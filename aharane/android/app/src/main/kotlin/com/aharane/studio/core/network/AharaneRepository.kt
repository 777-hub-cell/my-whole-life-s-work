package com.aharane.studio.core.network

import org.json.JSONArray
import org.json.JSONObject
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
    val pairingInProgress: Boolean
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

data class ServerOwnerSettings(
    val privateOwnerNumber: String = "",
    val publicOwnerNumber: String = "",
    val publicBotNumber: String = "",
    val allowedPublicSenders: List<String> = emptyList()
)

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

/**
 * Typed adapter for the existing Aharane server API. It never talks to WhatsApp
 * directly; Baileys, sessions and command dispatch remain on the server.
 */
class AharaneRepository(private val connection: AharaneConnectionManager) {
    private val api: AharaneApiClient
        get() = connection.api ?: throw IllegalStateException("Connect to your Aharane server first.")
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
            privateOwnerNumber = result.optString("privateOwnerNumber"),
            publicOwnerNumber = result.optString("publicOwnerNumber"),
            publicBotNumber = result.optString("publicBotNumber"),
            allowedPublicSenders = result.optJSONArray("allowedPublicSenders").toStringList()
        )
    }

    suspend fun saveOwnerSettings(settings: ServerOwnerSettings) {
        api.put(
            "owners",
            JSONObject()
                .put("privateOwnerNumber", settings.privateOwnerNumber)
                .put("publicOwnerNumber", settings.publicOwnerNumber)
                .put("publicBotNumber", settings.publicBotNumber)
                .put("allowedPublicSenders", JSONArray(settings.allowedPublicSenders))
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

    suspend fun chats(account: ChatAccount, query: String = "", limit: Int = 200): List<ChatSummary> {
        val response = api.get(
            "chats/${account.apiValue}",
            mapOf("limit" to limit.toString(), "q" to query)
        )
        val rows = response.optJSONArray("chats") ?: JSONArray()
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
                        isArchived = row.optBoolean("archived"),
                        isPinned = row.optBoolean("pinned"),
                        isMuted = row.optBoolean("muted"),
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
                        isVoiceNote = row.optBoolean("ptt")
                    )
                )
            }
        }
    }

    suspend fun sendText(conversation: ChatSummary, text: String): String {
        val result = api.sendChatMessage(conversation.key.account.apiValue, conversation.key.jid, text)
        return result.optJSONObject("message")?.optString("id").orEmpty()
    }

    suspend fun sendMedia(
        conversation: ChatSummary,
        bytes: ByteArray,
        mimeType: String,
        fileName: String,
        caption: String
    ): String {
        val result = api.sendChatMedia(
            conversation.key.account.apiValue,
            conversation.key.jid,
            bytes,
            mimeType,
            fileName,
            caption
        )
        return result.optString("message")
    }

    suspend fun visibility(account: ChatAccount): JSONObject =
        api.get("chats/${account.apiValue}/visibility")

    suspend fun saveVisibility(account: ChatAccount, visibility: JSONObject) {
        api.put("chats/${account.apiValue}/visibility", JSONObject().put("visibility", visibility))
    }

    suspend fun starredMessages(account: ChatAccount): JSONArray =
        api.get("chats/${account.apiValue}/starred").optJSONArray("messages") ?: JSONArray()

    suspend fun pairCode(account: ChatAccount): String =
        api.post("accounts/${account.apiValue}/pair-code", JSONObject()).optString("pairingCode")

    suspend fun pairingQr(account: ChatAccount): JSONObject =
        api.post("accounts/${account.apiValue}/qr", JSONObject())

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
        api.post("files/move", JSONObject().put("path", path).put("destination", destination))
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

    suspend fun mediaBytes(account: ChatAccount, message: ChatMessage): ByteArray =
        api.getBytes("chats/${account.apiValue}/media/${encodePath(message.messageId)}")

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

    suspend fun storage(): ServerStorageSnapshot {
        val response = api.get("storage")
        val disk = response.optJSONObject("disk") ?: JSONObject()
        val media = response.optJSONObject("media") ?: JSONObject()
        return ServerStorageSnapshot(
            totalBytes = disk.optLong("totalBytes"),
            usedBytes = disk.optLong("usedBytes"),
            freeBytes = disk.optLong("freeBytes"),
            mediaBytes = media.optLong("totalBytes")
        )
    }

    private fun parseAccount(account: ChatAccount, json: JSONObject): ServerAccountState =
        ServerAccountState(
            id = account,
            state = json.optString("state", "unknown"),
            connected = json.optBoolean("connected"),
            registered = json.optBoolean("registered"),
            reconnectAttempts = json.optInt("reconnectAttempts"),
            lastConnectedAt = json.optString("lastConnectedAt").takeIf { it.isNotBlank() && it != "null" },
            pairingInProgress = json.optBoolean("pairingInProgress")
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
