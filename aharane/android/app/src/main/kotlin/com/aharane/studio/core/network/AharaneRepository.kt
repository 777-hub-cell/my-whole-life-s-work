package com.aharane.studio.core.network

import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.model.ChatMessage
import com.aharane.studio.core.model.ChatSummary
import com.aharane.studio.core.model.ConversationKey
import com.aharane.studio.core.model.MessageDirection
import com.aharane.studio.core.model.MessageKind
import com.aharane.studio.core.model.MessageStatus

data class ServerAccountState(
    val id: ChatAccount,
    val state: String,
    val connected: Boolean,
    val registered: Boolean,
    val reconnectAttempts: Int,
    val lastConnectedAt: String?,
    val pairingInProgress: Boolean,
    val pairingSucceeded: Boolean = false,
    val pairingError: String = ""
)

data class ServerRuntimeSnapshot(
    val service: String,
    val privateAccount: ServerAccountState,
    val publicAccount: ServerAccountState,
    val privateOwnerConfigured: Boolean,
    val publicOwnerConfigured: Boolean,
    val currentVersion: String?,
    val uptimeSeconds: Long?
)

data class ServerAiReplyAvailability(
    val enabled: Boolean = false,
    val provider: String? = null,
    val model: String? = null
)

data class ServerOwnerSettings(
    val privateOwnerNumber: String = "",
    val publicOwnerNumber: String = "",
    val publicBotNumber: String = ""
) {
    val ownerNumber: String get() = privateOwnerNumber // legacy display alias
}

data class ServerEnvironmentValue(
    val key: String,
    val value: String,
    val readOnly: Boolean,
    val secret: Boolean,
    val type: String?
)

data class ServerFileEntry(
    val name: String,
    val path: String,
    val isDirectory: Boolean,
    val sizeBytes: Long?,
    val modifiedAt: String?,
    val readOnly: Boolean
)

data class ServerFileTree(
    val path: String,
    val children: List<ServerFileEntry>,
    val pendingEdits: Boolean,
    val changedCount: Int,
    val staleDraft: Boolean
)

data class ServerFileDocument(
    val path: String,
    val content: String,
    val sha256: String,
    val language: String,
    val pendingEdits: Boolean
)

data class ServerActivityEntry(
    val id: String,
    val timestamp: String,
    val level: String,
    val source: String,
    val message: String,
    val details: String
)

data class ServerStorageSnapshot(
    val totalBytes: Long,
    val usedBytes: Long,
    val freeBytes: Long,
    val mediaBytes: Long
)

data class ServerMessageMetrics(
    val messagesLast24h: Int,
    val totalMessages: Int,
    val hourlyMessages: List<Int>
)


data class AharaneUpdatePackage(
    val updateId: String,
    val filename: String,
    val sizeBytes: Long,
    val status: String,
    val version: String,
    val createdAt: String,
    val validatedAt: String?,
    val fileCount: Int
) {
    val sizeLabel: String get() = when {
        sizeBytes >= 1024L * 1024L -> "%.1f MB".format(sizeBytes / (1024.0 * 1024.0))
        else -> "%.0f KB".format(sizeBytes / 1024.0)
    }
}

data class EditorDiagnostic(
    val severity: String,
    val message: String,
    val line: Int?,
    val column: Int?
)

data class EditorDiagnosticsResult(
    val supported: Boolean,
    val reason: String?,
    val diagnostics: List<EditorDiagnostic>
)

/**
 * Typed adapter for the existing Aharane server API. It never talks to WhatsApp
 * directly; Baileys, sessions and command dispatch remain on the server.
 */
data class RemoteDeletedMessage(
    val messageId: String,
    val deletedAtMillis: Long
)

data class ChatSyncPage(
    val messages: List<ChatMessage>,
    val hasOlder: Boolean,
    val hasNewer: Boolean,
    val syncedAtMillis: Long,
    val deletedMessageIds: List<String> = emptyList(),
    val remoteDeletedMessages: List<RemoteDeletedMessage> = emptyList()
)

interface VisualCommandDataSource {
    suspend fun visualCommands(account: String): JSONObject
    suspend fun createVisualCommand(workflow: JSONObject): JSONObject
    suspend fun updateVisualCommand(id: String, workflow: JSONObject): JSONObject
    suspend fun deleteVisualCommand(id: String): JSONObject
    suspend fun testVisualCommand(id: String, messageText: String = ""): JSONObject
    suspend fun createCustomNode(definition: JSONObject): JSONObject =
        throw UnsupportedOperationException("Custom node management is unavailable.")
    suspend fun deleteCustomNode(id: String): JSONObject =
        throw UnsupportedOperationException("Custom node management is unavailable.")
}

class AharaneRepository(private val connection: AharaneConnectionManager) : VisualCommandDataSource {
    private data class AvatarCacheEntry(val expiresAt: Long, val bytes: ByteArray?)
    private val avatarCache = ConcurrentHashMap<String, AvatarCacheEntry>()
    private val api: AharaneApiClient
        get() = connection.api ?: throw IllegalStateException("Connect to your Aharane server first.")
    override suspend fun visualCommands(account: String): JSONObject =
        api.get("visual-commands", mapOf("account" to account))

    override suspend fun createVisualCommand(workflow: JSONObject): JSONObject =
        api.post("visual-commands", JSONObject().put("workflow", workflow))

    override suspend fun updateVisualCommand(id: String, workflow: JSONObject): JSONObject =
        api.put("visual-commands/" + encodePath(id), JSONObject().put("workflow", workflow))

    override suspend fun deleteVisualCommand(id: String): JSONObject =
        api.delete("visual-commands/" + encodePath(id), JSONObject().put("confirm", true))

    override suspend fun testVisualCommand(id: String, messageText: String): JSONObject =
        api.post("visual-commands/" + encodePath(id) + "/test", JSONObject().put("messageText", messageText))

    override suspend fun createCustomNode(definition: JSONObject): JSONObject =
        api.post("custom-nodes", JSONObject().put("node", definition))

    override suspend fun deleteCustomNode(id: String): JSONObject =
        api.delete("custom-nodes/" + encodePath(id), JSONObject().put("confirm", true))

    suspend fun runtimeSnapshot(): ServerRuntimeSnapshot {
        val payload = api.get("studio/snapshot")
        val runtime = payload.optJSONObject("runtime") ?: JSONObject()
        val accounts = runtime.optJSONObject("accounts") ?: JSONObject()
        val privateAccount = accounts.optJSONObject("private") ?: JSONObject()
        val publicAccount = accounts.optJSONObject("public") ?: JSONObject()
        val owners = runtime.optJSONObject("ownerIdentities") ?: JSONObject()
        val update = payload.optJSONObject("update") ?: JSONObject()
        return ServerRuntimeSnapshot(
            service = payload.optString("service", "Aharane"),
            privateAccount = parseAccount(ChatAccount.PRIVATE, privateAccount),
            publicAccount = parseAccount(ChatAccount.PUBLIC, publicAccount),
            privateOwnerConfigured = owners.optBoolean("privateOwnerConfigured"),
            publicOwnerConfigured = owners.optBoolean("publicOwnerConfigured"),
            currentVersion = payload.optString("currentVersion").takeIf { it.isNotBlank() },
            uptimeSeconds = payload.optLong("uptimeSeconds").takeIf { payload.has("uptimeSeconds") }
        )
    }

    suspend fun changePassword(currentPassword: String, newPassword: String) {
        require(newPassword.toByteArray(Charsets.UTF_8).size in 12..128) {
            "Choose a new password between 12 and 128 bytes."
        }
        api.changePassword(currentPassword, newPassword)
    }

    suspend fun ownerSettings(): ServerOwnerSettings {
        val result = api.get("owners").optJSONObject("owners") ?: JSONObject()
        return ServerOwnerSettings(
            privateOwnerNumber = result.optString("privateOwnerNumber").ifBlank { result.optString("ownerNumber") },
            publicOwnerNumber = result.optString("publicOwnerNumber").ifBlank { result.optString("ownerNumber") },
            publicBotNumber = result.optString("publicBotNumber")
        )
    }

    suspend fun saveOwnerSettings(settings: ServerOwnerSettings) {
        api.put(
            "owners",
            JSONObject()
                .put("privateOwnerNumber", settings.privateOwnerNumber)
                .put("publicOwnerNumber", settings.publicOwnerNumber)
                .put("publicBotNumber", settings.publicBotNumber)
        )
    }

    suspend fun studioSettings(): JSONObject =
        api.get("settings").optJSONObject("settings") ?: JSONObject()

    suspend fun saveStudioSettings(settings: JSONObject) {
        api.put("settings", JSONObject().put("settings", settings))
    }

    suspend fun environment(): List<ServerEnvironmentValue> {
        val rows = api.get("env").optJSONArray("env") ?: JSONArray()
        return buildList {
            for (index in 0 until rows.length()) {
                val row = rows.optJSONObject(index) ?: continue
                add(
                    ServerEnvironmentValue(
                        key = row.optString("key"),
                        value = row.optString("value"),
                        readOnly = row.optBoolean("readOnly"),
                        secret = row.optBoolean("secret"),
                        type = row.optString("type").takeIf { it.isNotBlank() }
                    )
                )
            }
        }
    }

    suspend fun saveEnvironment(values: List<ServerEnvironmentValue>) {
        val rows = JSONArray()
        values.forEach { item ->
            if (!item.readOnly) {
                rows.put(JSONObject().put("key", item.key).put("value", item.value))
            }
        }
        api.put("env", JSONObject().put("env", rows))
    }

    suspend fun aiReplyAvailability(): ServerAiReplyAvailability {
        val result = api.get("ai/availability")
        return ServerAiReplyAvailability(
            enabled = result.optBoolean("enabled"),
            provider = result.optString("provider").takeIf { it.isNotBlank() },
            model = result.optString("model").takeIf { it.isNotBlank() }
        )
    }

    suspend fun generateAiReply(
        message: String,
        quotedMessage: String,
        tone: String,
        instruction: String
    ): String {
        val result = api.post(
            "ai/reply",
            JSONObject()
                .put("message", message)
                .put("quotedMessage", quotedMessage)
                .put("tone", tone)
                .put("instruction", instruction)
        )
        return result.optString("reply").trim().also {
            require(it.isNotBlank()) { "The AI provider returned an empty reply. Try again." }
        }
    }

    /**
     * Load real, account-scoped WhatsApp profile pictures on demand.
     * The backend returns the authenticated WhatsApp session identity, so a
     * re-paired account cannot accidentally reuse another session's avatar.
     * Privacy-restricted pictures gracefully return null.
     */
    suspend fun whatsappAvatarBytes(chat: ChatSummary): ByteArray? {
        val meta = api.get(
            "chats/${chat.key.account.apiValue}/${encodePath(chat.key.jid)}/avatar"
        )
        val session = meta.optString("sourceSession")
        if (session.isBlank()) return null
        val cacheKey = "${chat.key.account.apiValue}:$session:${chat.key.jid}"
        val now = System.currentTimeMillis()
        avatarCache[cacheKey]?.takeIf { it.expiresAt > now }?.let { return it.bytes }
        val sourceUrl = meta.optString("pictureUrl")
        val bytes = if (sourceUrl.isBlank()) null else downloadWhatsappAvatar(sourceUrl)
        avatarCache[cacheKey] = AvatarCacheEntry(now + if (bytes == null) 60_000L else 600_000L, bytes)
        if (avatarCache.size > 350) {
            avatarCache.entries.removeIf { it.value.expiresAt <= now }
            if (avatarCache.size > 350) avatarCache.clear()
        }
        return bytes
    }

    suspend fun whatsappStatuses(account: ChatAccount): JSONObject =
        api.get("whatsapp/${account.apiValue}/statuses")

    suspend fun whatsappStatusMedia(account: ChatAccount, senderJid: String, messageId: String): ByteArray =
        api.getBytes(
            "whatsapp/${account.apiValue}/statuses/${encodePath(senderJid)}/${encodePath(messageId)}/media"
        )


    suspend fun whatsappChannels(account: ChatAccount): JSONObject =
        api.get("whatsapp/${account.apiValue}/channels")

    suspend fun whatsappChannelUpdates(account: ChatAccount, jid: String): JSONObject =
        api.get("whatsapp/${account.apiValue}/channels/${encodePath(jid)}/updates")

    suspend fun chats(account: ChatAccount, query: String = "", limit: Int = 200): List<ChatSummary> {
        val response = api.get(
            "chats/${account.apiValue}",
            mapOf("limit" to limit.toString(), "q" to query)
        )
        val rows = response.optJSONArray("chats") ?: JSONArray()
        val profile = studioSettings().optJSONObject(account.apiValue) ?: JSONObject()
        val preferences = profile.optJSONObject("chatPreferences") ?: JSONObject()
        val pinned = preferences.optJSONArray("pinned").toStringSet()
        val muted = preferences.optJSONArray("muted").toStringSet()
        val archived = preferences.optJSONArray("archived").toStringSet()
        return buildList {
            for (index in 0 until rows.length()) {
                val row = rows.optJSONObject(index) ?: continue
                val jid = row.optString("jid")
                if (jid.isBlank() || '@' !in jid) continue
                val timestamp = row.optLong("timestamp").let { if (it > 0 && it < 10_000_000_000L) it * 1000L else it }
                add(
                    ChatSummary(
                        key = ConversationKey(account, jid),
                        title = row.optString("name").ifBlank { jid.substringBefore('@') },
                        lastMessagePreview = row.optString("lastMessage"),
                        lastMessageAtMillis = timestamp.coerceAtLeast(0L),
                        unreadCount = row.optInt("unreadCount").coerceAtLeast(0),
                        isGroup = row.optBoolean("group"),
                        isArchived = row.optBoolean("archived") || jid in archived,
                        isPinned = row.optBoolean("pinned") || jid in pinned,
                        isMuted = row.optBoolean("muted") || jid in muted,
                        lastMessageType = parseMessageKind(row.optString("lastMessageType")),
                        lastMessageFromMe = row.optBoolean("fromMe")
                    )
                )
            }
        }
    }

    suspend fun messages(
        conversation: ChatSummary,
        limit: Int = 200,
        beforeMillis: Long? = null
    ): List<ChatMessage> {
        val query = mutableMapOf("limit" to limit.toString())
        beforeMillis?.let { query["before"] = it.toString() }
        val response = api.get(
            "chats/${conversation.key.account.apiValue}/${encodePath(conversation.key.jid)}/messages",
            query
        )
        val rows = response.optJSONArray("messages") ?: JSONArray()
        return buildList {
            for (index in 0 until rows.length()) {
                val row = rows.optJSONObject(index) ?: continue
                val type = row.optString("type")
                val timestamp = row.optLong("timestamp").let {
                    if (it > 0 && it < 10_000_000_000L) it * 1000L else it
                }
                val messageId = row.optString("id")
                if (messageId.isBlank()) continue
                add(
                    ChatMessage(
                        key = conversation.key,
                        messageId = messageId,
                        direction = if (row.optBoolean("fromMe")) MessageDirection.OUTGOING else MessageDirection.INCOMING,
                        kind = parseMessageKind(type),
                        text = row.optString("text"),
                        timestampMillis = timestamp.coerceAtLeast(0L),
                        status = parseMessageStatus(row.optString("status")),
                        mediaMimeType = row.optString("mimeType").takeIf { it.isNotBlank() },
                        mediaFileName = row.optString("fileName").takeIf { it.isNotBlank() },
                        isViewOnce = row.optBoolean("viewOnce"),
                        senderName = row.optString("pushName").takeIf { it.isNotBlank() },
                        mediaUrl = row.optString("mediaUrl").takeIf { it.isNotBlank() },
                        mediaSizeBytes = row.optLong("size").takeIf { it > 0 },
                        mediaDurationSeconds = row.optLong("duration").takeIf { it > 0 },
                        viewOnceViewed = row.optBoolean("viewOnceViewed"),
                        mediaUnavailable = row.optString("mediaUnavailable").takeIf { it.isNotBlank() },
                        isStarred = row.optBoolean("starred"),
                        isVoiceNote = row.optBoolean("ptt"),
                        replyToMessageId = row.optString("quotedMessageId").takeIf { it.isNotBlank() },
                        quotedMessageText = row.optString("quotedMessageText").takeIf { it.isNotBlank() }
                    )
                )
            }
        }
    }

    suspend fun syncMessages(
        conversation: ChatSummary,
        afterMillis: Long = 0L,
        afterMessageId: String = "",
        beforeMillis: Long? = null,
        beforeMessageId: String = "",
        limit: Int = 200
    ): ChatSyncPage {
        require(afterMillis <= 0L || beforeMillis == null) { "Use either an after or before cursor." }
        val query = mutableMapOf("limit" to limit.coerceIn(1, 500).toString())
        if (afterMillis > 0L) {
            query["after"] = afterMillis.toString()
            if (afterMessageId.isNotBlank()) query["afterId"] = afterMessageId.take(256)
        }
        beforeMillis?.let {
            query["before"] = it.toString()
            if (beforeMessageId.isNotBlank()) query["beforeId"] = beforeMessageId.take(256)
        }
        val response = api.get(
            "chats/${conversation.key.account.apiValue}/${encodePath(conversation.key.jid)}/sync",
            query
        )
        val rows = response.optJSONArray("messages") ?: JSONArray()
        val messages = buildList {
            for (index in 0 until rows.length()) {
                val row = rows.optJSONObject(index) ?: continue
                val messageId = row.optString("id")
                if (messageId.isBlank()) continue
                val rawTimestamp = row.optLong("timestamp")
                val timestamp = if (rawTimestamp > 0 && rawTimestamp < 10_000_000_000L) rawTimestamp * 1000L else rawTimestamp
                val reactionRows = row.optJSONArray("reactions")
                val reactions = reactionRows?.let { values ->
                    List(values.length()) { values.optString(it) }.filter(String::isNotBlank)
                }.orEmpty()
                add(ChatMessage(
                    key = conversation.key,
                    messageId = messageId,
                    direction = if (row.optBoolean("fromMe")) MessageDirection.OUTGOING else MessageDirection.INCOMING,
                    kind = parseMessageKind(row.optString("type")),
                    text = row.optString("text"),
                    timestampMillis = timestamp.coerceAtLeast(0L),
                    status = parseMessageStatus(row.optString("status")),
                    mediaMimeType = row.optString("mimeType").takeIf { it.isNotBlank() },
                    mediaFileName = row.optString("fileName").takeIf { it.isNotBlank() },
                    isViewOnce = row.optBoolean("viewOnce"),
                    senderName = row.optString("pushName").takeIf { it.isNotBlank() },
                    mediaUrl = row.optString("mediaUrl").takeIf { it.isNotBlank() },
                    mediaSizeBytes = row.optLong("size").takeIf { it > 0 },
                    mediaDurationSeconds = row.optLong("duration").takeIf { it > 0 },
                    viewOnceViewed = row.optBoolean("viewOnceViewed"),
                    mediaUnavailable = row.optString("mediaUnavailable").takeIf { it.isNotBlank() },
                    isStarred = row.optBoolean("starred"),
                    isVoiceNote = row.optBoolean("ptt"),
                    replyToMessageId = row.optString("quotedMessageId").takeIf { it.isNotBlank() },
                    quotedMessageText = row.optString("quotedMessageText").takeIf { it.isNotBlank() },
                    reactions = reactions,
                    deletedByRemote = row.optBoolean("deletedByRemote"),
                    deletedAtMillis = row.optLong("deletedAt")
                ))
            }
        }
        return ChatSyncPage(
            messages = messages,
            hasOlder = response.optBoolean("hasOlder", messages.size >= limit),
            hasNewer = response.optBoolean("hasNewer", false),
            syncedAtMillis = response.optLong("syncedAt", System.currentTimeMillis()),
            deletedMessageIds = response.optJSONArray("deletedMessageIds").let { values ->
                if (values == null) emptyList() else List(values.length()) { values.optString(it) }.filter(String::isNotBlank)
            },
            remoteDeletedMessages = response.optJSONArray("remoteDeletedMessages").let { values ->
                if (values == null) emptyList() else buildList {
                    for (index in 0 until values.length()) {
                        val row = values.optJSONObject(index) ?: continue
                        val messageId = row.optString("id")
                        if (messageId.isNotBlank()) add(
                            RemoteDeletedMessage(messageId, row.optLong("deletedAt").coerceAtLeast(0L))
                        )
                    }
                }
            }
        )
    }

    suspend fun searchMessages(
        conversation: ChatSummary,
        query: String,
        limit: Int = 100
    ): List<ChatMessage> {
        val term = query.trim()
        if (term.length < 2) return emptyList()
        require(term.length <= 100) { "Search text must be 100 characters or fewer." }
        val response = api.get(
            "chats/${conversation.key.account.apiValue}/${encodePath(conversation.key.jid)}/search",
            mapOf("q" to term, "limit" to limit.coerceIn(1, 100).toString())
        )
        val rows = response.optJSONArray("results") ?: JSONArray()
        return buildList {
            for (index in 0 until rows.length()) {
                val row = rows.optJSONObject(index) ?: continue
                val messageId = row.optString("id")
                if (messageId.isBlank()) continue
                val timestamp = row.optLong("timestamp").let {
                    if (it > 0 && it < 10_000_000_000L) it * 1000L else it
                }
                add(
                    ChatMessage(
                        key = conversation.key,
                        messageId = messageId,
                        direction = if (row.optBoolean("fromMe")) MessageDirection.OUTGOING else MessageDirection.INCOMING,
                        kind = parseMessageKind(row.optString("type")),
                        text = row.optString("text"),
                        timestampMillis = timestamp.coerceAtLeast(0L),
                        senderName = row.optString("pushName").takeIf { it.isNotBlank() },
                        mediaFileName = row.optString("fileName").takeIf { it.isNotBlank() },
                        deletedByRemote = row.optBoolean("deletedByRemote"),
                        deletedAtMillis = row.optLong("deletedAt"),
                        quotedMessageText = row.optString("quotedMessageText").takeIf { it.isNotBlank() }
                    )
                )
            }
        }.sortedBy { it.timestampMillis }
    }

    suspend fun sendText(
        conversation: ChatSummary,
        text: String,
        replyTo: ChatMessage? = null,
        clientMessageId: String? = null
    ): String {
        require(replyTo == null || replyTo.key == conversation.key) {
            "A reply must reference a message in the same conversation."
        }
        val result = api.sendChatMessage(
            conversation.key.account.apiValue,
            conversation.key.jid,
            text,
            replyTo?.messageId,
            clientMessageId
        )
        return result.optString("message")
    }

    suspend fun sendMedia(
        conversation: ChatSummary,
        bytes: ByteArray,
        mimeType: String,
        fileName: String,
        caption: String,
        isVoiceNote: Boolean = false,
        durationSeconds: Int = 0
    ): String {
        val result = api.sendChatMedia(
            conversation.key.account.apiValue,
            conversation.key.jid,
            bytes,
            mimeType,
            fileName,
            caption,
            isVoiceNote,
            durationSeconds
        )
        return result.optString("message")
    }

    suspend fun visibility(account: ChatAccount): JSONObject =
        api.get("chats/${account.apiValue}/visibility").optJSONObject("visibility") ?: JSONObject()

    suspend fun saveVisibility(account: ChatAccount, visibility: JSONObject) {
        api.put("chats/${account.apiValue}/visibility", JSONObject().put("visibility", visibility))
    }

    suspend fun setVisibilityModes(
        account: ChatAccount,
        showIndividuals: Boolean,
        showGroups: Boolean
    ) {
        val current = visibility(account)
        val individuals = current.optJSONObject("individuals") ?: JSONObject()
        val groups = current.optJSONObject("groups") ?: JSONObject()
        individuals.put("mode", if (showIndividuals) "all" else "selected")
        groups.put("mode", if (showGroups) "all" else "selected")
        current.put("individuals", individuals).put("groups", groups)
        saveVisibility(account, current)
    }

    suspend fun starredMessages(account: ChatAccount): JSONArray =
        api.get("chats/${account.apiValue}/starred").optJSONArray("messages") ?: JSONArray()

    suspend fun starredPreviews(account: ChatAccount): List<String> {
        val messages = starredMessages(account)
        return buildList {
            for (index in 0 until messages.length()) {
                val row = messages.optJSONObject(index) ?: continue
                val body = row.optString("text").ifBlank { row.optString("type").replaceFirstChar { it.uppercase() } }
                add("${row.optString("pushName").ifBlank { row.optString("jid") }} · $body")
            }
        }
    }

    suspend fun setChatPreferences(
        account: ChatAccount,
        jid: String,
        pinned: Boolean? = null,
        muted: Boolean? = null
    ) {
        val body = JSONObject().put("jid", jid)
        pinned?.let { body.put("pinned", it) }
        muted?.let { body.put("muted", it) }
        api.put("chats/${account.apiValue}/preferences", body)
    }

    suspend fun chatAppearance(): JSONObject =
        studioSettings().optJSONObject("chatAppearance") ?: JSONObject()

    suspend fun saveChatAppearance(appearance: JSONObject) {
        val settings = studioSettings()
        settings.put("chatAppearance", appearance)
        saveStudioSettings(settings)
    }

    suspend fun pairCode(account: ChatAccount): String =
        api.post("accounts/${account.apiValue}/pair-code", JSONObject()).optString("pairingCode")

    suspend fun startPairingQr(account: ChatAccount): JSONObject =
        api.post("accounts/${account.apiValue}/qr", JSONObject())

    suspend fun cancelPairing(account: ChatAccount): JSONObject =
        api.post("accounts/${account.apiValue}/cancel-pairing", JSONObject())

    suspend fun pairingQr(account: ChatAccount): JSONObject =
        api.get("accounts/${account.apiValue}/qr")

    suspend fun reconnect(account: ChatAccount): JSONObject =
        api.post("accounts/${account.apiValue}/reconnect", JSONObject())

    suspend fun restart(account: ChatAccount): JSONObject =
        api.post("accounts/${account.apiValue}/restart", JSONObject())

    suspend fun stop(account: ChatAccount): JSONObject =
        api.post("accounts/${account.apiValue}/stop", JSONObject())

    suspend fun repair(account: ChatAccount): JSONObject =
        api.post("accounts/${account.apiValue}/repair", JSONObject())

    suspend fun allFiles(): List<ServerFileEntry> {
        val result = linkedMapOf<String, ServerFileEntry>()
        val pending = ArrayDeque<String>()
        val visited = mutableSetOf<String>()
        pending.addLast("")
        while (pending.isNotEmpty() && visited.size < 1000) {
            val directory = pending.removeFirst()
            if (!visited.add(directory)) continue
            val tree = fileTree(directory)
            tree.children.forEach { entry ->
                result[entry.path] = entry
                if (entry.isDirectory) pending.addLast(entry.path)
            }
        }
        return result.values.toList()
    }

    suspend fun fileTree(path: String = ""): ServerFileTree {
        val response = api.get("files/tree", mapOf("item" to path))
        val children = response.optJSONArray("children") ?: JSONArray()
        return ServerFileTree(
            path = response.optString("path"),
            children = buildList {
                for (index in 0 until children.length()) {
                    val child = children.optJSONObject(index) ?: continue
                    add(
                        ServerFileEntry(
                            name = child.optString("name"),
                            path = child.optString("path"),
                            isDirectory = child.optString("type") == "folder",
                            sizeBytes = child.optLong("size").takeIf { it > 0 },
                            modifiedAt = child.optString("modified").takeIf { it.isNotBlank() },
                            readOnly = child.optBoolean("readOnly")
                        )
                    )
                }
            },
            pendingEdits = response.optBoolean("pending"),
            changedCount = response.optInt("changedCount"),
            staleDraft = response.optBoolean("stale")
        )
    }

    suspend fun previewFile(path: String): ServerFileDocument {
        val response = api.get("files/preview", mapOf("item" to path))
        return ServerFileDocument(
            path = response.optString("path"),
            content = response.optString("content"),
            sha256 = response.optString("sha256"),
            language = response.optString("language"),
            pendingEdits = response.optBoolean("pending")
        )
    }

    suspend fun saveFile(path: String, content: String, expectedSha256: String): String {
        val result = api.put(
            "files/content",
            JSONObject()
                .put("path", path)
                .put("content", content)
                .put("expectedSha256", expectedSha256)
        )
        return result.optString("sha256").takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("The server saved the file but did not return its new checksum.")
    }

    suspend fun createFile(parentPath: String, name: String, content: String) {
        api.post(
            "files",
            JSONObject()
                .put("parentPath", parentPath)
                .put("name", name)
                .put("type", "file")
                .put("content", content)
        )
    }

    suspend fun createFolder(parentPath: String, name: String) {
        api.post(
            "files",
            JSONObject()
                .put("parentPath", parentPath)
                .put("name", name)
                .put("type", "folder")
        )
    }

    suspend fun duplicateSourceEntry(entry: ServerFileEntry, newName: String) {
        require(newName.isNotBlank()) { "Enter a name for the copy." }
        val parent = entry.path.substringBeforeLast('/', "")
        if (!entry.isDirectory) {
            val source = previewFile(entry.path)
            createFile(parent, newName, source.content)
            return
        }
        val targetRoot = if (parent.isBlank()) newName else "$parent/$newName"
        createFolder(parent, newName)
        val sourcePrefix = entry.path.trimEnd('/') + "/"
        val descendants = allFiles().filter { it.path.startsWith(sourcePrefix) }
            .sortedBy { it.path.count { character -> character == '/' } }
        val createdFolders = mutableSetOf(targetRoot)
        descendants.filter { it.isDirectory }.forEach { folder ->
            val relative = folder.path.removePrefix(sourcePrefix)
            var destination = targetRoot
            relative.split('/').filter(String::isNotBlank).forEach { segment ->
                val nextPath = "$destination/$segment"
                if (createdFolders.add(nextPath)) createFolder(destination, segment)
                destination = nextPath
            }
        }
        descendants.filterNot { it.isDirectory }.forEach { file ->
            val relative = file.path.removePrefix(sourcePrefix)
            val segments = relative.split('/').filter(String::isNotBlank)
            if (segments.isEmpty()) return@forEach
            val targetName = segments.last()
            var targetParent = targetRoot
            segments.dropLast(1).forEach { segment ->
                val nextPath = "$targetParent/$segment"
                if (createdFolders.add(nextPath)) createFolder(targetParent, segment)
                targetParent = nextPath
            }
            val source = previewFile(file.path)
            createFile(targetParent, targetName, source.content)
        }
    }

    suspend fun renameFile(path: String, newName: String) {
        api.post("files/rename", JSONObject().put("path", path).put("name", newName))
    }

    suspend fun moveFile(path: String, destination: String) {
        moveFiles(listOf(path), destination)
    }

    suspend fun moveFiles(paths: List<String>, destination: String) {
        require(paths.isNotEmpty()) { "Select at least one source item to move." }
        require(paths.size <= 50) { "Move up to 50 items at a time." }
        api.post(
            "files/move",
            JSONObject()
                .put("paths", JSONArray(paths))
                .put("destination", destination.trim())
        )
    }

    suspend fun deleteFiles(paths: List<String>) {
        api.post("files/delete", JSONObject().put("paths", JSONArray(paths)))
    }

    suspend fun applyFileEdits() {
        api.post("files/apply", JSONObject().put("confirm", true))
    }

    suspend fun discardFileEdits() {
        api.post("files/discard", JSONObject().put("confirm", true))
    }

    suspend fun exportSourceZip(): ByteArray =
        api.getBytes("files/export")

    suspend fun downloadSourceFile(path: String): ByteArray =
        api.getBytes("files/download?item=" + java.net.URLEncoder.encode(path, "UTF-8"))

    suspend fun exportFiles(paths: List<String>): ByteArray =
        api.postBytes("files/export-selection", JSONObject().put("paths", JSONArray(paths)))

    suspend fun mediaBytes(conversation: ChatSummary, message: ChatMessage): ByteArray {
        require(conversation.key.account == message.key.account) {
            "The attachment does not belong to the selected WhatsApp account."
        }
        val mediaPath = "chats/${conversation.key.account.apiValue}/media/${encodePath(message.messageId)}"
        return try {
            api.getBytes(mediaPath)
        } catch (error: AharaneApiException) {
            if (error.statusCode != 404) throw error
            // Incoming media is indexed before its bytes are cached. Ask the
            // connected WhatsApp session to fetch it, then read the cached file.
            downloadUnavailableMedia(conversation, message)
            api.getBytes(mediaPath)
        }
    }

    suspend fun viewOnceMedia(account: ChatAccount, message: ChatMessage): ByteArray {
        require(message.isViewOnce) { "This message is not view-once media." }
        require(!message.viewOnceViewed) { "This view-once media has already been opened." }
        return api.sendViewOnceRequest(account.apiValue, message.messageId)
    }

    suspend fun downloadUnavailableMedia(conversation: ChatSummary, message: ChatMessage) {
        api.downloadChatMedia(
            conversation.key.account.apiValue,
            conversation.key.jid,
            message.messageId
        )
    }

    suspend fun react(conversation: ChatSummary, message: ChatMessage, reaction: String) {
        api.reactToMessage(
            conversation.key.account.apiValue,
            conversation.key.jid,
            message.messageId,
            reaction
        )
    }

    suspend fun star(conversation: ChatSummary, message: ChatMessage, starred: Boolean) {
        api.starMessage(
            conversation.key.account.apiValue,
            conversation.key.jid,
            message.messageId,
            starred
        )
    }

    suspend fun deleteMessage(conversation: ChatSummary, message: ChatMessage) {
        api.deleteMessage(
            conversation.key.account.apiValue,
            conversation.key.jid,
            message.messageId
        )
    }

    suspend fun forwardMessage(
        conversation: ChatSummary,
        message: ChatMessage,
        destination: ChatSummary
    ) {
        require(conversation.key.account == destination.key.account) {
            "Messages can only be forwarded within the same WhatsApp account."
        }
        api.forwardMessage(
            conversation.key.account.apiValue,
            conversation.key.jid,
            message.messageId,
            destination.key.jid
        )
    }

    suspend fun archive(conversation: ChatSummary, archived: Boolean) {
        api.archiveChat(
            conversation.key.account.apiValue,
            conversation.key.jid,
            archived
        )
    }

    suspend fun markUnread(conversation: ChatSummary) {
        api.markChatUnread(conversation.key.account.apiValue, conversation.key.jid)
    }

    suspend fun updatePackages(): List<AharaneUpdatePackage> {
        val rows = api.get("files/packages").optJSONArray("packages") ?: JSONArray()
        return buildList {
            for (index in 0 until rows.length()) {
                val row = rows.optJSONObject(index) ?: continue
                val id = row.optString("updateId")
                if (id.isBlank()) continue
                add(
                    AharaneUpdatePackage(
                        updateId = id,
                        filename = row.optString("filename"),
                        sizeBytes = row.optLong("size"),
                        status = row.optString("status"),
                        version = row.optString("version"),
                        createdAt = row.optString("createdAt"),
                        validatedAt = row.optString("validatedAt").takeIf { it.isNotBlank() && it != "null" },
                        fileCount = row.optInt("fileCount")
                    )
                )
            }
        }
    }

    suspend fun updateStatus(): JSONObject = api.get("update/status")

    suspend fun uploadUpdatePackage(
        filename: String,
        bytes: ByteArray,
        onProgress: (String, Float) -> Unit = { _, _ -> }
    ): JSONObject {
        require(filename.endsWith(".zip", ignoreCase = true)) { "Choose an Aharane ZIP update package." }
        require(bytes.size in 22..(50 * 1024 * 1024)) { "The ZIP must be between 22 bytes and 50 MB." }
        val updateId = UUID.randomUUID().toString()
        val sha256 = MessageDigest.getInstance("SHA-256")
            .digest(bytes)
            .joinToString("") { "%02x".format(it) }
        val chunkBytes = 1024 * 1024
        val totalChunks = (bytes.size + chunkBytes - 1) / chunkBytes
        var uploadStarted = false
        try {
            val started = api.post(
                "update/upload/start",
                JSONObject()
                    .put("updateId", updateId)
                    .put("filename", filename)
                    .put("size", bytes.size)
                    .put("totalChunks", totalChunks)
                    .put("sha256", sha256)
            )
            uploadStarted = true
            val actualChunkSize = started.optInt("chunkBytes", chunkBytes).takeIf { it > 0 } ?: chunkBytes
            val actualTotal = started.optInt("totalChunks", totalChunks)
            require(actualTotal == totalChunks) { "The server returned an unexpected upload layout." }
            for (index in 0 until totalChunks) {
                val from = index * actualChunkSize
                val to = minOf(bytes.size, from + actualChunkSize)
                require(to > from) { "The upload chunk layout is invalid." }
                val chunk = bytes.copyOfRange(from, to)
                api.post(
                    "update/upload/chunk",
                    JSONObject()
                        .put("updateId", updateId)
                        .put("index", index)
                        .put("data", Base64.encodeToString(chunk, Base64.NO_WRAP))
                )
                onProgress("Uploading package", (index + 1).toFloat() / totalChunks.toFloat())
            }
            onProgress("Validating manifest and package contents", 0.98f)
            val result = api.post("update/validate", JSONObject().put("updateId", updateId))
            uploadStarted = false
            onProgress("Package validated", 1f)
            return result
        } catch (error: Exception) {
            if (uploadStarted) {
                // The server refuses to abort a validated package, so this is
                // safe even when the validation response was lost in transit.
                runCatching {
                    api.post("update/upload/abort", JSONObject().put("updateId", updateId))
                }
            }
            throw error
        }
    }

    suspend fun removeUpdatePackage(updateId: String) {
        api.post("files/packages/remove", JSONObject().put("updateId", updateId))
    }

    suspend fun deployUpdatePackage(updateId: String): JSONObject =
        api.post(
            "update/deploy",
            JSONObject().put("updateId", updateId).put("confirm", true)
        )

    suspend fun diagnoseSource(path: String, content: String): EditorDiagnosticsResult {
        val response = api.post(
            "files/diagnostics",
            JSONObject().put("path", path).put("content", content)
        )
        val rows = response.optJSONArray("diagnostics") ?: JSONArray()
        val results = buildList {
            for (index in 0 until rows.length()) {
                val row = rows.optJSONObject(index) ?: continue
                add(
                    EditorDiagnostic(
                        severity = row.optString("severity", "error"),
                        message = row.optString("message"),
                        line = row.optInt("line").takeIf { it > 0 },
                        column = row.optInt("column").takeIf { it > 0 }
                    )
                )
            }
        }
        return EditorDiagnosticsResult(
            supported = response.optBoolean("supported"),
            reason = response.optString("reason").takeIf { it.isNotBlank() },
            diagnostics = results
        )
    }

    suspend fun clearActivity() {
        api.delete("activity")
    }

    suspend fun activity(limit: Int = 100): List<ServerActivityEntry> {
        val rows = api.get("activity", mapOf("limit" to limit.toString())).optJSONArray("entries") ?: JSONArray()
        return buildList {
            for (index in 0 until rows.length()) {
                val row = rows.optJSONObject(index) ?: continue
                add(
                    ServerActivityEntry(
                        id = row.optString("id"),
                        timestamp = row.optString("at"),
                        level = row.optString("level"),
                        source = row.optString("source"),
                        message = row.optString("message"),
                        details = row.optJSONObject("details")?.toString().orEmpty()
                    )
                )
            }
        }
    }

    suspend fun metrics(): ServerMessageMetrics {
        val response = api.get("metrics")
        val hourly = response.optJSONArray("hourlyMessages") ?: JSONArray()
        return ServerMessageMetrics(
            messagesLast24h = response.optInt("messagesLast24h"),
            totalMessages = response.optInt("totalMessages"),
            hourlyMessages = buildList {
                for (index in 0 until hourly.length()) add(hourly.optInt(index))
            }
        )
    }

    suspend fun storage(): ServerStorageSnapshot {
        val response = api.get("storage")
        val disk = response.optJSONObject("disk") ?: JSONObject()
        val media = response.optJSONObject("media") ?: JSONObject()
        return ServerStorageSnapshot(
            totalBytes = disk.optLong("totalBytes"),
            usedBytes = disk.optLong("usedBytes"),
            freeBytes = disk.optLong("freeBytes"),
            mediaBytes = media.optLong("bytes")
        )
    }

    private fun JSONArray?.toStringSet(): Set<String> {
        if (this == null) return emptySet()
        return buildSet { for (index in 0 until length()) add(optString(index)) }
    }

    private fun parseAccount(account: ChatAccount, json: JSONObject): ServerAccountState =
        ServerAccountState(
            id = account,
            state = json.optString("state", "unknown"),
            connected = json.optBoolean("connected"),
            registered = json.optBoolean("registered"),
            reconnectAttempts = json.optInt("reconnectAttempts"),
            lastConnectedAt = json.optString("lastConnectedAt").takeIf { it.isNotBlank() && it != "null" },
            pairingInProgress = json.optBoolean("pairingInProgress"),
            pairingSucceeded = json.optBoolean("pairingSucceeded"),
            pairingError = json.optString("pairingError")
        )

    private fun parseMessageKind(value: String): MessageKind = when (value.lowercase()) {
        "conversation", "extendedtextmessage", "text" -> MessageKind.TEXT
        "image" -> MessageKind.IMAGE
        "video" -> MessageKind.VIDEO
        "audio" -> MessageKind.AUDIO
        "sticker" -> MessageKind.STICKER
        "document" -> MessageKind.DOCUMENT
        "contact", "contacts" -> MessageKind.CONTACT
        "location", "liveLocation" -> MessageKind.LOCATION
        "poll" -> MessageKind.POLL
        "reaction" -> MessageKind.REACTION
        "response" -> MessageKind.RESPONSE
        else -> MessageKind.UNSUPPORTED
    }

    private fun parseMessageStatus(value: String): MessageStatus = when (value.lowercase()) {
        "pending" -> MessageStatus.PENDING
        "sent", "server_ack" -> MessageStatus.SENT
        "delivered", "delivery_ack" -> MessageStatus.DELIVERED
        "read", "read_ack" -> MessageStatus.READ
        "failed" -> MessageStatus.FAILED
        else -> MessageStatus.UNKNOWN
    }

    private fun JSONArray?.toStringList(): List<String> {
        if (this == null) return emptyList()
        return buildList { for (index in 0 until length()) add(optString(index)) }
    }

    private fun encodePath(value: String): String = value.toByteArray(Charsets.UTF_8)
        .joinToString("") { byte ->
            val unsigned = byte.toInt() and 0xff
            if ((unsigned in 0x41..0x5a) || (unsigned in 0x61..0x7a) ||
                (unsigned in 0x30..0x39) || unsigned == 0x2d || unsigned == 0x5f ||
                unsigned == 0x2e || unsigned == 0x7e) {
                unsigned.toChar().toString()
            } else "%%%02X".format(unsigned)
        }
}
