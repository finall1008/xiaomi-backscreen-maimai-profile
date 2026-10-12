package dev.finall.maiprofile.data

import android.content.Context
import dev.finall.maiprofile.model.AppSettings
import dev.finall.maiprofile.model.PlayerProfile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class ProfileRepository(context: Context) {
    private val prefs = context.getSharedPreferences("profile", Context.MODE_PRIVATE)
    fun settings() = AppSettings(prefs.getString("qq", "").orEmpty(), prefs.getString("gateway_token", "").orEmpty(), prefs.getBoolean("auto", true))
    fun saveSettings(settings: AppSettings) {
        require(settings.publicQq.isEmpty() || settings.publicQq.all { it.isDigit() }) { "请输入正确的 QQ 号" }
        val qq = settings.publicQq.trim()
        val previousQq = prefs.getString("qq", "").orEmpty()
        val edit = prefs.edit().putString("qq", qq).putString("gateway_token", settings.gatewayToken.trim())
            .putBoolean("auto", settings.autoRefresh)
        if (previousQq.isNotBlank() && previousQq != qq) edit.remove("player")
        edit.apply()
    }
    fun profile(): PlayerProfile {
        val j = JSONObject(prefs.getString("player", "{}").orEmpty())
        return PlayerProfile(j.optString("name"), j.optInt("rating"), j.optInt("playCount"), j.optInt("iconId"),
            j.optInt("plateId"), j.optInt("frameId"), j.optInt("titleId"), j.optString("title"), j.optString("titleColor", "normal"),
            j.optInt("courseRank"), j.optInt("classRank"), j.optLong("publicUpdatedAt"), j.optLong("fullUpdatedAt"))
    }
    private fun store(p: PlayerProfile): PlayerProfile {
        val j = JSONObject().apply {
            put("name", p.name); put("rating", p.rating); put("playCount", p.playCount)
            put("iconId", p.iconId); put("plateId", p.plateId); put("frameId", p.frameId)
            put("titleId", p.titleId); put("title", p.title); put("titleColor", p.titleColor)
            put("courseRank", p.courseRank); put("classRank", p.classRank)
            put("publicUpdatedAt", p.publicUpdatedAt); put("fullUpdatedAt", p.fullUpdatedAt)
        }
        prefs.edit().putString("player", j.toString()).apply()
        return p
    }
    suspend fun refreshPublic(): PlayerProfile = withContext(Dispatchers.IO) {
        val qq = settings().publicQq
        require(qq.isNotBlank()) { "请先保存公开 API 的 QQ 号" }
        val j = request("https://net.wmc.pub/api/player/$qq")
        require(j.has("nickname") && j.has("rating")) { "公开接口未返回玩家资料" }
        // A blank public plate is not an equipped nameplate. Preserve all full-profile decoration fields.
        val previous = profile()
        store(mergePublicProfile(previous, j.getString("nickname"), j.getInt("rating"),
            j.optInt("play_count", previous.playCount), System.currentTimeMillis()))
    }
    suspend fun refreshFull(qrInput: String): PlayerProfile = withContext(Dispatchers.IO) {
        val token = settings().gatewayToken
        require(token.isNotBlank()) { "请先保存 AWMC 网关令牌" }
        val qr = parseOfficialQr(qrInput)
        val reply = request("https://api.wmc.pub/v1/user/data", "POST", token,
            JSONObject().put("qrcode", qr).toString(), 180_000)
        require(reply.optInt("returnCode", -1) == 1) { "完整资料查询失败：${reply.optString("returnMessage", reply.optString("msg", "未知错误"))}" }
        val business = reply.optJSONObject("businessData") ?: runCatching { JSONObject(reply.optString("returnMessage")) }.getOrNull()
            ?: error("完整接口未返回资料")
        val u = business.optJSONObject("userData") ?: error("完整接口缺少 userData")
        val previous = profile()
        val id = u.optInt("titleId")
        var title = if (previous.titleId == id) previous.title else ""
        var color = if (previous.titleId == id) previous.titleColor else "normal"
        if (id > 0) runCatching {
            val t = request("https://maimai.lxns.net/api/v0/maimai/trophy/$id")
            title = t.getString("name"); color = t.optString("color", "normal").lowercase()
        }
        store(previous.copy(name = u.optString("userName", previous.name), rating = u.optInt("playerRating", previous.rating),
            playCount = u.optInt("playCount", previous.playCount), iconId = u.optInt("iconId"), plateId = u.optInt("plateId"),
            frameId = u.optInt("frameId"), titleId = id, title = title, titleColor = color,
            courseRank = u.optInt("courseRank"), classRank = u.optInt("classRank"), fullUpdatedAt = System.currentTimeMillis()))
    }
    suspend fun checkIn(): String = withContext(Dispatchers.IO) {
        val token = settings().gatewayToken
        require(token.isNotBlank()) { "请先保存 AWMC 网关令牌" }
        try {
            val j = request("https://api.wmc.pub/checkin", "POST", token)
            j.optString("msg").ifBlank { "签到成功" }
        } catch (e: ApiFailure) {
            if (e.status == 400 && e.apiMessage.equals("Already checked in today", true)) "今日已签到" else throw e
        }
    }
    private fun request(url: String, method: String = "GET", token: String = "", body: String? = null, timeout: Int = 30_000): JSONObject {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.requestMethod = method; conn.connectTimeout = 20_000; conn.readTimeout = timeout
        conn.setRequestProperty("Accept", "application/json")
        if (token.isNotEmpty()) conn.setRequestProperty("Authorization", "Bearer $token")
        if (body != null) {
            conn.doOutput = true; conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        }
        try {
            val status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else conn.errorStream
            val raw = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val json = runCatching { JSONObject(raw) }.getOrNull()
            if (status !in 200..299) {
                val msg = json?.optString("msg")?.takeIf { it.isNotBlank() }
                    ?: json?.optString("message")?.takeIf { it.isNotBlank() } ?: "HTTP $status"
                throw ApiFailure(status, msg)
            }
            return json ?: error("接口未返回 JSON")
        } finally { conn.disconnect() }
    }
    private class ApiFailure(val status: Int, val apiMessage: String) : Exception("请求失败（$status）：$apiMessage")
}
