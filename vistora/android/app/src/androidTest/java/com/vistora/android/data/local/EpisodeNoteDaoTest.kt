package com.vistora.android.data.local

import android.content.Context
import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class EpisodeNoteDaoTest {
    private lateinit var database: VistoraDatabase
    private lateinit var mediaDao: MediaDao
    private lateinit var noteDao: EpisodeNoteDao

    @Before
    fun createDatabase() {
        val context: Context = InstrumentationRegistry.getInstrumentation().targetContext
        database = Room.inMemoryDatabaseBuilder(context, VistoraDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        mediaDao = database.mediaDao()
        noteDao = database.episodeNoteDao()
    }

    @After
    fun closeDatabase() {
        database.close()
    }

    @Test
    fun savingTheSameEpisodeAgainUpdatesTheExistingNote() = runBlocking {
        val mediaId = mediaDao.upsert(sampleMedia())

        noteDao.upsert(EpisodeNoteEntity(mediaId, 12, "First thought", 100L, 100L))
        noteDao.upsert(EpisodeNoteEntity(mediaId, 12, "Updated thought", 100L, 200L))

        val saved = noteDao.find(mediaId, 12)
        assertNotNull(saved)
        assertEquals("Updated thought", saved?.body)
        assertEquals(1, noteDao.getAllForBackup().size)
    }

    @Test
    fun deletingATitleAlsoDeletesItsEpisodeNotes() = runBlocking {
        val mediaId = mediaDao.upsert(sampleMedia())
        noteDao.upsert(EpisodeNoteEntity(mediaId, 1, "A note", 100L, 100L))
        noteDao.upsert(EpisodeNoteEntity(mediaId, 2, "Another note", 100L, 100L))

        mediaDao.deleteById(mediaId)

        assertEquals(null, noteDao.find(mediaId, 1))
        assertEquals(null, noteDao.find(mediaId, 2))
        assertEquals(0, noteDao.getAllForBackup().size)
    }

    @Test
    fun episodeNumberAndTitleTogetherIdentifyANote() = runBlocking {
        val firstTitleId = mediaDao.upsert(sampleMedia("First title"))
        val secondTitleId = mediaDao.upsert(sampleMedia("Second title"))

        noteDao.upsert(EpisodeNoteEntity(firstTitleId, 1, "First title episode one", 100L, 100L))
        noteDao.upsert(EpisodeNoteEntity(firstTitleId, 2, "First title episode two", 100L, 100L))
        noteDao.upsert(EpisodeNoteEntity(secondTitleId, 1, "Second title episode one", 100L, 100L))

        assertEquals(3, noteDao.getAllForBackup().size)
        assertEquals("First title episode one", noteDao.find(firstTitleId, 1)?.body)
        assertEquals("Second title episode one", noteDao.find(secondTitleId, 1)?.body)
    }

    private fun sampleMedia(title: String = "Example series") = MediaEntity(
        title = title,
        type = "ANIME",
        releaseYear = 2024,
        totalEpisodes = 24,
        watchedEpisodes = 0,
        seriesState = "ONGOING",
        status = "PLAN_TO_WATCH",
        rating = 0,
        isWatchlisted = false,
        genres = "Drama",
        synopsis = "",
        posterPath = null,
        addedAt = 100L,
        updatedAt = 100L,
        startedAt = null,
        finishedAt = null,
        watchedOn = null,
        overallThoughts = ""
    )
}
