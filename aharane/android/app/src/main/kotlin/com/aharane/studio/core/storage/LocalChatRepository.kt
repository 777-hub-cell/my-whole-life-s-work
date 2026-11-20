package com.aharane.studio.core.storage

import android.content.Context
import com.aharane.studio.core.model.*
import org.json.JSONArray

class LocalChatRepository(context: Context) {
    private val secureDatabase = EncryptedChatDatabase.open(context.applicationContext)
    private val dao = secureDatabase.database.chatDao()

    suspend fun saveConversations(rows: List<ChatSummary>) {
        val preserved = rows.map { summary ->
            val previous = dao.conversation(summary.key.account.apiValue, summary.key.jid)
            summary.toRow().copy(
                lastSyncAtMillis = previous?.lastSyncAtMillis ?: 0L,
                newestSyncedTimestampMillis = previous?.newestSyncedTimestampMillis ?: 0L,
                oldestSyncedTimestampMillis = previous?.oldestSyncedTimestampMillis ?: 0L,
                hasOlderMessages = previous?.hasOlderMessages ?: false
            )
        }
        dao.putConversations(preserved)
    }

    suspend fun conversations(account: ChatAccount): List<ChatSummary> =
        dao.conversations(account.apiValue).map { it.toModel() }

    suspend fun saveMessages(conversation: ChatSummary, messages: List<ChatMessage>, hasOlder: Boolean? = null) {
        require(messages.all { it.key == conversation.key }) { "A message crossed its account or conversation boundary." }
        val rows = messages.map { it.toRow() }
        if (rows.isNotEmpty()) dao.putMessages(rows)
        val old = dao.conversation(conversation.key.account.apiValue, conversation.key.jid)
        val newest = maxOf(old?.newestSyncedTimestampMillis ?: 0L, rows.maxOfOrNull { it.timestampMillis } ?: 0L)
        val oldestIncoming = rows.minOfOrNull { it.timestampMillis } ?: 0L
        val oldest = when {
            oldestIncoming <= 0L -> old?.oldestSyncedTimestampMillis ?: 0L
            old == null || old.oldestSyncedTimestampMillis == 0L -> oldestIncoming
            else -> minOf(old.oldestSyncedTimestampMillis, oldestIncoming)
        }
        dao.putConversation(conversation.toRow().copy(
            lastSyncAtMillis = System.currentTimeMillis(),
            newestSyncedTimestampMillis = newest,
            oldestSyncedTimestampMillis = oldest,
            hasOlderMessages = hasOlder ?: (old?.hasOlderMessages ?: true)
        ))
    }

    suspend fun messages(key: ConversationKey): List<ChatMessage> =
        dao.messages(key.account.apiValue, key.jid).map { it.toModel() }

    suspend fun olderMessages(key: ConversationKey, before: Long, limit: Int = 100): List<ChatMessage> =
        dao.olderMessages(key.account.apiValue, key.jid, before, limit)
            .asReversed().map { it.toModel() }

    suspend fun search(account: ChatAccount, query: String, jid: String? = null, fromMillis: Long = 0L, toMillis: Long = 0L, limit: Int = 100): List<ChatMessage> {
        val term = query.trim()
        if (term.length < 2) return emptyList()
        return dao.search(account.apiValue, jid, term, fromMillis, toMillis, limit.coerceIn(1, 500)).map { it.toModel() }
    }

    suspend fun newestTimestamp(key: ConversationKey): Long =
        dao.conversation(key.account.apiValue, key.jid)?.newestSyncedTimestampMillis ?: 0L

    suspend fun lastSyncedAt(key: ConversationKey): Long =
        dao.conversation(key.account.apiValue, key.jid)?.lastSyncAtMillis ?: 0L

    suspend fun oldestTimestamp(key: ConversationKey): Long =
        dao.conversation(key.account.apiValue, key.jid)?.oldestSyncedTimestampMillis ?: 0L

    suspend fun hasOlderMessages(key: ConversationKey): Boolean =
        dao.conversation(key.account.apiValue, key.jid)?.hasOlderMessages ?: true

    suspend fun recordOlderPage(key: ConversationKey, messages: List<ChatMessage>, hasMore: Boolean) {
        val current = dao.conversation(key.account.apiValue, key.jid)
            ?: error("The conversation is not cached yet.")
        if (messages.isNotEmpty()) dao.putMessages(messages.filterNot { it.isViewOnce }.map { it.toRow() })
        val oldest = messages.minOfOrNull { it.timestampMillis }?.let {
            minOf(current.oldestSyncedTimestampMillis.takeIf { v -> v > 0 } ?: it, it)
        } ?: current.oldestSyncedTimestampMillis
        dao.putConversation(current.copy(
            lastSyncAtMillis = System.currentTimeMillis(),
            oldestSyncedTimestampMillis = oldest,
            hasOlderMessages = hasMore
        ))
    }

    suspend fun recordMediaCache(key: ConversationKey, messageId: String, relativePath: String, sha256: String, size: Long) {
        dao.setCachedMedia(key.account.apiValue, key.jid, messageId, relativePath, sha256, size)
    }

    suspend fun cachedMediaInfo(key: ConversationKey, messageId: String): ChatMessageRow? =
        dao.message(key.account.apiValue, key.jid, messageId)

    suspend fun cachedMediaForAccount(account: ChatAccount): List<ChatMessageRow> =
        dao.conversations(account.apiValue).flatMap { conversation ->
            dao.messages(account.apiValue, conversation.jid).filter { !it.cachedMediaPath.isNullOrBlank() }
        }

    suspend fun clearLocalConversation(key: ConversationKey) {
        dao.clearMessages(key.account.apiValue, key.jid)
        dao.clearConversation(key.account.apiValue, key.jid)
    }

    suspend fun cachedMediaBytes(account: ChatAccount): Long = dao.cachedMediaBytes(account.apiValue) ?: 0L

    fun close() = secureDatabase.database.close()
}

private fun ChatSummary.toRow() = ChatConversationRow(
    account = key.account.apiValue, jid = key.jid, title = title, lastMessagePreview = lastMessagePreview,
    lastMessageAtMillis = lastMessageAtMillis, unreadCount = unreadCount, isGroup = isGroup,
    isArchived = isArchived, isPinned = isPinned, isMuted = isMuted,
    lastMessageType = lastMessageType.name, lastMessageFromMe = lastMessageFromMe
)

private fun ChatConversationRow.toModel() = ChatSummary(
    key = ConversationKey(if (account == ChatAccount.PUBLIC.apiValue) ChatAccount.PUBLIC else ChatAccount.PRIVATE, jid),
    title = title.ifBlank { jid.substringBefore('@') },
    lastMessagePreview = lastMessagePreview, lastMessageAtMillis = lastMessageAtMillis,
    unreadCount = unreadCount, isGroup = isGroup, isArchived = isArchived, isPinned = isPinned,
    isMuted = isMuted, lastMessageType = runCatching { MessageKind.valueOf(lastMessageType) }.getOrDefault(MessageKind.UNSUPPORTED),
    lastMessageFromMe = lastMessageFromMe
)

private fun ChatMessage.toRow() = ChatMessageRow(
    account = key.account.apiValue, jid = key.jid, messageId = messageId,
    direction = direction.name, kind = kind.name, text = text, timestampMillis = timestampMillis,
    status = status.name, replyToMessageId = replyToMessageId, mediaMimeType = mediaMimeType,
    mediaFileName = mediaFileName, isViewOnce = isViewOnce, senderName = senderName,
    mediaUrl = mediaUrl, mediaSizeBytes = mediaSizeBytes, mediaDurationSeconds = mediaDurationSeconds,
    viewOnceViewed = viewOnceViewed, mediaUnavailable = mediaUnavailable, isStarred = isStarred,
    isVoiceNote = isVoiceNote, reactionsJson = JSONArray(reactions).toString()
)

private fun ChatMessageRow.toModel() = ChatMessage(
    key = ConversationKey(ChatAccount.fromApiValue(account) ?: ChatAccount.PRIVATE, jid),
    messageId = messageId,
    direction = runCatching { MessageDirection.valueOf(direction) }.getOrDefault(MessageDirection.INCOMING),
    kind = runCatching { MessageKind.valueOf(kind) }.getOrDefault(MessageKind.UNSUPPORTED),
    text = text, timestampMillis = timestampMillis,
    status = runCatching { MessageStatus.valueOf(status) }.getOrDefault(MessageStatus.UNKNOWN),
    replyToMessageId = replyToMessageId, mediaMimeType = mediaMimeType, mediaFileName = mediaFileName,
    isViewOnce = isViewOnce, senderName = senderName, mediaUrl = mediaUrl, mediaSizeBytes = mediaSizeBytes,
    mediaDurationSeconds = mediaDurationSeconds, viewOnceViewed = viewOnceViewed,
    mediaUnavailable = mediaUnavailable, isStarred = isStarred, isVoiceNote = isVoiceNote,
    reactions = runCatching {
        val json = org.json.JSONArray(reactionsJson)
        List(json.length()) { json.optString(it) }
    }.getOrDefault(emptyList())
)
