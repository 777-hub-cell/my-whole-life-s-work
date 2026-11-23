package com.aharane.studio.core.model

enum class ChatAccount(val apiValue: String, val label: String) {
    PRIVATE("private", "Private"), PUBLIC("public", "Public");
    companion object {
        fun fromApiValue(value: String): ChatAccount? = entries.firstOrNull { it.apiValue == value }
    }
}

enum class ChatFilter(val label: String) {
    ALL("All"), UNREAD("Unread"), GROUPS("Groups"), CHANNELS("Channels"), ARCHIVED("Archived")
}

data class ConversationKey(val account: ChatAccount, val jid: String) {
    init {
        require(jid.isNotBlank()) { "A conversation needs a WhatsApp JID." }
        require('@' in jid) { "A WhatsApp JID must include its server suffix." }
    }
}

enum class MessageKind {
    TEXT, IMAGE, VIDEO, AUDIO, STICKER, DOCUMENT, CONTACT, LOCATION, POLL, REACTION, RESPONSE, UNSUPPORTED
}

enum class MessageDirection { INCOMING, OUTGOING }
enum class MessageStatus { UNKNOWN, PENDING, SENT, DELIVERED, READ, FAILED }

data class ChatSummary(
    val key: ConversationKey,
    val title: String,
    val lastMessagePreview: String,
    val lastMessageAtMillis: Long,
    val unreadCount: Int = 0,
    val isGroup: Boolean = false,
    val isArchived: Boolean = false,
    val isPinned: Boolean = false,
    val isMuted: Boolean = false,
    val lastMessageType: MessageKind = MessageKind.TEXT,
    val lastMessageFromMe: Boolean = false,
    val lastSyncedAtMillis: Long = 0L,
    val hasOlderMessages: Boolean = false
) {
    init {
        require(title.isNotBlank())
        require(unreadCount >= 0)
        require(lastMessageAtMillis >= 0L)
    }
}

data class ChatMessage(
    val key: ConversationKey,
    val messageId: String,
    val direction: MessageDirection,
    val kind: MessageKind,
    val text: String,
    val timestampMillis: Long,
    val status: MessageStatus = MessageStatus.UNKNOWN,
    val replyToMessageId: String? = null,
    val quotedMessageText: String? = null,
    val mediaMimeType: String? = null,
    val mediaFileName: String? = null,
    val isViewOnce: Boolean = false,
    val senderName: String? = null,
    val mediaUrl: String? = null,
    val mediaSizeBytes: Long? = null,
    val mediaDurationSeconds: Long? = null,
    val viewOnceViewed: Boolean = false,
    val mediaUnavailable: String? = null,
    val isStarred: Boolean = false,
    val isVoiceNote: Boolean = false,
    val reactions: List<String> = emptyList(),
    val localOutboxState: String? = null,
    val localOutboxError: String? = null,
    val deletedByRemote: Boolean = false,
    val deletedAtMillis: Long = 0L
) {
    init {
        require(messageId.isNotBlank())
        require(timestampMillis >= 0L)
        require(!isViewOnce || kind == MessageKind.IMAGE || kind == MessageKind.VIDEO) {
            "Only image and video messages can be view-once."
        }
    }
}
