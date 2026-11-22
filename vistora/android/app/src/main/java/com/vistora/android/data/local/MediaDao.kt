package com.vistora.android.data.local

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface MediaDao {
    @Query("SELECT * FROM media_items ORDER BY updatedAt DESC, title COLLATE NOCASE ASC")
    fun observeAll(): Flow<List<MediaEntity>>

    @Query("SELECT * FROM media_items WHERE id = :id LIMIT 1")
    suspend fun findById(id: Long): MediaEntity?

    @Upsert
    suspend fun upsert(item: MediaEntity): Long

    @Query("DELETE FROM media_items WHERE id = :id")
    suspend fun deleteById(id: Long)
}

@Dao
interface EpisodeNoteDao {
    @Query("SELECT * FROM episode_notes WHERE mediaId = :mediaId ORDER BY episodeNumber ASC")
    fun observeForMedia(mediaId: Long): Flow<List<EpisodeNoteEntity>>

    @Query("SELECT * FROM episode_notes WHERE mediaId = :mediaId AND episodeNumber = :episode LIMIT 1")
    suspend fun find(mediaId: Long, episode: Int): EpisodeNoteEntity?

    @Upsert
    suspend fun upsert(note: EpisodeNoteEntity)

    @Query("DELETE FROM episode_notes WHERE mediaId = :mediaId AND episodeNumber = :episode")
    suspend fun delete(mediaId: Long, episode: Int)
}
