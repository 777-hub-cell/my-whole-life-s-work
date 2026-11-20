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

    fun setServerAddress(studioUrl: String): AharaneApiClient {
        val endpoint = ServerEndpointParser.parse(studioUrl)
        preferences.edit().putString(KEY_STUDIO_URL, endpoint.studioUrl).apply()
        val current = client
        if (current != null && current.endpoint == endpoint) return current
        return AharaneApiClient(appContext, endpoint).also { client = it }
    }

    suspend fun restoreSession(): Boolean {
        val address = savedStudioUrl
        if (address.isBlank()) return false
        val candidate = setServerAddress(address)
        return try {
            candidate.checkServer()
            candidate.get("status")
            true
        } catch (_: AharaneApiException) {
            false
        } catch (_: Exception) {
            false
        }
    }

    suspend fun connect(studioUrl: String): JSONObject {
        val candidate = setServerAddress(studioUrl)
        val health = candidate.checkServer()
        val auth = candidate.authStatus()
        return JSONObject()
            .put("health", health)
            .put("auth", auth)
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

    private companion object {
        const val KEY_STUDIO_URL = "studio_url"
    }
}
