package dev.finall.maiprofile.model

data class PlayerProfile(
    val name: String = "",
    val rating: Int = 0,
    val playCount: Int = 0,
    val iconId: Int = 0,
    val plateId: Int = 0,
    val frameId: Int = 0,
    val titleId: Int = 0,
    val title: String = "",
    val titleColor: String = "normal",
    val courseRank: Int = 0,
    val classRank: Int = 0,
    val publicUpdatedAt: Long = 0,
    val fullUpdatedAt: Long = 0,
)

data class AppSettings(
    val publicQq: String = "",
    val gatewayToken: String = "",
    val autoRefresh: Boolean = true,
)

data class AppUiState(
    val profile: PlayerProfile = PlayerProfile(),
    val settings: AppSettings = AppSettings(),
    val busy: Boolean = false,
    val status: String = "",
    val error: String? = null,
    val previewUrl: String? = null,
)
