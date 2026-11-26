package com.aharane.studio.features.chats

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertDoesNotExist
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.swipeLeft
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import com.aharane.studio.core.design.AharaneTheme
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.model.ChatFilter
import com.aharane.studio.core.model.ChatSummary
import com.aharane.studio.core.model.ConversationKey
import org.junit.Rule
import org.junit.Test

class ChatsScreenTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun inboxSwitchKeepsPrivateAndPublicConversationsSeparate() {
        val conversations = listOf(
            summary(ChatAccount.PRIVATE, "2348000000001@s.whatsapp.net", "Private contact"),
            summary(ChatAccount.PUBLIC, "2348000000001@s.whatsapp.net", "Public contact")
        )
        compose.setContent {
            var account by remember { mutableStateOf(ChatAccount.PRIVATE) }
            var filter by remember { mutableStateOf(ChatFilter.ALL) }
            AharaneTheme(themeMode = "light") {
                ChatsScreen(
                    account = account,
                    onAccountSelected = { account = it },
                    filter = filter,
                    onFilterSelected = { filter = it },
                    conversations = conversations,
                    accountConnected = true,
                    savedShowAvatars = false
                )
            }
        }

        compose.onNodeWithText("Private contact").assertIsDisplayed()
        compose.onNodeWithText("Public contact").assertDoesNotExist()
        compose.onNodeWithContentDescription("Switch to Public WhatsApp").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Public contact").assertIsDisplayed()
        compose.onNodeWithText("Private contact").assertDoesNotExist()
        compose.onNodeWithContentDescription("Switch to Private WhatsApp").assertIsDisplayed()
    }

    @Test
    fun inboxFiltersUnreadGroupsAndArchivedChatsIndependently() {
        val conversations = listOf(
            summary(ChatAccount.PRIVATE, "2348000000002@s.whatsapp.net", "Unread person", unread = 2),
            summary(ChatAccount.PRIVATE, "120363000000002@g.us", "Project group", group = true),
            summary(ChatAccount.PRIVATE, "2348000000003@s.whatsapp.net", "Archived person", archived = true),
            summary(ChatAccount.PUBLIC, "2348000000004@s.whatsapp.net", "Other account chat")
        )
        compose.setContent {
            var filter by remember { mutableStateOf(ChatFilter.ALL) }
            AharaneTheme(themeMode = "light") {
                ChatsScreen(
                    account = ChatAccount.PRIVATE,
                    onAccountSelected = {},
                    filter = filter,
                    onFilterSelected = { filter = it },
                    conversations = conversations,
                    accountConnected = true,
                    savedShowAvatars = false
                )
            }
        }

        compose.onNodeWithText("Unread person").assertIsDisplayed()
        compose.onNodeWithText("Project group").assertIsDisplayed()
        compose.onNodeWithText("Archived person").assertDoesNotExist()
        compose.onNodeWithText("Other account chat").assertDoesNotExist()

        compose.onNodeWithText("Unread").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Unread person").assertIsDisplayed()
        compose.onNodeWithText("Project group").assertDoesNotExist()

        compose.onNodeWithText("Groups").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Project group").assertIsDisplayed()
        compose.onNodeWithText("Unread person").assertDoesNotExist()

        compose.onNodeWithText("Archived").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Archived person").assertIsDisplayed()
        compose.onNodeWithText("Project group").assertDoesNotExist()
    }

    @Test
    fun conversationActionsUseLongPressInsteadOfSwipe() {
        val conversations = listOf(
            summary(ChatAccount.PRIVATE, "2348000000008@s.whatsapp.net", "Long press contact")
        )
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                ChatsScreen(
                    account = ChatAccount.PRIVATE,
                    onAccountSelected = {},
                    filter = ChatFilter.ALL,
                    onFilterSelected = {},
                    conversations = conversations,
                    accountConnected = true,
                    savedShowAvatars = true
                )
            }
        }

        compose.onNodeWithText("Long press contact").performTouchInput { swipeLeft() }
        compose.onNodeWithText("Conversation actions").assertDoesNotExist()

        compose.onNodeWithText("Long press contact").performTouchInput { longClick() }
        compose.onNodeWithText("Conversation actions").assertIsDisplayed()
        compose.onNodeWithText("Archive").assertIsDisplayed()
        compose.onNodeWithText("Mute").assertIsDisplayed()
    }

    @Test
    fun channelsFilterDoesNotFallBackToOrdinaryChatsOrStatus() {
        val conversations = listOf(
            summary(ChatAccount.PRIVATE, "2348000000005@s.whatsapp.net", "Ordinary conversation")
        )
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                ChatsScreen(
                    account = ChatAccount.PRIVATE,
                    onAccountSelected = {},
                    filter = ChatFilter.CHANNELS,
                    onFilterSelected = {},
                    conversations = conversations,
                    accountConnected = false,
                    savedShowAvatars = false
                )
            }
        }

        compose.onNodeWithText("Subscribed Channels").assertIsDisplayed()
        compose.onNodeWithText("Connect this WhatsApp session to view its subscribed Channels.").assertIsDisplayed()
        compose.onNodeWithText("Ordinary conversation").assertDoesNotExist()
        compose.onNodeWithText("Status").assertDoesNotExist()
    }
}

private fun summary(
    account: ChatAccount,
    jid: String,
    title: String,
    unread: Int = 0,
    group: Boolean = false,
    archived: Boolean = false
) = ChatSummary(
    key = ConversationKey(account, jid),
    title = title,
    lastMessagePreview = "Preview for $title",
    lastMessageAtMillis = 1_763_600_000_000L,
    unreadCount = unread,
    isGroup = group,
    isArchived = archived
)
