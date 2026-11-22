package com.vistora.android.domain

data class CatalogResult(
    val providerId: String,
    val title: String,
    val type: MediaType,
    val releaseYear: Int?,
    val totalEpisodes: Int,
    val seriesState: SeriesState,
    val synopsis: String,
    val genres: List<String>,
    val posterUrl: String?,
    val source: String
) {
    fun toDraft(): MediaItem = MediaItem(
        title = title,
        type = type,
        releaseYear = releaseYear,
        totalEpisodes = totalEpisodes,
        seriesState = seriesState,
        status = LibraryStatus.PLAN_TO_WATCH,
        isWatchlisted = true,
        synopsis = synopsis,
        genres = genres,
        posterPath = posterUrl
    )
}

data class CatalogSearchState(
    val query: String = "",
    val isLoading: Boolean = false,
    val results: List<CatalogResult> = emptyList(),
    val error: String? = null,
    val sourceLabel: String? = null
)
