package com.aharane.studio.features.chats

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.swipeRight
import androidx.compose.ui.test.junit4.createComposeRule
import android.view.KeyEvent
import androidx.test.platform.app.InstrumentationRegistry
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
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
        compose.onAllNodesWithText("AI Reply").assertCountEquals(0)
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
        compose.onAllNodesWithText("This is the selected incoming message.").assertCountEquals(2)
        compose.onAllNodesWithText("This is the older message being quoted.").assertCountEquals(2)
        compose.onNodeWithText("Professional").performClick()
        compose.onNodeWithTag("ai-reply-instruction").performTextInput("Keep it warm and brief.")
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        compose.waitForIdle()
        compose.onNodeWithText("Generate reply").performClick()
        compose.waitUntil(timeoutMillis = 5_000) {
            compose.onAllNodesWithTag("ai-reply-draft").fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithTag("ai-reply-draft").assertTextEquals("Thanks for explaining. I can do that.")
        compose.onNodeWithText("Send reply").performScrollTo().performClick()
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
    fun aiReplyUsesOnlySelectedTextWhenTheQuotedMessageIsUnavailable() {
        val selected = testIncomingMessage().copy(
            replyToMessageId = "not-loaded-quoted-message",
            quotedMessageText = ""
        )
        var suppliedMessage = ""
        var suppliedQuote = "must be replaced"
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                ConversationScreen(
                    conversation = testConversation(),
                    messages = listOf(selected),
                    connected = true,
                    aiReplyAvailable = true,
                    onBack = {},
                    onSend = { _, _ -> },
                    onGenerateAiReply = { message, quoted, _, _ ->
                        suppliedMessage = message
                        suppliedQuote = quoted
                        "I can reply based on the message you sent."
                    }
                )
            }
        }
        compose.onNodeWithTag("message-bubble-selected-message").performTouchInput { longClick() }
        compose.onNodeWithText("AI Reply").performClick()
        compose.onNodeWithText(
            "The original quoted text is unavailable. Aharane will use only the selected message and will not load chat history."
        ).assertIsDisplayed()
        compose.onNodeWithText("Generate reply").performClick()
        compose.waitUntil(timeoutMillis = 5_000) {
            compose.onAllNodesWithTag("ai-reply-draft").fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithTag("ai-reply-draft").assertTextEquals("I can reply based on the message you sent.")
        compose.runOnIdle {
            assertEquals("This is the selected incoming message.", suppliedMessage)
            assertEquals("", suppliedQuote)
        }
    }

    @Test
    fun bubbleSwipeRightOpensReplyWithoutSendingAutomatically() {
        val selected = testIncomingMessage()
        var sends = 0
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                ConversationScreen(
                    conversation = testConversation(),
                    messages = listOf(selected),
                    connected = true,
                    onBack = {},
                    onSend = { _, _ -> sends++ }
                )
            }
        }
        compose.onNodeWithTag("message-bubble-selected-message").performTouchInput { swipeRight() }
        compose.waitForIdle()
        compose.onNodeWithContentDescription("Cancel reply").assertIsDisplayed()
        compose.runOnIdle { assertEquals(0, sends) }
    }

    @Test
    fun tappingBubbleDoesNotTriggerAccidentalReply() {
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                ConversationScreen(
                    conversation = testConversation(),
                    messages = listOf(testIncomingMessage()),
                    connected = true,
                    onBack = {},
                    onSend = { _, _ -> }
                )
            }
        }
        compose.onNodeWithTag("message-bubble-selected-message").performClick()
        compose.onAllNodes(hasContentDescription("Cancel reply")).assertCountEquals(0)
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
        compose.waitForIdle()
        compose.onNodeWithTag("conversation-composer").assertTextEquals("Hello from the chat test")
        compose.onNodeWithTag("conversation-send").assertIsDisplayed().assertIsEnabled().performClick()
        compose.waitForIdle()
        compose.runOnIdle { assertEquals(listOf("Hello from the chat test"), sent) }
        compose.onNodeWithTag("conversation-composer").performTextInput("Second draft")
        compose.onNodeWithTag("conversation-composer").assertTextEquals("Second draft")
    }

    @Test
    fun connectedComposerOpensStickerTrayBeforeImportingASticker() {
        var stickerPickerRequests = 0
        var sentMessages = 0
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                ConversationScreen(
                    conversation = testConversation(),
                    messages = emptyList(),
                    connected = true,
                    onBack = {},
                    onSend = { _, _ -> sentMessages++ },
                    onPickSticker = { stickerPickerRequests++ }
                )
            }
        }
        compose.onNodeWithContentDescription("Open sticker tray")
            .assertIsDisplayed()
            .assertIsEnabled()
            .performClick()
        compose.onNodeWithText("Stickers").assertIsDisplayed()
        compose.onNodeWithText("Import WebP sticker").performClick()
        compose.runOnIdle {
            assertEquals(1, stickerPickerRequests)
            assertEquals(0, sentMessages)
        }
    }

    @Test
    fun activeVoiceRecordingShowsStopAndCancelControls() {
        val recording = androidx.compose.runtime.mutableStateOf(true)
        var stopped = 0
        var cancelled = 0
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                ConversationScreen(
                    conversation = testConversation(),
                    messages = emptyList(),
                    connected = true,
                    voiceRecording = recording.value,
                    onBack = {},
                    onSend = { _, _ -> },
                    onRecordVoice = {
                        stopped++
                        recording.value = false
                    },
                    onCancelVoiceRecording = {
                        cancelled++
                        recording.value = false
                    }
                )
            }
        }

        compose.onNodeWithText("Recording voice note · Tap send to finish").assertIsDisplayed()
        compose.onNodeWithContentDescription("Stop and send voice note").assertIsDisplayed().performClick()
        compose.waitForIdle()
        compose.runOnIdle {
            assertEquals(1, stopped)
            assertEquals(0, cancelled)
            assertEquals(false, recording.value)
        }
    }

    @Test
    fun cancellingVoiceRecordingDiscardsItWithoutSending() {
        val recording = androidx.compose.runtime.mutableStateOf(true)
        var sent = 0
        var cancelled = 0
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                ConversationScreen(
                    conversation = testConversation(),
                    messages = emptyList(),
                    connected = true,
                    voiceRecording = recording.value,
                    onBack = {},
                    onSend = { _, _ -> sent++ },
                    onRecordVoice = {},
                    onCancelVoiceRecording = {
                        cancelled++
                        recording.value = false
                    }
                )
            }
        }

        compose.onNodeWithContentDescription("Cancel voice note").assertIsDisplayed().performClick()
        compose.waitForIdle()
        compose.onAllNodesWithText("Recording voice note · Tap send to finish").assertCountEquals(0)
        compose.runOnIdle {
            assertEquals(1, cancelled)
            assertEquals(0, sent)
            assertEquals(false, recording.value)
        }
    }

    @Test
    fun pollCardSubmitsOnlySelectedOptionAndShowsVotes() {
        var submitted: List<String> = emptyList()
        val poll = com.aharane.studio.core.model.ChatMessage(
            key = testConversation().key,
            messageId = "poll-1",
            direction = com.aharane.studio.core.model.MessageDirection.INCOMING,
            kind = com.aharane.studio.core.model.MessageKind.POLL,
            text = "Lunch?",
            timestampMillis = 1_763_600_000_000L,
            pollOptions = listOf("Jollof rice", "Fried rice", "Pasta"),
            pollSelectableCount = 1,
            pollVoteCounts = mapOf("Jollof rice" to 3, "Fried rice" to 1, "Pasta" to 0),
            pollMyVotes = emptyList()
        )
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                ConversationScreen(
                    conversation = testConversation(),
                    messages = listOf(poll),
                    connected = true,
                    onBack = {},
                    onSend = { _, _ -> },
                    onVotePoll = { _, options -> submitted = options }
                )
            }
        }

        compose.onNodeWithText("Lunch?").assertIsDisplayed()
        compose.onNodeWithText("3").assertIsDisplayed()
        compose.onNodeWithText("Fried rice").performClick()
        compose.onNodeWithText("Vote").performClick()
        compose.runOnIdle { assertEquals(listOf("Fried rice"), submitted) }
    }

    @Test
    fun conversationOptionsOpensPollCreationForm() {
        var createdQuestion = ""
        var createdOptions: List<String> = emptyList()
        var createdSelectCount = 0
        val createPollCallbackInvoked = androidx.compose.runtime.mutableStateOf(false)
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                ConversationScreen(
                    conversation = testConversation(),
                    messages = emptyList(),
                    connected = true,
                    onBack = {},
                    onSend = { _, _ -> },
                    onCreatePoll = { question, options, count ->
                        createPollCallbackInvoked.value = true
                        createdQuestion = question
                        createdOptions = options
                        createdSelectCount = count
                    }
                )
            }
        }

        compose.onNodeWithContentDescription("Conversation options").performClick()
        compose.onNodeWithText("Create poll").performClick()
        compose.onNodeWithTag("poll-question").performClick().performTextInput("Lunch?")
        compose.onNodeWithTag("poll-question").assertTextEquals("Lunch?")
        compose.onNodeWithTag("poll-option-0").performClick().performTextInput("Jollof rice")
        compose.onNodeWithTag("poll-option-0").assertTextEquals("Jollof rice")
        compose.onNodeWithTag("poll-option-1").performClick().performTextInput("Pasta")
        compose.onNodeWithTag("poll-option-1").assertTextEquals("Pasta")
        // Dismiss the keyboard before tapping the submit action below it.
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        compose.waitForIdle()
        // The question must survive option edits and keyboard dismissal.
        compose.onNodeWithTag("poll-question").assertTextEquals("Lunch?")
        compose.onNodeWithTag("poll-create-submit").assertIsEnabled().performScrollTo().performClick()
        compose.waitUntil(5_000) { createPollCallbackInvoked.value }
        compose.runOnIdle {
            assertEquals(true, createPollCallbackInvoked.value)
            assertEquals("Lunch?", createdQuestion)
            assertEquals(listOf("Jollof rice", "Pasta"), createdOptions)
            assertEquals(1, createdSelectCount)
        }
    }

    @Test
    fun disconnectedComposerKeepsDraftAndAllowsOfflineStickerBrowsing() {
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
        compose.onNodeWithContentDescription("Open sticker tray").assertIsEnabled().performClick()
        compose.onNodeWithText("Stickers").assertIsDisplayed()
        compose.onNodeWithText("Sign in to send stickers.").assertIsDisplayed()
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
