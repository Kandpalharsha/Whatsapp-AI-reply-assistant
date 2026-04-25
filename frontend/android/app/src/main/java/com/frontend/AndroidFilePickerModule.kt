package com.frontend

import android.app.Activity
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.provider.OpenableColumns
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AndroidFilePickerModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  private var pendingPromise: Promise? = null

  private val pickerListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != REQUEST_CODE) {
        return
      }

      val promise = pendingPromise
      pendingPromise = null

      if (promise == null) {
        return
      }

      if (resultCode != Activity.RESULT_OK || data?.data == null) {
        promise.reject("PICKER_CANCELLED", "File selection was cancelled")
        return
      }

      val uri = data.data!!
      try {
        val result = Arguments.createMap().apply {
          putString("uri", uri.toString())
          putString("name", resolveDisplayName(uri) ?: "chat.txt")
          putString("type", reactContext.contentResolver.getType(uri) ?: "text/plain")
          putString("text", readText(uri))
        }
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject(
          "PICKER_READ_FAILED",
          "Could not read the selected file. Please choose a local text file from device storage.",
          error,
        )
      }
    }
  }

  init {
    reactContext.addActivityEventListener(pickerListener)
  }

  override fun getName(): String = "AndroidFilePicker"

  @ReactMethod
  fun pickTextFile(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "No active activity found")
      return
    }

    if (pendingPromise != null) {
      promise.reject("PICKER_IN_PROGRESS", "A file picker request is already running")
      return
    }

    pendingPromise = promise

    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "text/plain"
      putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("text/plain"))
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
    }

    try {
      activity.startActivityForResult(intent, REQUEST_CODE)
    } catch (error: Exception) {
      pendingPromise = null
      promise.reject("PICKER_FAILED", error.message, error)
    }
  }

  private fun resolveDisplayName(uri: Uri): String? {
    if (uri.scheme != "content") {
      return uri.lastPathSegment
    }

    var cursor: Cursor? = null
    return try {
      cursor = reactContext.contentResolver.query(uri, null, null, null, null)
      if (cursor != null && cursor.moveToFirst()) {
        val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (index >= 0) cursor.getString(index) else null
      } else {
        null
      }
    } finally {
      cursor?.close()
    }
  }

  private fun readText(uri: Uri): String {
    reactContext.contentResolver.openInputStream(uri).use { stream ->
      if (stream == null) {
        throw IllegalStateException("Could not open the selected file")
      }
      return stream.bufferedReader(Charsets.UTF_8).readText()
    }
  }

  companion object {
    private const val REQUEST_CODE = 47021
  }
}
