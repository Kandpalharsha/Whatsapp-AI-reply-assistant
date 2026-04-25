package com.frontend

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

object WhatsAppAutoReplyManager {
  private const val PREFS_NAME = "whatsapp_ai_prefs"
  private const val KEY_ACCESS_TOKEN = "access_token"
  private const val KEY_BASE_URL = "base_url"
  private const val DEFAULT_BASE_URL = "http://127.0.0.1:8000"
  private const val DUPLICATE_REPLY_WINDOW_MS = 5 * 60_000L
  private const val SELF_REPLY_IGNORE_WINDOW_MS = 10 * 60_000L

  private val executor = Executors.newScheduledThreadPool(2)
  private val inFlightKeys = mutableSetOf<String>()
  private val repliedFingerprints = mutableMapOf<String, Long>()
  private val awaitingRemoteReplyByChat = mutableMapOf<String, Long>()
  private val lastSentReplyTextByChat = mutableMapOf<String, String>()

  fun configureSession(context: Context, accessToken: String, baseUrl: String?) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_ACCESS_TOKEN, accessToken)
      .putString(KEY_BASE_URL, baseUrl ?: DEFAULT_BASE_URL)
      .apply()
  }

  fun clearSession(context: Context) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .remove(KEY_ACCESS_TOKEN)
      .remove(KEY_BASE_URL)
      .apply()
  }

  fun scheduleAutoReply(context: Context, snapshot: WhatsAppNotificationStore.CapturedNotification) {
    if (!snapshot.canReply || snapshot.text.isBlank()) {
      WhatsAppNotificationStore.updateAutoReplyStatus(
        snapshot.key,
        if (!snapshot.canReply) "Auto-reply skipped: WhatsApp quick reply is unavailable."
        else "Auto-reply skipped: notification text was empty.",
      )
      return
    }

    val chatKey = normalize(snapshot.title)
    val fingerprint = buildFingerprint(snapshot.title, snapshot.text)
    val now = System.currentTimeMillis()

    synchronized(inFlightKeys) {
      pruneReplyHistory(now)

      val lastSentReply = lastSentReplyTextByChat[chatKey]
      val waitingSince = awaitingRemoteReplyByChat[chatKey]
      if (
        waitingSince != null &&
          lastSentReply != null &&
          now - waitingSince < SELF_REPLY_IGNORE_WINDOW_MS
      ) {
        if (looksLikeOwnReply(snapshot.text, lastSentReply)) {
          WhatsAppNotificationStore.updateAutoReplyStatus(
            snapshot.key,
            "Waiting for the other person. Ignored a notification that looked like your own sent reply.",
          )
          return
        }
        awaitingRemoteReplyByChat.remove(chatKey)
        lastSentReplyTextByChat.remove(chatKey)
      }

      val fingerprintReplyAt = repliedFingerprints[fingerprint]
      if (fingerprintReplyAt != null && now - fingerprintReplyAt < DUPLICATE_REPLY_WINDOW_MS) {
        WhatsAppNotificationStore.updateAutoReplyStatus(
          snapshot.key,
          "Auto-reply skipped: this incoming message already got a reply recently.",
        )
        return
      }

      if (!inFlightKeys.add(snapshot.key)) {
        WhatsAppNotificationStore.updateAutoReplyStatus(
          snapshot.key,
          "Auto-reply already in progress for this notification.",
        )
        return
      }
    }

    WhatsAppNotificationStore.updateAutoReplyStatus(
      snapshot.key,
      "Auto-reply scheduled. Waiting to generate a reply...",
    )

    executor.schedule(
      {
        try {
          attemptAutoReply(context, snapshot)
        } finally {
          synchronized(inFlightKeys) {
            inFlightKeys.remove(snapshot.key)
          }
        }
      },
      1,
      TimeUnit.SECONDS,
    )
  }

  private fun attemptAutoReply(
    context: Context,
    snapshot: WhatsAppNotificationStore.CapturedNotification,
  ) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val accessToken = prefs.getString(KEY_ACCESS_TOKEN, null) ?: run {
      WhatsAppNotificationStore.updateAutoReplyStatus(
        snapshot.key,
        "Auto-reply failed: no saved login token found in the app session.",
      )
      return
    }
    val baseUrl = prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL

    WhatsAppNotificationStore.updateAutoReplyStatus(
      snapshot.key,
      "Generating AI reply...",
    )

    val contact = findMatchingContact(baseUrl, accessToken, snapshot.title)
    val conversationHistory = WhatsAppNotificationStore
      .getRecentConversationHistory(snapshot.title, snapshot.key)

    val body = JSONObject().apply {
      put("contact_id", contact?.id ?: JSONObject.NULL)
      put("contact_name", snapshot.title)
      put("incoming_message", snapshot.text)
      put(
        "conversation_history",
        JSONArray().apply {
          conversationHistory.forEach { item ->
            put(
              JSONObject().apply {
                put("role", item.role)
                put("text", item.text)
              },
            )
          }
        },
      )
    }

    val response = postJson(
      url = "$baseUrl/reply/generate",
      accessToken = accessToken,
      payload = body,
    )

    if (response == null) {
      WhatsAppNotificationStore.updateAutoReplyStatus(
        snapshot.key,
        "Auto-reply failed: could not reach the backend or generation request failed.",
      )
      return
    }

    val reply = response.optString("reply", "").trim()
    if (reply.isBlank()) {
      WhatsAppNotificationStore.updateAutoReplyStatus(
        snapshot.key,
        "Auto-reply stopped: backend returned an empty reply.",
      )
      return
    }

    val target = WhatsAppNotificationStore.getReplyTarget(snapshot.key) ?: run {
      WhatsAppNotificationStore.updateAutoReplyStatus(
        snapshot.key,
        "Auto-reply failed: WhatsApp quick reply target was no longer available.",
      )
      return
    }

    try {
      WhatsAppNotificationStore.sendReply(context, target, reply)
    } catch (_: Exception) {
      WhatsAppNotificationStore.updateAutoReplyStatus(
        snapshot.key,
        "Auto-reply failed while sending the quick reply action.",
      )
      return
    }

    recordReply(snapshot.title, snapshot.text, reply)
    WhatsAppNotificationStore.updateAutoReplyStatus(
      snapshot.key,
      "Reply sent automatically.",
    )
  }

  private fun findMatchingContact(
    baseUrl: String,
    accessToken: String,
    notificationTitle: String,
  ): ContactInfo? {
    val payload = getJson("$baseUrl/chat/contacts", accessToken) ?: return null
    val normalizedTitle = normalize(notificationTitle)
    for (index in 0 until payload.length()) {
      val item = payload.optJSONObject(index) ?: continue
      val name = item.optString("name")
      if (normalize(name) == normalizedTitle) {
        return ContactInfo(id = item.optString("id"), name = name)
      }
    }
    return null
  }

  private fun getJson(url: String, accessToken: String): JSONArray? {
    val connection = openConnection(url, accessToken).apply {
      requestMethod = "GET"
    }

    return try {
      val statusCode = connection.responseCode
      if (statusCode !in 200..299) {
        null
      } else {
        val body = connection.inputStream.bufferedReader().use(BufferedReader::readText)
        JSONArray(body)
      }
    } catch (_: Exception) {
      null
    } finally {
      connection.disconnect()
    }
  }

  private fun postJson(url: String, accessToken: String, payload: JSONObject): JSONObject? {
    val connection = openConnection(url, accessToken).apply {
      requestMethod = "POST"
      doOutput = true
      setRequestProperty("Content-Type", "application/json")
    }

    return try {
      OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
        writer.write(payload.toString())
      }

      val statusCode = connection.responseCode
      val stream = if (statusCode in 200..299) {
        connection.inputStream
      } else {
        connection.errorStream
      } ?: return null

      val body = stream.bufferedReader().use(BufferedReader::readText)
      if (statusCode !in 200..299) {
        null
      } else {
        JSONObject(body)
      }
    } catch (_: Exception) {
      null
    } finally {
      connection.disconnect()
    }
  }

  private fun openConnection(url: String, accessToken: String): HttpURLConnection {
    return (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = 30_000
      readTimeout = 30_000
      setRequestProperty("Authorization", "Bearer $accessToken")
      setRequestProperty("Accept", "application/json")
    }
  }

  private fun normalize(value: String): String {
    return value.trim().lowercase(Locale.ROOT)
  }

  private fun buildFingerprint(title: String, text: String): String {
    return "${normalize(title)}|${normalize(text)}"
  }

  private fun recordReply(title: String, text: String, reply: String) {
    val now = System.currentTimeMillis()
    val chatKey = normalize(title)
    synchronized(inFlightKeys) {
      pruneReplyHistory(now)
      repliedFingerprints[buildFingerprint(title, text)] = now
      awaitingRemoteReplyByChat[chatKey] = now
      lastSentReplyTextByChat[chatKey] = normalize(reply)
    }
  }

  private fun pruneReplyHistory(now: Long) {
    val fingerprintExpiry = now - DUPLICATE_REPLY_WINDOW_MS
    val selfReplyExpiry = now - SELF_REPLY_IGNORE_WINDOW_MS

    repliedFingerprints.entries.removeIf { (_, timestamp) -> timestamp < fingerprintExpiry }
    awaitingRemoteReplyByChat.entries.removeIf { (_, timestamp) -> timestamp < selfReplyExpiry }

    val activeChatKeys = awaitingRemoteReplyByChat.keys.toSet()
    lastSentReplyTextByChat.entries.removeIf { (chatKey, _) -> chatKey !in activeChatKeys }
  }

  private fun looksLikeOwnReply(notificationText: String, lastReplyText: String): Boolean {
    val normalizedNotification = normalize(notificationText)
    val normalizedLastReply = normalize(lastReplyText)
    return normalizedNotification == normalizedLastReply ||
      normalizedNotification.contains(normalizedLastReply) ||
      normalizedLastReply.contains(normalizedNotification)
  }

  private data class ContactInfo(
    val id: String,
    val name: String,
  )
}
