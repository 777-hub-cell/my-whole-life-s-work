package com.vistora.android.data.local

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface MediaDao {
    @Query("SELECT * FROM media_items ORDER BY updatedAt DESC, title COLLATE NOCASE ASC")
    fun observeAll(): Flow<List<MediaEntity>>

    @Query("SELECT * FROM media_items WHERE id = :id LIMIT 1")
    suspend fun findById(id: Long): MediaEntity?

    @Query("SELECT * FROM media_items ORDER BY id ASC")
    suspend fun getAllForBackup(): List<MediaEntity>

    @Upsert
    suspend fun upsert(item: MediaEntity): Long

    @Upsert
    suspend fun upsertAll(items: List<MediaEntity>)

    @Query("DELETE FROM media_items WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("DELETE FROM media_items")
    suspend fun deleteAll()
}

@Dao
interface EpisodeNoteDao {
    @Query("SELECT * FROM episode_notes WHERE mediaId = :mediaId ORDER BY episodeNumber ASC")
    fun observeForMedia(mediaId: Long): Flow<List<EpisodeNoteEntity>>

    @Query("SELECT * FROM episode_notes ORDER BY updatedAt DESC, mediaId ASC, episodeNumber DESC")
    fun observeAll(): Flow<List<EpisodeNoteEntity>>

    @Query("SELECT * FROM episode_notes WHERE mediaId = :mediaId AND episodeNumber = :episode LIMIT 1")
    suspend fun find(mediaId: Long, episode: Int): EpisodeNoteEntity?

    @Query("SELECT * FROM episode_notes ORDER BY mediaId ASC, episodeNumber ASC")
    suspend fun getAllForBackup(): List<EpisodeNoteEntity>

    @Upsert
    suspend fun upsert(note: EpisodeNoteEntity)

    @Upsert
    suspend fun upsertAll(notes: List<EpisodeNoteEntity>)

    @Query("DELETE FROM episode_notes WHERE mediaId = :mediaId AND episodeNumber = :episode")
    suspend fun delete(mediaId: Long, episode: Int)

    @Query("DELETE FROM episode_notes")
    suspend fun deleteAll()
}
