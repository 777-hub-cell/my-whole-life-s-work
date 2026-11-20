package com.aharane.studio.features.chats

import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.semantics.SemanticsProperties
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
        compose.runOnIdle {
            val editableText = compose.onNodeWithTag("conversation-composer")
                .fetchSemanticsNode().config[SemanticsProperties.EditableText]
            assertEquals("", editableText.text)
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

private fun testConversation() = ChatSummary(
    key = ConversationKey(ChatAccount.PRIVATE, "2348000000000@s.whatsapp.net"),
    title = "Test contact",
    lastMessagePreview = "",
    lastMessageAtMillis = 1_763_600_000_000L
)
