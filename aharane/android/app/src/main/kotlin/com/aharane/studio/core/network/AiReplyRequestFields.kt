package com.aharane.studio.core.network

import org.json.JSONObject

/**
 * Builds the intentionally narrow AI Reply request.
 *
 * Only the selected incoming message and an optional, already-loaded quoted
 * message can cross the network boundary. Never add chat IDs or history here.
 */
internal object AiReplyRequestFields {
    fun build(
        selectedText: String,
        selectedSender: String?,
        quotedText: String?,
        quotedSender: String?,
        tone: String,
        instructions: String
    ): JSONObject {
        val message = JSONObject().put("text", selectedText).apply {
            selectedSender?.takeIf { it.isNotBlank() }?.let { put("senderName", it) }
        }
        return JSONObject()
            .put("message", message)
            .apply {
                if (!quotedText.isNullOrBlank()) {
                    put("quotedMessage", JSONObject().put("text", quotedText).apply {
                        quotedSender?.takeIf { it.isNotBlank() }?.let { put("senderName", it) }
                    })
                }
                put("tone", tone)
                put("instructions", instructions)
            }
    }
}
