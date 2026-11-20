package com.aharane.studio.core.network

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpCookie
import java.net.URL
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Small persistent cookie jar for the Aharane HTTPS session cookie.
 *
 * Only the short-lived, server-issued HttpOnly session cookie is persisted.
 * The Studio password and bootstrap/admin token are never stored.
 */
class SecureCookieStore(context: Context) {
    private val preferences = context.applicationContext
        .getSharedPreferences("aharane-secure-session", Context.MODE_PRIVATE)

    private data class Entry(
        val name: String,
        val value: String,
        val domain: String,
        val hostOnly: Boolean,
        val path: String,
        val secure: Boolean,
        val httpOnly: Boolean,
        val expiresAt: Long
    ) {
        fun matches(url: URL, now: Long): Boolean {
            if (expiresAt <= now) return false
            if (secure && url.protocol != "https") return false
            val requestHost = url.host.lowercase()
            val cookieDomain = domain.trimStart('.').lowercase()
            val domainMatches = if (hostOnly) requestHost == cookieDomain
                else requestHost == cookieDomain || requestHost.endsWith(".$cookieDomain")
            if (!domainMatches) return false
            val requestPath = url.path.ifBlank { "/" }
            val cookiePath = path.ifBlank { "/" }
            return requestPath == cookiePath ||
                requestPath.startsWith(if (cookiePath.endsWith("/")) cookiePath else "$cookiePath/")
        }

        fun identity(): String = "$name|$domain|$path"
    }

    @Synchronized
    fun headerFor(url: URL): String {
        val now = System.currentTimeMillis()
        val all = readEntries().filter { it.expiresAt > now }
        if (all.size != readEntries().size) writeEntries(all)
        return all.filter { it.matches(url, now) }
            .joinToString("; ") { "${it.name}=${it.value}" }
    }

    @Synchronized
    fun accept(url: URL, setCookieHeaders: List<String>) {
        if (setCookieHeaders.isEmpty()) return
        val entries = readEntries().toMutableList()
        for (header in setCookieHeaders) {
            val parsed = runCatching { HttpCookie.parse(header).firstOrNull() }.getOrNull() ?: continue
            val path = parsed.path?.takeIf { it.startsWith("/") } ?: defaultPath(url.path)
            val suppliedDomain = parsed.domain?.trimStart('.')?.lowercase()
            val hostOnly = suppliedDomain.isNullOrBlank()
            val domain = suppliedDomain?.takeIf { url.host.equals(it, true) || url.host.endsWith(".$it", true) }
                ?: if (hostOnly) url.host.lowercase() else continue
            val maxAge = parsed.maxAge
            val expiresAt = when {
                maxAge == 0L -> 0L
                maxAge > 0L -> System.currentTimeMillis() + maxAge * 1000L
                else -> Long.MAX_VALUE
            }
            val entry = Entry(
                name = parsed.name,
                value = parsed.value,
                domain = domain,
                hostOnly = hostOnly,
                path = path,
                secure = parsed.secure,
                httpOnly = parsed.isHttpOnly,
                expiresAt = expiresAt
            )
            entries.removeAll { it.identity() == entry.identity() }
            if (expiresAt > System.currentTimeMillis()) entries += entry
        }
        writeEntries(entries)
    }

    @Synchronized
    fun clear() {
        preferences.edit().remove(STORAGE_KEY).apply()
    }

    private fun defaultPath(requestPath: String): String {
        if (!requestPath.startsWith("/") || requestPath.count { it == '/' } <= 1) return "/"
        val lastSlash = requestPath.lastIndexOf('/')
        return if (lastSlash <= 0) "/" else requestPath.substring(0, lastSlash)
    }

    private fun readEntries(): List<Entry> {
        val encrypted = preferences.getString(STORAGE_KEY, null) ?: return emptyList()
        return runCatching {
            val parts = encrypted.split('.', limit = 2)
            require(parts.size == 2)
            val iv = Base64.decode(parts[0], Base64.NO_WRAP)
            val cipherText = Base64.decode(parts[1], Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
            val array = JSONArray(String(cipher.doFinal(cipherText), Charsets.UTF_8))
            buildList {
                for (index in 0 until array.length()) {
                    val item = array.getJSONObject(index)
                    add(
                        Entry(
                            name = item.getString("name"),
                            value = item.getString("value"),
                            domain = item.getString("domain"),
                            hostOnly = item.optBoolean("hostOnly", true),
                            path = item.optString("path", "/"),
                            secure = item.optBoolean("secure", true),
                            httpOnly = item.optBoolean("httpOnly", true),
                            expiresAt = item.optLong("expiresAt", Long.MAX_VALUE)
                        )
                    )
                }
            }
        }.getOrElse {
            clear()
            emptyList()
        }
    }

    private fun writeEntries(entries: List<Entry>) {
        val array = JSONArray()
        entries.forEach { cookie ->
            array.put(
                JSONObject()
                    .put("name", cookie.name)
                    .put("value", cookie.value)
                    .put("domain", cookie.domain)
                    .put("hostOnly", cookie.hostOnly)
                    .put("path", cookie.path)
                    .put("secure", cookie.secure)
                    .put("httpOnly", cookie.httpOnly)
                    .put("expiresAt", cookie.expiresAt)
            )
        }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val encrypted = cipher.doFinal(array.toString().toByteArray(Charsets.UTF_8))
        val value = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + "." +
            Base64.encodeToString(encrypted, Base64.NO_WRAP)
        preferences.edit().putString(STORAGE_KEY, value).apply()
    }

    private fun secretKey(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .setUserAuthenticationRequired(false)
                .build()
        )
        return generator.generateKey()
    }

    private companion object {
        const val KEY_ALIAS = "aharane.studio.native.session.v1"
        const val STORAGE_KEY = "encrypted_session_cookies"
    }
}
