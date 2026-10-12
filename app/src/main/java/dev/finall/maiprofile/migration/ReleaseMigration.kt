package dev.finall.maiprofile.migration

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.util.zip.ZipFile

/** One-time, explicitly requested debug-to-release migration. The staged archive is app-scoped. */
object ReleaseMigration {
    const val EXTRA_RESTORE = "restore_debug_data"

    fun restore(context: Context) {
        val prefs = context.getSharedPreferences("profile", Context.MODE_PRIVATE)
        check(!prefs.contains("player")) { "已有资料，停止迁移以避免覆盖" }
        val external = context.getExternalFilesDir(null) ?: error("无法读取迁移文件")
        val archive = File(external, "release-userdata.zip")
        check(archive.isFile) { "迁移备份不存在" }
        val cache = File(context.filesDir, "resource-cache").apply { mkdirs() }
        var resources = 0
        ZipFile(archive).use { zip ->
            val entry = zip.getEntry("profile.json") ?: error("迁移备份缺少设置")
            val settings = zip.getInputStream(entry).bufferedReader().use { JSONObject(it.readText()) }
            val edit = prefs.edit()
            listOf("qq", "gateway_token", "player").forEach { key ->
                if (settings.has(key)) edit.putString(key, settings.getString(key))
            }
            if (settings.has("auto")) edit.putBoolean("auto", settings.getBoolean("auto"))
            zip.entries().asSequence().filter { !it.isDirectory && it.name.startsWith("resource-cache/") }.forEach { file ->
                val name = file.name.removePrefix("resource-cache/")
                require(name.isNotBlank() && !name.contains('/') && !name.contains('\\') && name != "..") { "无效的缓存文件路径" }
                zip.getInputStream(file).use { input -> File(cache, name).outputStream().use { input.copyTo(it) } }
                resources++
            }
            check(edit.commit()) { "迁移设置保存失败" }
            listOf("qq", "gateway_token", "player").forEach { key ->
                check(!settings.has(key) || prefs.getString(key, null) == settings.getString(key)) { "迁移设置核对失败" }
            }
            check(!settings.has("auto") || prefs.getBoolean("auto", true) == settings.getBoolean("auto")) { "自动刷新设置核对失败" }
        }
        check(archive.delete()) { "迁移已完成，但临时备份清理失败" }
        Log.i("MaiMigration", "Settings verified; cached resources restored: $resources")
    }
}
