package com.aharane.studio

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.storage.ChatConversationRow
import com.aharane.studio.core.storage.ChatMessageRow
import com.aharane.studio.core.storage.EncryptedChatDatabase
import com.aharane.studio.core.storage.EncryptedChatStorageException
import com.aharane.studio.core.storage.EncryptedMediaCache
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
        reopened.database.close()
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
        assertThrows(IllegalArgumentException::class.java) {
            cache.store("private", jid, "view-once:one-time", bytes, viewOnce = true)
        }
        cache.delete("private", jid, messageId)
        assertFalse(path.exists())
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
    }
}
