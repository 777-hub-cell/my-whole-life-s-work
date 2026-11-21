package com.aharane.studio.features.chats

import androidx.compose.ui.test.assertDoesNotExist
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import com.aharane.studio.core.design.AharaneTheme
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.model.ChatSummary
import com.aharane.studio.core.model.ConversationKey
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class ConversationScreenTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun aiReplyIsHiddenWhenTheServerHasNoConfiguredAiProvider() {
        val selected = testIncomingMessage()
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                ConversationScreen(
                    conversation = testConversation(),
                    messages = listOf(selected),
                    connected = true,
                    aiReplyAvailable = false,
                    onBack = {},
                    onSend = { _, _ -> }
                )
            }
        }
        compose.onNodeWithTag("message-bubble-selected-message").performTouchInput { longClick() }
        compose.onNodeWithText("Message actions").assertIsDisplayed()
        compose.onNodeWithText("AI Reply").assertDoesNotExist()
    }

    @Test
    fun aiReplyUsesSelectedAndQuotedTextThenSendsOnlyAfterApproval() {
        val selected = testIncomingMessage()
        var suppliedMessage = ""
        var suppliedQuote = ""
        var suppliedTone = ""
        var suppliedInstruction = ""
        var sentText = ""
        var sentQuotedId = ""
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                ConversationScreen(
                    conversation = testConversation(),
                    messages = listOf(selected),
                    connected = true,
                    aiReplyAvailable = true,
                    onBack = {},
                    onSend = { text, quoted ->
                        sentText = text
                        sentQuotedId = quoted?.messageId.orEmpty()
                    },
                    onGenerateAiReply = { message, quoted, tone, instruction ->
                        suppliedMessage = message
                        suppliedQuote = quoted
                        suppliedTone = tone
                        suppliedInstruction = instruction
                        "Thanks for explaining. I can do that."
                    }
                )
            }
        }
        compose.onNodeWithTag("message-bubble-selected-message").performTouchInput { longClick() }
        compose.onNodeWithText("AI Reply").performClick()
        compose.onNodeWithText("This is the selected incoming message.").assertIsDisplayed()
        compose.onNodeWithText("This is the older message being quoted.").assertIsDisplayed()
        compose.onNodeWithText("Professional").performClick()
        compose.onNodeWithTag("ai-reply-instruction").performTextInput("Keep it warm and brief.")
        compose.onNodeWithText("Generate reply").performClick()
        compose.onNodeWithTag("ai-reply-draft").assertIsDisplayed()
        compose.onNodeWithText("Send reply").performClick()
        compose.runOnIdle {
            assertEquals("This is the selected incoming message.", suppliedMessage)
            assertEquals("This is the older message being quoted.", suppliedQuote)
            assertEquals("Professional", suppliedTone)
            assertEquals("Keep it warm and brief.", suppliedInstruction)
            assertEquals("Thanks for explaining. I can do that.", sentText)
            assertEquals("selected-message", sentQuotedId)
        }
    }

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

private fun testIncomingMessage() = com.aharane.studio.core.model.ChatMessage(
    key = testConversation().key,
    messageId = "selected-message",
    direction = com.aharane.studio.core.model.MessageDirection.INCOMING,
    kind = com.aharane.studio.core.model.MessageKind.TEXT,
    text = "This is the selected incoming message.",
    timestampMillis = 1_763_600_000_000L,
    replyToMessageId = "older-quoted-message",
    quotedMessageText = "This is the older message being quoted."
)

private fun testConversation() = ChatSummary(
    key = ConversationKey(ChatAccount.PRIVATE, "2348000000000@s.whatsapp.net"),
    title = "Test contact",
    lastMessagePreview = "",
    lastMessageAtMillis = 1_763_600_000_000L
)
