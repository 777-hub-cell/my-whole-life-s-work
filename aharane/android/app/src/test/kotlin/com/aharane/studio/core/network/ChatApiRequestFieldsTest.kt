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
}
