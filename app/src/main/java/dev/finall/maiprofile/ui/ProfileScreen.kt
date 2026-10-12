package dev.finall.maiprofile.ui

import android.annotation.SuppressLint
import android.graphics.Color
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.webkit.ConsoleMessage
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebResourceError
import androidx.webkit.WebViewAssetLoader
import java.io.File
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import dev.finall.maiprofile.model.AppSettings
import dev.finall.maiprofile.model.AppUiState
import dev.finall.maiprofile.model.PlayerProfile
import top.yukonga.miuix.kmp.basic.BasicComponent
import top.yukonga.miuix.kmp.basic.Button
import top.yukonga.miuix.kmp.basic.ButtonDefaults
import top.yukonga.miuix.kmp.basic.Card
import top.yukonga.miuix.kmp.basic.Scaffold
import top.yukonga.miuix.kmp.basic.Switch
import top.yukonga.miuix.kmp.basic.Text
import top.yukonga.miuix.kmp.basic.TextField
import top.yukonga.miuix.kmp.basic.TopAppBar
import top.yukonga.miuix.kmp.theme.ColorSchemeMode
import top.yukonga.miuix.kmp.theme.MiuixTheme
import top.yukonga.miuix.kmp.theme.ThemeController
import top.yukonga.miuix.kmp.window.WindowDialog
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val updatedAtFormat: DateTimeFormatter =
    DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneId.systemDefault())

@Composable
fun ProfileScreen(
    state: AppUiState,
    onSaveSettings: (AppSettings) -> Unit,
    onRefreshPublic: () -> Unit,
    onRefreshFull: (String) -> Unit,
    onCheckIn: () -> Unit,
    onPublish: () -> Unit,
    onExport: () -> Unit,
    onDismissError: () -> Unit,
) {
    var publicQq by remember(state.settings.publicQq) { mutableStateOf(state.settings.publicQq) }
    var gatewayToken by remember(state.settings.gatewayToken) { mutableStateOf(state.settings.gatewayToken) }
    var autoRefresh by remember(state.settings.autoRefresh) { mutableStateOf(state.settings.autoRefresh) }
    var showFullQuery by remember { mutableStateOf(false) }
    var fullQuery by remember { mutableStateOf("") }
    val themeController = remember { ThemeController(colorSchemeMode = ColorSchemeMode.System) }
    val canDeliver = !state.busy && (!state.previewUrl.isNullOrBlank() || state.profile.hasContent())
    MiuixTheme(controller = themeController) {
        Scaffold(topBar = { TopAppBar(title = "舞萌背屏") }) { padding ->
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding).imePadding(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                item {
                    Card(Modifier.fillMaxWidth(), insideMargin = PaddingValues(0.dp)) {
                        PreviewWebView(state.previewUrl)
                    }
                }
                item {
                    Card(Modifier.fillMaxWidth()) {
                        if (state.profile.name.isNotBlank()) {
                            BasicComponent(title = state.profile.name, summary = state.profile.title.takeIf { it.isNotBlank() })
                        }
                        BasicComponent(title = "公开资料", summary = formatUpdated(state.profile.publicUpdatedAt))
                        BasicComponent(title = "完整资料", summary = formatUpdated(state.profile.fullUpdatedAt))
                        BasicComponent(
                            title = "最近状态",
                            summary = when {
                                state.busy -> "正在处理…"
                                state.status.isNotBlank() -> state.status
                                else -> "暂无"
                            },
                        )
                    }
                }
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Button(
                            onClick = onRefreshPublic,
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !state.busy,
                        ) { Text("刷新公开资料") }
                        Button(
                            onClick = { showFullQuery = true },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !state.busy,
                        ) { Text("更新完整资料 · 2 Token") }
                        Button(
                            onClick = onCheckIn,
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !state.busy,
                        ) { Text("每日签到") }
                        Button(
                            onClick = onPublish,
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColorsPrimary(),
                            enabled = canDeliver,
                        ) { Text("发送到背屏") }
                        Button(
                            onClick = onExport,
                            modifier = Modifier.fillMaxWidth(),
                            enabled = canDeliver,
                        ) { Text("导出卡片") }
                    }
                }
                item {
                    Card(Modifier.fillMaxWidth()) {
                        TextField(
                            value = publicQq,
                            onValueChange = { publicQq = it },
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(top = 16.dp),
                            label = "公开 QQ",
                            singleLine = true,
                            enabled = !state.busy,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        )
                        TextField(
                            value = gatewayToken,
                            onValueChange = { gatewayToken = it },
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(top = 12.dp),
                            label = "网关令牌",
                            singleLine = true,
                            enabled = !state.busy,
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        )
                        BasicComponent(
                            title = "自动刷新公开资料",
                            summary = "每小时读取查分器已同步的数据 · 免费",
                            enabled = !state.busy,
                            endActions = {
                                Switch(
                                    checked = autoRefresh,
                                    onCheckedChange = { autoRefresh = it },
                                    enabled = !state.busy,
                                )
                            },
                        )
                        Button(
                            onClick = {
                                onSaveSettings(
                                    AppSettings(
                                        publicQq = publicQq.trim(),
                                        gatewayToken = gatewayToken.trim(),
                                        autoRefresh = autoRefresh,
                                    ),
                                )
                            },
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 16.dp),
                            colors = ButtonDefaults.buttonColorsPrimary(),
                            enabled = !state.busy,
                        ) { Text("保存") }
                    }
                }
            }
        }
        WindowDialog(
            show = showFullQuery,
            title = "更新完整资料",
            summary = "粘贴二维码内容或网页地址。成功查询消耗 2 Token。",
            onDismissRequest = { showFullQuery = false },
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                TextField(
                    value = fullQuery,
                    onValueChange = { fullQuery = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = "二维码内容或网页地址",
                    enabled = !state.busy,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(onClick = { showFullQuery = false }, modifier = Modifier.weight(1f)) { Text("取消") }
                    Button(
                        onClick = {
                            val query = fullQuery.trim()
                            fullQuery = ""
                            showFullQuery = false
                            onRefreshFull(query)
                        },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColorsPrimary(),
                        enabled = !state.busy && fullQuery.isNotBlank(),
                    ) { Text("更新") }
                }
            }
        }
        WindowDialog(
            show = state.error != null,
            title = "操作提示",
            summary = state.error?.let(::shortError),
            onDismissRequest = onDismissError,
        ) {
            Button(
                onClick = onDismissError,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColorsPrimary(),
            ) { Text("确定") }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun PreviewWebView(previewUrl: String?) {
    var loadError by remember { mutableStateOf<String?>(null) }
    loadError?.let { Text(it, modifier = Modifier.padding(16.dp)) }
    AndroidView(
        modifier = Modifier.fillMaxWidth().aspectRatio(912f / 596f),
        factory = { context ->
            val loader = WebViewAssetLoader.Builder()
                .addPathHandler("/cards/", WebViewAssetLoader.InternalStoragePathHandler(context, File(context.filesDir, "cards")))
                .build()
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                webViewClient = object : WebViewClient() {
                    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                        loader.shouldInterceptRequest(request.url)
                    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                        if (request.isForMainFrame) loadError = "预览加载失败：${error.description}"
                    }
                }
                webChromeClient = object : WebChromeClient() {
                    override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                        if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                            loadError = "预览脚本错误：${message.message().take(160)}"
                        }
                        return true
                    }
                }
                settings.useWideViewPort = true
                settings.loadWithOverviewMode = true
                isVerticalScrollBarEnabled = false
                isHorizontalScrollBarEnabled = false
                setBackgroundColor(Color.WHITE)
            }
        },
        onRelease = { webView -> webView.destroy() },
        update = { webView ->
            if (webView.tag != previewUrl) {
                loadError = null
                webView.tag = previewUrl
                if (previewUrl.isNullOrBlank()) webView.loadUrl("about:blank") else webView.loadUrl(previewUrl)
            }
        },
    )
}

private fun PlayerProfile.hasContent(): Boolean =
    name.isNotBlank() || publicUpdatedAt > 0L || fullUpdatedAt > 0L

private fun formatUpdated(at: Long): String =
    if (at <= 0L) "尚未更新" else updatedAtFormat.format(Instant.ofEpochMilli(at))

private fun shortError(message: String): String {
    val line = message.lineSequence().map { it.trim() }.firstOrNull { it.isNotEmpty() && !it.startsWith("at ") }.orEmpty()
    return line.substringBefore("\tat ").trim().ifEmpty { "操作失败" }
}
