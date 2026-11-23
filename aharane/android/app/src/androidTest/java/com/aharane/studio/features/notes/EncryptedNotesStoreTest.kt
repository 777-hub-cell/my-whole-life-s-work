package com.aharane.studio.features.notes

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class EncryptedNotesStoreTest {
    @Test
    fun encryptedNotesPersistAcrossRepositoryInstancesAndAllowSafeDeletion() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = EncryptedNotesStore(context)
        val id = java.util.UUID.randomUUID().toString()
        val saved = store.upsert(AharaneNote(id, "Reminder", "**Don't forget** the project"))
        val fresh = EncryptedNotesStore(context)
        assertTrue(fresh.all().any { it.id == id && it.content == "**Don't forget** the project" })
        val updated = fresh.upsert(saved.copy(title = "Edited reminder"))
        assertEquals("Edited reminder", EncryptedNotesStore(context).all().first { it.id == id }.title)
        assertTrue(EncryptedNotesStore(context).delete(updated.id))
        assertFalse(EncryptedNotesStore(context).all().any { it.id == id })
    }
}
