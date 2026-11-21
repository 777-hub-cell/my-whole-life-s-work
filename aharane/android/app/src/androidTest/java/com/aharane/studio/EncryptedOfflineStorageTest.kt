package com.aharane.studio

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.sqlite.db.SupportSQLiteOpenHelper
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.model.ChatMessage
import com.aharane.studio.core.model.ConversationKey
import com.aharane.studio.core.model.MessageDirection
import com.aharane.studio.core.model.MessageKind
import com.aharane.studio.core.model.MessageStatus
import com.aharane.studio.core.storage.ChatConversationRow
import com.aharane.studio.core.storage.ChatMessageRow
import com.aharane.studio.core.storage.EncryptedChatDatabase
import com.aharane.studio.core.storage.EncryptedChatStorageException
import com.aharane.studio.core.storage.EncryptedMediaCache
import com.aharane.studio.core.storage.LocalChatRepository
import com.aharane.studio.features.chats.ChatAppearanceStore
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class EncryptedOfflineStorageTest {
    private val context: Context
        get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test
    fun encryptedRoomDatabasePersistsAcrossCloseAndReopen() = runBlocking {
        val marker = "AHARANE_PRIVATE_CHAT_PLAINTEXT_SENTINEL"
        val jid = "2348000000000@s.whatsapp.net"
        val first = EncryptedChatDatabase.open(context)
        val file = first.databaseFile
        first.database.chatDao().putConversation(
            ChatConversationRow(
                account = "private",
                jid = jid,
                title = marker,
                lastMessagePreview = marker,
                lastMessageAtMillis = 1760000000000,
                unreadCount = 0,
                isGroup = false,
                isArchived = false,
                isPinned = false,
                isMuted = false,
                lastMessageType = "TEXT",
                lastMessageFromMe = false
            )
        )
        first.database.chatDao().putMessages(
            listOf(
                ChatMessageRow(
                    account = "private",
                    jid = jid,
                    messageId = "offline-1",
                    direction = "INCOMING",
                    kind = "TEXT",
                    text = marker,
                    timestampMillis = 1760000000000,
                    status = "DELIVERED",
                    replyToMessageId = null,
                    quotedMessageText = null,
                    mediaMimeType = null,
                    mediaFileName = null,
                    isViewOnce = false,
                    senderName = "Tester",
                    mediaUrl = null,
                    mediaSizeBytes = null,
                    mediaDurationSeconds = null,
                    viewOnceViewed = false,
                    mediaUnavailable = null,
                    isStarred = false,
                    isVoiceNote = false,
                    reactionsJson = "[]"
                )
            )
        )
        first.database.close()

        assertTrue(file.exists())
        val databaseBytes = file.readBytes().toString(Charsets.ISO_8859_1)
        assertFalse("Database file exposed chat content in plaintext.", databaseBytes.contains(marker))
        assertTrue("The app stores the encrypted database in no-backup storage.", file.path.startsWith(context.noBackupFilesDir.path))

        val reopened = EncryptedChatDatabase.open(context)
        val restored = reopened.database.chatDao().conversation("private", jid)
        assertEquals(marker, restored?.title)
        assertEquals(marker, reopened.database.chatDao().messages("private", jid).single().text)
        assertTrue(reopened.database.chatDao().messages("public", jid).isEmpty())

        val original = reopened.database.chatDao().messages("private", jid).single()
        val attachment = original.copy(
            messageId = "offline-search-file",
            text = "Annual review attached",
            timestampMillis = 1760000005000,
            mediaFileName = "roster-2026.pdf",
            senderName = "Elena"
        )
        reopened.database.chatDao().putMessages(listOf(attachment))
        assertEquals(
            "roster-2026.pdf",
            reopened.database.chatDao().search("private", null, "ROSTER-2026.PDF", 0L, 0L, 10).single().mediaFileName
        )
        assertEquals(
            "Elena",
            reopened.database.chatDao().search("private", null, "elena", 0L, 0L, 10).single().senderName
        )
        assertEquals(
            0,
            reopened.database.chatDao().search("public", null, "annual review", 0L, 0L, 10).size
        )
        assertEquals(
            0,
            reopened.database.chatDao().search("private", null, "annual review", 1760000006000, 0L, 10).size
        )

        reopened.database.chatDao().putMessages(listOf(attachment.copy(text = "Corrected review")))
        val duplicateRows = reopened.database.chatDao().messages("private", jid).filter { it.messageId == attachment.messageId }
        assertEquals(1, duplicateRows.size)
        assertEquals("Corrected review", duplicateRows.single().text)

        reopened.database.chatDao().clearMessages("private", jid)
        reopened.database.chatDao().clearConversation("private", jid)
        reopened.database.close()
    }

    @Test
    fun remoteDeletionMarkerPersistsBothDirectionsAndPreservesOfflineMedia() = runBlocking {
        val jid = "2348999999999@s.whatsapp.net"
        val db = EncryptedChatDatabase.open(context)
        val dao = db.database.chatDao()
        dao.putConversation(
            ChatConversationRow(
                account = "private", jid = jid, title = "Retention test",
                lastMessagePreview = "original message", lastMessageAtMillis = 1765000000000L,
                unreadCount = 0, isGroup = false, isArchived = false, isPinned = false,
                isMuted = false, lastMessageType = "TEXT", lastMessageFromMe = false
            )
        )
        fun row(id: String, direction: String, viewOnce: Boolean = false) = ChatMessageRow(
            account = "private", jid = jid, messageId = id, direction = direction,
            kind = if (viewOnce) "IMAGE" else "TEXT",
            text = if (viewOnce) "" else "Original content $id",
            timestampMillis = 1765000000000L, status = "DELIVERED",
            replyToMessageId = null, quotedMessageText = null, mediaMimeType = null, mediaFileName = null,
            isViewOnce = viewOnce, senderName = "Participant", mediaUrl = null,
            mediaSizeBytes = null, mediaDurationSeconds = null, viewOnceViewed = false,
            mediaUnavailable = null, isStarred = false, isVoiceNote = false,
            reactionsJson = "[]"
        )
        dao.putMessages(
            listOf(
                row("incoming-retained", "INCOMING").copy(
                    cachedMediaPath = "private/retained-media.enc",
                    cachedMediaSha256 = "a".repeat(64),
                    cachedMediaBytes = 512L
                ),
                row("outgoing-kept", "OUTGOING"),
                row("view-once-not-marked", "INCOMING", viewOnce = true)
            )
        )
        dao.markMessageDeletedRemotely("private", jid, "incoming-retained", 1765000001000L)
        dao.markMessageDeletedRemotely("private", jid, "outgoing-kept", 1765000001000L)
        dao.markMessageDeletedRemotely("private", jid, "view-once-not-marked", 1765000001000L)

        val incoming = dao.message("private", jid, "incoming-retained")
        val outgoing = dao.message("private", jid, "outgoing-kept")
        val viewOnce = dao.message("private", jid, "view-once-not-marked")
        assertNotNull(incoming)
        assertEquals("Original content incoming-retained", incoming?.text)
        assertTrue(incoming?.deletedByRemote == true)
        assertEquals(1765000001000L, incoming?.deletedAtMillis)
        assertEquals("private/retained-media.enc", incoming?.cachedMediaPath)
        assertEquals("a".repeat(64), incoming?.cachedMediaSha256)
        assertEquals(512L, incoming?.cachedMediaBytes)
        assertTrue("A remotely revoked outgoing message is retained too.", outgoing?.deletedByRemote == true)
        assertFalse(viewOnce?.deletedByRemote == true)

        dao.clearMessages("private", jid)
        dao.clearConversation("private", jid)
        db.database.close()
    }

    @Test
    fun encryptedMediaRequiresCorrectAccountAndConversationIdentity() {
        val cache = EncryptedMediaCache(context)
        val bytes = "offline-image-payload-sentinel".toByteArray()
        val jid = "2348111111111@s.whatsapp.net"
        val messageId = "image-1"
        val record = cache.store("private", jid, messageId, bytes)
        val path = File(File(context.noBackupFilesDir, "aharane-secure-media"), record.relativePath)
        assertTrue(path.exists())
        assertFalse(path.readBytes().toString(Charsets.ISO_8859_1).contains("offline-image-payload-sentinel"))
        assertArrayEquals(bytes, cache.read("private", jid, messageId, record.relativePath, record.sha256))
        assertThrows(Exception::class.java) {
            cache.read("public", jid, messageId, record.relativePath, record.sha256)
        }
        val corrupted = path.readBytes()
        corrupted[corrupted.lastIndex] = (corrupted.last().toInt() xor 0x40).toByte()
        path.writeBytes(corrupted)
        assertThrows(Exception::class.java) {
            cache.read("private", jid, messageId, record.relativePath, record.sha256)
        }
        assertThrows(IllegalArgumentException::class.java) {
            cache.store("private", jid, "view-once:one-time", bytes, viewOnce = true)
        }
        cache.delete("private", jid, messageId)
        cache.clearConversation("private", jid)
        assertFalse(path.exists())
    }

    @Test
    fun missingKeystoreWrappingKeyFailsClosedWithoutCreatingPlaintextDatabase() = runBlocking {
        val namespace = java.util.UUID.randomUUID().toString().replace("-", "").take(24)
        val alias = "com.aharane.chat.database.wrap.v1.$namespace"
        val isolated = EncryptedChatDatabase.openForTesting(context, namespace)
        val databaseFile = isolated.databaseFile
        isolated.database.chatDao().putConversation(
            ChatConversationRow(
                account = "private", jid = "2348555555555@s.whatsapp.net",
                title = "Keep encrypted", lastMessagePreview = "private",
                lastMessageAtMillis = 1762000000000, unreadCount = 0, isGroup = false,
                isArchived = false, isPinned = false, isMuted = false,
                lastMessageType = "TEXT", lastMessageFromMe = false
            )
        )
        isolated.database.close()
        val keyStore = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        keyStore.deleteEntry(alias)
        try {
            assertThrows(EncryptedChatStorageException::class.java) {
                EncryptedChatDatabase.openForTesting(context, namespace)
            }
            assertTrue("Encrypted user data must be left in place for recovery.", databaseFile.exists())
            assertTrue("The database must never be silently replaced with plaintext.", databaseFile.length() > 0L)
        } finally {
            databaseFile.parentFile?.deleteRecursively()
            keyStore.deleteEntry(alias)
        }
    }

    @Test
    fun encryptedOutgoingTextQueueSurvivesReopenAndRecoversInterruptedSend() = runBlocking {
        val jid = "2348777777777@s.whatsapp.net"
        val conversation = com.aharane.studio.core.model.ChatSummary(
            key = com.aharane.studio.core.model.ConversationKey(ChatAccount.PRIVATE, jid),
            title = "Outbox test",
            lastMessagePreview = "",
            lastMessageAtMillis = 1764000000000L
        )
        val first = LocalChatRepository(context)
        val clientId = first.enqueueTextMessage(conversation, "queued while offline", null)
        assertEquals("PENDING", first.outgoingMessage(conversation.key, clientId)?.state)
        first.updateOutgoingMessage(conversation.key, clientId, "SENDING")
        first.close()

        val reopened = LocalChatRepository(context)
        try {
            reopened.resetInterruptedOutgoingMessages()
            val interrupted = reopened.outgoingMessage(conversation.key, clientId)
            assertEquals("FAILED", interrupted?.state)
            assertTrue(interrupted?.lastError.orEmpty().contains("same server idempotency key"))
            val displayed = reopened.messages(conversation.key).single()
            assertEquals("local-$clientId", displayed.messageId)
            assertEquals(MessageStatus.FAILED, displayed.status)
            assertEquals("FAILED", displayed.localOutboxState)

            reopened.updateOutgoingMessage(conversation.key, clientId, "PENDING", null)
            assertTrue(reopened.pendingOutgoingMessages(ChatAccount.PRIVATE).any { it.jid == jid && it.clientMessageId == clientId })
            assertTrue(reopened.outgoingMessages(ConversationKey(ChatAccount.PUBLIC, jid)).isEmpty())

            reopened.updateOutgoingMessage(conversation.key, clientId, "SENT", null, "remote-outgoing-1")
            val sent = reopened.messages(conversation.key).single()
            assertEquals("remote-outgoing-1", sent.messageId)
            assertEquals(MessageStatus.SENT, sent.status)
            assertEquals("SENT", sent.localOutboxState)
        } finally {
            reopened.clearLocalConversation(conversation.key)
            reopened.close()
        }
    }

    @Test
    fun roomVersionOneMigrationAddsCompositeCursorColumnsWithoutDroppingHistory() {
        val helper = FrameworkSQLiteOpenHelperFactory().create(
            SupportSQLiteOpenHelper.Configuration.builder(context)
                .name(null)
                .callback(object : SupportSQLiteOpenHelper.Callback(1) {
                    override fun onCreate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                        db.execSQL(
                            """CREATE TABLE chat_conversations (
                                account TEXT NOT NULL,
                                jid TEXT NOT NULL,
                                title TEXT NOT NULL,
                                lastMessagePreview TEXT NOT NULL,
                                lastMessageAtMillis INTEGER NOT NULL,
                                unreadCount INTEGER NOT NULL,
                                isGroup INTEGER NOT NULL,
                                isArchived INTEGER NOT NULL,
                                isPinned INTEGER NOT NULL,
                                isMuted INTEGER NOT NULL,
                                lastMessageType TEXT NOT NULL,
                                lastMessageFromMe INTEGER NOT NULL,
                                lastSyncAtMillis INTEGER NOT NULL,
                                newestSyncedTimestampMillis INTEGER NOT NULL,
                                oldestSyncedTimestampMillis INTEGER NOT NULL,
                                hasOlderMessages INTEGER NOT NULL,
                                PRIMARY KEY(account, jid)
                            )"""
                        )
                        db.execSQL(
                            "INSERT INTO chat_conversations VALUES ('private','2348444444444@s.whatsapp.net','Saved','hello',1761000000000,2,0,0,0,0,'TEXT',0,1761000000100,1761000000000,1760000000000,1)"
                        )
                    }
                    override fun onUpgrade(db: androidx.sqlite.db.SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
                })
                .build()
        )
        try {
            val db = helper.writableDatabase
            EncryptedChatDatabase.MIGRATION_1_2.migrate(db)
            val columns = mutableSetOf<String>()
            db.query("PRAGMA table_info(chat_conversations)").use { cursor ->
                val index = cursor.getColumnIndexOrThrow("name")
                while (cursor.moveToNext()) columns += cursor.getString(index)
            }
            assertTrue(columns.contains("newestSyncedMessageId"))
            assertTrue(columns.contains("oldestSyncedMessageId"))
            db.query("SELECT title, unreadCount FROM chat_conversations WHERE account='private'").use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals("Saved", cursor.getString(0))
                assertEquals(2, cursor.getInt(1))
            }
        } finally {
            helper.close()
        }
    }

    @Test
    fun offlineSearchSupportsSenderFilenameAndDateWithoutNetwork() = runBlocking {
        val jid = "2348333333333@s.whatsapp.net"
        val firstTimestamp = 1761000000000L
        val secondTimestamp = firstTimestamp + 86_400_000L
        val db = EncryptedChatDatabase.open(context)
        db.database.chatDao().putConversation(
            ChatConversationRow(
                account = "private", jid = jid, title = "Offline contact",
                lastMessagePreview = "report.pdf", lastMessageAtMillis = secondTimestamp,
                unreadCount = 0, isGroup = false, isArchived = false, isPinned = false,
                isMuted = false, lastMessageType = "DOCUMENT", lastMessageFromMe = false
            )
        )
        db.database.chatDao().putMessages(
            listOf(
                ChatMessageRow(
                    account = "private", jid = jid, messageId = "offline-search-1",
                    direction = "INCOMING", kind = "TEXT", text = "clinic follow up",
                    timestampMillis = firstTimestamp, status = "DELIVERED",
                    replyToMessageId = null, quotedMessageText = null, mediaMimeType = null, mediaFileName = null,
                    isViewOnce = false, senderName = "Alice", mediaUrl = null,
                    mediaSizeBytes = null, mediaDurationSeconds = null, viewOnceViewed = false,
                    mediaUnavailable = null, isStarred = false, isVoiceNote = false,
                    reactionsJson = "[]"
                ),
                ChatMessageRow(
                    account = "private", jid = jid, messageId = "offline-search-2",
                    direction = "INCOMING", kind = "DOCUMENT", text = "",
                    timestampMillis = secondTimestamp, status = "DELIVERED",
                    replyToMessageId = null, quotedMessageText = null, mediaMimeType = "application/pdf", mediaFileName = "report.pdf",
                    isViewOnce = false, senderName = "Bob", mediaUrl = null,
                    mediaSizeBytes = 1000L, mediaDurationSeconds = null, viewOnceViewed = false,
                    mediaUnavailable = null, isStarred = false, isVoiceNote = false,
                    reactionsJson = "[]"
                )
            )
        )
        db.database.close()

        val local = LocalChatRepository(context)
        try {
            assertEquals("offline-search-1", local.search(ChatAccount.PRIVATE, "Alice", jid).single().messageId)
            assertEquals("offline-search-2", local.search(ChatAccount.PRIVATE, "report.pdf", jid).single().messageId)
            val byDate = local.search(ChatAccount.PRIVATE, "", jid, secondTimestamp, secondTimestamp + 86_399_999L)
            assertEquals("offline-search-2", byDate.single().messageId)
            assertTrue(local.search(ChatAccount.PUBLIC, "Alice", jid).isEmpty())
        } finally {
            local.close()
        }
        val reopened = EncryptedChatDatabase.open(context)
        reopened.database.chatDao().clearMessages("private", jid)
        reopened.database.chatDao().clearConversation("private", jid)
        reopened.database.close()
    }

    @Test
    fun roomVersionThreeMigrationAddsRemoteDeleteMarkerWithoutDroppingCachedContent() {
        val helper = FrameworkSQLiteOpenHelperFactory().create(
            SupportSQLiteOpenHelper.Configuration.builder(context)
                .name(null)
                .callback(object : SupportSQLiteOpenHelper.Callback(3) {
                    override fun onCreate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                        db.execSQL(
                            """CREATE TABLE chat_messages (
                                account TEXT NOT NULL,
                                jid TEXT NOT NULL,
                                messageId TEXT NOT NULL,
                                text TEXT NOT NULL,
                                PRIMARY KEY(account, jid, messageId)
                            )"""
                        )
                        db.execSQL(
                            "INSERT INTO chat_messages VALUES ('private','2348888888888@s.whatsapp.net','retained-1','Keep this deleted message')"
                        )
                    }
                    override fun onUpgrade(db: androidx.sqlite.db.SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
                })
                .build()
        )
        try {
            val db = helper.writableDatabase
            EncryptedChatDatabase.MIGRATION_3_4.migrate(db)
            val columns = mutableSetOf<String>()
            db.query("PRAGMA table_info(chat_messages)").use { cursor ->
                val index = cursor.getColumnIndexOrThrow("name")
                while (cursor.moveToNext()) columns += cursor.getString(index)
            }
            assertTrue(columns.contains("deletedByRemote"))
            assertTrue(columns.contains("deletedAtMillis"))
            db.query("SELECT text, deletedByRemote FROM chat_messages WHERE messageId='retained-1'").use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals("Keep this deleted message", cursor.getString(0))
                assertEquals(0, cursor.getInt(1))
            }
        } finally {
            helper.close()
        }
    }

    @Test
    fun remoteDeletedMessageRemainsReadableFromEncryptedOfflineHistory() = runBlocking {
        val key = com.aharane.studio.core.model.ConversationKey(
            ChatAccount.PRIVATE, "2348999999999@s.whatsapp.net"
        )
        val conversation = com.aharane.studio.core.model.ChatSummary(
            key = key, title = "Saved conversation", lastMessagePreview = "Keep this",
            lastMessageAtMillis = 1765000000000L
        )
        val local = LocalChatRepository(context)
        try {
            local.saveConversations(listOf(conversation))
            local.saveMessages(
                conversation,
                listOf(
                    com.aharane.studio.core.model.ChatMessage(
                        key = key,
                        messageId = "retained-remote-delete",
                        direction = com.aharane.studio.core.model.MessageDirection.INCOMING,
                        kind = com.aharane.studio.core.model.MessageKind.TEXT,
                        text = "Original content remains in Hub.",
                        timestampMillis = 1765000000000L,
                        deletedByRemote = true,
                        deletedAtMillis = 1765000001000L
                    )
                )
            )
            val loaded = local.messages(key).single()
            assertEquals("Original content remains in Hub.", loaded.text)
            assertTrue(loaded.deletedByRemote)
            assertEquals(1765000001000L, loaded.deletedAtMillis)
        } finally {
            local.close()
            val clean = EncryptedChatDatabase.open(context)
            clean.database.chatDao().clearMessages("private", key.jid)
            clean.database.chatDao().clearConversation("private", key.jid)
            clean.database.close()
        }
    }

    @Test
    fun appearanceInheritanceKeepsPrivatePublicAndChatLayersSeparate() {
        context.getSharedPreferences("aharane-chat-appearance", Context.MODE_PRIVATE).edit().clear().commit()
        val store = ChatAppearanceStore(context)
        store.setField(null, null, "bubbleRadius", "22")
        store.setField(ChatAccount.PRIVATE, null, "outgoingBubble", "#244A3C")
        store.setField(ChatAccount.PRIVATE, "2348222222222@s.whatsapp.net", "messageSize", "19")

        val privateAccount = store.resolve(ChatAccount.PRIVATE)
        val publicAccount = store.resolve(ChatAccount.PUBLIC)
        val privateChat = store.resolve(ChatAccount.PRIVATE, "2348222222222@s.whatsapp.net")
        assertEquals(22, privateAccount.bubbleRadius)
        assertEquals("#244A3C", privateAccount.outgoingBubble)
        assertEquals(22, publicAccount.bubbleRadius)
        assertEquals("#DCEFE5", publicAccount.outgoingBubble)
        assertEquals(19, privateChat.messageSize)
        assertEquals("#244A3C", privateChat.outgoingBubble)

        store.reset(ChatAccount.PRIVATE, "2348222222222@s.whatsapp.net")
        assertEquals(14, store.resolve(ChatAccount.PRIVATE, "2348222222222@s.whatsapp.net").messageSize)
        assertEquals("#DCEFE5", store.resolve(ChatAccount.PUBLIC).outgoingBubble)

        val profileId = store.saveProfile("Test profile", store.resolve(ChatAccount.PRIVATE))
        val exported = store.exportProfiles()
        store.renameProfile(profileId, "Renamed profile")
        assertTrue(store.profiles().any { it.id == profileId && it.name == "Renamed profile" })
        store.importProfiles(exported)
        assertTrue(store.profiles().any { it.name == "Test profile" })
        val duplicateId = store.duplicateProfile(profileId)
        assertTrue(store.profiles().any { it.id == duplicateId })
        store.deleteProfile(profileId)
        assertFalse(store.profiles().any { it.id == profileId })

        context.getSharedPreferences("aharane-chat-appearance", Context.MODE_PRIVATE).edit().clear().commit()
    }
}
