package com.aharane.studio.core.network

import org.junit.Assert.assertEquals
import org.junit.Test

class ChatApiRequestFieldsTest {
    @Test
    fun reactionUsesServerEmojiField() {
        assertEquals(
            mapOf("messageId" to "message-1", "emoji" to "❤️"),
            ChatApiRequestFields.reaction("message-1", "❤️")
        )
    }

    @Test
    fun forwardUsesServerTargetJidField() {
        assertEquals(
            mapOf("messageId" to "message-2", "targetJid" to "2348000000000@s.whatsapp.net"),
            ChatApiRequestFields.forward("message-2", "2348000000000@s.whatsapp.net")
        )
    }

    @Test
    fun connectionRequiredMediaErrorsDoNotRepeatPairingInstructions() {
        assertEquals(
            "This attachment isn't available right now.",
            displayableMediaUnavailable("Connect this WhatsApp account before downloading media.")
        )
        assertEquals(
            "This attachment isn't available right now.",
            displayableMediaUnavailable("Pair your WhatsApp account to access this attachment.")
        )
        assertEquals(
            "File was removed by the sender.",
            displayableMediaUnavailable("File was removed by the sender.")
        )
    }
}
