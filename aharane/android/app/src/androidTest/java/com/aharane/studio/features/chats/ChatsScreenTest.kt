package com.aharane.studio.features.chats

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.swipeLeft
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithTag
import org.junit.Assert.assertEquals
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
        compose.onAllNodesWithText("Public contact").assertCountEquals(0)
        compose.onNodeWithContentDescription("Switch to Public WhatsApp").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Public contact").assertIsDisplayed()
        compose.onAllNodesWithText("Private contact").assertCountEquals(0)
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
        compose.onAllNodesWithText("Archived person").assertCountEquals(0)
        compose.onAllNodesWithText("Other account chat").assertCountEquals(0)

        compose.onNodeWithText("Unread").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Unread person").assertIsDisplayed()
        compose.onAllNodesWithText("Project group").assertCountEquals(0)

        compose.onNodeWithText("Groups").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Project group").assertIsDisplayed()
        compose.onAllNodesWithText("Unread person").assertCountEquals(0)

        compose.onNodeWithText("Archived").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Archived person").assertIsDisplayed()
        compose.onAllNodesWithText("Project group").assertCountEquals(0)
    }

    @Test
    fun longPressEntersMultiSelectAndBulkArchiveAppliesToEverySelectedChat() {
        val conversations = listOf(
            summary(ChatAccount.PRIVATE, "2348000000008@s.whatsapp.net", "First contact"),
            summary(ChatAccount.PRIVATE, "2348000000009@s.whatsapp.net", "Second contact")
        )
        val actions = mutableListOf<Pair<String, String>>()
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                ChatsScreen(
                    account = ChatAccount.PRIVATE,
                    onAccountSelected = {},
                    filter = ChatFilter.ALL,
                    onFilterSelected = {},
                    conversations = conversations,
                    accountConnected = true,
                    savedShowAvatars = true,
                    onChatAction = { chat, action -> actions += chat.key.jid to action }
                )
            }
        }

        compose.onNodeWithText("First contact").performTouchInput { longClick() }
        compose.onNodeWithTag("chat-selection-count").assertIsDisplayed()
        compose.onNodeWithText("1 selected").assertIsDisplayed()
        // The long-press enters multi-select only, without opening an action popup
        // or performing anything before the user chooses a toolbar action.
        compose.onAllNodesWithText("Mark as unread").assertCountEquals(0)
        assertEquals(emptyList<Pair<String, String>>(), actions)
        compose.onNodeWithText("Second contact").performClick()
        compose.onNodeWithText("2 selected").assertIsDisplayed()
        compose.onNodeWithContentDescription("Archive selected chats").performClick()

        compose.waitForIdle()
        assertEquals(
            listOf(
                "2348000000008@s.whatsapp.net" to "archive",
                "2348000000009@s.whatsapp.net" to "archive"
            ),
            actions
        )
        compose.onAllNodesWithText("selected").assertCountEquals(0)
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
        compose.onAllNodesWithText("Ordinary conversation").assertCountEquals(0)
        compose.onAllNodesWithText("Status").assertCountEquals(0)
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
