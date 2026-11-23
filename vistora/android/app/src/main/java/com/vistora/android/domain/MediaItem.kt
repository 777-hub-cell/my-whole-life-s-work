package com.vistora.android.domain

enum class MediaType(val label: String, val category: String) {
    MOVIE("Movie", "Movies"),
    K_DRAMA("K-Drama", "K-Dramas"),
    ANIME("Anime", "Anime"),
    TV_SERIES("TV Series", "TV Series")
}

enum class LibraryStatus(val label: String) {
    WATCHING("Watching"),
    COMPLETED("Completed"),
    PLAN_TO_WATCH("Plan to Watch"),
    ON_HOLD("On Hold"),
    DROPPED("Dropped")
}

enum class TrackedDate { STARTED, FINISHED, WATCHED_ON }

enum class SeriesState(val label: String) {
    ONGOING("Ongoing"),
    COMPLETED("Completed"),
    UPCOMING("Upcoming"),
    UNKNOWN("Unknown")
}

data class MediaItem(
    val id: Long = 0,
    val title: String,
    val type: MediaType,
    val releaseYear: Int? = null,
    val totalEpisodes: Int = 0,
    val watchedEpisodes: Int = 0,
    val seriesState: SeriesState = SeriesState.UNKNOWN,
    val status: LibraryStatus = LibraryStatus.PLAN_TO_WATCH,
    val rating: Int = 0,
    val isWatchlisted: Boolean = false,
    val genres: List<String> = emptyList(),
    val synopsis: String = "",
    val posterPath: String? = null,
    val addedAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val startedAt: Long? = null,
    val finishedAt: Long? = null,
    val watchedOn: Long? = null,
    val overallThoughts: String = "",
    val overallThoughtsUpdatedAt: Long? = null
) {
    val isEpisodic: Boolean get() = totalEpisodes > 0
    val progressPercent: Int
        get() = if (totalEpisodes == 0) 0
        else ((watchedEpisodes.coerceIn(0, totalEpisodes) * 100f) / totalEpisodes).toInt()
}

data class EpisodeNote(
    val mediaId: Long,
    val episodeNumber: Int,
    val body: String,
    val createdAt: Long,
    val updatedAt: Long
)
