package dev.finall.maiprofile

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.finall.maiprofile.bridge.RearCardBridgeClient
import dev.finall.maiprofile.card.CardPackageBuilder
import dev.finall.maiprofile.data.ProfileRepository
import dev.finall.maiprofile.model.*
import dev.finall.maiprofile.work.ProfileRefreshWorker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File

class ProfileViewModel(app: Application) : AndroidViewModel(app) {
    private val repository = ProfileRepository(app)
    private val builder = CardPackageBuilder(app)
    private val bridgeClient = RearCardBridgeClient(app)
    private val mutable = MutableStateFlow(AppUiState(profile = repository.profile(), settings = repository.settings()))
    val state = mutable.asStateFlow()
    init {
        ProfileRefreshWorker.schedule(app, state.value.settings.autoRefresh)
        resume()
    }
    fun resume() {
        if (state.value.busy) return
        operation {
            val settings = repository.settings()
            mutable.update { it.copy(settings = settings, profile = repository.profile()) }
            if (settings.autoRefresh && settings.publicQq.isNotBlank() &&
                System.currentTimeMillis() - repository.profile().publicUpdatedAt >= settings.refreshIntervalMinutes * 60L * 1000) {
                val p = repository.refreshPublic()
                mutable.update { it.copy(profile = p, status = "公开资料已刷新") }
                updateRearScreenIfConfigured(p)
            }
            refreshPreview()
        }
    }
    fun saveSettings(settings: AppSettings) {
        operation {
            repository.saveSettings(settings)
            mutable.update { it.copy(settings = repository.settings(), status = "设置已保存") }
            ProfileRefreshWorker.schedule(getApplication(), settings.autoRefresh)
            if (settings.autoRefresh && settings.publicQq.isNotBlank()) {
                val refreshed = repository.refreshPublic()
                mutable.update { it.copy(profile = refreshed, status = "公开资料已刷新") }
                updateRearScreenIfConfigured(refreshed)
            }
            refreshPreview()
        }
    }
    fun refreshPublic() = operation {
        val p = repository.refreshPublic()
        mutable.update { it.copy(profile = p, status = "公开资料已刷新") }
        refreshPreview()
    }
    fun refreshFull(qr: String) = operation {
        val p = repository.refreshFull(qr)
        mutable.update { it.copy(profile = p, status = if (p.titleId > 0 && p.title.isBlank()) "完整资料已更新，称号文字获取失败" else "完整资料已更新") }
        refreshPreview()
    }
    fun checkIn() = operation {
        val message = repository.checkIn()
        mutable.update { it.copy(status = message) }
    }
    fun preparePackage(onReady: (File) -> Unit) = operation {
        val file = builder.export(repository.profile())
        onReady(file)
    }
    fun publish(onBindingRequired: (File) -> Unit) = operation {
        val file = builder.export(repository.profile())
        if (!bridgeClient.isConfigured()) {
            onBindingRequired(file)
        } else {
            val result = bridgeClient.update(file)
            if (result.getString("status") == "BINDING_REQUIRED") onBindingRequired(file)
            else mutable.update { it.copy(status = "内容已保存") }
        }
    }
    private suspend fun updateRearScreenIfConfigured(profile: PlayerProfile) {
        if (!bridgeClient.isConfigured()) return
        val result = bridgeClient.update(builder.export(profile))
        mutable.update { it.copy(status = if (result.getString("status") == "SAVED")
            "公开资料已刷新，背屏内容已保存" else "公开资料已刷新，请手动发送并重新绑定背屏") }
    }
    fun dismissError() { mutable.update { it.copy(error = null) } }
    fun reportError(message: String) { mutable.update { it.copy(error = message) } }
    fun setStatus(message: String) { mutable.update { it.copy(status = message) } }
    private suspend fun refreshPreview() {
        val p = repository.profile()
        mutable.update { it.copy(profile = p) }
        if (p.name.isNotBlank()) {
            val url = builder.preview(p)
            mutable.update { it.copy(previewUrl = url) }
        } else {
            mutable.update { it.copy(previewUrl = null) }
        }
    }
    private fun operation(block: suspend () -> Unit) {
        if (state.value.busy) return
        mutable.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try { block() } catch (e: Exception) {
                mutable.update { it.copy(error = e.message?.take(240) ?: "操作失败") }
            } finally { mutable.update { it.copy(busy = false) } }
        }
    }
}
