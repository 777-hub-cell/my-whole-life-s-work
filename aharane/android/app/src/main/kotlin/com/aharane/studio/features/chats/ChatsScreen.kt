package com.aharane.studio.features.chats

import androidx.compose.animation.core.animateDpAsState
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Public

import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.draw.clip
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.*
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.model.ChatFilter
import com.aharane.studio.core.model.ChatSummary
import com.aharane.studio.core.model.ChatMessage
import android.app.DatePickerDialog
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import java.util.Calendar
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import org.json.JSONObject

@Composable
fun ChatsScreen(
    account: ChatAccount,
    onAccountSelected: (ChatAccount) -> Unit,
    filter: ChatFilter,
    onFilterSelected: (ChatFilter) -> Unit,
    conversations: List<ChatSummary> = emptyList(),
    accountDisplayName: String = account.label,
    accountConnected: Boolean = false,
    onConnectAccount: () -> Unit = {},
    onConversationSelected: (ChatSummary) -> Unit = {},
    onChatAction: (ChatSummary, String) -> Unit = { _, _ -> },
    onLoadAvatar: suspend (ChatSummary) -> ByteArray? = { null },
    showIndividuals: Boolean = true,
    showGroups: Boolean = true,
    savedChatTheme: String = "system",
    savedShowAvatars: Boolean = true,
    savedShowPreviews: Boolean = true,
    savedShowTimestamps: Boolean = true,
    messageSearchResults: List<ChatMessage> = emptyList(),
    onInboxSearchChanged: (String, Long, Long) -> Unit = { _, _, _ -> },
    onInboxMessageSelected: (ChatMessage) -> Unit = {},
    onLoadChannels: suspend (ChatAccount) -> JSONObject = { JSONObject().put("supported", false) },
    onLoadChannelUpdates: suspend (ChatAccount, String) -> JSONObject = { _, _ -> JSONObject().put("supported", false) },
) {
    var query by rememberSaveable { mutableStateOf("") }
    var fromMillis by rememberSaveable { mutableLongStateOf(0L) }
    var toMillis by rememberSaveable { mutableLongStateOf(0L) }
    val context = LocalContext.current
    LaunchedEffect(query, fromMillis, toMillis, account) {
        val term = query.trim()
        if (term.length >= 2) delay(350)
        if (term.length >= 2 || fromMillis > 0L || toMillis > 0L) {
            onInboxSearchChanged(term, fromMillis, toMillis)
        } else {
            onInboxSearchChanged("", 0L, 0L)
        }
    }
    var channelRows by remember { mutableStateOf<List<Triple<String, String, String>>>(emptyList()) }
    var selectedChannel by remember { mutableStateOf<String?>(null) }
    var channelUpdates by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var channelsSupported by remember { mutableStateOf(false) }
    var channelError by remember { mutableStateOf("") }
    var channelsLoading by remember { mutableStateOf(false) }
    var updatesLoading by remember { mutableStateOf(false) }
    LaunchedEffect(filter, account, accountConnected) {
        if (filter == ChatFilter.CHANNELS) {
            selectedChannel = null
            channelRows = emptyList()
            channelUpdates = emptyList()
            channelError = ""
            if (accountConnected) {
                channelsLoading = true
                try {
                    val result = onLoadChannels(account)
                    channelsSupported = result.optBoolean("supported")
                    val data = result.optJSONArray("channels")
                    channelRows = buildList {
                        if (data != null) for (index in 0 until data.length()) {
                            val row = data.optJSONObject(index) ?: continue
                            val jid = row.optString("jid")
                            if (jid.endsWith("@newsletter")) add(
                                Triple(jid, row.optString("name", "Unnamed channel"), row.optString("description"))
                            )
                        }
                    }
                    if (!channelsSupported) channelError = result.optString("reason", "Channels are not supported by this paired session.")
                } catch (failure: Exception) {
                    channelsSupported = false
                    channelError = failure.message ?: "Could not retrieve Channels."
                } finally { channelsLoading = false }
            }
        }
    }
    LaunchedEffect(selectedChannel, account) {
        val jid = selectedChannel ?: return@LaunchedEffect
        updatesLoading = true
        channelUpdates = emptyList()
        try {
            val result = onLoadChannelUpdates(account, jid)
            val data = result.optJSONArray("updates")
            if (!result.optBoolean("supported")) {
                channelError = result.optString("reason", "Channel updates are unsupported by this session.")
            } else {
                channelError = ""
                channelUpdates = buildList {
                    if (data != null) for (index in 0 until data.length()) data.optJSONObject(index)?.let(::add)
                }
            }
        } catch (failure: Exception) {
            channelError = failure.message ?: "Could not retrieve Channel updates."
        } finally { updatesLoading = false }
    }

    val chatTheme = savedChatTheme.replaceFirstChar { it.uppercase() }
    val showAvatars = savedShowAvatars
    val showPreviews = savedShowPreviews
    val showTimestamps = savedShowTimestamps
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
    val visibleChats = remember(conversations, account, filter, query, showIndividuals, showGroups) {
        conversations.asSequence()
            .filter { it.key.account == account }
            .filter { if (it.isGroup) showGroups else showIndividuals }
            .filter { chat ->
                when (filter) {
                    ChatFilter.ALL -> !chat.isArchived
                    ChatFilter.UNREAD -> chat.unreadCount > 0 && !chat.isArchived
                    ChatFilter.GROUPS -> chat.isGroup && !chat.isArchived
                    // Newsletter JIDs are not ingested by the current ChatStore; do not present ordinary chats as Channels.
                    ChatFilter.CHANNELS -> false
                    ChatFilter.ARCHIVED -> chat.isArchived
                }
            }
            .filter { query.isBlank() || it.title.contains(query, true) || it.lastMessagePreview.contains(query, true) }
            .sortedWith(compareByDescending<ChatSummary> { it.isPinned }.thenByDescending { it.lastMessageAtMillis })
            .toList()
    }

    val chatListState = rememberLazyListState()
    MaterialTheme(colorScheme = chatScheme) {
    LazyColumn(
        state = chatListState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 3.dp, bottom = 10.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { StudioPageTitle("Chat", compact = true) }
                ChatHeaderButton(
                    icon = switchIcon,
                    description = if (account == ChatAccount.PRIVATE) "Switch to Public WhatsApp" else "Switch to Private WhatsApp"
                ) {
                    onAccountSelected(
                        if (account == ChatAccount.PRIVATE) ChatAccount.PUBLIC else ChatAccount.PRIVATE
                    )
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
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp))
                    .background(StudioPalette.Surface)
                    .border(1.dp, StudioPalette.Line, RoundedCornerShape(11.dp))
                    .padding(start = 12.dp, end = 5.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                BasicTextField(
                    value = query,
                    onValueChange = { query = it },
                    singleLine = true,
                    textStyle = androidx.compose.ui.text.TextStyle(color = StudioPalette.Ink, fontSize = 13.sp),
                    modifier = Modifier.weight(1f).padding(vertical = 12.dp),
                    decorationBox = { inner ->
                        Box {
                            if (query.isBlank()) {
                                Text(
                                    "Search chats and saved messages",
                                    color = StudioPalette.Muted,
                                    fontSize = 13.sp
                                )
                            }
                            inner()
                        }
                    }
                )
                if (fromMillis > 0L || toMillis > 0L) {
                    Text(
                        SimpleDateFormat("d MMM", Locale.getDefault()).format(Date(fromMillis)),
                        color = StudioPalette.Accent,
                        fontSize = 10.sp,
                        modifier = Modifier.padding(horizontal = 3.dp)
                    )
                    Box(
                        Modifier.size(32.dp).clip(CircleShape).clickable {
                            fromMillis = 0L
                            toMillis = 0L
                        },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Outlined.Close, contentDescription = "Clear date filter", tint = StudioPalette.Muted, modifier = Modifier.size(17.dp))
                    }
                }
                Box(
                    Modifier.size(36.dp).clip(CircleShape)
                        .background(if (fromMillis > 0L || toMillis > 0L) StudioPalette.Soft else Color.Transparent)
                        .clickable {
                            val calendar = Calendar.getInstance().apply {
                                if (fromMillis > 0L) timeInMillis = fromMillis
                            }
                            DatePickerDialog(
                                context,
                                { _, year, month, day ->
                                    val start = Calendar.getInstance().apply {
                                        set(year, month, day, 0, 0, 0)
                                        set(Calendar.MILLISECOND, 0)
                                    }.timeInMillis
                                    fromMillis = start
                                    toMillis = start + 86_399_999L
                                },
                                calendar.get(Calendar.YEAR),
                                calendar.get(Calendar.MONTH),
                                calendar.get(Calendar.DAY_OF_MONTH)
                            ).show()
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Outlined.CalendarMonth,
                        contentDescription = "Filter saved messages by date",
                        tint = if (fromMillis > 0L || toMillis > 0L) StudioPalette.Accent else StudioPalette.Muted,
                        modifier = Modifier.size(19.dp)
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
        }
        if (query.trim().length >= 2 || fromMillis > 0L || toMillis > 0L) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text("Saved message matches", color = StudioPalette.Ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    if (messageSearchResults.isEmpty()) {
                        Text("No saved messages match this search yet.", color = StudioPalette.Muted, fontSize = 11.5.sp)
                    } else {
                        messageSearchResults.take(30).forEach { message ->
                            val chatName = accountConversations.firstOrNull { it.key == message.key }?.title ?: message.key.jid
                            Row(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp))
                                    .background(StudioPalette.Surface).clickable { onInboxMessageSelected(message) }
                                    .padding(horizontal = 10.dp, vertical = 9.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(chatName, color = StudioPalette.Ink, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                    Text(
                                        message.text.ifBlank { message.mediaFileName ?: message.kind.name.lowercase() },
                                        color = StudioPalette.Muted, fontSize = 11.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        (message.senderName?.let { "$it · " } ?: "") + SimpleDateFormat("d MMM yyyy · h:mm a", Locale.getDefault()).format(Date(message.timestampMillis)),
                                        color = StudioPalette.Muted, fontSize = 9.5.sp
                                    )
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
            }
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
        if (filter == ChatFilter.CHANNELS) {
            item {
                Row(
                    Modifier.fillMaxWidth().padding(bottom = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            if (selectedChannel == null) "Channels" else channelRows.firstOrNull { it.first == selectedChannel }?.second ?: "Channel",
                            fontSize = 15.sp, color = StudioPalette.Ink, fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            if (selectedChannel == null) "Updates from channels you follow" else "Channel updates",
                            fontSize = 11.5.sp, color = StudioPalette.Muted
                        )
                    }
                    if (selectedChannel != null) {
                        StudioActionButton(
                            "All channels",
                            compact = true,
                            onClick = { selectedChannel = null; channelError = "" }
                        )
                    }
                }
                when {
                    !accountConnected -> Text(
                        "Connect this WhatsApp session to view its subscribed Channels.",
                        color = StudioPalette.Muted, fontSize = 12.sp
                    )
                    channelsLoading || updatesLoading -> Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        androidx.compose.material3.CircularProgressIndicator(
                            Modifier.size(15.dp), color = StudioPalette.Accent, strokeWidth = 2.dp
                        )
                        Text("Loading channels…", color = StudioPalette.Muted, fontSize = 12.sp)
                    }
                    channelError.isNotBlank() -> Text(channelError, color = StudioPalette.Muted, fontSize = 12.sp)
                    selectedChannel == null && channelRows.isEmpty() -> Text(
                        if (channelsSupported) "No subscribed channels found." else "This session does not support listing channels.",
                        color = StudioPalette.Muted, fontSize = 12.sp
                    )
                    selectedChannel != null && channelUpdates.isEmpty() -> Text(
                        "No channel updates are available.",
                        color = StudioPalette.Muted, fontSize = 12.sp
                    )
                }
            }
            if (selectedChannel == null) {
                itemsIndexed(
                    items = channelRows.filter { query.isBlank() || it.second.contains(query, true) || it.third.contains(query, true) },
                    key = { _, row -> row.first }
                ) { index, row ->
                    if (index > 0) StudioDivider()
                    ChannelListRow(
                        title = row.second,
                        description = row.third.ifBlank { "Channel" },
                        onClick = { selectedChannel = row.first }
                    )
                }
            } else {
                itemsIndexed(channelUpdates, key = { index, row -> row.optString("id").ifBlank { "update-$index" } }) { index, update ->
                    if (index > 0) StudioDivider()
                    Column(
                        Modifier.fillMaxWidth().background(StudioPalette.Surface).padding(horizontal = 13.dp, vertical = 13.dp),
                        verticalArrangement = Arrangement.spacedBy(5.dp)
                    ) {
                        val kind = update.optString("type", "text")
                        Text(
                            update.optString("text").ifBlank { "Channel $kind update" },
                            color = StudioPalette.Ink, fontSize = 13.sp, lineHeight = 18.sp
                        )
                        val time = update.optLong("timestampMillis")
                        if (time > 0L) {
                            Text(
                                SimpleDateFormat("d MMM yyyy · h:mm a", Locale.getDefault()).format(Date(time)),
                                color = StudioPalette.Muted, fontSize = 10.sp
                            )
                        }
                    }
                }
            }
        } else {
        item {
            if (visibleChats.isEmpty()) {
                StudioCard(padding = PaddingValues(horizontal = 16.dp, vertical = 26.dp)) {
                    Column(
                        Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Box(
                            Modifier.size(44.dp).clip(CircleShape).background(StudioPalette.Soft),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                Icons.Outlined.ChatBubbleOutline,
                                contentDescription = null,
                                tint = StudioPalette.Accent,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                        Text(
                            when {
                                !accountConnected -> "Connect this WhatsApp account"
                                query.isNotBlank() -> "No chats match your search."
                                filter == ChatFilter.UNREAD -> "No unread chats."
                                filter == ChatFilter.GROUPS -> "No groups yet."
                                filter == ChatFilter.CHANNELS -> "No supported Channels are available in this session."
                                filter == ChatFilter.ARCHIVED -> "No archived chats."
                                accountConversations.isEmpty() -> "No conversations yet."
                                else -> "No chats match these filters."
                            },
                            color = StudioPalette.Ink,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            lineHeight = 20.sp,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Text(
                            when {
                                !accountConnected -> "Link this account to load its conversations."
                                query.isNotBlank() -> "Try a different search or clear the current query."
                                filter == ChatFilter.UNREAD -> "Unread conversations will appear here."
                                filter == ChatFilter.GROUPS -> "Group conversations will appear here."
                                filter == ChatFilter.CHANNELS -> "Channel conversations are not yet available through Aharane’s Chat service."
                                filter == ChatFilter.ARCHIVED -> "Archived conversations will appear here."
                                accountConversations.isEmpty() -> "New conversations will appear here when this account receives messages."
                                else -> "Try another filter to find the conversation you need."
                            },
                            color = StudioPalette.Muted,
                            fontSize = 12.sp,
                            lineHeight = 17.sp,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth()
                        )
                        if (!accountConnected) {
                            StudioActionButton("Link account", compact = true, primary = true, onClick = onConnectAccount)
                        } else if (query.isNotBlank()) {
                            StudioActionButton("Clear search", compact = true, onClick = { query = "" })
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
        }
        if (visibleChats.isNotEmpty()) {
            itemsIndexed(
                items = visibleChats,
                key = { _, chat -> chat.key.account.apiValue + ":" + chat.key.jid }
            ) { index, chat ->
                if (index > 0) StudioDivider()
                ChatListRow(
                    chat = chat,
                    connected = accountConnected,
                    showAvatar = showAvatars,
                    showPreview = showPreviews,
                    showTimestamp = showTimestamps,
                    onLoadAvatar = onLoadAvatar,
                    onClick = { onConversationSelected(chat) },
                    onAction = { action -> onChatAction(chat, action) }
                )
            }
            item { Spacer(Modifier.height(16.dp)) }
        }
        }
    }
    }
}

@Composable
private fun ChatHeaderButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    description: String,
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
    }
}

@Composable
private fun ChannelListRow(
    title: String,
    description: String,
    onClick: () -> Unit
) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 66.dp)
            .background(StudioPalette.Surface)
            .clickable(onClick = onClick)
            .padding(horizontal = 13.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(11.dp)
    ) {
        Box(
            Modifier.size(40.dp).clip(CircleShape).background(StudioPalette.Soft),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Outlined.Public,
                contentDescription = "Channel",
                tint = StudioPalette.Accent,
                modifier = Modifier.size(20.dp)
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                title,
                color = StudioPalette.Ink,
                fontSize = 14.sp,
                lineHeight = 18.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                description,
                color = StudioPalette.Muted,
                fontSize = 12.5.sp,
                lineHeight = 17.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        Text("›", color = StudioPalette.Muted, fontSize = 22.sp, lineHeight = 24.sp)
    }
}

@Composable
private fun ChatListRow(
    chat: ChatSummary,
    connected: Boolean,
    showAvatar: Boolean,
    showPreview: Boolean,
    showTimestamp: Boolean,
    onLoadAvatar: suspend (ChatSummary) -> ByteArray?,
    onClick: () -> Unit,
    onAction: (String) -> Unit
) {
    var actionsOpen by rememberSaveable(chat.key.account.apiValue, chat.key.jid) { mutableStateOf(false) }
    val rowScale = LocalStudioRowScale.current
    // WhatsApp-style inbox: show each contact or group picture in the chat list.
    // Conversation message rows intentionally do not repeat the contact avatar.
    val showProfileAvatar = true
    val profilePicture by produceState<ImageBitmap?>(
        initialValue = null, chat.key, connected, showProfileAvatar
    ) {
        if (connected && showProfileAvatar) {
            val bytes = try {
                onLoadAvatar(chat)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                null
            }
            value = bytes?.let { data ->
                withContext(Dispatchers.Default) {
                    BitmapFactory.decodeByteArray(data, 0, data.size)?.asImageBitmap()
                }
            }
        }
    }

    Row(
        Modifier.fillMaxWidth().heightIn(min = 66.dp * rowScale)
            .background(StudioPalette.Surface)
            .combinedClickable(
                onClick = onClick,
                onLongClick = { actionsOpen = true }
            )
            .padding(horizontal = 13.dp, vertical = 10.dp * rowScale),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(11.dp)
    ) {
        if (showProfileAvatar) {
            Box(
                Modifier.size(40.dp).clip(CircleShape).background(StudioPalette.Soft),
                contentAlignment = Alignment.Center
            ) {
                if (profilePicture != null) {
                    Image(
                        bitmap = profilePicture!!,
                        contentDescription = "WhatsApp profile picture of " + chat.title,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize().clip(CircleShape)
                    )
                } else {
                    Text(chat.title.trim().take(1).uppercase().ifBlank { "?" }, color = StudioPalette.Accent, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
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
                if (chat.isPinned) Text("Pinned", color = StudioPalette.Muted, fontSize = 9.sp, fontWeight = FontWeight.SemiBold)
                if (chat.isMuted) Text("Muted", color = StudioPalette.Muted, fontSize = 9.sp, fontWeight = FontWeight.SemiBold)
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

    if (actionsOpen) {
        Dialog(onDismissRequest = { actionsOpen = false }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
                    .background(StudioPalette.Surface).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(chat.title, color = StudioPalette.Ink, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Text("Conversation actions", color = StudioPalette.Muted, fontSize = 12.sp)
                listOf("Pin", "Mute", if (chat.isArchived) "Unarchive" else "Archive", "Unread").forEach { label ->
                    StudioActionButton(
                        label,
                        modifier = Modifier.fillMaxWidth(),
                        enabled = connected,
                        onClick = {
                            actionsOpen = false
                            onAction(if (label == "Unarchive") "archive" else label.lowercase())
                        }
                    )
                }
                StudioActionButton("Cancel", modifier = Modifier.fillMaxWidth(), onClick = { actionsOpen = false })
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
