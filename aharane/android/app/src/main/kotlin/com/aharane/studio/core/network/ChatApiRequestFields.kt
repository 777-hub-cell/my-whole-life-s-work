package com.aharane.studio.core.network

/** Field names here are part of the Aharane server's public JSON API contract. */
internal object ChatApiRequestFields {
    fun reaction(messageId: String, emoji: String): Map<String, String> =
        linkedMapOf("messageId" to messageId, "emoji" to emoji)

    fun forward(messageId: String, targetJid: String): Map<String, String> =
        linkedMapOf("messageId" to messageId, "targetJid" to targetJid)
}

internal fun chatApiBody(fields: Map<String, String>): org.json.JSONObject =
    org.json.JSONObject().apply {
        fields.forEach { (key, value) -> put(key, value) }
    }
