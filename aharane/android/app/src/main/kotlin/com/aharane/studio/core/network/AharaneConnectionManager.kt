package com.aharane.studio.core.network

import android.content.Context
import org.json.JSONObject

class AharaneConnectionManager(context: Context) {
    private val preferences = context.applicationContext
        .getSharedPreferences("aharane-server-connection", Context.MODE_PRIVATE)

    @Volatile
    private var client: AharaneApiClient? = null

    val savedStudioUrl: String
        get() = preferences.getString(KEY_STUDIO_URL, "").orEmpty()

    val api: AharaneApiClient?
        get() = client

    fun setServerAddress(studioUrl: String): AharaneApiClient {
        val endpoint = ServerEndpointParser.parse(studioUrl)
        preferences.edit().putString(KEY_STUDIO_URL, endpoint.studioUrl).apply()
        return AharaneApiClientCache.getOrCreate(client, endpoint, this).also { client = it }
    }

    suspend fun restoreSession(): Boolean {
        val address = savedStudioUrl
        if (address.isBlank()) return false
        val candidate = AharaneApiClient(thisContext(), ServerEndpointParser.parse(address))
        return try {
            candidate.checkServer()
            candidate.get("status")
            client = candidate
            true
        } catch (error: AharaneApiException) {
            client = candidate
            false
        } catch (_: Exception) {
            client = candidate
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
        return active.get("status")
    }

    suspend fun logout() {
        client?.logout()
        client = null
    }

    private fun thisContext(): Context = contextRef ?: throw IllegalStateException("Context unavailable")

    private companion object {
        const val KEY_STUDIO_URL = "studio_url"
        // The manager stores only the application context in a private static holder
        // to avoid retaining an Activity instance.
        @Volatile var contextRef: Context? = null
    }

    init {
        contextRef = context.applicationContext
    }
}

private object AharaneApiClientCache {
    fun getOrCreate(
        current: AharaneApiClient?,
        endpoint: ServerEndpoint,
        manager: AharaneConnectionManager
    ): AharaneApiClient = current?.takeIf { it.endpoint == endpoint }
        ?: AharaneApiClient(ReflectionContext.context(manager), endpoint)
}

private object ReflectionContext {
    fun context(manager: AharaneConnectionManager): Context {
        val field = AharaneConnectionManager::class.java.getDeclaredField("contextRef")
        field.isAccessible = true
        return field.get(null) as Context
    }
}
