package com.aharane.studio.core.model
import org.junit.Assert.*
import org.junit.Test

class ChatModelsTest {
    @Test fun privateAndPublicHaveDistinctScopes() {
        assertEquals("private", ChatAccount.PRIVATE.apiValue)
        assertEquals("public", ChatAccount.PUBLIC.apiValue)
        assertNotEquals(ChatAccount.PRIVATE, ChatAccount.PUBLIC)
    }
    @Test fun accountsParseExplicitly() {
        assertEquals(ChatAccount.PRIVATE, ChatAccount.fromApiValue("private"))
        assertEquals(ChatAccount.PUBLIC, ChatAccount.fromApiValue("public"))
        assertNull(ChatAccount.fromApiValue("other"))
    }
    @Test fun conversationIdentityIncludesAccount() {
        val privateChat = ConversationKey(ChatAccount.PRIVATE, "2348000000000@s.whatsapp.net")
        val publicChat = ConversationKey(ChatAccount.PUBLIC, "2348000000000@s.whatsapp.net")
        assertNotEquals(privateChat, publicChat)
    }
    @Test(expected = IllegalArgumentException::class)
    fun conversationRequiresWhatsAppJid() {
        ConversationKey(ChatAccount.PRIVATE, "not-a-jid")
    }
    @Test(expected = IllegalArgumentException::class)
    fun viewOnceOnlyAllowsImageOrVideo() {
        ChatMessage(ConversationKey(ChatAccount.PRIVATE, "2348000000000@s.whatsapp.net"),
            "msg1", MessageDirection.INCOMING, MessageKind.DOCUMENT, "", 1L, isViewOnce = true)
    }
}
