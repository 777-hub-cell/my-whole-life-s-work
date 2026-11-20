package com.aharane.studio.core.storage

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.room.*
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory
import java.io.File
import java.io.FileOutputStream
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec

@Entity(
    tableName = "chat_conversations",
    primaryKeys = ["account", "jid"],
    indices = [Index(value = ["account", "lastMessageAtMillis"])]
)
data class ChatConversationRow(
    val account: String,
    val jid: String,
    val title: String,
    val lastMessagePreview: String,
    val lastMessageAtMillis: Long,
    val unreadCount: Int,
    val isGroup: Boolean,
    val isArchived: Boolean,
    val isPinned: Boolean,
    val isMuted: Boolean,
    val lastMessageType: String,
    val lastMessageFromMe: Boolean,
    val lastSyncAtMillis: Long = 0L,
    val newestSyncedTimestampMillis: Long = 0L,
    val newestSyncedMessageId: String = "",
    val oldestSyncedTimestampMillis: Long = 0L,
    val oldestSyncedMessageId: String = "",
    val hasOlderMessages: Boolean = true
)

@Entity(
    tableName = "chat_messages",
    primaryKeys = ["account", "jid", "messageId"],
    indices = [
        Index(value = ["account", "jid", "timestampMillis"]),
        Index(value = ["account", "jid", "text"]),
        Index(value = ["account", "jid", "mediaFileName"])
    ]
)
data class ChatMessageRow(
    val account: String,
    val jid: String,
    val messageId: String,
    val direction: String,
    val kind: String,
    val text: String,
    val timestampMillis: Long,
    val status: String,
    val replyToMessageId: String?,
    val mediaMimeType: String?,
    val mediaFileName: String?,
    val isViewOnce: Boolean,
    val senderName: String?,
    val mediaUrl: String?,
    val mediaSizeBytes: Long?,
    val mediaDurationSeconds: Long?,
    val viewOnceViewed: Boolean,
    val mediaUnavailable: String?,
    val isStarred: Boolean,
    val isVoiceNote: Boolean,
    val reactionsJson: String,
    val cachedMediaPath: String? = null,
    val cachedMediaSha256: String? = null,
    val cachedMediaBytes: Long = 0L
)

@Dao
interface ChatDao {
    @Query("SELECT * FROM chat_conversations WHERE account = :account ORDER BY isPinned DESC, lastMessageAtMillis DESC")
    suspend fun conversations(account: String): List<ChatConversationRow>

    @Query("SELECT * FROM chat_conversations WHERE account = :account AND jid = :jid LIMIT 1")
    suspend fun conversation(account: String, jid: String): ChatConversationRow?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putConversations(rows: List<ChatConversationRow>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putConversation(row: ChatConversationRow)

    @Query("SELECT * FROM chat_messages WHERE account = :account AND jid = :jid ORDER BY timestampMillis ASC")
    suspend fun messages(account: String, jid: String): List<ChatMessageRow>

    @Query("SELECT * FROM chat_messages WHERE account = :account AND jid = :jid AND messageId = :messageId LIMIT 1")
    suspend fun message(account: String, jid: String, messageId: String): ChatMessageRow?

    @Query("SELECT * FROM chat_messages WHERE account = :account AND jid = :jid AND timestampMillis < :before ORDER BY timestampMillis DESC LIMIT :limit")
    suspend fun olderMessages(account: String, jid: String, before: Long, limit: Int): List<ChatMessageRow>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putMessages(rows: List<ChatMessageRow>)

    @Query("""
        SELECT * FROM chat_messages
        WHERE account = :account
          AND (:jid IS NULL OR jid = :jid)
          AND (text LIKE '%' || :query || '%' COLLATE NOCASE
            OR COALESCE(senderName, '') LIKE '%' || :query || '%' COLLATE NOCASE
            OR COALESCE(mediaFileName, '') LIKE '%' || :query || '%' COLLATE NOCASE)
          AND (:fromMillis = 0 OR timestampMillis >= :fromMillis)
          AND (:toMillis = 0 OR timestampMillis <= :toMillis)
        ORDER BY timestampMillis DESC LIMIT :limit
    """)
    suspend fun search(account: String, jid: String?, query: String, fromMillis: Long, toMillis: Long, limit: Int): List<ChatMessageRow>

    @Query("UPDATE chat_conversations SET lastSyncAtMillis = :syncedAt, newestSyncedTimestampMillis = :newest, newestSyncedMessageId = :newestId, oldestSyncedTimestampMillis = :oldest, oldestSyncedMessageId = :oldestId, hasOlderMessages = :hasOlder WHERE account = :account AND jid = :jid")
    suspend fun updateSync(account: String, jid: String, syncedAt: Long, newest: Long, newestId: String, oldest: Long, oldestId: String, hasOlder: Boolean)

    @Query("UPDATE chat_messages SET cachedMediaPath = :path, cachedMediaSha256 = :sha256, cachedMediaBytes = :size WHERE account = :account AND jid = :jid AND messageId = :messageId")
    suspend fun setCachedMedia(account: String, jid: String, messageId: String, path: String?, sha256: String?, size: Long)

    @Query("DELETE FROM chat_messages WHERE account = :account AND jid = :jid")
    suspend fun clearMessages(account: String, jid: String)

    @Query("DELETE FROM chat_conversations WHERE account = :account AND jid = :jid")
    suspend fun clearConversation(account: String, jid: String)

    @Query("SELECT SUM(cachedMediaBytes) FROM chat_messages WHERE account = :account")
    suspend fun cachedMediaBytes(account: String): Long?
}

@Database(
    entities = [ChatConversationRow::class, ChatMessageRow::class],
    version = 2,
    exportSchema = true
)
abstract class AharaneChatDatabase : RoomDatabase() {
    abstract fun chatDao(): ChatDao
}

class EncryptedChatDatabase private constructor(
    val database: AharaneChatDatabase,
    val databaseFile: File
) {
    companion object {
        private const val KEY_ALIAS = "com.aharane.chat.database.wrap.v1"
        private const val KEY_FILE = "chat-database-key.wrap"

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE chat_conversations ADD COLUMN newestSyncedMessageId TEXT NOT NULL DEFAULT ''")
                database.execSQL("ALTER TABLE chat_conversations ADD COLUMN oldestSyncedMessageId TEXT NOT NULL DEFAULT ''")
            }
        }

        fun open(context: Context): EncryptedChatDatabase {
            System.loadLibrary("sqlcipher")
            val root = File(context.noBackupFilesDir, "aharane-secure-chat").apply {
                if (!exists() && !mkdirs()) error("Could not create the private chat storage directory.")
            }
            val file = File(root, "chat-v1.db")
            val keyFile = File(root, KEY_FILE)
            val passphrase = loadOrCreatePassphrase(keyFile, file.exists())
            val factory = SupportOpenHelperFactory(passphrase)
            val db = Room.databaseBuilder(context.applicationContext, AharaneChatDatabase::class.java, file.absolutePath)
                .openHelperFactory(factory)
                .addMigrations(MIGRATION_1_2)
                .build()
            try {
                // Force the encrypted open now. A bad or missing key fails closed here.
                db.openHelper.writableDatabase
            } catch (error: Exception) {
                db.close()
                throw EncryptedChatStorageException(
                    "The encrypted chat database could not be opened. Aharane did not create an unencrypted replacement.",
                    error
                )
            }
            return EncryptedChatDatabase(db, file)
        }

        private fun loadOrCreatePassphrase(keyFile: File, databaseExists: Boolean): ByteArray {
            val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            if (keyFile.exists()) {
                val wrappingKey = keyStore.getKey(KEY_ALIAS, null)
                    ?: throw EncryptedChatStorageException("The Android Keystore wrapping key is missing. Encrypted chats are locked; no unencrypted fallback was created.")
                val blob = keyFile.readBytes()
                if (blob.size <= 12) throw EncryptedChatStorageException("The encrypted chat-key file is incomplete.")
                val iv = blob.copyOfRange(0, 12)
                val encrypted = blob.copyOfRange(12, blob.size)
                return try {
                    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                    cipher.init(Cipher.DECRYPT_MODE, wrappingKey, GCMParameterSpec(128, iv))
                    cipher.doFinal(encrypted)
                } catch (error: Exception) {
                    throw EncryptedChatStorageException("The protected database key cannot be decrypted. Aharane did not reset or downgrade your chat database.", error)
                }
            }
            if (databaseExists) {
                throw EncryptedChatStorageException("The encrypted database exists but its wrapped key is missing. Aharane refused to replace it with a new database.")
            }
            if (keyStore.getKey(KEY_ALIAS, null) != null) {
                throw EncryptedChatStorageException("A chat database key already exists but its wrapped copy is missing.")
            }
            val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            generator.init(
                KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .setRandomizedEncryptionRequired(true)
                    .build()
            )
            val wrappingKey = generator.generateKey()
            val raw = ByteArray(32).also(SecureRandom()::nextBytes)
            try {
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.ENCRYPT_MODE, wrappingKey)
                val encrypted = cipher.doFinal(raw)
                val wrapped = cipher.iv + encrypted
                val temporary = File(keyFile.parentFile, keyFile.name + ".part")
                FileOutputStream(temporary).use { output ->
                    output.write(wrapped)
                    output.fd.sync()
                }
                if (!temporary.renameTo(keyFile)) {
                    temporary.delete()
                    throw EncryptedChatStorageException("Could not safely persist the wrapped database key.")
                }
                return raw.copyOf()
            } finally {
                raw.fill(0)
            }
        }
    }
}

class EncryptedChatStorageException(message: String, cause: Throwable? = null) : Exception(message, cause)
