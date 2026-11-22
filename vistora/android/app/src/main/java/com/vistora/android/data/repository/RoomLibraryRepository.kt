package com.vistora.android.data.repository

import androidx.room.withTransaction
import com.vistora.android.data.local.VistoraDatabase
import com.vistora.android.data.local.toDomain
import com.vistora.android.data.local.toEntity
import com.vistora.android.domain.EpisodeNote
import com.vistora.android.domain.LibrarySnapshot
import com.vistora.android.domain.MediaItem
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class RoomLibraryRepository(
    private val database: VistoraDatabase
) : LibraryRepository {
    private val mediaDao = database.mediaDao()
    private val noteDao = database.episodeNoteDao()

    override fun observeItems(): Flow<List<MediaItem>> =
        mediaDao.observeAll().map { rows -> rows.map { it.toDomain() } }

    override fun observeEpisodeNotes(mediaId: Long): Flow<List<EpisodeNote>> =
        noteDao.observeForMedia(mediaId).map { rows -> rows.map { it.toDomain() } }

    override fun observeAllEpisodeNotes(): Flow<List<EpisodeNote>> =
        noteDao.observeAll().map { rows -> rows.map { it.toDomain() } }

    override suspend fun saveItem(item: MediaItem): Long =
        mediaDao.upsert(item.toEntity())

    override suspend fun deleteItem(mediaId: Long) {
        database.withTransaction {
            mediaDao.deleteById(mediaId)
        }
    }

    override suspend fun saveEpisodeNote(note: EpisodeNote) {
        database.withTransaction {
            if (note.body.isBlank()) {
                noteDao.delete(note.mediaId, note.episodeNumber)
            } else {
                noteDao.upsert(note.toEntity())
            }
        }
    }

    override suspend fun deleteEpisodeNote(mediaId: Long, episodeNumber: Int) {
        noteDao.delete(mediaId, episodeNumber)
    }

    override suspend fun exportSnapshot(): LibrarySnapshot =
        database.withTransaction {
            LibrarySnapshot(
                items = mediaDao.getAllForBackup().map { it.toDomain() },
                episodeNotes = noteDao.getAllForBackup().map { it.toDomain() }
            )
        }

    override suspend fun replaceSnapshot(snapshot: LibrarySnapshot) {
        database.withTransaction {
            noteDao.deleteAll()
            mediaDao.deleteAll()
            mediaDao.upsertAll(snapshot.items.map { it.toEntity() })
            noteDao.upsertAll(snapshot.episodeNotes.map { it.toEntity() })
        }
    }
}
