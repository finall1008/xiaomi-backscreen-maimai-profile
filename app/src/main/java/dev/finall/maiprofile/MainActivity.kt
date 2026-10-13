package dev.finall.maiprofile

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.finall.maiprofile.bridge.RearCardBridgeClient
import dev.finall.maiprofile.ui.ProfileScreen
import java.io.File

class MainActivity : ComponentActivity() {
    private val model: ProfileViewModel by viewModels()
    private var pendingExport: File? = null
    private val exportFile = registerForActivityResult(ActivityResultContracts.CreateDocument("application/zip")) { uri ->
        val file = pendingExport
        if (uri != null && file != null) {
            try {
                contentResolver.openOutputStream(uri)?.use { output -> file.inputStream().use { it.copyTo(output) } }
                    ?: error("无法写入文件")
                model.setStatus("卡片 ZIP 已导出")
            } catch (e: Exception) { model.reportError(e.message ?: "导出失败") }
        }
        pendingExport = null
    }
    private val bridge = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        RearCardBridgeClient(this).recordForegroundResult(result.data)
        val status = result.data?.getStringExtra("status")
        if (status != null) model.setStatus(when(status) {
            "SAVED" -> "内容已保存"
            "BINDING_REQUIRED" -> "内容已暂存，请在背屏卡片桥完成绑定"
            "CARRIER_WRITTEN" -> "载体已写入，请完成首次绑定"
            "SETTINGS_OPENED" -> "背屏设置已打开"
            else -> result.data?.getStringExtra("message") ?: "桥接操作已结束"
        })
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val migrationError = if (intent.getBooleanExtra(dev.finall.maiprofile.migration.ReleaseMigration.EXTRA_RESTORE, false)) {
            runCatching { dev.finall.maiprofile.migration.ReleaseMigration.restore(this) }.exceptionOrNull()
        } else null
        setContent {
            val state = model.state.collectAsStateWithLifecycle().value
            ProfileScreen(state, model::saveSettings, model::refreshPublic, model::refreshFull, model::checkIn,
                onPublish = { model.publish(::sendToBridge) },
                onExport = { model.preparePackage { pendingExport = it; exportFile.launch("maimai-card.zip") } },
                onDismissError = model::dismissError)
        }
        migrationError?.let { model.reportError("资料迁移失败：${it.message}") }
    }
    override fun onResume() { super.onResume(); model.resume() }
    private fun sendToBridge(file: File) {
        val uri: Uri = FileProvider.getUriForFile(this, "$packageName.files", file)
        val intent = Intent("dev.finall.rearcardbridge.action.UPDATE_CONTENT").apply {
            setPackage("dev.finall.rearcardbridge")
            setDataAndType(uri, "application/zip")
            clipData = ClipData.newRawUri("舞萌背屏卡片", uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            putExtra("api_version", 2)
            putExtra("request_id", RearCardBridgeClient.requestId())
            putExtra("key", RearCardBridgeClient.KEY)
        }
        try { bridge.launch(intent) } catch (_: ActivityNotFoundException) {
            model.reportError("请先安装背屏卡片桥")
        }
    }
}
