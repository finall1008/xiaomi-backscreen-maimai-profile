package dev.finall.maiprofile.work

import android.content.Context
import androidx.work.*
import dev.finall.maiprofile.data.ProfileRepository
import java.util.concurrent.TimeUnit

class ProfileRefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val repo = ProfileRepository(applicationContext)
        if (!repo.settings().autoRefresh || repo.settings().publicQq.isBlank()) return Result.success()
        return try { repo.refreshPublic(); Result.success() } catch (_: Exception) { Result.failure() }
    }
    companion object {
        fun schedule(context: Context, enabled: Boolean) {
            val manager = WorkManager.getInstance(context)
            if (!enabled || ProfileRepository(context).settings().publicQq.isBlank()) {
                manager.cancelUniqueWork("public-profile-refresh")
                return
            }
            val request = PeriodicWorkRequestBuilder<ProfileRefreshWorker>(1, TimeUnit.HOURS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
            manager.enqueueUniquePeriodicWork("public-profile-refresh", ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}
