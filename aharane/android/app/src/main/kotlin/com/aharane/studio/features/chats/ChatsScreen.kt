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
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.darkColorScheme
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
    onChatAction: (ChatSummary, String) -> Unit = { _, _ -> },
    showIndividuals: Boolean = true,
    showGroups: Boolean = true,
    starredItems: List<String> = emptyList(),
    savedChatTheme: String = "system",
    savedShowAvatars: Boolean = true,
    savedShowPreviews: Boolean = true,
    savedShowTimestamps: Boolean = true,
    onVisibilityModeChange: (String, Boolean) -> Unit = { _, _ -> },
    onChatAppearanceChange: (String, Boolean, Boolean, Boolean) -> Unit = { _, _, _, _ -> }
) {
    var query by rememberSaveable { mutableStateOf("") }
    var activeTool by rememberSaveable { mutableStateOf("") }
    var chatTheme by rememberSaveable(account) { mutableStateOf(savedChatTheme.replaceFirstChar { it.uppercase() }) }
    var showAvatars by rememberSaveable(account) { mutableStateOf(savedShowAvatars) }
    var showPreviews by rememberSaveable(account) { mutableStateOf(savedShowPreviews) }
    var showTimestamps by rememberSaveable(account) { mutableStateOf(savedShowTimestamps) }
    val parentScheme = MaterialTheme.colorScheme
    val chatScheme = when (chatTheme.lowercase()) {
        "light" -> parentScheme.copy(
            primary = Color(0xFF0E7A5C),
            onPrimary = Color.White,
            primaryContainer = Color(0xFFDDF1EA),
            onPrimaryContainer = Color(0xFF103D30),
            background = Color(0xFFF2F4F3),
            onBackground = Color(0xFF12181B),
            surface = Color.White,
            onSurface = Color(0xFF12181B),
            surfaceVariant = Color(0xFFE9EFEC),
            onSurfaceVariant = Color(0xFF66726F),
            outline = Color(0xFFE1E6E4),
            error = Color(0xFFC2372D)
        )
        "dark" -> parentScheme.copy(
            primary = Color(0xFF3CC79A),
            onPrimary = Color(0xFF04140E),
            primaryContainer = Color(0xFF133A2E),
            onPrimaryContainer = Color(0xFFDDF1EA),
            background = Color(0xFF0C1110),
            onBackground = Color(0xFFEAF0EE),
            surface = Color(0xFF151C1B),
            onSurface = Color(0xFFEAF0EE),
            surfaceVariant = Color(0xFF1D2825),
            onSurfaceVariant = Color(0xFF8B9895),
            outline = Color(0xFF25302E),
            error = Color(0xFFFF7A6E)
        )
        else -> parentScheme
    }
    val switchIcon = if (account == ChatAccount.PRIVATE) Icons.Outlined.Lock else Icons.Outlined.Public
    val accountConversations = conversations.filter { it.key.account == account }
    val unreadCount = accountConversations.sumOf { it.unreadCount }
    val visibleChats = remember(conversations, account, filter, query, showIndividuals, showGroups) {
        conversations.asSequence()
            .filter { it.key.account == account }
            .filter { if (it.isGroup) showGroups else showIndividuals }
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

    MaterialTheme(colorScheme = chatScheme) {
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
                placeholder = "Search chats",
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
                            showAvatar = showAvatars,
                            showPreview = showPreviews,
                            showTimestamp = showTimestamps,
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
                            "Choose whether individual chats and groups are included in this account's inbox. Changes are saved to the Aharane server.",
                            color = StudioPalette.Muted,
                            fontSize = 13.sp,
                            lineHeight = 19.sp
                        )
                        PreferenceToggle("Show individual chats", showIndividuals) {
                            onVisibilityModeChange("individuals", it)
                        }
                        PreferenceToggle("Show groups", showGroups) {
                            onVisibilityModeChange("groups", it)
                        }
                    }
                    "starred" -> {
                        Text("Starred messages", color = StudioPalette.Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                        if (starredItems.isEmpty()) {
                            StudioEmpty(
                                title = "No starred messages.",
                                description = if (accountConnected) "Star a message inside a conversation to keep it here."
                                else "Connect this WhatsApp account to load starred messages."
                            )
                        } else {
                            Column(Modifier.fillMaxWidth()) {
                                starredItems.take(40).forEachIndexed { index, item ->
                                    if (index > 0) StudioDivider()
                                    Text(
                                        item,
                                        color = StudioPalette.Ink,
                                        fontSize = 12.5.sp,
                                        lineHeight = 18.sp,
                                        modifier = Modifier.fillMaxWidth().padding(vertical = 9.dp)
                                    )
                                }
                            }
                        }
                    }
                    "appearance" -> {
                        Text("Chat appearance", color = StudioPalette.Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                        Text("Theme", color = StudioPalette.Ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        StudioSegmented(
                            options = listOf("System", "Light", "Dark"),
                            selected = chatTheme,
                            onSelect = {
                                chatTheme = it
                                onChatAppearanceChange(it.lowercase(), showAvatars, showPreviews, showTimestamps)
                            }
                        )
                        PreferenceToggle("Show avatars", showAvatars) {
                            showAvatars = it
                            onChatAppearanceChange(chatTheme.lowercase(), it, showPreviews, showTimestamps)
                        }
                        PreferenceToggle("Show message previews", showPreviews) {
                            showPreviews = it
                            onChatAppearanceChange(chatTheme.lowercase(), showAvatars, it, showTimestamps)
                        }
                        PreferenceToggle("Show timestamps", showTimestamps) {
                            showTimestamps = it
                            onChatAppearanceChange(chatTheme.lowercase(), showAvatars, showPreviews, it)
                        }
                        Text(
                            "Saved to your Aharane server and shared by the Studio.",
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
    showAvatar: Boolean,
    showPreview: Boolean,
    showTimestamp: Boolean,
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
            if (showAvatar) {
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
                if (showPreview) {
                    Text(
                        chat.lastMessagePreview,
                        color = StudioPalette.Muted,
                        fontSize = 12.5.sp,
                        lineHeight = 17.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (chat.isPinned) Text("📌", fontSize = 10.sp)
                    if (chat.isMuted) Text("🔕", fontSize = 10.sp)
                    if (showTimestamp) {
                        Text(
                            relativeTime(chat.lastMessageAtMillis),
                            color = StudioPalette.Muted,
                            fontSize = 10.5.sp,
                            maxLines = 1
                        )
                    }
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
