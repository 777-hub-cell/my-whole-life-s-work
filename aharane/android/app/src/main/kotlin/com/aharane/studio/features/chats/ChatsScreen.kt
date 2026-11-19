package com.aharane.studio.features.chats

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.*
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.model.ChatFilter
import com.aharane.studio.core.model.ChatSummary
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun ChatsScreen(
    account: ChatAccount,
    onAccountSelected: (ChatAccount) -> Unit,
    filter: ChatFilter,
    onFilterSelected: (ChatFilter) -> Unit,
    conversations: List<ChatSummary> = emptyList(),
    accountDisplayName: String = account.label,
    accountConnected: Boolean = false,
    onConversationSelected: (ChatSummary) -> Unit = {}
) {
    var query by rememberSaveable { mutableStateOf("") }
    val switchIcon = if (account == ChatAccount.PRIVATE) Icons.Outlined.Lock else Icons.Outlined.Public
    val unreadCount = conversations.sumOf { it.unreadCount }
    val visibleChats = remember(conversations, account, filter, query) {
        conversations.asSequence()
            .filter { it.key.account == account }
            .filter { chat ->
                when (filter) {
                    ChatFilter.ALL -> !chat.isArchived
                    ChatFilter.UNREAD -> chat.unreadCount > 0 && !chat.isArchived
                    ChatFilter.GROUPS -> chat.isGroup && !chat.isArchived
                    ChatFilter.ARCHIVED -> chat.isArchived
                }
            }
            .filter { query.isBlank() || it.title.contains(query, true) || it.lastMessagePreview.contains(query, true) }
            .sortedWith(compareByDescending<ChatSummary> { it.isPinned }.thenByDescending { it.lastMessageAtMillis })
            .toList()
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { StudioPageTitle("Chats") }
                Box(
                    Modifier.size(46.dp).clip(CircleShape)
                        .background(StudioPalette.Surface)
                        .border(1.dp, StudioPalette.Line, CircleShape)
                        .clickable {
                            onAccountSelected(
                                if (account == ChatAccount.PRIVATE) ChatAccount.PUBLIC else ChatAccount.PRIVATE
                            )
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        switchIcon,
                        contentDescription = "Switch WhatsApp account",
                        tint = StudioPalette.Accent,
                        modifier = Modifier.size(22.dp)
                    )
                    Box(
                        Modifier.align(Alignment.BottomEnd).size(13.dp).clip(CircleShape)
                            .background(StudioPalette.Surface),
                        contentAlignment = Alignment.Center
                    ) {
                        StudioStatusDot(online = accountConnected, size = 8)
                    }
                }
            }
            Text(
                buildString {
                    append(accountDisplayName)
                    append(" · ")
                    if (accountConnected) {
                        append("${conversations.count { it.key.account == account }} conversations")
                        if (unreadCount > 0) append(" · $unreadCount unread")
                    } else {
                        append("Not connected")
                    }
                },
                color = StudioPalette.Muted,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                modifier = Modifier.padding(top = 6.dp, bottom = 12.dp)
            )
        }
        item {
            StudioSearchField(
                value = query,
                onValueChange = { query = it },
                placeholder = "Search chats and messages"
            )
            Spacer(Modifier.height(12.dp))
        }
        item {
            StudioSegmented(
                options = ChatFilter.entries.map { it.label },
                selected = filter.label,
                onSelect = { label ->
                    ChatFilter.entries.firstOrNull { it.label == label }?.let(onFilterSelected)
                }
            )
            Spacer(Modifier.height(14.dp))
        }
        item {
            if (visibleChats.isEmpty()) {
                StudioCard {
                    StudioEmpty(
                        title = when {
                            query.isNotBlank() -> "No chats match"
                            filter == ChatFilter.UNREAD -> "No unread chats"
                            filter == ChatFilter.GROUPS -> "No groups yet"
                            filter == ChatFilter.ARCHIVED -> "No archived chats"
                            else -> "No chats yet"
                        },
                        description = if (accountConnected) {
                            "There are no conversations in this inbox."
                        } else {
                            "Connect Aharane Local Studio to load the ${account.label.lowercase()} conversations."
                        }
                    )
                }
                Spacer(Modifier.height(16.dp))
            } else {
                StudioCard {
                    visibleChats.forEachIndexed { index, chat ->
                        if (index > 0) StudioDivider()
                        ChatListRow(chat = chat, onClick = { onConversationSelected(chat) })
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
            Text(
                "Private and Public inboxes remain separate.",
                color = StudioPalette.Muted,
                fontSize = 12.sp,
                lineHeight = 18.sp,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

@Composable
private fun ChatListRow(chat: ChatSummary, onClick: () -> Unit) {
    val avatarInitials = chat.title.trim().split(Regex("\\s+"))
        .filter { it.isNotEmpty() }.take(2).joinToString("") { it.take(1) }.uppercase()
    Row(
        Modifier.fillMaxWidth().defaultMinSize(minHeight = 66.dp)
            .clickable(onClick = onClick)
            .padding(horizontal = 13.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(11.dp)
    ) {
        Box(
            Modifier.size(40.dp).clip(CircleShape).background(StudioPalette.Soft),
            contentAlignment = Alignment.Center
        ) {
            Text(
                if (chat.isGroup) "◎" else avatarInitials.ifBlank { "?" },
                color = StudioPalette.Accent,
                fontSize = if (chat.isGroup) 21.sp else 13.sp,
                fontWeight = FontWeight.Bold
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                chat.title,
                color = StudioPalette.Ink,
                fontSize = 14.sp,
                lineHeight = 18.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                chat.lastMessagePreview,
                color = StudioPalette.Muted,
                fontSize = 12.5.sp,
                lineHeight = 17.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                if (chat.isPinned) Text("📌", fontSize = 10.sp)
                if (chat.isMuted) Text("🔕", fontSize = 10.sp)
                Text(
                    relativeTime(chat.lastMessageAtMillis),
                    color = StudioPalette.Muted,
                    fontSize = 10.5.sp,
                    maxLines = 1
                )
            }
            if (chat.unreadCount > 0) {
                Text(
                    chat.unreadCount.coerceAtMost(99).toString(),
                    color = androidx.compose.ui.graphics.Color.White,
                    fontSize = 10.sp,
                    lineHeight = 13.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.clip(RoundedCornerShape(20.dp))
                        .background(StudioPalette.Accent)
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                )
            }
        }
    }
}

private fun relativeTime(timestamp: Long): String {
    if (timestamp <= 0L) return ""
    val now = System.currentTimeMillis()
    val format = SimpleDateFormat("yyyyMMdd", Locale.getDefault())
    return when (format.format(Date(timestamp))) {
        format.format(Date(now)) -> SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date(timestamp))
        format.format(Date(now - 86_400_000L)) -> "Yesterday"
        else -> SimpleDateFormat("d MMM", Locale.getDefault()).format(Date(timestamp))
    }
}
