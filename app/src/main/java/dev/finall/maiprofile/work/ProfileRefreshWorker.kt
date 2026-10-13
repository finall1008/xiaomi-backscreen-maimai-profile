package dev.finall.maiprofile.work

import android.content.Context
import android.util.Log
import androidx.work.*
import dev.finall.maiprofile.bridge.RearCardBridgeClient
import dev.finall.maiprofile.card.CardPackageBuilder
import dev.finall.maiprofile.data.ProfileRepository
import kotlinx.coroutines.CancellationException
import java.util.concurrent.TimeUnit

class ProfileRefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val repo = ProfileRepository(applicationContext)
        if (!repo.settings().autoRefresh || repo.settings().publicQq.isBlank()) return Result.success()
        return try {
            val profile = repo.refreshPublic()
            val bridge = RearCardBridgeClient(applicationContext)
            // First binding is always a user-initiated foreground operation.
            if (bridge.isConfigured()) {
                val file = CardPackageBuilder(applicationContext).export(profile, background = true)
                val reply = bridge.update(file)
                if (reply.getString("status") == "BINDING_REQUIRED") {
                    Log.w("ProfileRefresh", "背屏绑定已取消，请手动发送并重新绑定")
                }
            }
            Result.success()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w("ProfileRefresh", "后台公开资料或背屏更新失败", e)
            Result.failure()
        }
    }
    companion object {
        fun schedule(context: Context, enabled: Boolean) {
            val manager = WorkManager.getInstance(context)
            val settings = ProfileRepository(context).settings()
            if (!enabled || settings.publicQq.isBlank()) {
                manager.cancelUniqueWork("public-profile-refresh")
                return
            }
            val request = PeriodicWorkRequestBuilder<ProfileRefreshWorker>(settings.refreshIntervalMinutes.toLong(), TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
            // Apply interval changes without creating a second periodic worker.
            manager.enqueueUniquePeriodicWork("public-profile-refresh", ExistingPeriodicWorkPolicy.UPDATE, request)
        }
    }
}
