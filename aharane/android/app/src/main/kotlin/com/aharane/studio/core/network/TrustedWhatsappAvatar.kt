package com.aharane.studio.core.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.net.URI
import java.net.URL
import javax.net.ssl.HttpsURLConnection

/**
 * Downloads only real WhatsApp-provided profile-picture URLs.
 * Never follows a redirect to an untrusted hostname or an insecure scheme.
 * Missing/private images are represented by null, not invented placeholders.
 */
internal fun trustedWhatsappAvatarUrl(input: String): URL? {
    val uri = runCatching { URI(input) }.getOrNull() ?: return null
    val host = uri.host?.lowercase()?.trimEnd('.') ?: return null
    val domains = listOf("whatsapp.net", "whatsapp.com", "fbcdn.net", "fbsbx.com")
    if (uri.scheme?.lowercase() != "https" || uri.userInfo != null ||
        (uri.port != -1 && uri.port != 443) ||
        domains.none { domain -> host == domain || host.endsWith(".$domain") }) return null
    return runCatching { uri.toURL() }.getOrNull()
}

internal suspend fun downloadWhatsappAvatar(source: String, maxBytes: Int = 524_288): ByteArray? =
    withContext(Dispatchers.IO) {
        var url = trustedWhatsappAvatarUrl(source) ?: return@withContext null
        repeat(3) {
            val connection = (url.openConnection() as? HttpsURLConnection)
                ?: return@withContext null
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 4_000
            connection.readTimeout = 5_000
            connection.setRequestProperty("Accept", "image/*")
            try {
                when (connection.responseCode) {
                    301, 302, 303, 307, 308 -> {
                        val location = connection.getHeaderField("Location")
                            ?: return@withContext null
                        url = trustedWhatsappAvatarUrl(URL(url, location).toString())
                            ?: return@withContext null
                    }
                    200 -> {
                        val mimeType = connection.contentType.orEmpty().substringBefore(';').trim().lowercase()
                        if (mimeType.isNotEmpty() && !mimeType.startsWith("image/")) return@withContext null
                        if (connection.contentLength > maxBytes) return@withContext null
                        val out = ByteArrayOutputStream()
                        connection.inputStream.use { stream ->
                            val buffer = ByteArray(8192)
                            while (true) {
                                val count = stream.read(buffer)
                                if (count < 0) break
                                if (out.size() + count > maxBytes) return@withContext null
                                out.write(buffer, 0, count)
                            }
                        }
                        return@withContext out.toByteArray().takeIf { it.isNotEmpty() }
                    }
                    else -> return@withContext null
                }
            } finally {
                connection.disconnect()
            }
        }
        null
    }
