package com.aharane.studio.core.network

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

data class ServerEndpoint(
    val origin: String,
    val prefix: String,
    val studioUrl: String
) {
    fun apiUrl(path: String): URL = URL(
        origin + prefix + "/api/" + path.trimStart('/')
    )

    fun healthUrl(): URL = URL(origin + prefix + "/healthz")
}

/**
 * The user enters the HTTPS Studio URL, e.g. https://host.example/aharane/studio.
 * The API uses the same reverse-proxy prefix, without the final /studio segment.
 */
object ServerEndpointParser {
    fun parse(raw: String): ServerEndpoint {
        val value = raw.trim()
        require(value.isNotBlank()) { "Enter your Aharane Studio HTTPS address." }
        val parsed = URL(value)
        require(parsed.protocol.equals("https", ignoreCase = true)) {
            "Aharane connections must use HTTPS."
        }
        require(parsed.userInfo.isNullOrBlank() && parsed.query.isNullOrBlank() && parsed.ref.isNullOrBlank()) {
            "Enter the Studio address without a username, password, query or fragment."
        }
        require(parsed.host.isNotBlank()) { "Enter a valid server host." }
        val path = parsed.path.trimEnd('/')
        val prefix = when {
            path.endsWith("/studio", ignoreCase = true) -> path.dropLast("/studio".length).trimEnd('/')
            path.endsWith("/api", ignoreCase = true) -> path.dropLast("/api".length).trimEnd('/')
            else -> path
        }
        val origin = "${parsed.protocol.lowercase()}://${parsed.authority}"
        return ServerEndpoint(origin = origin, prefix = prefix, studioUrl = origin + path.ifBlank { "" } + "/studio")
    }
}

class AharaneApiException(
    val statusCode: Int,
    message: String
) : Exception(message)

class AharaneApiClient(context: Context, endpoint: ServerEndpoint) {
    private val cookies = SecureCookieStore(context.applicationContext)
    val endpoint: ServerEndpoint = endpoint

    fun hasSavedSession(): Boolean {
        return cookies.headerFor(endpoint.apiUrl("status")).isNotBlank()
    }

    suspend fun checkServer(): JSONObject = requestJson(
        url = endpoint.healthUrl(),
        method = "GET"
    )

    suspend fun authStatus(): JSONObject = get("auth/status")

    suspend fun login(password: String): JSONObject {
        require(password.isNotBlank()) { "Enter your Studio password." }
        return post("auth/login", JSONObject().put("password", password))
    }

    suspend fun logout(): JSONObject {
        return try {
            post("auth/logout", JSONObject())
        } finally {
            cookies.clear()
        }
    }

    suspend fun get(path: String): JSONObject = requestJson(endpoint.apiUrl(path), "GET")

    suspend fun get(path: String, query: Map<String, String>): JSONObject {
        val queryString = query.entries.joinToString("&") {
            encode(it.key) + "=" + encode(it.value)
        }
        val url = endpoint.apiUrl(path + if (queryString.isBlank()) "" else "?$queryString")
        return requestJson(url, "GET")
    }

    suspend fun post(path: String, body: JSONObject): JSONObject =
        requestJson(endpoint.apiUrl(path), "POST", body.toString().toByteArray(StandardCharsets.UTF_8))

    suspend fun put(path: String, body: JSONObject): JSONObject =
        requestJson(endpoint.apiUrl(path), "PUT", body.toString().toByteArray(StandardCharsets.UTF_8))

    suspend fun delete(path: String): JSONObject =
        requestJson(endpoint.apiUrl(path), "DELETE")

    suspend fun uploadBytes(
        path: String,
        bytes: ByteArray,
        contentType: String,
        headers: Map<String, String> = emptyMap()
    ): JSONObject = requestJson(
        endpoint.apiUrl(path),
        "POST",
        bytes,
        contentType,
        headers
    )

    suspend fun getBytes(path: String): ByteArray =
        requestBytes(endpoint.apiUrl(path), "GET")

    suspend fun postBytes(path: String, body: JSONObject = JSONObject()): ByteArray =
        requestBytes(
            endpoint.apiUrl(path),
            "POST",
            body.toString().toByteArray(StandardCharsets.UTF_8),
            "application/json"
        )

    private suspend fun requestBytes(
        url: URL,
        method: String,
        body: ByteArray? = null,
        contentType: String? = null
    ): ByteArray {
        val response = perform(url, method, body, contentType, emptyMap())
        if (response.first !in 200..299) throw responseError(response.first, response.second)
        return response.third
    }

    suspend fun sendChatMessage(account: String, jid: String, text: String): JSONObject =
        post("chats/$account/${encodePath(jid)}/send", JSONObject().put("text", text))

    suspend fun reactToMessage(account: String, jid: String, messageId: String, reaction: String): JSONObject =
        post(
            "chats/$account/${encodePath(jid)}/reaction",
            JSONObject().put("messageId", messageId).put("reaction", reaction)
        )

    suspend fun starMessage(account: String, jid: String, messageId: String, starred: Boolean): JSONObject =
        post(
            "chats/$account/${encodePath(jid)}/star",
            JSONObject().put("messageId", messageId).put("starred", starred)
        )

    suspend fun deleteMessage(account: String, jid: String, messageId: String): JSONObject =
        post(
            "chats/$account/${encodePath(jid)}/delete",
            JSONObject().put("messageId", messageId)
        )

    suspend fun archiveChat(account: String, jid: String, archived: Boolean): JSONObject =
        post(
            "chats/$account/${encodePath(jid)}/archive",
            JSONObject().put("archived", archived)
        )

    suspend fun markChatUnread(account: String, jid: String): JSONObject =
        post("chats/$account/${encodePath(jid)}/mark-unread", JSONObject())

    suspend fun downloadChatMedia(account: String, jid: String, messageId: String): JSONObject =
        post(
            "chats/$account/${encodePath(jid)}/media/$messageId/download",
            JSONObject()
        )

    suspend fun forwardMessage(account: String, jid: String, messageId: String, destinationJid: String): JSONObject =
        post(
            "chats/$account/${encodePath(jid)}/forward",
            JSONObject().put("messageId", messageId).put("destinationJid", destinationJid)
        )

    suspend fun sendChatMedia(
        account: String,
        jid: String,
        bytes: ByteArray,
        mimeType: String,
        fileName: String,
        caption: String
    ): JSONObject = uploadBytes(
        "chats/$account/${encodePath(jid)}/media",
        bytes,
        "application/octet-stream",
        mapOf(
            "X-Media-Type" to mimeType,
            "X-File-Name" to fileName,
            "X-Caption" to caption
        )
    )

    suspend fun sendViewOnceRequest(account: String, messageId: String): ByteArray =
        postBytes("chats/$account/media/$messageId/view-once", JSONObject())

    private suspend fun requestJson(
        url: URL,
        method: String,
        body: ByteArray? = null,
        contentType: String? = "application/json",
        headers: Map<String, String> = emptyMap()
    ): JSONObject {
        val response = perform(url, method, body, contentType, headers)
        if (response.first !in 200..299) throw responseError(response.first, response.second)
        val text = response.third.toString(StandardCharsets.UTF_8)
        return if (text.isBlank()) JSONObject().put("ok", true) else runCatching { JSONObject(text) }
            .getOrElse { throw AharaneApiException(response.first, "The Aharane server returned an invalid response.") }
    }

    private suspend fun perform(
        url: URL,
        method: String,
        body: ByteArray?,
        contentType: String?,
        headers: Map<String, String>
    ): Triple<Int, String, ByteArray> = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = 30_000
            useCaches = false
            instanceFollowRedirects = false
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Origin", endpoint.origin)
            setRequestProperty("Cache-Control", "no-store")
            val cookieHeader = cookies.headerFor(url)
            if (cookieHeader.isNotBlank()) setRequestProperty("Cookie", cookieHeader)
            if (contentType != null) setRequestProperty("Content-Type", contentType)
            headers.forEach { (key, value) -> setRequestProperty(key, value) }
            if (body != null) doOutput = true
        }
        try {
            if (body != null) connection.outputStream.use { output ->
                output.write(body)
                output.flush()
            }
            val status = connection.responseCode
            val setCookies = connection.headerFields.entries
                .filter { it.key.equals("Set-Cookie", ignoreCase = true) }
                .flatMap { it.value.orEmpty() }
            cookies.accept(url, setCookies)
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val bytes = stream?.use(::readFully) ?: ByteArray(0)
            Triple(status, bytes.toString(StandardCharsets.UTF_8), bytes)
        } finally {
            connection.disconnect()
        }
    }

    private fun responseError(status: Int, body: String): AharaneApiException {
        val message = runCatching { JSONObject(body).optString("error") }.getOrNull()
            ?.takeIf { it.isNotBlank() }
            ?: when (status) {
                401 -> "Your Studio session has expired. Sign in again."
                403 -> "The server rejected this request."
                404 -> "That Aharane endpoint was not found. Check the Studio URL."
                429 -> "Too many requests. Wait a moment and try again."
                503 -> "The Aharane service is temporarily unavailable."
                else -> "Aharane request failed (HTTP $status)."
            }
        return AharaneApiException(status, message)
    }

    private fun readFully(input: InputStream): ByteArray {
        val output = ByteArrayOutputStream()
        input.copyTo(output)
        return output.toByteArray()
    }

    private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")
    private fun encodePath(value: String): String = value.toByteArray(StandardCharsets.UTF_8)
        .joinToString("") { byte ->
            val unsigned = byte.toInt() and 0xff
            if ((unsigned in 0x41..0x5a) || (unsigned in 0x61..0x7a) ||
                (unsigned in 0x30..0x39) || unsigned == 0x2d || unsigned == 0x5f ||
                unsigned == 0x2e || unsigned == 0x7e) {
                unsigned.toChar().toString()
            } else "%%%02X".format(unsigned)
        }

}
