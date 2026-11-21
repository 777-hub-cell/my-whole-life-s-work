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
        assertEquals(
            setOf("message", "quotedMessage", "tone", "instructions"),
            request.keys().asSequence().toSet()
        )
        assertEquals("Are you on your way?", request.getJSONObject("message").getString("text"))
        assertEquals("Alex", request.getJSONObject("message").getString("senderName"))
        assertEquals("We are meeting at 5.", request.getJSONObject("quotedMessage").getString("text"))
        assertEquals("Friendly", request.getString("tone"))
        assertEquals("Keep it short.", request.getString("instructions"))
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
        assertTrue(request.has("message"))
        assertFalse(request.has("quotedMessage"))
        assertEquals(3, request.length())
    }
}
