package com.frontend

import android.app.Notification
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale

object WhatsAppNotificationStore {
  private const val SELF_REPLY_WINDOW_MS = 10 * 60_000L

  data class HistoryItem(
    val role: String,
    val text: String,
  )

  data class ReplyTarget(
    val pendingIntent: PendingIntent,
    val remoteInputs: Array<RemoteInput>,
    val packageName: String,
  )

  data class CapturedNotification(
    val key: String,
    val packageName: String,
    val title: String,
    val text: String,
    val postTime: Long,
    val canReply: Boolean,
    val autoReplyStatus: String?,
  )

  private data class PendingSelfReply(
    val replyText: String,
    val markedAt: Long,
  )

  private val notifications = linkedMapOf<String, CapturedNotification>()
  private val replyTargets = mutableMapOf<String, ReplyTarget>()
  private val pendingSelfReplies = mutableMapOf<String, PendingSelfReply>()
  var reactContext: ReactApplicationContext? = null

  fun upsert(
    key: String,
    packageName: String,
    title: String,
    text: String,
    postTime: Long,
    action: Notification.Action?,
  ): CapturedNotification? {
    val remoteInputs = action?.remoteInputs
    if (action != null && remoteInputs != null && remoteInputs.isNotEmpty()) {
      replyTargets[key] = ReplyTarget(action.actionIntent, remoteInputs, packageName)
    } else {
      replyTargets.remove(key)
    }

    synchronized(this) {
      prunePendingSelfReplies(postTime)
      val chatKey = normalize(title)
      if (shouldIgnoreAsSelfReply(chatKey, text, postTime)) {
        pendingSelfReplies.remove(chatKey)
        return null
      }
    }

    val snapshot = CapturedNotification(
      key = key,
      packageName = packageName,
      title = title,
      text = text,
      postTime = postTime,
      canReply = replyTargets.containsKey(key),
      autoReplyStatus = notifications[key]?.autoReplyStatus,
    )
    notifications[key] = snapshot
    emit(snapshot)
    return snapshot
  }

  fun remove(key: String) {
    notifications.remove(key)
    replyTargets.remove(key)
  }

  fun list(): List<CapturedNotification> {
    return notifications.values.sortedByDescending { it.postTime }
  }

  fun updateAutoReplyStatus(key: String, status: String) {
    val current = notifications[key] ?: return
    val updated = current.copy(autoReplyStatus = status)
    notifications[key] = updated
    emit(updated)
  }

  fun getRecentConversationHistory(title: String, excludeKey: String, limit: Int = 4): List<HistoryItem> {
    return notifications.values
      .asSequence()
      .filter { item ->
        item.key != excludeKey &&
          item.title.equals(title, ignoreCase = true) &&
          item.text.isNotBlank()
      }
      .sortedByDescending { it.postTime }
      .map { item -> HistoryItem(role = "in", text = item.text) }
      .distinctBy { item -> item.text.trim().lowercase() }
      .take(limit)
      .toList()
      .asReversed()
  }

  fun markPendingSelfReply(title: String, replyText: String) {
    val now = System.currentTimeMillis()
    synchronized(this) {
      prunePendingSelfReplies(now)
      pendingSelfReplies[normalize(title)] = PendingSelfReply(
        replyText = normalize(replyText),
        markedAt = now,
      )
    }
  }

  fun clearPendingSelfReply(title: String) {
    synchronized(this) {
      pendingSelfReplies.remove(normalize(title))
    }
  }

  fun getReplyTarget(key: String): ReplyTarget? = replyTargets[key]

  fun sendReply(context: Context, target: ReplyTarget, message: String) {
    val bundle = android.os.Bundle()
    target.remoteInputs.forEach { input ->
      bundle.putCharSequence(input.resultKey, message)
    }
    val fillInIntent = android.content.Intent()
    RemoteInput.addResultsToIntent(target.remoteInputs, fillInIntent, bundle)
    target.pendingIntent.send(context, 0, fillInIntent)
  }

  private fun emit(snapshot: CapturedNotification) {
    val ctx = reactContext ?: return
    val payload = Arguments.createMap().apply {
      putString("key", snapshot.key)
      putString("packageName", snapshot.packageName)
      putString("title", snapshot.title)
      putString("text", snapshot.text)
      putDouble("postTime", snapshot.postTime.toDouble())
      putBoolean("canReply", snapshot.canReply)
      putString("autoReplyStatus", snapshot.autoReplyStatus)
    }
    ctx
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("whatsapp_notification", payload)
  }

  private fun normalize(value: String): String {
    return value.trim().lowercase(Locale.ROOT)
  }

  private fun prunePendingSelfReplies(now: Long) {
    val expiry = now - SELF_REPLY_WINDOW_MS
    pendingSelfReplies.entries.removeIf { (_, value) -> value.markedAt < expiry }
  }

  private fun shouldIgnoreAsSelfReply(chatKey: String, text: String, postTime: Long): Boolean {
    val pending = pendingSelfReplies[chatKey] ?: return false
    if (postTime - pending.markedAt > SELF_REPLY_WINDOW_MS) {
      pendingSelfReplies.remove(chatKey)
      return false
    }

    val normalizedNotification = normalize(text)
    val normalizedReply = pending.replyText
    return normalizedNotification == normalizedReply ||
      normalizedNotification.contains(normalizedReply) ||
      normalizedReply.contains(normalizedNotification)
  }
}
