package com.aharane.studio.core.storage

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.aharane.studio.core.network.AharaneApiException
import com.aharane.studio.core.network.AharaneConnectionManager
import com.aharane.studio.core.network.AharaneRepository
import com.aharane.studio.core.network.ServerFileEntry
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.KeyStore
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.CipherOutputStream
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec

data class CachedWorkspaceFile(
    val name: String,
    val path: String,
    val isDirectory: Boolean,
    val sizeBytes: Long?,
    val modifiedAt: String?,
    val readOnly: Boolean,
    val serverSha256: String = "",
    val language: String = "",
    val hasContent: Boolean = false,
    val pendingSync: Boolean = false,
    val syncConflict: Boolean = false
)

data class PendingWorkspaceDocument(
    val path: String,
    val content: String,
    val baseSha256: String
)

/**
 * Encrypted on-device mirror for source files. File payloads and the path manifest
 * are AES-GCM protected by Android Keystore; writes are committed atomically.
 */
class EncryptedWorkspaceStore(context: Context) {
    private val root = File(context.applicationContext.noBackupFilesDir, "aharane-private-workspace")
    private val manifestFile = File(root, "manifest.enc")
    private val keyAlias = "com.aharane.workspace.files.v1"
    private val lock = Any()

    init {
        if (!root.exists() && !root.mkdirs()) {
            throw IllegalStateException("Could not create the private Aharane workspace cache.")
        }
    }

    fun entries(): List<CachedWorkspaceFile> = synchronized(lock) {
        readManifest().values.sortedWith(
            compareByDescending<CachedWorkspaceFile> { it.isDirectory }
                .thenBy { it.path.lowercase(java.util.Locale.ROOT) }
        )
    }

    fun file(path: String): CachedWorkspaceFile? = synchronized(lock) { readManifest()[path] }

    fun replaceRemoteTree(remote: List<ServerFileEntry>) = synchronized(lock) {
        require(remote.size <= 10_000) { "The workspace contains too many entries to cache safely." }
        val existing = readManifest()
        val next = linkedMapOf<String, CachedWorkspaceFile>()
        remote.forEach { entry ->
            val old = existing[entry.path]
            next[entry.path] = if (old?.pendingSync == true) {
                old.copy(
                    name = entry.name,
                    isDirectory = entry.isDirectory,
                    sizeBytes = entry.sizeBytes,
                    modifiedAt = entry.modifiedAt,
                    readOnly = entry.readOnly
                )
            } else {
                // Keep an offline payload only while its server metadata still matches.
                // A changed or undated remote file must be fetched again before it is
                // treated as the current offline copy.
                val metadataUnchanged = old != null &&
                    !old.modifiedAt.isNullOrBlank() &&
                    old.modifiedAt == entry.modifiedAt &&
                    old.sizeBytes == entry.sizeBytes
                CachedWorkspaceFile(
                    name = entry.name,
                    path = entry.path,
                    isDirectory = entry.isDirectory,
                    sizeBytes = entry.sizeBytes,
                    modifiedAt = entry.modifiedAt,
                    readOnly = entry.readOnly,
                    serverSha256 = if (metadataUnchanged) old.serverSha256 else "",
                    language = if (metadataUnchanged) old.language else "",
                    hasContent = metadataUnchanged && old.hasContent && encryptedFile(entry.path).isFile
                )
            }
        }
        existing.values.filter { it.pendingSync && it.path !in next }.forEach {
            next[it.path] = it.copy(syncConflict = true)
        }
        existing.keys.filter { it !in next }.forEach { deleteEncrypted(it) }
        writeManifest(next)
    }

    fun cacheRemoteText(path: String, content: String, serverSha256: String, language: String) = synchronized(lock) {
        val current = readManifest()
        val old = current[path]
        if (old?.pendingSync == true) return@synchronized
        val bytes = content.toByteArray(Charsets.UTF_8)
        writeEncrypted(encryptedFile(path), path, bytes)
        val name = old?.name ?: path.substringAfterLast('/')
        current[path] = (old ?: CachedWorkspaceFile(name, path, false, bytes.size.toLong(), null, false)).copy(
            sizeBytes = bytes.size.toLong(),
            serverSha256 = serverSha256,
            language = language,
            hasContent = true,
            pendingSync = false,
            syncConflict = false
        )
        writeManifest(current)
    }

    fun saveLocalText(path: String, content: String, baseSha256: String, language: String): CachedWorkspaceFile = synchronized(lock) {
        require(path.isNotBlank() && !path.endsWith("/")) { "Choose a file before saving." }
        val current = readManifest()
        val old = current[path]
        require(old?.isDirectory != true) { "A folder cannot be opened as a text document." }
        val bytes = content.toByteArray(Charsets.UTF_8)
        writeEncrypted(encryptedFile(path), path, bytes)
        val record = (old ?: CachedWorkspaceFile(
            name = path.substringAfterLast('/'),
            path = path,
            isDirectory = false,
            sizeBytes = bytes.size.toLong(),
            modifiedAt = null,
            readOnly = false
        )).copy(
            sizeBytes = bytes.size.toLong(),
            serverSha256 = old?.serverSha256?.takeIf { it.isNotBlank() } ?: baseSha256,
            language = language.ifBlank { old?.language.orEmpty() },
            hasContent = true,
            pendingSync = true,
            syncConflict = false
        )
        current[path] = record
        writeManifest(current)
        record
    }

    fun readText(path: String): String? = synchronized(lock) {
        val record = readManifest()[path] ?: return@synchronized null
        if (!record.hasContent) return@synchronized null
        runCatching { readEncrypted(encryptedFile(path), path).toString(Charsets.UTF_8) }.getOrNull()
    }

    fun pendingDocuments(): List<PendingWorkspaceDocument> = synchronized(lock) {
        readManifest().values.filter { it.pendingSync && !it.isDirectory && it.hasContent && !it.syncConflict }
            .mapNotNull { record ->
                runCatching {
                    PendingWorkspaceDocument(
                        path = record.path,
                        content = readEncrypted(encryptedFile(record.path), record.path).toString(Charsets.UTF_8),
                        baseSha256 = record.serverSha256
                    )
                }.getOrNull()
            }
    }

    fun markSynced(path: String, newSha256: String) = synchronized(lock) {
        val current = readManifest()
        val old = current[path] ?: return@synchronized
        current[path] = old.copy(serverSha256 = newSha256, pendingSync = false, syncConflict = false)
        writeManifest(current)
    }

    fun markConflict(path: String) = synchronized(lock) {
        val current = readManifest()
        val old = current[path] ?: return@synchronized
        current[path] = old.copy(syncConflict = true)
        writeManifest(current)
    }

    private fun readManifest(): MutableMap<String, CachedWorkspaceFile> {
        if (!manifestFile.isFile) return linkedMapOf()
        val decoded = readEncrypted(manifestFile, "workspace-manifest").toString(Charsets.UTF_8)
        val rows = JSONArray(decoded)
        return buildMap {
            for (index in 0 until rows.length()) {
                val row = rows.optJSONObject(index) ?: continue
                val path = row.optString("path")
                if (path.isBlank()) continue
                put(path, CachedWorkspaceFile(
                    name = row.optString("name"),
                    path = path,
                    isDirectory = row.optBoolean("isDirectory"),
                    sizeBytes = row.optLong("sizeBytes").takeIf { it >= 0L },
                    modifiedAt = row.optString("modifiedAt").takeIf { it.isNotBlank() },
                    readOnly = row.optBoolean("readOnly"),
                    serverSha256 = row.optString("serverSha256"),
                    language = row.optString("language"),
                    hasContent = row.optBoolean("hasContent") && encryptedFile(path).isFile,
                    pendingSync = row.optBoolean("pendingSync"),
                    syncConflict = row.optBoolean("syncConflict")
                ))
            }
        }.toMutableMap()
    }

    private fun writeManifest(records: Map<String, CachedWorkspaceFile>) {
        val rows = JSONArray()
        records.values.forEach { record ->
            rows.put(JSONObject()
                .put("name", record.name)
                .put("path", record.path)
                .put("isDirectory", record.isDirectory)
                .put("sizeBytes", record.sizeBytes ?: -1L)
                .put("modifiedAt", record.modifiedAt.orEmpty())
                .put("readOnly", record.readOnly)
                .put("serverSha256", record.serverSha256)
                .put("language", record.language)
                .put("hasContent", record.hasContent)
                .put("pendingSync", record.pendingSync)
                .put("syncConflict", record.syncConflict))
        }
        writeEncrypted(manifestFile, "workspace-manifest", rows.toString().toByteArray(Charsets.UTF_8))
    }

    private fun encryptedFile(path: String): File = File(root, sha256(path.toByteArray(Charsets.UTF_8)) + ".enc")

    private fun deleteEncrypted(path: String) {
        val target = encryptedFile(path)
        if (target.exists() && !target.delete()) throw IllegalStateException("Could not remove an obsolete offline workspace file.")
    }

    private fun writeEncrypted(target: File, aad: String, bytes: ByteArray) {
        val temporary = File(root, target.name + ".part")
        val backup = File(root, target.name + ".bak")
        try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, workspaceKey())
            val iv = cipher.iv ?: error("Android Keystore did not return an encryption nonce.")
            cipher.updateAAD(aad.toByteArray(Charsets.UTF_8))
            FileOutputStream(temporary).use { raw ->
                raw.write(iv)
                CipherOutputStream(raw, cipher).use { encrypted -> encrypted.write(bytes) }
            }
            if (backup.exists() && !backup.delete()) error("Could not clear an old workspace-file backup.")
            if (target.exists() && !target.renameTo(backup)) error("Could not preserve the previous offline file.")
            if (!temporary.renameTo(target)) {
                backup.takeIf { it.exists() }?.renameTo(target)
                error("Could not commit the encrypted workspace file.")
            }
            backup.delete()
        } finally {
            temporary.delete()
        }
    }

    private fun readEncrypted(file: File, aad: String): ByteArray {
        require(file.isFile && file.length() > 12L) { "The encrypted workspace file is missing or incomplete." }
        FileInputStream(file).use { input ->
            val iv = ByteArray(12)
            var offset = 0
            while (offset < iv.size) {
                val count = input.read(iv, offset, iv.size - offset)
                if (count < 0) error("The encrypted workspace header is incomplete.")
                offset += count
            }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, workspaceKey(), GCMParameterSpec(128, iv))
            cipher.updateAAD(aad.toByteArray(Charsets.UTF_8))
            val ciphertext = input.readBytes()
            return cipher.doFinal(ciphertext)
        }
    }

    private fun workspaceKey(): java.security.Key {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        keyStore.getKey(keyAlias, null)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder(
            keyAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .build())
        return generator.generateKey()
    }

    private fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}

object WorkspaceSyncService {
    private const val MAX_FILE_BYTES = 8L * 1024L * 1024L
    private const val MAX_TOTAL_BYTES = 128L * 1024L * 1024L

    suspend fun sync(repository: AharaneRepository, store: EncryptedWorkspaceStore): List<ServerFileEntry> {
        store.pendingDocuments().forEach { pending ->
            try {
                val sha = repository.saveFile(pending.path, pending.content, pending.baseSha256)
                store.markSynced(pending.path, sha)
            } catch (error: AharaneApiException) {
                if (error.statusCode == 409) {
                    store.markConflict(pending.path)
                } else {
                    throw error
                }
            }
        }

        val remote = repository.allFiles()
        store.replaceRemoteTree(remote)
        val cachedBytes = store.entries().asSequence()
            .filter { !it.isDirectory && it.hasContent }
            .sumOf { (it.sizeBytes ?: 0L).coerceAtLeast(0L) }
        var remaining = (MAX_TOTAL_BYTES - cachedBytes).coerceAtLeast(0L)
        remote.asSequence()
            .filterNot { it.isDirectory }
            .filter { entry -> (entry.sizeBytes ?: 0L) in 0L..MAX_FILE_BYTES }
            .forEach { entry ->
                val current = store.file(entry.path)
                if (current?.pendingSync == true || current?.hasContent == true) return@forEach
                if (remaining <= 0L) return@forEach
                runCatching {
                    val document = repository.previewFile(entry.path)
                    val bytes = document.content.toByteArray(Charsets.UTF_8)
                    if (bytes.size.toLong() <= remaining && bytes.size.toLong() <= MAX_FILE_BYTES) {
                        store.cacheRemoteText(entry.path, document.content, document.sha256, document.language)
                        remaining -= bytes.size.toLong()
                    }
                }
            }
        return store.entries().map { record ->
            ServerFileEntry(
                name = record.name,
                path = record.path,
                isDirectory = record.isDirectory,
                sizeBytes = record.sizeBytes,
                modifiedAt = record.modifiedAt,
                readOnly = record.readOnly
            )
        }
    }
}

class WorkspaceSyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val connection = AharaneConnectionManager(applicationContext)
        if (connection.savedStudioUrl.isBlank()) return Result.success()
        val restored = runCatching { connection.restoreSession() }.getOrDefault(false)
        if (!restored) {
            return if (connection.api?.hasSavedSession() == true) Result.retry() else Result.success()
        }
        return try {
            val store = EncryptedWorkspaceStore(applicationContext)
            WorkspaceSyncService.sync(AharaneRepository(connection), store)
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }

    companion object {
        const val WORK_NAME = "aharane-encrypted-workspace-sync"
    }
}

object WorkspaceSyncScheduler {
    fun enqueue(context: Context) {
        val request = OneTimeWorkRequestBuilder<WorkspaceSyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
            WorkspaceSyncWorker.WORK_NAME,
            ExistingWorkPolicy.APPEND_OR_REPLACE,
            request
        )
    }
}
