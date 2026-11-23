package com.vistora.android.domain

data class LibrarySnapshot(
    val items: List<MediaItem>,
    val episodeNotes: List<EpisodeNote>
)
