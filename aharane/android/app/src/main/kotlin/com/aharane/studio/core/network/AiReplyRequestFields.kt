package com.aharane.studio.core.network

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
    ): Map<String, Any> {
        val message = linkedMapOf<String, Any>("text" to selectedText)
        selectedSender?.takeIf { it.isNotBlank() }?.let { message["senderName"] = it }
        val request = linkedMapOf<String, Any>(
            "message" to message,
            "tone" to tone,
            "instructions" to instructions
        )
        if (!quotedText.isNullOrBlank()) {
            val quoted = linkedMapOf<String, Any>("text" to quotedText)
            quotedSender?.takeIf { it.isNotBlank() }?.let { quoted["senderName"] = it }
            request["quotedMessage"] = quoted
        }
        return request
    }
}
