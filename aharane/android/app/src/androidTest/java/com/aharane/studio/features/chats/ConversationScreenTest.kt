package com.aharane.studio.features.chats

import androidx.compose.ui.test.assertDoesNotExist
import androidx.compose.ui.test.assertExists
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import com.aharane.studio.core.design.AharaneTheme
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.model.ChatMessage
import com.aharane.studio.core.model.ChatSummary
import com.aharane.studio.core.model.ConversationKey
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ConversationScreenTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun connectedComposerDeliversTextToSendCallbackAndClearsDraft() {
        val sent = mutableListOf<String>()
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                ConversationScreen(
                    conversation = testConversation(),
                    messages = emptyList(),
                    connected = true,
                    onBack = {},
                    onSend = { text, _ -> sent += text }
                )
            }
        }
        compose.onNodeWithTag("conversation-composer").performTextInput("Hello from the chat test")
        compose.onNodeWithContentDescription("Send message").performClick()
        compose.runOnIdle { assertEquals(listOf("Hello from the chat test"), sent) }
        compose.onNodeWithTag("conversation-composer").performTextInput("Second draft")
        compose.onNodeWithTag("conversation-composer").assertTextEquals("Second draft")
    }


    @Test
    fun aiReplyActionIsHiddenWhenSharedEnvProviderIsNotConfigured() {
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                ConversationScreen(
                    conversation = testConversation(),
                    messages = listOf(incomingMessage()),
                    connected = true,
                    aiReplyAvailable = false,
                    onBack = {},
                    onSend = { _, _ -> error("No message should be sent.") }
                )
            }
        }
        compose.onNodeWithText("Incoming message for AI").performTouchInput { longClick() }
        compose.onNodeWithText("AI Reply").assertDoesNotExist()
    }

    @Test
    fun aiReplyUsesOnlySelectedAndLoadedQuoteAndNeverSendsAutomatically() {
        val sent = mutableListOf<Pair<String, String?>>()
        var receivedQuote: String? = null
        val selected = incomingMessage(replyToMessageId = "quote-1")
        val quoted = ChatMessage(
            key = selected.key,
            messageId = "quote-1",
            direction = com.aharane.studio.core.model.MessageDirection.OUTGOING,
            kind = com.aharane.studio.core.model.MessageKind.TEXT,
            text = "We can meet at five.",
            timestampMillis = selected.timestampMillis - 1
        )
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                ConversationScreen(
                    conversation = testConversation(),
                    messages = listOf(quoted, selected),
                    connected = true,
                    aiReplyAvailable = true,
                    onBack = {},
                    onSend = { text, replyTo -> sent += text to replyTo?.messageId },
                    onGenerateAiReply = { message, quotedMessage, tone, instructions ->
                        assertEquals("message-incoming", message.messageId)
                        receivedQuote = quotedMessage?.text
                        assertEquals("Casual", tone)
                        assertEquals("", instructions)
                        "That works for me, see you then!"
                    }
                )
            }
        }
        compose.onNodeWithText("Incoming message for AI").performTouchInput { longClick() }
        compose.onNodeWithText("AI Reply").assertExists().performClick()
        compose.onNodeWithText("Use draft").assertIsEnabled()
        compose.runOnIdle {
            assertEquals("We can meet at five.", receivedQuote)
            assertTrue(sent.isEmpty())
        }
        compose.onNodeWithText("Use draft").performClick()
        compose.onNodeWithTag("conversation-composer").assertTextEquals("That works for me, see you then!")
        compose.runOnIdle { assertTrue(sent.isEmpty()) }
        compose.onNodeWithContentDescription("Send message").performClick()
        compose.runOnIdle {
            assertEquals(listOf("That works for me, see you then!" to "message-incoming"), sent)
        }
    }

    @Test
    fun disconnectedComposerKeepsDraftButDisablesSendAndAttachments() {
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                ConversationScreen(
                    conversation = testConversation(),
                    messages = emptyList(),
                    connected = false,
                    onBack = {},
                    onSend = { _, _ -> error("Disconnected chat must not send.") }
                )
            }
        }
        compose.onNodeWithTag("conversation-composer").performTextInput("Draft stays on this phone")
        compose.onNodeWithTag("conversation-send").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Attach image, video, audio or document").assertIsNotEnabled()
        compose.onNodeWithTag("conversation-composer").assertTextEquals("Draft stays on this phone")
    }
}

private fun incomingMessage(replyToMessageId: String? = null) = ChatMessage(
    key = ConversationKey(ChatAccount.PRIVATE, "2348000000000@s.whatsapp.net"),
    messageId = "message-incoming",
    direction = com.aharane.studio.core.model.MessageDirection.INCOMING,
    kind = com.aharane.studio.core.model.MessageKind.TEXT,
    text = "Incoming message for AI",
    timestampMillis = 1_763_600_000_000L,
    replyToMessageId = replyToMessageId
)

private fun testConversation() = ChatSummary(
    key = ConversationKey(ChatAccount.PRIVATE, "2348000000000@s.whatsapp.net"),
    title = "Test contact",
    lastMessagePreview = "",
    lastMessageAtMillis = 1_763_600_000_000L
)
