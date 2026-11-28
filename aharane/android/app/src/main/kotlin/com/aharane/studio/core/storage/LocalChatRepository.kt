package com.aharane.studio.core.storage

import android.content.Context
import com.aharane.studio.core.model.*
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

class LocalChatRepository(context: Context) {
    private val secureDatabase = EncryptedChatDatabase.open(context.applicationContext)
    private val dao = secureDatabase.database.chatDao()

    suspend fun saveConversations(rows: List<ChatSummary>): List<ChatSummary> {
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
        return preserved.mapNotNull { row ->
            dao.conversation(row.account, row.jid)?.toModel()
        }
    }

    suspend fun conversations(account: ChatAccount): List<ChatSummary> =
        dao.conversations(account.apiValue).map { it.toModel() }

    suspend fun enqueueTextMessage(
        conversation: ChatSummary,
        text: String,
        quotedMessageId: String?,
        clientMessageId: String = UUID.randomUUID().toString().replace("-", "")
    ): String {
        require(text.isNotBlank() && text.toByteArray(Charsets.UTF_8).size <= 12 * 1024)
        require(quotedMessageId.isNullOrBlank() || dao.message(
            conversation.key.account.apiValue, conversation.key.jid, quotedMessageId
        ) != null) { "The quoted message is not in this conversation's saved history." }
        dao.putOutgoingMessage(
            ChatOutgoingMessageRow(
                account = conversation.key.account.apiValue,
                jid = conversation.key.jid,
                clientMessageId = clientMessageId,
                text = text,
                quotedMessageId = quotedMessageId,
                queuedAtMillis = System.currentTimeMillis(),
                state = "PENDING",
                lastError = null,
                remoteMessageId = null
            )
        )
        return clientMessageId
    }

    suspend fun enqueueMediaMessage(
        conversation: ChatSummary,
        mimeType: String,
        fileName: String,
        caption: String,
        quotedMessageId: String?,
        cacheRecord: EncryptedMediaRecord,
        isVoiceNote: Boolean = false,
        durationSeconds: Int = 0,
        clientMessageId: String = UUID.randomUUID().toString().replace("-", "")
    ): String {
        require(mimeType.isNotBlank() && fileName.isNotBlank())
        require(cacheRecord.sizeBytes in 1..(24L * 1024L * 1024L))
        require(quotedMessageId.isNullOrBlank() || dao.message(
            conversation.key.account.apiValue, conversation.key.jid, quotedMessageId
        ) != null) { "The quoted message is not in this conversation's saved history." }
        dao.putOutgoingMedia(
            ChatOutgoingMediaRow(
                account = conversation.key.account.apiValue,
                jid = conversation.key.jid,
                clientMessageId = clientMessageId,
                mimeType = mimeType,
                fileName = fileName,
                caption = caption,
                quotedMessageId = quotedMessageId,
                queuedAtMillis = System.currentTimeMillis(),
                state = "PENDING",
                lastError = null,
                cachePath = cacheRecord.relativePath,
                cacheSha256 = cacheRecord.sha256,
                sizeBytes = cacheRecord.sizeBytes,
                isVoiceNote = isVoiceNote,
                durationSeconds = durationSeconds.coerceAtLeast(0),
                remoteMessageId = null
            )
        )
        return clientMessageId
    }

    suspend fun outgoingMediaMessage(key: ConversationKey, clientMessageId: String): ChatOutgoingMediaRow? =
        dao.outgoingMediaMessage(key.account.apiValue, key.jid, clientMessageId)

    suspend fun outgoingMediaMessages(key: ConversationKey): List<ChatOutgoingMediaRow> =
        dao.outgoingMedia(key.account.apiValue, key.jid)

    suspend fun pendingOutgoingMedia(account: ChatAccount, limit: Int = 100): List<ChatOutgoingMediaRow> =
        dao.pendingOutgoingMedia(account.apiValue, limit.coerceIn(1, 200))

    suspend fun updateOutgoingMedia(
        key: ConversationKey,
        clientMessageId: String,
        state: String,
        error: String? = null,
        remoteMessageId: String? = null
    ) {
        require(state in setOf("PENDING", "SENDING", "SENT", "FAILED"))
        dao.updateOutgoingMedia(key.account.apiValue, key.jid, clientMessageId, state, error, remoteMessageId)
    }

    suspend fun resetInterruptedOutgoingMedia() {
        dao.interruptedOutgoingMedia().forEach { row ->
            dao.updateOutgoingMedia(
                row.account, row.jid, row.clientMessageId, "FAILED",
                "The app stopped during media sending. Retry reuses the same server idempotency key.", null
            )
        }
    }

    suspend fun outgoingMessage(key: ConversationKey, clientMessageId: String): ChatOutgoingMessageRow? =
        dao.outgoingMessage(key.account.apiValue, key.jid, clientMessageId)

    suspend fun outgoingMessages(key: ConversationKey): List<ChatOutgoingMessageRow> =
        dao.outgoingMessages(key.account.apiValue, key.jid)

    suspend fun pendingOutgoingMessages(account: ChatAccount, limit: Int = 100): List<ChatOutgoingMessageRow> =
        dao.pendingOutgoingMessages(account.apiValue, limit.coerceIn(1, 200))

    suspend fun updateOutgoingMessage(
        key: ConversationKey,
        clientMessageId: String,
        state: String,
        error: String? = null,
        remoteMessageId: String? = null
    ) {
        require(state in setOf("PENDING", "SENDING", "SENT", "FAILED"))
        dao.updateOutgoingMessage(key.account.apiValue, key.jid, clientMessageId, state, error, remoteMessageId)
    }

    suspend fun resetInterruptedOutgoingMessages() {
        // Outbox rows may survive even if the conversation summary has not yet
        // been cached. Recover from the outbox table directly, not by walking chats.
        dao.interruptedOutgoingMessages().forEach { row ->
            dao.updateOutgoingMessage(
                row.account, row.jid, row.clientMessageId,
                "FAILED", "The app stopped during sending. Safe retry uses the same server idempotency key.", null
            )
        }
    }

    suspend fun applyDeletedMessages(key: ConversationKey, messageIds: List<String>) {
        messageIds.distinct().take(2000).forEach { id ->
            if (id.isNotBlank()) dao.deleteMessage(key.account.apiValue, key.jid, id)
        }
    }

    suspend fun applyRemoteDeletedMessages(key: ConversationKey, markers: List<Pair<String, Long>>) {
        markers.distinctBy { it.first }.take(2000).forEach { (messageId, deletedAtMillis) ->
            if (messageId.isNotBlank()) {
                dao.markMessageDeletedRemotely(
                    key.account.apiValue,
                    key.jid,
                    messageId,
                    deletedAtMillis.coerceAtLeast(0L)
                )
            }
        }
    }

    suspend fun saveMessages(conversation: ChatSummary, messages: List<ChatMessage>, hasOlder: Boolean? = null) {
        require(messages.all { it.key == conversation.key }) { "A message crossed its account or conversation boundary." }
        val rows = messages.map { it.toRow() }
        if (rows.isNotEmpty()) {
            dao.putMessages(rows)
            rows.forEach {
                dao.reconcileOutgoingMessage(it.account, it.jid, it.messageId)
                dao.reconcileOutgoingMedia(it.account, it.jid, it.messageId)
            }
        }
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
            old?.oldestSyncedMessageId.isNullOrBlank() -> earliestIncoming.messageId
            else -> minOf(old.oldestSyncedMessageId, earliestIncoming.messageId)
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

    suspend fun messages(key: ConversationKey): List<ChatMessage> {
        val saved = dao.messages(key.account.apiValue, key.jid).map { it.toModel() }
        val queued = dao.outgoingMessages(key.account.apiValue, key.jid).map { it.toChatMessage(key) }
        val queuedMedia = dao.outgoingMedia(key.account.apiValue, key.jid).map { it.toChatMessage(key) }
        return (saved + queued + queuedMedia).distinctBy { it.messageId }.sortedBy { it.timestampMillis }
    }

    suspend fun olderMessages(key: ConversationKey, before: Long, limit: Int = 100): List<ChatMessage> =
        dao.olderMessages(key.account.apiValue, key.jid, before, limit)
            .asReversed().map { it.toModel() }

    suspend fun search(account: ChatAccount, query: String, jid: String? = null, fromMillis: Long = 0L, toMillis: Long = 0L, limit: Int = 100): List<ChatMessage> {
        val term = query.trim()
        if (term.length < 2 && fromMillis == 0L && toMillis == 0L) return emptyList()
        return dao.search(account.apiValue, jid, term.takeIf { it.length >= 2 }.orEmpty(), fromMillis, toMillis, limit.coerceIn(1, 500)).map { it.toModel() }
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
            (incomingOldest == oldOldest && (current.oldestSyncedMessageId.isBlank() || earliest.messageId < current.oldestSyncedMessageId)))
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

    suspend fun cachedMediaIds(key: ConversationKey): Set<String> =
        dao.messages(key.account.apiValue, key.jid)
            .filter { !it.cachedMediaPath.isNullOrBlank() && !it.cachedMediaSha256.isNullOrBlank() }
            .map { it.messageId }
            .toSet()

    suspend fun cachedMediaForAccount(account: ChatAccount): List<ChatMessageRow> =
        dao.conversations(account.apiValue).flatMap { conversation ->
            dao.messages(account.apiValue, conversation.jid).filter { !it.cachedMediaPath.isNullOrBlank() }
        }

    suspend fun clearLocalConversation(key: ConversationKey) {
        dao.clearMessages(key.account.apiValue, key.jid)
        dao.clearOutgoingMessages(key.account.apiValue, key.jid)
        dao.clearOutgoingMedia(key.account.apiValue, key.jid)
        dao.clearConversation(key.account.apiValue, key.jid)
    }

    suspend fun cachedMediaBytes(account: ChatAccount): Long = dao.cachedMediaBytes(account.apiValue) ?: 0L

    suspend fun clearCachedMediaMetadata(account: ChatAccount) {
        dao.clearCachedMediaMetadata(account.apiValue)
    }

    fun close() = secureDatabase.database.close()
}

private fun ChatOutgoingMessageRow.toChatMessage(key: ConversationKey): ChatMessage = ChatMessage(
    key = key,
    messageId = remoteMessageId?.takeIf { it.isNotBlank() } ?: "local-$clientMessageId",
    direction = MessageDirection.OUTGOING,
    kind = MessageKind.TEXT,
    text = text,
    timestampMillis = queuedAtMillis,
    status = when (state) {
        "SENT" -> MessageStatus.SENT
        "FAILED" -> MessageStatus.FAILED
        else -> MessageStatus.PENDING
    },
    replyToMessageId = quotedMessageId,
    localOutboxState = state,
    localOutboxError = lastError
)

private fun ChatOutgoingMediaRow.toChatMessage(key: ConversationKey): ChatMessage {
    val kind = when {
        mimeType == "image/webp" -> MessageKind.STICKER
        mimeType.startsWith("image/") -> MessageKind.IMAGE
        mimeType.startsWith("video/") -> MessageKind.VIDEO
        mimeType.startsWith("audio/") -> MessageKind.AUDIO
        else -> MessageKind.DOCUMENT
    }
    return ChatMessage(
        key = key,
        messageId = remoteMessageId?.takeIf { it.isNotBlank() } ?: "local-$clientMessageId",
        direction = MessageDirection.OUTGOING,
        kind = kind,
        text = caption,
        timestampMillis = queuedAtMillis,
        status = when (state) {
            "SENT" -> MessageStatus.SENT
            "FAILED" -> MessageStatus.FAILED
            else -> MessageStatus.PENDING
        },
        mediaMimeType = mimeType,
        mediaFileName = fileName,
        mediaSizeBytes = sizeBytes,
        mediaDurationSeconds = durationSeconds.toLong().takeIf { it > 0 },
        isVoiceNote = isVoiceNote,
        mediaUnavailable = "Stored securely on this phone · waiting to send",
        localOutboxState = state,
        localOutboxError = lastError,
        localOutboxMedia = true
    )
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
    status = status.name, replyToMessageId = replyToMessageId, quotedMessageText = quotedMessageText, mediaMimeType = mediaMimeType,
    mediaFileName = mediaFileName, isViewOnce = isViewOnce, senderName = senderName,
    mediaUrl = mediaUrl, mediaSizeBytes = mediaSizeBytes, mediaDurationSeconds = mediaDurationSeconds,
    viewOnceViewed = viewOnceViewed, mediaUnavailable = mediaUnavailable, isStarred = isStarred,
    isVoiceNote = isVoiceNote, reactionsJson = JSONArray(reactions).toString(),
    deletedByRemote = deletedByRemote, deletedAtMillis = deletedAtMillis,
    pollOptionsJson = JSONArray(pollOptions).toString(),
    pollSelectableCount = pollSelectableCount.coerceAtLeast(1),
    pollVoteCountsJson = JSONObject(pollVoteCounts).toString(),
    pollMyVotesJson = JSONArray(pollMyVotes).toString(),
    isSystem = isSystem
)

private fun ChatMessageRow.toModel() = ChatMessage(
    key = ConversationKey(ChatAccount.fromApiValue(account) ?: ChatAccount.PRIVATE, jid),
    messageId = messageId,
    direction = runCatching { MessageDirection.valueOf(direction) }.getOrDefault(MessageDirection.INCOMING),
    kind = runCatching { MessageKind.valueOf(kind) }.getOrDefault(MessageKind.UNSUPPORTED),
    text = text, timestampMillis = timestampMillis,
    status = runCatching { MessageStatus.valueOf(status) }.getOrDefault(MessageStatus.UNKNOWN),
    replyToMessageId = replyToMessageId, quotedMessageText = quotedMessageText, mediaMimeType = mediaMimeType, mediaFileName = mediaFileName,
    isViewOnce = isViewOnce, senderName = senderName, mediaUrl = mediaUrl, mediaSizeBytes = mediaSizeBytes,
    mediaDurationSeconds = mediaDurationSeconds, viewOnceViewed = viewOnceViewed,
    mediaUnavailable = mediaUnavailable, isStarred = isStarred, isVoiceNote = isVoiceNote,
    reactions = runCatching {
        val json = org.json.JSONArray(reactionsJson)
        List(json.length()) { json.optString(it) }
    }.getOrDefault(emptyList()),
    deletedByRemote = deletedByRemote,
    deletedAtMillis = deletedAtMillis,
    pollOptions = runCatching {
        val values = JSONArray(pollOptionsJson)
        List(values.length()) { values.optString(it) }.filter(String::isNotBlank)
    }.getOrDefault(emptyList()),
    pollSelectableCount = pollSelectableCount.coerceAtLeast(1),
    pollVoteCounts = runCatching {
        val values = JSONObject(pollVoteCountsJson)
        buildMap { values.keys().forEach { key -> put(key, values.optInt(key).coerceAtLeast(0)) } }
    }.getOrDefault(emptyMap()),
    pollMyVotes = runCatching {
        val values = JSONArray(pollMyVotesJson)
        List(values.length()) { values.optString(it) }.filter(String::isNotBlank)
    }.getOrDefault(emptyList()),
    isSystem = isSystem
)
