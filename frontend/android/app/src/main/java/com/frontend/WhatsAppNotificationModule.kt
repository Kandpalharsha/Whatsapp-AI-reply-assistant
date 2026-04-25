package com.frontend

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WhatsAppNotificationModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  init {
    WhatsAppNotificationStore.reactContext = reactContext
  }

  override fun getName(): String = "WhatsAppNotification"

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  @ReactMethod
  fun openNotificationAccessSettings() {
    val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    reactApplicationContext.startActivity(intent)
  }

  @ReactMethod
  fun isNotificationAccessEnabled(promise: Promise) {
    val enabled = Settings.Secure.getString(
      reactApplicationContext.contentResolver,
      "enabled_notification_listeners",
    ) ?: ""

    val serviceName = ComponentName(
      reactApplicationContext,
      WhatsAppNotificationListenerService::class.java,
    ).flattenToString()

    promise.resolve(enabled.contains(serviceName))
  }

  @ReactMethod
  fun getCapturedNotifications(promise: Promise) {
    val array = Arguments.createArray()
    for (item in WhatsAppNotificationStore.list()) {
      array.pushMap(
        Arguments.createMap().apply {
          putString("key", item.key)
          putString("packageName", item.packageName)
          putString("title", item.title)
          putString("text", item.text)
          putDouble("postTime", item.postTime.toDouble())
          putBoolean("canReply", item.canReply)
          putString("autoReplyStatus", item.autoReplyStatus)
        }
      )
    }
    promise.resolve(array)
  }

  @ReactMethod
  fun configureSession(accessToken: String, baseUrl: String, promise: Promise) {
    try {
      WhatsAppAutoReplyManager.configureSession(
        reactApplicationContext,
        accessToken,
        baseUrl,
      )
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("SESSION_CONFIG_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun clearSession(promise: Promise) {
    try {
      WhatsAppAutoReplyManager.clearSession(reactApplicationContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("SESSION_CLEAR_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun sendQuickReply(notificationKey: String, message: String, promise: Promise) {
    val target = WhatsAppNotificationStore.getReplyTarget(notificationKey)
    if (target == null) {
      promise.reject("NO_REPLY_TARGET", "No WhatsApp quick-reply action is available for this notification.")
      return
    }

    try {
      WhatsAppNotificationStore.sendReply(reactApplicationContext, target, message)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("REPLY_FAILED", error.message, error)
    }
  }
}
