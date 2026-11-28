package com.aharane.studio.features.notes

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class AharaneNote(
    val id: String = UUID.randomUUID().toString(),
    val title: String = "",
    val content: String = "",
    val updatedAt: Long = System.currentTimeMillis()
)

/**
 * Local, encrypted notes. Data is never stored as plaintext or uploaded to the
 * bot. Android Keystore protects the AES key, AtomicFile protects commits.
 * Corrupted or undecryptable files raise an error instead of erasing user notes.
 */
class EncryptedNotesStore(context: Context) {
    private val file = AtomicFile(java.io.File(context.applicationContext.filesDir, "aharane-notes-v1.enc"))
    private val mutex = Mutex()
    private val keyAlias = "aharane.notes.aes.v1"
    private val maxNotes = 1_000
    private val maxNoteChars = 200_000

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(keyAlias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(
                KeyGenParameterSpec.Builder(
                    keyAlias,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build()
            )
            generateKey()
        }
    }

    private fun decrypt(): List<AharaneNote> {
        if (!file.baseFile.exists()) return emptyList()
        val bytes = file.openRead().use { it.readBytes() }
        require(bytes.size in 14..5_000_000) { "Notes storage is invalid or too large. No notes were removed." }
        require(bytes[0] == 'A'.code.toByte() && bytes[1] == 'N'.code.toByte() &&
            bytes[2] == 1.toByte()) { "Unsupported encrypted notes format. No notes were removed." }
        val iv = bytes.copyOfRange(3, 15)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
        val decoded = cipher.doFinal(bytes.copyOfRange(15, bytes.size))
        val data = JSONObject(decoded.toString(Charsets.UTF_8))
        require(data.optInt("version") == 1) { "Unsupported notes version. No notes were removed." }
        val rows = data.optJSONArray("notes") ?: JSONArray()
        require(rows.length() <= maxNotes) { "Unexpected notes count. No notes were removed." }
        return (0 until rows.length()).mapNotNull { index ->
            rows.optJSONObject(index)?.let { row ->
                AharaneNote(
                    id = row.getString("id"),
                    title = row.optString("title"),
                    content = row.optString("content"),
                    updatedAt = row.optLong("updatedAt")
                )
            }
        }
    }

    private fun encrypt(notes: List<AharaneNote>) {
        require(notes.size <= maxNotes) { "Notes limit reached ($maxNotes)." }
        require(notes.all { it.title.length <= 200 && it.content.length <= maxNoteChars }) {
            "Note is too long to save."
        }
        val payload = JSONObject().put("version", 1).put("notes", JSONArray().apply {
            notes.forEach { note ->
                put(JSONObject()
                    .put("id", note.id)
                    .put("title", note.title)
                    .put("content", note.content)
                    .put("updatedAt", note.updatedAt))
            }
        }).toString().toByteArray(Charsets.UTF_8)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val bytes = byteArrayOf('A'.code.toByte(), 'N'.code.toByte(), 1.toByte()) +
            cipher.iv + cipher.doFinal(payload)
        val stream = file.startWrite()
        try {
            stream.write(bytes)
            file.finishWrite(stream)
        } catch (error: Throwable) {
            file.failWrite(stream)
            throw error
        }
    }

    suspend fun all(): List<AharaneNote> = withContext(Dispatchers.IO) {
        mutex.withLock { decrypt().sortedByDescending { it.updatedAt } }
    }

    suspend fun upsert(note: AharaneNote): AharaneNote = withContext(Dispatchers.IO) {
        mutex.withLock {
            val current = decrypt().toMutableList()
            val saved = note.copy(updatedAt = System.currentTimeMillis())
            val index = current.indexOfFirst { it.id == saved.id }
            if (index >= 0) current[index] = saved else current.add(saved)
            encrypt(current)
            saved
        }
    }

    suspend fun delete(id: String): Boolean = withContext(Dispatchers.IO) {
        mutex.withLock {
            val current = decrypt()
            if (current.none { it.id == id }) false else {
                encrypt(current.filterNot { it.id == id })
                true
            }
        }
    }
}
