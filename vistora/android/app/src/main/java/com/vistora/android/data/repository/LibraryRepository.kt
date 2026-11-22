package com.vistora.android.data.repository

import com.vistora.android.domain.EpisodeNote
import com.vistora.android.domain.MediaItem
import kotlinx.coroutines.flow.Flow

interface LibraryRepository {
    fun observeItems(): Flow<List<MediaItem>>
    fun observeEpisodeNotes(mediaId: Long): Flow<List<EpisodeNote>>
    suspend fun saveItem(item: MediaItem): Long
    suspend fun deleteItem(mediaId: Long)
    suspend fun saveEpisodeNote(note: EpisodeNote)
    suspend fun deleteEpisodeNote(mediaId: Long, episodeNumber: Int)
}
