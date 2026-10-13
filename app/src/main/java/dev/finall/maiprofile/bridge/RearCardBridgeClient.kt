package dev.finall.maiprofile.bridge

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

class RearCardBridgeClient(private val context: Context) {
    private val prefs = context.getSharedPreferences("rear-card-bridge", Context.MODE_PRIVATE)
    fun isConfigured(): Boolean = prefs.getBoolean("configured", false)

    fun recordForegroundResult(result: Intent?) {
        if (result?.getStringExtra("key") == KEY &&
            !result.getStringExtra("card_id").isNullOrBlank() &&
            result.getStringExtra("status") in setOf("SAVED", "CARRIER_WRITTEN", "SETTINGS_OPENED")) {
            prefs.edit().putBoolean("configured", true).apply()
        }
    }

    suspend fun update(file: File): Bundle = withContext(Dispatchers.IO) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        context.grantUriPermission(PACKAGE, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        try {
            val result = context.contentResolver.call(
                Uri.parse("content://$PACKAGE.update"), "update_content", null,
                Bundle().apply {
                    putInt("api_version", 2)
                    putParcelable("package_uri", uri)
                    putString("request_id", requestId())
                    putString("key", KEY)
                },
            ) ?: error("背屏卡片桥未返回更新结果")
            when (result.getString("status")) {
                "SAVED" -> prefs.edit().putBoolean("configured", true).apply()
                "BINDING_REQUIRED" -> prefs.edit().putBoolean("configured", false).apply()
                else -> error(result.getString("message") ?: "背屏更新失败：${result.getString("status")}")
            }
            result
        } catch (e: IllegalArgumentException) {
            throw IllegalStateException("无法调用背屏卡片桥 v2，请确认已安装支持 v2 的版本", e)
        } finally {
            context.revokeUriPermission(PACKAGE, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }

    companion object {
        const val PACKAGE = "dev.finall.rearcardbridge"
        // Same key for foreground binding and background updates; independent of the QQ account.
        const val KEY = "maimai-profile"
        fun requestId(): String = "maimai-${UUID.randomUUID()}"
    }
}
