package com.aharane.studio.core.network

import android.content.Context
import org.json.JSONObject

/**
 * Owns the selected Studio URL and the authenticated API client for this app
 * installation. The URL is ordinary configuration; the session cookie itself
 * is held separately in Android Keystore-encrypted storage.
 */
class AharaneConnectionManager(context: Context) {
    private val appContext = context.applicationContext
    private val preferences = appContext.getSharedPreferences(
        "aharane-server-connection",
        Context.MODE_PRIVATE
    )

    @Volatile
    private var client: AharaneApiClient? = null

    val savedStudioUrl: String
        get() = preferences.getString(KEY_STUDIO_URL, "").orEmpty()

    val api: AharaneApiClient?
        get() = client

    private fun clientFor(endpoint: ServerEndpoint): AharaneApiClient {
        val current = client
        if (current != null && current.endpoint == endpoint) return current
        return AharaneApiClient(appContext, endpoint).also { client = it }
    }

    fun setServerAddress(studioUrl: String): AharaneApiClient {
        val endpoint = ServerEndpointParser.parse(studioUrl)
        preferences.edit().putString(KEY_STUDIO_URL, endpoint.studioUrl).apply()
        return clientFor(endpoint)
    }

    /**
     * Checks the encrypted cookie jar synchronously so the UI can show a
     * restore splash instead of briefly rendering the sign-in form.
     */
    fun hasSavedSession(): Boolean {
        val address = savedStudioUrl
        if (address.isBlank()) return false
        val candidates = runCatching { ServerEndpointParser.candidates(address) }.getOrNull()
            ?: return false
        val savedClient = candidates
            .map { AharaneApiClient(appContext, it) }
            .firstOrNull { it.hasSavedSession() }
            ?: return false
        client = savedClient
        return true
    }

    suspend fun restoreSession(): Boolean {
        val address = savedStudioUrl
        if (address.isBlank()) return false
        var lastNotFound: AharaneApiException? = null
        for (endpoint in ServerEndpointParser.candidates(address)) {
            val candidate = clientFor(endpoint)
            try {
                candidate.checkServer()
                candidate.authStatus()
                if (!candidate.hasSavedSession()) return false
                candidate.get("status")
                client = candidate
                return true
            } catch (error: AharaneApiException) {
                if (error.statusCode == 404) {
                    lastNotFound = error
                    continue
                }
                if (error.statusCode == 401) {
                    candidate.clearSession()
                    client = candidate
                    return false
                }
                client = candidate
                return false
            } catch (_: Exception) {
                // Retain the candidate and cookie for a safe offline fallback.
                client = candidate
                return false
            }
        }
        if (lastNotFound != null) throw lastNotFound
        return false
    }

    suspend fun connect(studioUrl: String): JSONObject {
        val preferred = ServerEndpointParser.parse(studioUrl)
        preferences.edit().putString(KEY_STUDIO_URL, preferred.studioUrl).apply()
        var lastNotFound: AharaneApiException? = null
        for (endpoint in ServerEndpointParser.candidates(studioUrl)) {
            val candidate = clientFor(endpoint)
            try {
                val health = candidate.checkServer()
                val auth = candidate.authStatus()
                client = candidate
                return JSONObject()
                    .put("health", health)
                    .put("auth", auth)
            } catch (error: AharaneApiException) {
                if (error.statusCode == 404) {
                    lastNotFound = error
                    continue
                }
                client = candidate
                throw error
            } catch (error: Exception) {
                client = candidate
                throw error
            }
        }
        if (lastNotFound != null) throw lastNotFound
        throw IllegalStateException("Could not find the Aharane API at this Studio address.")
    }

    suspend fun login(password: String): JSONObject {
        val active = client ?: run {
            val address = savedStudioUrl
            require(address.isNotBlank()) { "Enter your Aharane Studio address first." }
            setServerAddress(address)
        }
        active.login(password)
        // Do not mark the device connected until the protected API confirms
        // that the newly received HttpOnly cookie is accepted.
        return active.get("status")
    }

    suspend fun logout() {
        try {
            client?.logout()
        } finally {
            client = null
        }
    }

    fun forgetServer() {
        client?.clearSession()
        client = null
        preferences.edit().remove(KEY_STUDIO_URL).apply()
    }

    private companion object {
        const val KEY_STUDIO_URL = "studio_url"
    }
}
