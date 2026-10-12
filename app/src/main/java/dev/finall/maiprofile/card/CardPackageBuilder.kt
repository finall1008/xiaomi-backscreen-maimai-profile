package dev.finall.maiprofile.card

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import java.io.ByteArrayOutputStream
import kotlin.math.min
import dev.finall.maiprofile.model.PlayerProfile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class CardPackageBuilder(private val context: Context) {
    private val resources = File(context.filesDir, "resource-cache").apply { mkdirs() }
    private val root = File(context.filesDir, "cards").apply { mkdirs() }

    suspend fun preview(profile: PlayerProfile): String = withContext(Dispatchers.IO) {
        val dir = create(profile, true)
        // Retain the active and previous preview, rather than accumulating one folder per refresh.
        root.listFiles().orEmpty().filter { it.isDirectory && it.name.startsWith("preview-") }
            .sortedByDescending { it.lastModified() }.drop(2).forEach { it.deleteRecursively() }
        "https://appassets.androidplatform.net/cards/${dir.name}/index.html"
    }

    suspend fun export(profile: PlayerProfile): File = withContext(Dispatchers.IO) {
        val dir = create(profile, false)
        val target = File(context.cacheDir, "published/maimai-card.zip").apply { parentFile!!.mkdirs() }
        ZipOutputStream(target.outputStream().buffered()).use { zip ->
            // All rendering images are carried inside the script. No carrier file refresh is needed.
            dir.listFiles().orEmpty().filter { it.name == "index.html" || it.name == "main.js" }.forEach { file ->
                zip.putNextEntry(ZipEntry(file.relativeTo(dir).invariantSeparatorsPath))
                file.inputStream().use { it.copyTo(zip) }
                zip.closeEntry()
            }
        }
        target
    }

    private fun create(profile: PlayerProfile, preview: Boolean): File {
        val dir = File(root, if (preview) "preview-${System.currentTimeMillis()}" else "package")
        if (!preview && dir.exists()) dir.deleteRecursively()
        dir.mkdirs()
        copyAssets("card", dir)
        val config = JSONObject().apply {
            put("name", profile.name); put("rating", profile.rating); put("title", profile.title)
            put("fullUpdatedAt", profile.fullUpdatedAt)
            put("courseRank", profile.courseRank); put("classRank", profile.classRank)
            val tier = listOf(1000, 2000, 4000, 7000, 10000, 12000, 13000, 14000, 14500, 15000)
                .indexOfFirst { profile.rating < it }.let { if (it < 0) 11 else it + 1 }
            put("ratingAsset", "assets/rating-${tier.toString().padStart(2, '0')}.png")
            val titleColor = profile.titleColor.lowercase().takeIf { it in listOf("normal", "bronze", "silver", "gold", "rainbow") } ?: "normal"
            put("titleAsset", "assets/title-$titleColor.png")
        }
        listOf("icon" to profile.iconId, "plate" to profile.plateId, "frame" to profile.frameId).forEach { (kind, id) ->
            if (id > 0) {
                val name = "$kind-$id.png"
                val cached = fetch("https://assets2.lxns.net/maimai/$kind/$id.png", name)
                cached.copyTo(File(dir, "assets/$name"), overwrite = true)
                config.put("${kind}Asset", "assets/$name")
            }
        }
        listOf("course" to profile.courseRank, "class" to profile.classRank).forEach { (kind, rank) ->
            if (rank > 0) {
                val name = "$kind-$rank.webp"
                val file = fetch("https://maimai.lxns.net/assets/maimai/${kind}_rank/$rank.webp", name)
                file.copyTo(File(dir, "assets/$name"), overwrite = true)
                config.put("${kind}Asset", "assets/$name")
            }
        }
        val imageSources = JSONObject()
        val selected = listOf("ratingAsset", "titleAsset", "iconAsset", "plateAsset", "frameAsset", "courseAsset", "classAsset")
            .map { config.optString(it) }.filter { it.isNotBlank() } + (0..9).map { "assets/digit-$it.png" }
        selected.forEach { path ->
            val bounds = when {
                path.contains("frame-") -> 1424 to 596
                path.contains("plate-") -> 568 to 92
                path.contains("icon-") -> 146 to 146
                path.contains("rating-") -> 350 to 69
                path.contains("digit-") -> 36 to 44
                path.contains("title-") -> 568 to 53
                path.contains("course-") -> 112 to 45
                else -> 92 to 55
            }
            imageSources.put(path, imageDataUrl(File(dir, path), bounds.first, bounds.second, path.contains("frame-")))
        }
        config.put("imageSources", imageSources)
        // Profile and image Data URLs are inline, so the live bridge updates them as one script version.
        val data = config.toString().replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
        val cameras = if (preview) "<img class=\"lens top\" src=\"assets/lens-top.png\"><img class=\"lens bottom\" src=\"assets/lens-bottom.png\">" else ""
        val html = context.assets.open("card/index.html").bufferedReader().use { it.readText() }
            .replace("/*PROFILE_DATA*/", data).replace("<!--PREVIEW_CAMERAS-->", cameras)
        File(dir, "index.html").writeText(html)
        return dir
    }

    private fun imageDataUrl(file: File, maxWidth: Int, maxHeight: Int, lossy: Boolean): String {
        val original = BitmapFactory.decodeFile(file.absolutePath) ?: error("无法读取图片：${file.name}")
        val scale = min(1.0, min(maxWidth.toDouble() / original.width, maxHeight.toDouble() / original.height))
        val bitmap = if (scale < 1.0) Bitmap.createScaledBitmap(original,
            (original.width * scale).toInt().coerceAtLeast(1), (original.height * scale).toInt().coerceAtLeast(1), true) else original
        try {
            val bytes = ByteArrayOutputStream()
            val format = if (lossy) Bitmap.CompressFormat.WEBP_LOSSY else Bitmap.CompressFormat.PNG
            check(bitmap.compress(format, if (lossy) 90 else 100, bytes)) { "图片编码失败：${file.name}" }
            val mime = if (lossy) "image/webp" else "image/png"
            return "data:$mime;base64,${Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)}"
        } finally {
            if (bitmap !== original) bitmap.recycle()
            original.recycle()
        }
    }

    private fun copyAssets(path: String, dir: File) {
        context.assets.list(path).orEmpty().forEach { name ->
            val child = "$path/$name"
            val target = File(dir, name)
            if (context.assets.list(child).orEmpty().isNotEmpty()) {
                target.mkdirs(); copyAssets(child, target)
            } else context.assets.open(child).use { input -> target.outputStream().use { input.copyTo(it) } }
        }
    }

    private fun fetch(url: String, name: String): File {
        val cached = File(resources, name)
        if (cached.isFile && cached.length() > 0) return cached
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 20_000; conn.readTimeout = 30_000
        val partial = File(resources, "$name.partial")
        try {
            check(conn.responseCode in 200..299) { "素材下载失败（${conn.responseCode}）" }
            conn.inputStream.use { input -> partial.outputStream().use { input.copyTo(it) } }
            check(partial.length() > 0 && partial.renameTo(cached)) { "素材保存失败" }
        } finally { conn.disconnect() }
        return cached
    }
}
