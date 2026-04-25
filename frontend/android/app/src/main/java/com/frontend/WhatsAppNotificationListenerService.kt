package com.frontend

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class WhatsAppNotificationListenerService : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (!isWhatsAppPackage(sbn.packageName)) {
      return
    }

    val extras = sbn.notification.extras
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: "WhatsApp"
    val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
      ?: extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
      ?: ""

    val replyAction = sbn.notification.actions?.firstOrNull { action ->
      val remoteInputs = action.remoteInputs
      remoteInputs != null && remoteInputs.isNotEmpty()
    }

    val snapshot = WhatsAppNotificationStore.upsert(
      key = sbn.key,
      packageName = sbn.packageName,
      title = title,
      text = text,
      postTime = sbn.postTime,
      action = replyAction,
    )
    WhatsAppAutoReplyManager.scheduleAutoReply(applicationContext, snapshot)
  }

  override fun onNotificationRemoved(sbn: StatusBarNotification) {
    WhatsAppNotificationStore.remove(sbn.key)
  }

  private fun isWhatsAppPackage(packageName: String): Boolean {
    return packageName == "com.whatsapp" || packageName == "com.whatsapp.w4b"
  }
}
