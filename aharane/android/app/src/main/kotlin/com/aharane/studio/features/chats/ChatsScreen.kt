package com.aharane.studio.features.chats

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material.icons.outlined.TextFields
import androidx.compose.material3.Icon
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.window.Dialog
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
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
    onConversationSelected: (ChatSummary) -> Unit = {},
    onChatAction: (ChatSummary, String) -> Unit = { _, _ -> }
) {
    var query by rememberSaveable { mutableStateOf("") }
    var activeTool by rememberSaveable { mutableStateOf("") }
    var chatTheme by rememberSaveable { mutableStateOf("System") }
    var showAvatars by rememberSaveable { mutableStateOf(true) }
    var showPreviews by rememberSaveable { mutableStateOf(true) }
    var showTimestamps by rememberSaveable { mutableStateOf(true) }
    val switchIcon = if (account == ChatAccount.PRIVATE) Icons.Outlined.Lock else Icons.Outlined.Public
    val accountConversations = conversations.filter { it.key.account == account }
    val unreadCount = accountConversations.sumOf { it.unreadCount }
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
                ChatHeaderButton(
                    icon = switchIcon,
                    description = "Switch WhatsApp account",
                    showOfflineDot = !accountConnected
                ) {
                    onAccountSelected(
                        if (account == ChatAccount.PRIVATE) ChatAccount.PUBLIC else ChatAccount.PRIVATE
                    )
                }
                Spacer(Modifier.width(7.dp))
                ChatHeaderButton(Icons.Outlined.Tune, "Configure chat visibility") {
                    activeTool = "visibility"
                }
                Spacer(Modifier.width(7.dp))
                ChatHeaderButton(Icons.Outlined.StarBorder, "Starred messages") {
                    activeTool = "starred"
                }
                Spacer(Modifier.width(7.dp))
                ChatHeaderButton(Icons.Outlined.TextFields, "Chat appearance") {
                    activeTool = "appearance"
                }
            }
            Text(
                "${account.label} account · ${accountConversations.size} conversations",
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
                placeholder = "Search chats and messages",
                showIcon = false
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
                StudioCard(padding = PaddingValues(horizontal = 16.dp, vertical = 28.dp)) {
                    Text(
                        when (filter) {
                            ChatFilter.UNREAD -> "No unread chats."
                            ChatFilter.GROUPS -> "No groups match."
                            ChatFilter.ARCHIVED -> "No archived chats."
                            else -> "No chats match."
                        },
                        color = StudioPalette.Muted,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                Spacer(Modifier.height(16.dp))
            } else {
                StudioCard {
                    visibleChats.forEachIndexed { index, chat ->
                        if (index > 0) StudioDivider()
                        ChatListRow(
                            chat = chat,
                            connected = accountConnected,
                            onClick = { onConversationSelected(chat) },
                            onAction = { action -> onChatAction(chat, action) }
                        )
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
        }
    }
    if (activeTool.isNotEmpty()) {
        Dialog(onDismissRequest = { activeTool = "" }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(StudioPalette.Surface).padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                when (activeTool) {
                    "visibility" -> {
                        Text("Chat visibility", color = StudioPalette.Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                        Text(
                            "Choose which conversations appear in this inbox. Visibility settings will load when the Aharane server is connected.",
                            color = StudioPalette.Muted,
                            fontSize = 13.sp,
                            lineHeight = 19.sp
                        )
                        Text("Individual chats", color = StudioPalette.Ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        Text("All individual chats · Not loaded", color = StudioPalette.Muted, fontSize = 12.sp)
                        Text("Groups", color = StudioPalette.Ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        Text("All groups · Not loaded", color = StudioPalette.Muted, fontSize = 12.sp)
                    }
                    "starred" -> {
                        Text("Starred messages", color = StudioPalette.Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                        StudioEmpty(
                            title = "No starred messages.",
                            description = "Starred messages from this account will appear here when the inbox is connected."
                        )
                    }
                    "appearance" -> {
                        Text("Chat appearance", color = StudioPalette.Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                        Text("Theme", color = StudioPalette.Ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        StudioSegmented(
                            options = listOf("System", "Light", "Dark"),
                            selected = chatTheme,
                            onSelect = { chatTheme = it }
                        )
                        PreferenceToggle("Show avatars", showAvatars) { showAvatars = it }
                        PreferenceToggle("Show message previews", showPreviews) { showPreviews = it }
                        PreferenceToggle("Show timestamps", showTimestamps) { showTimestamps = it }
                        Text(
                            "These preview preferences stay on this screen until native server settings are connected.",
                            color = StudioPalette.Muted,
                            fontSize = 11.5.sp,
                            lineHeight = 16.sp
                        )
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    StudioActionButton("Close", compact = true, primary = true, onClick = { activeTool = "" })
                }
            }
        }
    }
}

@Composable
private fun ChatHeaderButton(
    icon: ImageVector,
    description: String,
    showOfflineDot: Boolean = false,
    onClick: () -> Unit
) {
    Box(
        Modifier.size(40.dp).clip(CircleShape)
            .background(StudioPalette.Surface)
            .border(1.dp, StudioPalette.Line, CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, contentDescription = description, tint = StudioPalette.Accent, modifier = Modifier.size(19.dp))
        if (showOfflineDot) {
            Box(
                Modifier.align(Alignment.BottomEnd).size(12.dp).clip(CircleShape)
                    .background(StudioPalette.Bad).border(1.5.dp, StudioPalette.Surface, CircleShape)
            )
        }
    }
}

@Composable
private fun PreferenceToggle(title: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { onChange(!checked) }.padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(title, color = StudioPalette.Ink, fontSize = 13.sp, modifier = Modifier.weight(1f))
        Box(
            Modifier.width(42.dp).height(24.dp).clip(CircleShape)
                .background(if (checked) StudioPalette.Accent else StudioPalette.Line)
                .padding(3.dp),
            contentAlignment = if (checked) Alignment.CenterEnd else Alignment.CenterStart
        ) {
            Box(Modifier.size(18.dp).clip(CircleShape).background(Color.White))
        }
    }
}

@Composable
private fun ChatListRow(
    chat: ChatSummary,
    connected: Boolean,
    onClick: () -> Unit,
    onAction: (String) -> Unit
) {
    var swipeOpen by rememberSaveable(chat.key.jid) { mutableStateOf(false) }
    var dragDistance by remember { mutableFloatStateOf(0f) }
    val density = LocalDensity.current
    val offset by animateDpAsState(
        targetValue = if (swipeOpen) (-228).dp else 0.dp,
        label = "chat-row-swipe"
    )
    val rowScale = LocalStudioRowScale.current
    val avatarInitials = chat.title.trim().split(Regex("\\s+"))
        .filter { it.isNotEmpty() }.take(2).joinToString("") { it.take(1) }.uppercase()

    Box(
        Modifier.fillMaxWidth().heightIn(min = 66.dp * rowScale).clip(RoundedCornerShape(0.dp))
    ) {
        Row(
            Modifier.align(Alignment.CenterEnd).fillMaxHeight().width(228.dp),
            horizontalArrangement = Arrangement.spacedBy(0.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            listOf("Pin", "Mute", "Archive", "Unread").forEachIndexed { index, label ->
                val color = when (index) {
                    0 -> StudioPalette.Accent
                    1 -> StudioPalette.Muted
                    2 -> Color(0xFF52645F)
                    else -> Color(0xFF8A6A24)
                }
                Box(
                    Modifier.weight(1f).fillMaxHeight().background(color)
                        .clickable(enabled = connected) {
                            swipeOpen = false
                            onAction(label.lowercase())
                        }.padding(horizontal = 2.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(label, color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                }
            }
        }

        Row(
            Modifier.fillMaxWidth().heightIn(min = 66.dp * rowScale)
                .offset(x = offset, y = 0.dp)
                .background(StudioPalette.Surface)
                .pointerInput(connected, swipeOpen) {
                    val threshold = with(density) { 38.dp.toPx() }
                    detectHorizontalDragGestures(
                        onDragEnd = {
                            if (dragDistance < -threshold) swipeOpen = true
                            if (dragDistance > threshold) swipeOpen = false
                            dragDistance = 0f
                        },
                        onHorizontalDrag = { change, amount ->
                            dragDistance += amount
                            change.consume()
                        }
                    )
                }
                .clickable {
                    if (swipeOpen) swipeOpen = false else onClick()
                }
                .padding(horizontal = 13.dp, vertical = 10.dp * rowScale),
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
                        color = Color.White,
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
