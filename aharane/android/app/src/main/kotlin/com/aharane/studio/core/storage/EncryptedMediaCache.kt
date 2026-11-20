package com.aharane.studio.core.storage

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.CipherInputStream
import javax.crypto.CipherOutputStream
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec

data class EncryptedMediaRecord(val relativePath: String, val sha256: String, val sizeBytes: Long)

/**
 * Authenticated AES-GCM media cache. Filenames and directories are opaque hashes;
 * additional authenticated data binds every file to its account, JID and message id.
 */
class EncryptedMediaCache(context: Context) {
    private val root = File(context.noBackupFilesDir, "aharane-secure-media")
    private val alias = "com.aharane.chat.media.wrap.v1"
    private val preferences = context.applicationContext.getSharedPreferences("aharane-media-cache", Context.MODE_PRIVATE)

    fun maximumCacheBytes(account: String): Long {
        require(account == "private" || account == "public")
        return preferences.getLong("maximum-bytes-" + account, 512L * 1024L * 1024L)
    }

    fun setMaximumCacheMegabytes(account: String, megabytes: Int) {
        require(account == "private" || account == "public")
        require(megabytes in 100..4096) { "Choose a cache limit between 100 MB and 4096 MB." }
        check(preferences.edit().putLong("maximum-bytes-" + account, megabytes.toLong() * 1024L * 1024L).commit())
    }

    fun cacheSizeBytes(account: String): Long {
        require(account == "private" || account == "public")
        return File(root, hash(account)).walkTopDown().filter { it.isFile && it.extension == "enc" }.sumOf { it.length() }
    }

    fun store(account: String, jid: String, messageId: String, bytes: ByteArray, viewOnce: Boolean = false): EncryptedMediaRecord {
        require(account == "private" || account == "public") { "Unknown WhatsApp account." }
        require(!viewOnce) { "View-once media must never be cached." }
        require(bytes.isNotEmpty()) { "The attachment is empty." }
        require(bytes.size <= 256 * 1024 * 1024) { "Offline media is limited to 256 MB per item." }
        val ownership = account + "|" + jid + "|" + messageId
        val folder = File(root, hash(account) + "/" + hash(jid)).apply {
            if (!exists() && !mkdirs()) error("Could not create the private media cache.")
        }
        val target = File(folder, hash(messageId) + ".enc")
        val existingBytes = if (target.exists()) target.length() else 0L
        require(cacheSizeBytes(account) - existingBytes + bytes.size <= maximumCacheBytes(account)) {
            "The offline media cache is full. Increase its limit or clear older cached media."
        }
        val temporary = File(folder, target.name + ".part")
        val iv = ByteArray(12).also(SecureRandom()::nextBytes)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, mediaKey(), GCMParameterSpec(128, iv))
        cipher.updateAAD(ownership.toByteArray(Charsets.UTF_8))
        FileOutputStream(temporary).use { raw ->
            raw.write(iv)
            CipherOutputStream(raw, cipher).use { encrypted -> encrypted.write(bytes) }
        }
        val digest = sha256(bytes)
        val verifiedBytes = readEncryptedFile(temporary, ownership)
        check(sha256(verifiedBytes) == digest && verifiedBytes.size == bytes.size) { "Encrypted media verification failed." }
        if (target.exists() && !target.delete()) throw IllegalStateException("Could not replace the older media cache entry.")
        if (!temporary.renameTo(target)) throw IllegalStateException("Could not commit the encrypted media file.")
        return EncryptedMediaRecord(root.toPath().relativize(target.toPath()).toString(), digest, bytes.size.toLong())
    }

    fun read(account: String, jid: String, messageId: String, relativePath: String, expectedSha256: String): ByteArray {
        val target = File(root, relativePath).canonicalFile
        require(target.path.startsWith(root.canonicalPath + File.separator)) { "Invalid cached media path." }
        val bytes = readEncryptedFile(target, account + "|" + jid + "|" + messageId)
        check(sha256(bytes) == expectedSha256) { "The cached attachment failed its integrity check." }
        return bytes
    }

    fun delete(account: String, jid: String, messageId: String) {
        val target = File(root, hash(account) + "/" + hash(jid) + "/" + hash(messageId) + ".enc")
        if (target.exists() && !target.delete()) throw IllegalStateException("Could not delete the encrypted cached attachment.")
    }

    fun clearConversation(account: String, jid: String) {
        File(root, hash(account) + "/" + hash(jid)).deleteRecursively()
    }

    fun clearAccount(account: String) {
        require(account == "private" || account == "public")
        File(root, hash(account)).deleteRecursively()
    }

    fun clearAll() {
        if (root.exists()) root.deleteRecursively()
        if (!root.exists() && !root.mkdirs()) throw IllegalStateException("Could not clear the offline media cache.")
    }

    private fun readEncryptedFile(file: File, aad: String): ByteArray {
        require(file.isFile && file.length() > 12) { "Encrypted media file is missing or incomplete." }
        FileInputStream(file).use { input ->
            val iv = ByteArray(12)
            check(input.read(iv) == iv.size) { "Encrypted media header is incomplete." }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, mediaKey(), GCMParameterSpec(128, iv))
            cipher.updateAAD(aad.toByteArray(Charsets.UTF_8))
            val output = ByteArrayOutputStream()
            CipherInputStream(input, cipher).use { it.copyTo(output) }
            return output.toByteArray()
        }
    }

    private fun mediaKey(): java.security.Key {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        store.getKey(alias, null)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder(
            alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .build())
        return generator.generateKey()
    }

    private fun hash(value: String): String = sha256(value.toByteArray(Charsets.UTF_8))
    private fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
