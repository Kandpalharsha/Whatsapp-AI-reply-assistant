package com.frontend

import android.app.Notification
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule

object WhatsAppNotificationStore {
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

  private val notifications = linkedMapOf<String, CapturedNotification>()
  private val replyTargets = mutableMapOf<String, ReplyTarget>()
  var reactContext: ReactApplicationContext? = null

  fun upsert(
    key: String,
    packageName: String,
    title: String,
    text: String,
    postTime: Long,
    action: Notification.Action?,
  ): CapturedNotification {
    val remoteInputs = action?.remoteInputs
    if (action != null && remoteInputs != null && remoteInputs.isNotEmpty()) {
      replyTargets[key] = ReplyTarget(action.actionIntent, remoteInputs, packageName)
    } else {
      replyTargets.remove(key)
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
}
