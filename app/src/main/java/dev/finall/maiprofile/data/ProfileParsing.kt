package dev.finall.maiprofile.data

import dev.finall.maiprofile.model.PlayerProfile
import java.net.URI

internal fun mergePublicProfile(previous: PlayerProfile, name: String, rating: Int, playCount: Int, now: Long): PlayerProfile =
    previous.copy(name = name, rating = rating, playCount = playCount, publicUpdatedAt = now)

internal fun parseOfficialQr(input: String): String {
    val raw = input.trim()
    require(raw.isNotBlank()) { "请输入二维码内容或网页地址" }
    // Keep the previously verified image-link conversion; let upstream validate all other formats.
    val uri = runCatching { URI(raw) }.getOrNull()
    if (uri?.host == "wq.wahlap.net") {
        val basename = uri.path.orEmpty().substringAfterLast('/')
        if (basename.matches(Regex("MAID[A-Za-z0-9]+\\.png"))) return "SGWC${basename.removeSuffix(".png")}"
    }
    return raw
}
