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
                newestSyncedMessageId = previous?.newestSyncedMessageId ?: "",
                oldestSyncedTimestampMillis = previous?.oldestSyncedTimestampMillis ?: 0L,
                oldestSyncedMessageId = previous?.oldestSyncedMessageId ?: "",
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
        val latestIncoming = rows.maxWithOrNull(compareBy<ChatMessageRow> { it.timestampMillis }.thenBy { it.messageId })
        val earliestIncoming = rows.minWithOrNull(compareBy<ChatMessageRow> { it.timestampMillis }.thenBy { it.messageId })
        val oldNewest = old?.newestSyncedTimestampMillis ?: 0L
        val incomingNewest = latestIncoming?.timestampMillis ?: 0L
        val newest = maxOf(oldNewest, incomingNewest)
        val newestId = when {
            latestIncoming == null -> old?.newestSyncedMessageId.orEmpty()
            incomingNewest > oldNewest -> latestIncoming.messageId
            incomingNewest < oldNewest -> old?.newestSyncedMessageId.orEmpty()
            else -> maxOf(old?.newestSyncedMessageId.orEmpty(), latestIncoming.messageId)
        }
        val oldOldest = old?.oldestSyncedTimestampMillis ?: 0L
        val incomingOldest = earliestIncoming?.timestampMillis ?: 0L
        val oldest = when {
            incomingOldest <= 0L -> oldOldest
            old == null || oldOldest == 0L -> incomingOldest
            else -> minOf(oldOldest, incomingOldest)
        }
        val oldestId = when {
            earliestIncoming == null -> old?.oldestSyncedMessageId.orEmpty()
            incomingOldest < oldOldest || oldOldest == 0L -> earliestIncoming.messageId
            incomingOldest > oldOldest -> old?.oldestSyncedMessageId.orEmpty()
            else -> minOf(old?.oldestSyncedMessageId.orEmpty(), earliestIncoming.messageId)
        }
        dao.putConversation(conversation.toRow().copy(
            lastSyncAtMillis = System.currentTimeMillis(),
            newestSyncedTimestampMillis = newest,
            newestSyncedMessageId = newestId,
            oldestSyncedTimestampMillis = oldest,
            oldestSyncedMessageId = oldestId,
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

    data class MessageCursor(val timestampMillis: Long, val messageId: String)

    suspend fun newestCursor(key: ConversationKey): MessageCursor {
        val row = dao.conversation(key.account.apiValue, key.jid)
        return MessageCursor(row?.newestSyncedTimestampMillis ?: 0L, row?.newestSyncedMessageId.orEmpty())
    }

    suspend fun oldestCursor(key: ConversationKey): MessageCursor {
        val row = dao.conversation(key.account.apiValue, key.jid)
        return MessageCursor(row?.oldestSyncedTimestampMillis ?: 0L, row?.oldestSyncedMessageId.orEmpty())
    }

    suspend fun newestTimestamp(key: ConversationKey): Long = newestCursor(key).timestampMillis

    suspend fun lastSyncedAt(key: ConversationKey): Long =
        dao.conversation(key.account.apiValue, key.jid)?.lastSyncAtMillis ?: 0L

    suspend fun oldestTimestamp(key: ConversationKey): Long = oldestCursor(key).timestampMillis

    suspend fun hasOlderMessages(key: ConversationKey): Boolean =
        dao.conversation(key.account.apiValue, key.jid)?.hasOlderMessages ?: true

    suspend fun recordOlderPage(key: ConversationKey, messages: List<ChatMessage>, hasMore: Boolean) {
        val current = dao.conversation(key.account.apiValue, key.jid)
            ?: error("The conversation is not cached yet.")
        if (messages.isNotEmpty()) dao.putMessages(messages.filterNot { it.isViewOnce }.map { it.toRow() })
        val earliest = messages.minWithOrNull(compareBy<ChatMessage> { it.timestampMillis }.thenBy { it.messageId })
        val incomingOldest = earliest?.timestampMillis ?: 0L
        val oldOldest = current.oldestSyncedTimestampMillis
        val takeIncomingCursor = earliest != null && (oldOldest <= 0L || incomingOldest < oldOldest ||
            (incomingOldest == oldOldest && earliest.messageId < current.oldestSyncedMessageId))
        val oldest = if (oldOldest <= 0L || incomingOldest <= 0L) maxOf(oldOldest, incomingOldest)
            else minOf(oldOldest, incomingOldest)
        dao.putConversation(current.copy(
            lastSyncAtMillis = System.currentTimeMillis(),
            oldestSyncedTimestampMillis = oldest,
            oldestSyncedMessageId = if (takeIncomingCursor) earliest!!.messageId else current.oldestSyncedMessageId,
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

    suspend fun clearCachedMediaMetadata(account: ChatAccount) {
        dao.clearCachedMediaMetadata(account.apiValue)
    }

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
