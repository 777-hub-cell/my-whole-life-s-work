package com.aharane.studio.core.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AiReplyRequestFieldsTest {
    @Test
    fun requestContainsOnlySelectedMessageQuotedMessageAndUserOptions() {
        val request = AiReplyRequestFields.build(
            selectedText = "Are you on your way?",
            selectedSender = "Alex",
            quotedText = "We are meeting at 5.",
            quotedSender = "You",
            tone = "Friendly",
            instructions = "Keep it short."
        )
        assertEquals(setOf("message", "quotedMessage", "tone", "instructions"), request.keys)
        val message = request["message"] as Map<*, *>
        val quote = request["quotedMessage"] as Map<*, *>
        assertEquals("Are you on your way?", message["text"])
        assertEquals("Alex", message["senderName"])
        assertEquals("We are meeting at 5.", quote["text"])
        assertEquals("Friendly", request["tone"])
        assertEquals("Keep it short.", request["instructions"])
        assertFalse(request.toString().contains("chatHistory"))
        assertFalse(request.toString().contains("conversationId"))
    }

    @Test
    fun missingQuotedMessageIsNotFetchedOrReconstructed() {
        val request = AiReplyRequestFields.build(
            selectedText = "Okay, thanks.",
            selectedSender = null,
            quotedText = null,
            quotedSender = null,
            tone = "Casual",
            instructions = ""
        )
        assertTrue(request.containsKey("message"))
        assertFalse(request.containsKey("quotedMessage"))
        assertEquals(3, request.size)
    }
}
