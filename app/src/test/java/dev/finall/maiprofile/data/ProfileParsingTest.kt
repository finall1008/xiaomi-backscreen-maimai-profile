package dev.finall.maiprofile.data

import dev.finall.maiprofile.model.PlayerProfile
import org.junit.Assert.*
import org.junit.Test

class ProfileParsingTest {
    @Test fun publicRefreshKeepsPaidDecorationCache() {
        val full = PlayerProfile(name = "before", rating = 15100, iconId = 256001, plateId = 559501,
            frameId = 559504, titleId = 508571, title = "称号", courseRank = 5, classRank = 2, fullUpdatedAt = 100)
        val public = mergePublicProfile(full, "after", 15158, 1315, 200)
        assertEquals(full.copy(name = "after", rating = 15158, playCount = 1315, publicUpdatedAt = 200), public)
    }
    @Test fun officialImageUrlConvertsToTheSameQrCredential() {
        val credential = "SGWCMAID261012160211ABCD"
        assertEquals(credential, parseOfficialQr("https://wq.wahlap.net/qrcode/img/MAID261012160211ABCD.png?v"))
        assertEquals(credential, parseOfficialQr(" $credential "))
    }
    @Test fun forwardsQrWebpageUrlForUpstreamValidation() {
        val url = "https://wq.wahlap.net/wm/?accessToken=example"
        assertEquals(url, parseOfficialQr(" $url "))
    }
    @Test(expected = IllegalArgumentException::class)
    fun rejectsEmptyQrInput() {
        parseOfficialQr("  ")
    }
}
