package com.aharane.studio.features.chats

import androidx.activity.compose.BackHandler

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Poll
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Send
import androidx.compose.material.icons.outlined.Videocam
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import com.aharane.studio.core.design.AharaneInstrumentSans
import com.aharane.studio.core.design.StudioPalette
import com.aharane.studio.core.design.StudioActionButton
import com.aharane.studio.core.design.StudioTag
import com.aharane.studio.core.design.StudioTextInput
import com.aharane.studio.core.model.ChatMessage
import com.aharane.studio.core.model.ChatSummary
import com.aharane.studio.core.model.MessageDirection
import com.aharane.studio.core.model.MessageKind
import com.aharane.studio.core.model.MessageStatus
import android.media.MediaPlayer
import android.media.PlaybackParams
import android.os.Build
import java.io.File
import java.util.Calendar
import android.app.DatePickerDialog
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.drawable.Animatable
import android.graphics.drawable.Drawable
import android.widget.ImageView
import android.widget.MediaController
import android.widget.VideoView
import androidx.compose.ui.viewinterop.AndroidView
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Full-screen native conversation surface. The screen consumes only server-backed
 * summaries/messages supplied by its caller; it never creates sample chat content.
 *
 * The composer remains editable so the user can prepare a draft; sending and
 * server-dependent attachment actions require an available connection.
 */
@Composable
fun ConversationScreen(
    conversation: ChatSummary,
    messages: List<ChatMessage>,
    connected: Boolean,
    aiReplyAvailable: Boolean = false,
    onGenerateAiReply: suspend (String, String, String, String) -> String = { _, _, _, _ -> "" },
    mediaRequestsAvailable: Boolean = connected,
    appearance: ChatAppearance = ChatAppearance(),
    hasOlderMessages: Boolean = false,
    loadingOlderMessages: Boolean = false,
    autoDownloadImages: Boolean = true,
    autoDownloadVideoPreviews: Boolean = true,
    onSyncConversation: () -> Unit = {},
    onLoadOlderMessages: () -> Unit = {},
    onBack: () -> Unit,
    onSend: (String, ChatMessage?) -> Unit,
    onAttach: () -> Unit = {},
    onRecordVoice: () -> Unit = {},
    onOpenMedia: (ChatMessage) -> Unit = {},
    onKeepMediaOffline: (ChatMessage) -> Unit = {},
    onViewOnce: (ChatMessage) -> Unit = {},
    onStarMessage: (ChatMessage) -> Unit = {},
    onReactMessage: (ChatMessage, String) -> Unit = { _, _ -> },
    onForwardMessage: (ChatMessage, ChatSummary) -> Unit = { _, _ -> },
    onDeleteMessage: (ChatMessage) -> Unit = {},
    onRetryOutgoingMessage: (ChatMessage) -> Unit = {},
    onCopyMessage: (ChatMessage) -> Unit = {},
    forwardTargets: List<ChatSummary> = emptyList(),
    searchResults: List<ChatMessage>? = null,
    onSearchChanged: (String, Long, Long) -> Unit = { query, _, _ -> },
    mediaPreviews: Map<String, ImageBitmap> = emptyMap(),
    mediaPreviewErrors: Set<String> = emptySet(),
    audioFiles: Map<String, File> = emptyMap(),
    audioLoading: Set<String> = emptySet(),
    audioErrors: Map<String, String> = emptyMap(),
    audioWaveforms: Map<String, List<Float>> = emptyMap(),
    animatedMediaFiles: Map<String, File> = emptyMap(),
    videoFiles: Map<String, File> = emptyMap(),
    videoLoading: Set<String> = emptySet(),
    videoErrors: Map<String, String> = emptyMap(),
    onLoadMediaPreview: (ChatMessage) -> Unit = {},
    onLoadVideo: (ChatMessage) -> Unit = {},
    onLoadAudio: (ChatMessage) -> Unit = {},
    onDownloadMedia: (ChatMessage) -> Unit = {},
    onOpenLocation: (ChatMessage) -> Unit = {}
) {
    var draft by rememberSaveable(conversation.key.jid) { mutableStateOf("") }
    var replyTo by remember { mutableStateOf<ChatMessage?>(null) }
    var searchOpen by rememberSaveable { mutableStateOf(false) }
    var mediaGalleryOpen by rememberSaveable(conversation.key.account.apiValue, conversation.key.jid) { mutableStateOf(false) }
    var mediaGalleryFilter by rememberSaveable(conversation.key.account.apiValue, conversation.key.jid) { mutableStateOf("All") }
    var search by rememberSaveable { mutableStateOf("") }
    var selectedSearchDay by rememberSaveable { mutableStateOf<Long?>(null) }
    var moreOpen by remember { mutableStateOf(false) }
    var actionMessage by remember { mutableStateOf<ChatMessage?>(null) }
    var aiReplyMessage by remember { mutableStateOf<ChatMessage?>(null) }
    var aiReplyTone by rememberSaveable { mutableStateOf("Natural") }
    var aiReplyInstruction by rememberSaveable { mutableStateOf("") }
    var aiReplyDraft by remember { mutableStateOf("") }
    var aiReplyLoading by remember { mutableStateOf(false) }
    var aiReplyError by remember { mutableStateOf("") }
    val aiReplyScope = rememberCoroutineScope()
    val aiReplyTones = listOf("Natural", "Friendly", "Casual", "Professional", "Formal", "Empathetic", "Concise", "Apologetic", "Confident")
    var forwardMessage by remember { mutableStateOf<ChatMessage?>(null) }
    var deleteMessage by remember { mutableStateOf<ChatMessage?>(null) }
    val context = LocalContext.current
    var wallpaperBitmap by remember(appearance.photoUri) { mutableStateOf<ImageBitmap?>(null) }
    LaunchedEffect(appearance.photoUri) {
        wallpaperBitmap = if (appearance.photoUri.isBlank()) null else withContext(Dispatchers.IO) {
            runCatching {
                context.contentResolver.openInputStream(Uri.parse(appearance.photoUri))?.use {
                    BitmapFactory.decodeStream(it)?.asImageBitmap()
                }
            }.getOrNull()
        }
    }
    val wallpaperBrush = when (appearance.wallpaper) {
        "solid", "default" -> Brush.linearGradient(listOf(appearanceColor(appearance.wallpaperColor), appearanceColor(appearance.wallpaperColor)))
        "gradient" -> Brush.linearGradient(listOf(appearanceColor(appearance.gradientStart), appearanceColor(appearance.gradientEnd)))
        else -> {
            val background = if (appearance.theme == "dark") Color(0xFF18211F) else StudioPalette.Background
            Brush.linearGradient(listOf(background, background))
        }
    }

    val listState = rememberLazyListState()
    val visible = remember(messages, searchResults, search, conversation.key) {
        val source = if ((search.isNotBlank() || selectedSearchDay != null) && searchResults != null) searchResults else messages
        source.asSequence()
            .filter { it.key == conversation.key }
            .filter {
                (search.isBlank() || searchResults != null ||
                    it.text.contains(search, ignoreCase = true) ||
                    (it.senderName?.contains(search, ignoreCase = true) == true) ||
                    (it.mediaFileName?.contains(search, ignoreCase = true) == true)) &&
                    (selectedSearchDay == null || it.timestampMillis in selectedSearchDay!!..(selectedSearchDay!! + 86_399_999L))
            }
            .toList()
    }

    LaunchedEffect(search, selectedSearchDay, connected, conversation.key) {
        val query = search.trim()
        if (query.length >= 2) kotlinx.coroutines.delay(350)
        onSearchChanged(
            query,
            selectedSearchDay ?: 0L,
            selectedSearchDay?.plus(86_399_999L) ?: 0L
        )
    }

    LaunchedEffect(messages, searchResults, search, conversation.key) {
        if (visible.isNotEmpty()) {
            listState.animateScrollToItem(visible.lastIndex)
        }
    }
    BackHandler {
        when {
            moreOpen -> moreOpen = false
            actionMessage != null -> actionMessage = null
            forwardMessage != null -> forwardMessage = null
            deleteMessage != null -> deleteMessage = null
            searchOpen -> {
                searchOpen = false
                search = ""
            }
            replyTo != null -> replyTo = null
            else -> onBack()
        }
    }

    Column(
        Modifier.fillMaxSize().background(StudioPalette.Background).imePadding()
    ) {
        Row(
            Modifier.fillMaxWidth().height(58.dp)
                .background(StudioPalette.Surface)
                .border(width = 0.5.dp, color = StudioPalette.Line),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ConversationTool(Icons.Outlined.ArrowBack, "Back to chats", onClick = onBack)
            Box(
                Modifier.padding(start = 2.dp, end = 10.dp).size(38.dp)
                    .clip(CircleShape).background(StudioPalette.Soft),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    conversation.title.trim().take(1).uppercase(),
                    color = StudioPalette.Accent,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(
                    conversation.title,
                    color = StudioPalette.Ink,
                    fontSize = 15.sp,
                    lineHeight = 19.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    if (conversation.isGroup) "Group conversation" else conversation.key.account.label + " account",
                    color = StudioPalette.Muted,
                    fontSize = 11.5.sp,
                    lineHeight = 15.sp,
                    maxLines = 1
                )
            }
            ConversationTool(
                Icons.Outlined.Image,
                if (mediaGalleryOpen) "Close media gallery" else "Browse conversation media"
            ) {
                mediaGalleryOpen = !mediaGalleryOpen
                if (mediaGalleryOpen) {
                    searchOpen = false
                    search = ""
                    selectedSearchDay = null
                }
            }
            ConversationTool(
                Icons.Outlined.Search,
                if (searchOpen) "Close conversation search" else "Search in conversation"
            ) {
                searchOpen = !searchOpen
                if (!searchOpen) {
                    search = ""
                    selectedSearchDay = null
                }
            }
            ConversationTool(Icons.Outlined.MoreVert, "Conversation options") {
                moreOpen = !moreOpen
            }
        }

        if (searchOpen) {
            Row(
                Modifier.fillMaxWidth().background(StudioPalette.Surface)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                BasicTextField(
                    cursorBrush = SolidColor(StudioPalette.Accent),
                    value = search,
                    onValueChange = { search = it },
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyMedium.copy(color = StudioPalette.Ink),
                    modifier = Modifier.weight(1f),
                    decorationBox = { inner ->
                        Box {
                            if (search.isEmpty()) Text(
                                "Search this conversation",
                                color = StudioPalette.Muted,
                                fontSize = 14.sp
                            )
                            inner()
                        }
                    }
                )
                ConversationTool(Icons.Outlined.DateRange, "Filter by date") {
                    val calendar = Calendar.getInstance().apply {
                        selectedSearchDay?.let { timeInMillis = it }
                    }
                    DatePickerDialog(
                        context,
                        { _, year, month, day ->
                            selectedSearchDay = Calendar.getInstance().apply {
                                set(year, month, day, 0, 0, 0)
                                set(Calendar.MILLISECOND, 0)
                            }.timeInMillis
                        },
                        calendar.get(Calendar.YEAR),
                        calendar.get(Calendar.MONTH),
                        calendar.get(Calendar.DAY_OF_MONTH)
                    ).show()
                }
                Text(
                    when {
                        selectedSearchDay != null -> "${visible.size} · " + java.text.SimpleDateFormat("d MMM", java.util.Locale.getDefault()).format(java.util.Date(selectedSearchDay!!))
                        search.isBlank() -> "${visible.size} messages"
                        else -> "${visible.size} matches"
                    },
                    color = StudioPalette.Muted,
                    fontSize = 10.5.sp,
                    modifier = Modifier.padding(start = 4.dp)
                )
                ConversationTool(Icons.Outlined.Close, "Clear search") {
                    search = ""
                    selectedSearchDay = null
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(StudioPalette.Line))
        }

        if (mediaGalleryOpen) {
            val gallerySource = messages.filter { message ->
                !message.isViewOnce && message.kind in setOf(
                    MessageKind.IMAGE, MessageKind.VIDEO, MessageKind.AUDIO,
                    MessageKind.STICKER, MessageKind.DOCUMENT
                )
            }
            val galleryItems = gallerySource.filter { message ->
                when (mediaGalleryFilter) {
                    "Photos" -> message.kind == MessageKind.IMAGE
                    "Videos" -> message.kind == MessageKind.VIDEO
                    "Audio" -> message.kind == MessageKind.AUDIO
                    "Files" -> message.kind == MessageKind.DOCUMENT
                    "Stickers" -> message.kind == MessageKind.STICKER
                    else -> true
                }
            }.sortedByDescending { it.timestampMillis }
            Column(
                Modifier.weight(1f).fillMaxWidth().background(StudioPalette.Background)
            ) {
                LazyRow(
                    modifier = Modifier.fillMaxWidth().background(StudioPalette.Surface)
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    items(listOf("All", "Photos", "Videos", "Audio", "Files", "Stickers")) { filter ->
                        val selected = mediaGalleryFilter == filter
                        Text(
                            filter,
                            color = if (selected) Color.White else StudioPalette.Muted,
                            fontSize = 11.sp,
                            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                            modifier = Modifier.clip(RoundedCornerShape(14.dp))
                                .background(if (selected) StudioPalette.Accent else StudioPalette.Background)
                                .clickable { mediaGalleryFilter = filter }
                                .padding(horizontal = 11.dp, vertical = 7.dp)
                        )
                    }
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(StudioPalette.Line))
                if (galleryItems.isEmpty()) {
                    Column(
                        Modifier.fillMaxSize().padding(28.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(if (mediaGalleryFilter == "All") "No media in this conversation yet" else "No ${mediaGalleryFilter.lowercase()} in this conversation yet", color = StudioPalette.Ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        Text("Shared photos, videos and files appear here. View-once media is excluded.", color = StudioPalette.Muted, fontSize = 11.5.sp, lineHeight = 17.sp)
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(1.dp)
                    ) {
                        items(galleryItems, key = { it.messageId }) { item ->
                            Row(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
                                    .clickable {
                                        when (item.kind) {
                                            MessageKind.AUDIO -> onLoadAudio(item)
                                            MessageKind.VIDEO -> onLoadVideo(item)
                                            else -> onOpenMedia(item)
                                        }
                                    }
                                    .padding(horizontal = 9.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Box(
                                    Modifier.size(38.dp).clip(RoundedCornerShape(7.dp)).background(StudioPalette.Soft),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        when (item.kind) {
                                            MessageKind.IMAGE -> "IMG"
                                            MessageKind.VIDEO -> "VID"
                                            MessageKind.AUDIO -> "AUD"
                                            MessageKind.STICKER -> "STK"
                                            else -> "DOC"
                                        },
                                        color = StudioPalette.Accent, fontSize = 9.sp, fontWeight = FontWeight.Bold
                                    )
                                }
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(
                                        item.mediaFileName?.takeIf { it.isNotBlank() }
                                            ?: item.text.takeIf { it.isNotBlank() }?.take(52)
                                            ?: messageAttachmentLabel(item.kind),
                                        color = StudioPalette.Ink, fontSize = 12.5.sp,
                                        maxLines = 1, overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        SimpleDateFormat("d MMM yyyy · h:mm a", Locale.getDefault()).format(Date(item.timestampMillis)) +
                                            if (item.deletedByRemote) " · Deleted on WhatsApp" else "",
                                        color = StudioPalette.Muted, fontSize = 10.sp,
                                        maxLines = 1, overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }
                }
            }
        } else {
            Box(Modifier.weight(1f).fillMaxWidth().background(wallpaperBrush)) {
            if (appearance.wallpaper == "photo" && wallpaperBitmap != null) {
                val matrix = ColorMatrix().apply {
                    setToScale(
                        appearance.wallpaperBrightness,
                        appearance.wallpaperBrightness,
                        appearance.wallpaperBrightness,
                        1f
                    )
                }
                Image(
                    bitmap = wallpaperBitmap!!,
                    contentDescription = "Conversation wallpaper",
                    contentScale = if (appearance.photoFit == "fit") ContentScale.Fit else ContentScale.Crop,
                    colorFilter = ColorFilter.colorMatrix(matrix),
                    modifier = Modifier.fillMaxSize().blur(appearance.wallpaperBlur.dp)
                )
            }
            if (appearance.wallpaperDim > 0f) {
                Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = appearance.wallpaperDim)))
            }
            if (visible.isEmpty()) {
                Column(
                    Modifier.align(Alignment.Center).padding(horizontal = 32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    Text(
                        if (search.isBlank()) "No messages yet" else "No matching messages",
                        color = StudioPalette.Ink,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        if (search.isBlank()) "Messages from this conversation will appear here."
                        else "Try another word or clear the search.",
                        color = StudioPalette.Muted,
                        fontSize = 13.sp,
                        lineHeight = 19.sp
                    )
                }
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(
                        when (appearance.density) {
                            "compact" -> 2.dp
                            "spacious" -> 10.dp
                            else -> appearance.bubbleSpacing.dp
                        }
                    )
                ) {
                    if (hasOlderMessages) {
                        item(key = "older-messages") {
                            Text(
                                if (loadingOlderMessages) "Loading older messages…" else "Load older messages",
                                color = StudioPalette.Accent,
                                fontSize = 12.sp,
                                modifier = Modifier.fillMaxWidth()
                                    .clickable(enabled = !loadingOlderMessages) { onLoadOlderMessages() }
                                    .padding(vertical = 8.dp),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
                    }
                    itemsIndexed(visible, key = { _, item -> item.messageId }) { index, message ->
                        val previous = visible.getOrNull(index - 1)
                        if (appearance.showDateSeparators && (previous == null || !sameDay(previous.timestampMillis, message.timestampMillis))) {
                            ConversationDayDivider(message.timestampMillis)
                        }
                        MessageBubble(
                            message = message,
                            appearance = appearance,
                            autoDownloadImages = autoDownloadImages,
                            autoDownloadVideoPreviews = autoDownloadVideoPreviews,
                            showTimestamp = appearance.showTimestamps,
                            groupedWithPrevious = appearance.groupMessages && previous != null &&
                                previous.direction == message.direction && previous.senderName == message.senderName && sameDay(previous.timestampMillis, message.timestampMillis),
                            reply = message.replyToMessageId?.let { id -> messages.firstOrNull { it.messageId == id && it.key == conversation.key } },
                            onReply = { replyTo = message },
                            onRetryOutgoing = { onRetryOutgoingMessage(message) },
                            onOpenMedia = { onOpenMedia(message) },
                            onKeepOffline = { onKeepMediaOffline(message) },
                            onViewOnce = { onViewOnce(message) },
                            onStar = { actionMessage = message },
                            connected = connected,
                            mediaPreview = mediaPreviews[mediaKey(message)],
                            mediaPreviewUnavailable = message.messageId in mediaPreviewErrors,
                            onLoadMediaPreview = { onLoadMediaPreview(message) },
                            mediaConnected = mediaRequestsAvailable,
                            audioFile = audioFiles[mediaKey(message)],
                            audioLoading = message.messageId in audioLoading,
                            audioError = audioErrors[message.messageId],
                            audioWaveform = audioWaveforms[mediaKey(message)].orEmpty(),
                            animatedMediaFile = animatedMediaFiles[mediaKey(message)],
                            videoFile = videoFiles[mediaKey(message)],
                            videoLoading = message.messageId in videoLoading,
                            videoError = videoErrors[message.messageId],
                            onLoadVideo = { onLoadVideo(message) },
                            onLoadAudio = { onLoadAudio(message) },
                            onDownloadMedia = { onDownloadMedia(message) },
                            onOpenLocation = { onOpenLocation(message) }
                        )
                    }
                }
            }
            }
        }

        if (replyTo != null) {
            Row(
                Modifier.fillMaxWidth().background(StudioPalette.Surface)
                    .padding(start = 12.dp, end = 8.dp, top = 7.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(Modifier.width(3.dp).height(34.dp).clip(RoundedCornerShape(2.dp)).background(StudioPalette.Accent))
                Column(Modifier.weight(1f).padding(start = 9.dp)) {
                    Text(
                        if (replyTo!!.direction == MessageDirection.OUTGOING) "You" else conversation.title,
                        color = StudioPalette.Accent,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        replyTo!!.text.ifBlank { messageAttachmentLabel(replyTo!!.kind) },
                        color = StudioPalette.Muted,
                        fontSize = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                ConversationTool(Icons.Outlined.Close, "Cancel reply") { replyTo = null }
            }
        }

        Row(
            Modifier.fillMaxWidth().background(StudioPalette.Surface)
                .border(width = 0.5.dp, color = StudioPalette.Line)
                .padding(horizontal = 9.dp, vertical = 8.dp),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            ConversationTool(
                Icons.Outlined.AttachFile,
                "Attach image, video, audio or document",
                enabled = connected,
                onClick = onAttach
            )
            Box(
                Modifier.weight(1f).defaultMinSize(minHeight = 44.dp)
                    .clip(RoundedCornerShape(22.dp))
                    .background(StudioPalette.Background)
                    .border(1.dp, StudioPalette.Line, RoundedCornerShape(22.dp))
                    .padding(horizontal = 15.dp, vertical = 11.dp),
                contentAlignment = Alignment.CenterStart
            ) {
                BasicTextField(
                    cursorBrush = SolidColor(StudioPalette.Accent),
                    value = draft,
                    onValueChange = { draft = it },
                    modifier = Modifier.fillMaxWidth().testTag("conversation-composer"),
                    minLines = 1,
                    maxLines = 4,
                    textStyle = MaterialTheme.typography.bodyMedium.copy(
                        color = StudioPalette.Ink,
                        lineHeight = 19.sp
                    ),
                    decorationBox = { inner ->
                        Box {
                            if (draft.isEmpty()) Text(
                                "Message",
                                color = StudioPalette.Muted,
                                fontSize = 14.sp
                            )
                            inner()
                        }
                    }
                )
            }
            val hasDraft = draft.isNotBlank()
            Box(
                Modifier.size(44.dp).clip(CircleShape)
                    .background(
                        if (hasDraft && connected) StudioPalette.Accent
                        else StudioPalette.Background
                    )
                    .border(
                        1.dp,
                        if (hasDraft && connected) StudioPalette.Accent else StudioPalette.Line,
                        CircleShape
                    )
                    .clickable(enabled = connected) {
                        if (hasDraft) {
                            val messageText = draft.trim()
                            if (messageText.isNotEmpty()) {
                                onSend(messageText, replyTo)
                                draft = ""
                                replyTo = null
                            }
                        } else {
                            onRecordVoice()
                        }
                    }.testTag("conversation-send"),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    if (hasDraft) Icons.Outlined.Send else Icons.Outlined.Mic,
                    contentDescription = if (hasDraft) "Send message" else "Voice note",
                    tint = if (hasDraft && connected) Color.White else StudioPalette.Muted,
                    modifier = Modifier.size(19.dp)
                )
            }
        }
    }

    if (actionMessage != null) {
        val selected = actionMessage!!
        androidx.compose.ui.window.Dialog(onDismissRequest = { actionMessage = null }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(StudioPalette.Surface).padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(5.dp)
            ) {
                Text("Message actions", color = StudioPalette.Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                Text(
                    selected.text.ifBlank { messageAttachmentLabel(selected.kind) },
                    color = StudioPalette.Muted,
                    fontSize = 12.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                if (
                    aiReplyAvailable &&
                    selected.direction == MessageDirection.INCOMING &&
                    selected.kind == MessageKind.TEXT &&
                    selected.text.isNotBlank() &&
                    !selected.deletedByRemote
                ) {
                    StudioPaletteAction("AI Reply") {
                        aiReplyMessage = selected
                        aiReplyTone = "Natural"
                        aiReplyInstruction = ""
                        aiReplyDraft = ""
                        aiReplyError = ""
                        aiReplyLoading = false
                        actionMessage = null
                    }
                }
                StudioPaletteAction("Reply") {
                    replyTo = selected
                    actionMessage = null
                }
                StudioPaletteAction(if (selected.isStarred) "Remove star" else "Star message") {
                    onStarMessage(selected)
                    actionMessage = null
                }
                Text("React", color = StudioPalette.Muted, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    listOf("❤️", "👍", "😂", "😮", "😢", "🙏").forEach { emoji ->
                        androidx.compose.material3.TextButton(onClick = {
                            onReactMessage(selected, emoji)
                            actionMessage = null
                        }) {
                            Text(emoji, fontSize = 20.sp)
                        }
                    }
                }
                if (!selected.isViewOnce && selected.kind in setOf(
                    MessageKind.IMAGE, MessageKind.VIDEO, MessageKind.AUDIO,
                    MessageKind.STICKER, MessageKind.DOCUMENT
                )) {
                    StudioPaletteAction("Save media to this phone") {
                        onKeepMediaOffline(selected)
                        actionMessage = null
                    }
                }
                StudioPaletteAction("Copy message") {
                    onCopyMessage(selected)
                    actionMessage = null
                }
                StudioPaletteAction("Forward message") {
                    forwardMessage = selected
                    actionMessage = null
                }
                StudioPaletteAction("Delete message") {
                    deleteMessage = selected
                    actionMessage = null
                }
                StudioPaletteAction("Cancel") { actionMessage = null }
            }
        }
    }

    if (aiReplyMessage != null) {
        val selected = aiReplyMessage!!
        val loadedQuote = selected.replyToMessageId?.let { id ->
            messages.firstOrNull { it.messageId == id && it.key == selected.key }
        }
        val quotedText = selected.quotedMessageText?.takeIf { it.isNotBlank() }
            ?: loadedQuote?.let { it.text.ifBlank { messageAttachmentLabel(it.kind) } }.orEmpty()
        androidx.compose.ui.window.Dialog(onDismissRequest = {
            if (!aiReplyLoading) aiReplyMessage = null
        }) {
            Column(
                Modifier.fillMaxWidth().widthIn(max = 520.dp).heightIn(max = 720.dp)
                    .clip(RoundedCornerShape(20.dp)).background(StudioPalette.Surface)
                    .verticalScroll(rememberScrollState()).padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(11.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StudioTag("AI WRITING", accent = true)
                    Spacer(Modifier.weight(1f))
                    Text("Groq", color = StudioPalette.Muted, fontSize = 11.sp)
                }
                Text("AI Reply", color = StudioPalette.Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Text(
                    "Aharane uses only this message, its explicit quote and the instructions you add below. It does not load chat history.",
                    color = StudioPalette.Muted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp
                )
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                        .background(StudioPalette.Background).padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    Text("SELECTED MESSAGE", color = StudioPalette.Accent, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    Text(selected.text, color = StudioPalette.Ink, fontSize = 13.sp, lineHeight = 18.sp)
                    if (!selected.replyToMessageId.isNullOrBlank()) {
                        Box(Modifier.fillMaxWidth().height(1.dp).background(StudioPalette.Line))
                        Text("QUOTED MESSAGE", color = StudioPalette.Accent, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        if (quotedText.isNotBlank()) {
                            Text(quotedText, color = StudioPalette.Ink, fontSize = 13.sp, lineHeight = 18.sp)
                        } else {
                            Text(
                                "The original quoted text is unavailable. Aharane will use only the selected message and will not load chat history.",
                                color = StudioPalette.Bad,
                                fontSize = 12.sp,
                                lineHeight = 17.sp
                            )
                        }
                    }
                }

                Text("Choose a tone", color = StudioPalette.Ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                LazyRow(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    items(aiReplyTones, key = { it }) { tone ->
                        val active = aiReplyTone == tone
                        androidx.compose.material3.Surface(
                            modifier = Modifier.clip(RoundedCornerShape(99.dp))
                                .clickable(enabled = !aiReplyLoading) { aiReplyTone = tone },
                            color = if (active) StudioPalette.Soft else StudioPalette.Background,
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                if (active) StudioPalette.Accent else StudioPalette.Line
                            ),
                            shape = RoundedCornerShape(99.dp)
                        ) {
                            Text(
                                tone,
                                color = if (active) StudioPalette.Accent else StudioPalette.Ink,
                                fontSize = 12.sp,
                                fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp)
                            )
                        }
                    }
                }
                Text("Additional context or instructions", color = StudioPalette.Ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                StudioTextInput(
                    value = aiReplyInstruction,
                    onValueChange = { aiReplyInstruction = it },
                    placeholder = "Tell AI what you want to say, add context, or explain how the reply should sound…",
                    singleLine = false,
                    minLines = 3,
                    minHeight = 104.dp,
                    textSize = 13.5.sp,
                    tag = "ai-reply-instruction"
                )
                if (aiReplyError.isNotBlank()) {
                    Text(aiReplyError, color = StudioPalette.Bad, fontSize = 12.sp, lineHeight = 17.sp)
                }
                if (aiReplyDraft.isNotBlank()) {
                    Text("REPLY DRAFT · EDITABLE", color = StudioPalette.Accent, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    StudioTextInput(
                        value = aiReplyDraft,
                        onValueChange = { aiReplyDraft = it },
                        placeholder = "Your generated reply",
                        singleLine = false,
                        minLines = 4,
                        minHeight = 124.dp,
                        textSize = 14.sp,
                        tag = "ai-reply-draft"
                    )
                }
                if (aiReplyLoading) {
                    Text("Writing your reply…", color = StudioPalette.Muted, fontSize = 12.sp)
                }
                if (aiReplyDraft.isBlank()) {
                    StudioActionButton(
                        if (aiReplyLoading) "Generating…" else "Generate reply",
                        modifier = Modifier.fillMaxWidth(),
                        primary = true,
                        enabled = !aiReplyLoading,
                        onClick = {
                            aiReplyScope.launch {
                                aiReplyLoading = true
                                aiReplyError = ""
                                runCatching {
                                    onGenerateAiReply(
                                        selected.text,
                                        quotedText,
                                        aiReplyTone,
                                        aiReplyInstruction
                                    )
                                }.onSuccess { aiReplyDraft = it }
                                    .onFailure { aiReplyError = it.message ?: "The AI reply could not be generated." }
                                aiReplyLoading = false
                            }
                        }
                    )
                } else {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StudioActionButton(
                            "Regenerate",
                            modifier = Modifier.weight(1f),
                            enabled = !aiReplyLoading && !quoteMissing,
                            onClick = {
                                aiReplyScope.launch {
                                    aiReplyLoading = true
                                    aiReplyError = ""
                                    runCatching {
                                        onGenerateAiReply(
                                            selected.text,
                                            quotedText,
                                            aiReplyTone,
                                            aiReplyInstruction
                                        )
                                    }.onSuccess { aiReplyDraft = it }
                                        .onFailure { aiReplyError = it.message ?: "The AI reply could not be generated." }
                                    aiReplyLoading = false
                                }
                            }
                        )
                        StudioActionButton(
                            "Send reply",
                            modifier = Modifier.weight(1f),
                            primary = true,
                            enabled = connected && !aiReplyLoading && aiReplyDraft.isNotBlank(),
                            onClick = {
                                val text = aiReplyDraft.trim()
                                if (text.isNotBlank()) {
                                    onSend(text, selected)
                                    aiReplyMessage = null
                                    aiReplyDraft = ""
                                }
                            }
                        )
                    }
                }
                StudioActionButton(
                    "Cancel",
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !aiReplyLoading,
                    onClick = { aiReplyMessage = null }
                )
            }
        }
    }

    if (forwardMessage != null) {
        val source = forwardMessage!!
        val targets = forwardTargets.filter {
            it.key.account == conversation.key.account && it.key != conversation.key
        }
        androidx.compose.ui.window.Dialog(onDismissRequest = { forwardMessage = null }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(StudioPalette.Surface).padding(16.dp)
            ) {
                Text("Forward to", color = StudioPalette.Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                Text(
                    "Choose a conversation in the same ${conversation.key.account.label} WhatsApp account.",
                    color = StudioPalette.Muted,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(top = 4.dp, bottom = 10.dp)
                )
                if (targets.isEmpty()) {
                    Text("No other conversations are available in this account.", color = StudioPalette.Muted, fontSize = 13.sp)
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxWidth().heightIn(max = 420.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        items(targets, key = { it.key.jid }) { target ->
                            StudioPaletteAction(target.title) {
                                onForwardMessage(source, target)
                                forwardMessage = null
                            }
                        }
                    }
                }
                StudioPaletteAction("Cancel") { forwardMessage = null }
            }
        }
    }

    if (deleteMessage != null) {
        val selected = deleteMessage!!
        androidx.compose.ui.window.Dialog(onDismissRequest = { deleteMessage = null }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(StudioPalette.Surface).padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text("Delete message?", color = StudioPalette.Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                Text(
                    "This asks WhatsApp to delete or clear the selected message. The server may reject the action when the connected account does not support it.",
                    color = StudioPalette.Muted,
                    fontSize = 12.5.sp,
                    lineHeight = 18.sp
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    androidx.compose.material3.TextButton(onClick = { deleteMessage = null }) {
                        Text("Cancel", color = StudioPalette.Muted)
                    }
                    androidx.compose.material3.TextButton(onClick = {
                        onDeleteMessage(selected)
                        deleteMessage = null
                    }) {
                        Text("Delete", color = StudioPalette.Bad)
                    }
                }
            }
        }
    }

    if (moreOpen) {
        androidx.compose.ui.window.Dialog(onDismissRequest = { moreOpen = false }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(StudioPalette.Surface).padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text("Conversation", color = StudioPalette.Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                Text(
                    conversation.key.jid,
                    color = StudioPalette.Muted,
                    fontSize = 12.sp
                )
                Text(
                    conversation.key.account.label + " WhatsApp inbox",
                    color = StudioPalette.Muted,
                    fontSize = 12.sp
                )
                StudioPaletteAction("Close", onClick = { moreOpen = false })
            }
        }
    }
}

@Composable
private fun ConversationTool(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    description: String,
    enabled: Boolean = true,
    onClick: () -> Unit
) {
    Box(
        Modifier.size(42.dp).clip(CircleShape)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            icon,
            contentDescription = description,
            tint = if (enabled) StudioPalette.Muted else StudioPalette.Muted.copy(alpha = .35f),
            modifier = Modifier.size(20.dp)
        )
    }
}

@Composable
private fun ConversationDayDivider(timestamp: Long) {
    val label = remember(timestamp) {
        val now = System.currentTimeMillis()
        val date = SimpleDateFormat("yyyyMMdd", Locale.getDefault())
        val today = date.format(Date(now))
        val yesterday = date.format(Date(now - 86_400_000L))
        when (date.format(Date(timestamp))) {
            today -> "Today"
            yesterday -> "Yesterday"
            else -> SimpleDateFormat("d MMM yyyy", Locale.getDefault()).format(Date(timestamp))
        }
    }
    Box(Modifier.fillMaxWidth().padding(vertical = 8.dp), contentAlignment = Alignment.Center) {
        Text(
            label,
            color = StudioPalette.Muted,
            fontSize = 11.5.sp,
            modifier = Modifier.clip(RoundedCornerShape(30.dp))
                .background(StudioPalette.Surface)
                .border(1.dp, StudioPalette.Line, RoundedCornerShape(30.dp))
                .padding(horizontal = 11.dp, vertical = 4.dp)
        )
    }
}

@Composable
private fun MessageBubble(
    message: ChatMessage,
    appearance: ChatAppearance,
    autoDownloadImages: Boolean,
    autoDownloadVideoPreviews: Boolean,
    showTimestamp: Boolean,
    groupedWithPrevious: Boolean,
    reply: ChatMessage?,
    onReply: () -> Unit,
    onRetryOutgoing: () -> Unit,
    onOpenMedia: () -> Unit,
    onKeepOffline: () -> Unit,
    onViewOnce: () -> Unit,
    onStar: () -> Unit,
    connected: Boolean,
    mediaPreview: ImageBitmap?,
    mediaPreviewUnavailable: Boolean,
    onLoadMediaPreview: () -> Unit,
    mediaConnected: Boolean,
    audioFile: File?,
    audioLoading: Boolean,
    audioError: String?,
    audioWaveform: List<Float>,
    animatedMediaFile: File?,
    videoFile: File?,
    videoLoading: Boolean,
    videoError: String?,
    onLoadVideo: () -> Unit,
    onLoadAudio: () -> Unit,
    onDownloadMedia: () -> Unit,
    onOpenLocation: () -> Unit
) {
    val outgoing = message.direction == MessageDirection.OUTGOING
    val bubble = appearanceColor(if (outgoing) appearance.outgoingBubble else appearance.incomingBubble)
    val foreground = readableAppearanceText(bubble)
    val timestamp = remember(message.timestampMillis) {
        SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date(message.timestampMillis))
    }
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (outgoing) Arrangement.End else Arrangement.Start,
        verticalAlignment = Alignment.Bottom
    ) {
        if (!outgoing && appearance.showAvatars) {
            Box(
                Modifier.size(24.dp).clip(CircleShape).background(StudioPalette.Soft),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    (message.senderName?.firstOrNull()?.uppercaseChar() ?: '•').toString(),
                    color = StudioPalette.Accent,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            Spacer(Modifier.width(5.dp))
        }
        Column(
            Modifier.widthIn(max = 310.dp)
                .clip(
                    RoundedCornerShape(
                        topStart = if (groupedWithPrevious) 5.dp else appearance.bubbleRadius.dp,
                        topEnd = if (groupedWithPrevious) 5.dp else appearance.bubbleRadius.dp,
                        bottomEnd = if (outgoing) 5.dp else appearance.bubbleRadius.dp,
                        bottomStart = if (outgoing) appearance.bubbleRadius.dp else 5.dp
                    )
                )
                .background(bubble)
                .then(
                    if (appearance.bubbleBorder) Modifier.border(
                        1.dp, StudioPalette.Line.copy(alpha = .75f),
                        RoundedCornerShape(appearance.bubbleRadius.dp)
                    ) else Modifier
                )
                .combinedClickable(
                    onClick = onReply,
                    onLongClick = { if (connected) onStar() }
                )
                .testTag("message-bubble-" + message.messageId)
                .padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
            if (!outgoing && appearance.showSenderLabels && !message.senderName.isNullOrBlank()) {
                Text(
                    message.senderName,
                    color = if (appearanceLuminance(bubble) > 0.45f) StudioPalette.Accent else foreground.copy(alpha = .85f),
                    fontSize = 10.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(bottom = 4.dp)
                )
            }
            val quotedPreview = reply?.let { it.text.ifBlank { messageAttachmentLabel(it.kind) } }
                ?.takeIf { it.isNotBlank() } ?: message.quotedMessageText?.takeIf { it.isNotBlank() }
            if (!message.replyToMessageId.isNullOrBlank() && !quotedPreview.isNullOrBlank()) {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
                        .background(if (outgoing) Color.White.copy(alpha = .13f) else StudioPalette.Background)
                        .padding(horizontal = 8.dp, vertical = 6.dp)
                ) {
                    Text(
                        if (reply?.direction == MessageDirection.OUTGOING) "You" else "Reply",
                        color = if (outgoing) Color.White.copy(alpha = .9f) else StudioPalette.Accent,
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        quotedPreview,
                        color = foreground.copy(alpha = .78f),
                        fontSize = 11.5.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Spacer(Modifier.height(6.dp))
            }
            if (message.isViewOnce) {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp))
                        .background(if (outgoing) Color.White.copy(alpha = .13f) else StudioPalette.Background)
                        .clickable(enabled = connected, onClick = onViewOnce)
                        .padding(11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(9.dp)
                ) {
                    Icon(
                        if (message.kind == MessageKind.VIDEO) Icons.Outlined.Videocam else Icons.Outlined.Image,
                        contentDescription = null,
                        tint = foreground,
                        modifier = Modifier.size(22.dp)
                    )
                    Column(Modifier.weight(1f)) {
                        Text("View once", color = foreground, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        Text("Open this media once", color = foreground.copy(alpha = .72f), fontSize = 11.sp)
                    }
                }
            } else {
                MessageContent(
                    message = message,
                    foreground = foreground,
                    outgoing = outgoing,
                    mediaPreview = mediaPreview,
                    mediaPreviewUnavailable = mediaPreviewUnavailable,
                    onLoadMediaPreview = onLoadMediaPreview,
                    mediaConnected = mediaConnected,
                    audioFile = audioFile,
                    audioLoading = audioLoading,
                    audioError = audioError,
                    audioWaveform = if (appearance.audioStyle == "minimal") emptyList() else audioWaveform,
                    animatedMediaFile = animatedMediaFile,
                    videoFile = videoFile,
                    videoLoading = videoLoading,
                    videoError = videoError,
                    onLoadVideo = onLoadVideo,
                    appearance = appearance,
                    autoDownloadImages = autoDownloadImages,
                    autoDownloadVideoPreviews = autoDownloadVideoPreviews,
                    onLoadMedia = onOpenMedia,
                    onLoadAudio = onLoadAudio,
                    onDownloadMedia = onDownloadMedia,
                    onOpenLocation = onOpenLocation
                )
            }
            if (message.deletedByRemote && !message.isViewOnce) {
                Text(
                    "Deleted by the other person on WhatsApp · retained in Hub",
                    color = foreground.copy(alpha = .78f),
                    fontSize = 10.sp,
                    fontStyle = androidx.compose.ui.text.font.FontStyle.Italic,
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
                )
            }
            if (showTimestamp || message.isStarred || (outgoing && message.status != MessageStatus.UNKNOWN)) {
                Row(
                    Modifier.fillMaxWidth().padding(top = 4.dp),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (showTimestamp) {
                        Text(timestamp, color = foreground.copy(alpha = if (outgoing) .72f else .55f), fontSize = 9.5.sp)
                    }
                    if (message.isStarred) {
                        Text("★  ", color = foreground.copy(alpha = .9f), fontSize = 10.sp)
                    }
                    if (outgoing) {
                        Text(
                            when (message.status) {
                                MessageStatus.READ, MessageStatus.DELIVERED -> "  ✓✓"
                                MessageStatus.SENT -> "  ✓"
                                MessageStatus.PENDING -> "  ◷"
                                MessageStatus.FAILED -> "  !"
                                MessageStatus.UNKNOWN -> ""
                            },
                            color = if (message.status == MessageStatus.READ) Color(0xFFBDEBDA) else foreground.copy(alpha = .75f),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
                if (outgoing && message.localOutboxState == "SENDING") {
                    Text("Sending…", color = StudioPalette.Muted, fontSize = 10.sp)
                } else if (outgoing && message.localOutboxState == "FAILED") {
                    Row(
                        Modifier.fillMaxWidth().padding(top = 2.dp),
                        horizontalArrangement = Arrangement.End,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            message.localOutboxError?.take(115) ?: "Not sent",
                            color = StudioPalette.Bad,
                            fontSize = 9.5.sp,
                            maxLines = 2
                        )
                        if (message.localOutboxError.orEmpty().contains("uncertain", ignoreCase = true)) {
                            Text(" · Check WhatsApp", color = StudioPalette.Bad, fontSize = 9.5.sp)
                        } else {
                            Text(
                                "  Retry",
                                color = StudioPalette.Accent,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.clickable(onClick = onRetryOutgoing).padding(start = 4.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageContent(
    message: ChatMessage,
    foreground: Color,
    outgoing: Boolean,
    mediaPreview: ImageBitmap?,
    mediaPreviewUnavailable: Boolean,
    onLoadMediaPreview: () -> Unit,
    mediaConnected: Boolean,
    audioFile: File?,
    audioLoading: Boolean,
    audioError: String?,
    audioWaveform: List<Float>,
    animatedMediaFile: File?,
    videoFile: File?,
    videoLoading: Boolean,
    videoError: String?,
    onLoadVideo: () -> Unit,
    appearance: ChatAppearance,
    autoDownloadImages: Boolean,
    autoDownloadVideoPreviews: Boolean,
    onLoadMedia: () -> Unit,
    onLoadAudio: () -> Unit,
    onDownloadMedia: () -> Unit,
    onOpenLocation: () -> Unit
) {
    val soft = if (outgoing) Color.White.copy(alpha = .13f) else StudioPalette.Background
    when (message.kind) {
        MessageKind.TEXT, MessageKind.RESPONSE, MessageKind.REACTION ->
            Text(
                message.text,
                color = foreground,
                fontSize = appearance.messageSize.sp,
                lineHeight = (appearance.messageSize + appearance.lineSpacing).sp,
                fontWeight = when (appearance.fontWeight) {
                    "bold" -> FontWeight.Bold
                    "medium" -> FontWeight.Medium
                    else -> FontWeight.Normal
                },
                fontFamily = when (appearance.fontFamily) {
                    "Mono" -> androidx.compose.ui.text.font.FontFamily.Monospace
                    "System" -> androidx.compose.ui.text.font.FontFamily.SansSerif
                    else -> AharaneInstrumentSans
                }
            )
        MessageKind.IMAGE, MessageKind.STICKER -> {
            val animatedMime = message.mediaMimeType.equals("image/gif", true) ||
                (message.kind == MessageKind.STICKER && message.mediaMimeType.equals("image/webp", true))
            val openImage = if (animatedMime && Build.VERSION.SDK_INT >= 28 && animatedMediaFile == null) {
                onLoadMediaPreview
            } else onLoadMedia
            LaunchedEffect(message.messageId, mediaPreview, mediaPreviewUnavailable, autoDownloadImages) {
                if (mediaConnected && autoDownloadImages && mediaPreview == null && !mediaPreviewUnavailable) onLoadMediaPreview()
            }
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                if (animatedMediaFile != null) {
                    AnimatedMediaPreview(
                        file = animatedMediaFile,
                        fallback = mediaPreview,
                        modifier = Modifier.fillMaxWidth().heightIn(max = 240.dp)
                            .clip(RoundedCornerShape(appearance.mediaRadius.dp)).clickable(onClick = onLoadMedia)
                    )
                } else if (mediaPreview != null) {
                    Image(
                        bitmap = mediaPreview,
                        contentDescription = message.mediaFileName ?: "WhatsApp image",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxWidth().heightIn(max = 240.dp)
                            .clip(RoundedCornerShape(appearance.mediaRadius.dp)).clickable(onClick = openImage)
                    )
                } else {
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(appearance.mediaRadius.dp))
                            .background(soft).clickable(onClick = openImage).padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(9.dp)
                    ) {
                        Icon(Icons.Outlined.Image, null, tint = foreground, modifier = Modifier.size(23.dp))
                        Column(Modifier.weight(1f)) {
                            Text(message.mediaFileName ?: messageAttachmentLabel(message.kind), color = foreground, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
                            Text(
                                when {
                                    mediaPreviewUnavailable -> message.mediaUnavailable?.ifBlank { "Preview unavailable · tap to open" } ?: "Preview unavailable · tap to open"
                                    !mediaConnected -> "Tap to open"
                                    !autoDownloadImages -> "Automatic preview is off · tap to open"
                                    else -> "Loading preview · tap to open"
                                },
                                color = foreground.copy(alpha = .72f),
                                fontSize = 10.5.sp
                            )
                        }
                    }
                }
                if (message.text.isNotBlank()) Text(
                    message.text,
                    color = foreground,
                    fontSize = (appearance.messageSize - 1).sp,
                    lineHeight = (appearance.messageSize + appearance.lineSpacing).sp
                )
            }
        }
        MessageKind.VIDEO -> {
            LaunchedEffect(message.messageId, mediaPreview, mediaPreviewUnavailable, autoDownloadVideoPreviews) {
                if (mediaConnected && autoDownloadVideoPreviews && mediaPreview == null && !mediaPreviewUnavailable) onLoadMediaPreview()
            }
            if (videoFile != null) {
                InlineVideoPlayer(videoFile, appearance.mediaRadius)
            } else {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(appearance.mediaRadius.dp))
                        .background(soft).clickable(enabled = !videoLoading, onClick = onLoadVideo)
                ) {
                    if (mediaPreview != null) {
                        Box(Modifier.fillMaxWidth().heightIn(max = 210.dp), contentAlignment = Alignment.Center) {
                            Image(bitmap = mediaPreview, contentDescription = "Video thumbnail", contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth().heightIn(max = 210.dp))
                            Box(Modifier.size(46.dp).clip(CircleShape).background(Color.Black.copy(alpha = .62f)), contentAlignment = Alignment.Center) {
                                Icon(Icons.Outlined.PlayArrow, "Play video", tint = Color.White, modifier = Modifier.size(30.dp))
                            }
                        }
                    } else {
                        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.Videocam, null, tint = foreground, modifier = Modifier.size(24.dp))
                            Column(Modifier.weight(1f).padding(start = 9.dp)) {
                                Text(message.mediaFileName ?: "Video", color = foreground, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
                                Text(
                                    when {
                                        videoError != null -> videoError
                                        videoLoading -> "Preparing video playback…"
                                        mediaPreviewUnavailable -> message.mediaUnavailable ?: "Video preview unavailable"
                                        !mediaConnected -> "Tap to play"
                                        !autoDownloadVideoPreviews -> "Automatic preview is off · tap to play"
                                        else -> "Tap to load and play"
                                    },
                                    color = if (videoError != null) StudioPalette.Bad else foreground.copy(alpha = .7f),
                                    fontSize = 10.5.sp
                                )
                            }
                            Icon(Icons.Outlined.PlayArrow, null, tint = foreground, modifier = Modifier.size(22.dp))
                        }
                    }
                    Text(
                        "${message.mediaMimeType ?: "Video"} · ${message.mediaSizeBytes?.let(::formatMediaBytes) ?: "Size unavailable"} · Tap to play",
                        color = foreground.copy(alpha = .72f), fontSize = 10.5.sp,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                    )
                }
            }
        }
        MessageKind.AUDIO -> AudioMessagePlayer(
            message = message, file = audioFile, loading = audioLoading, error = audioError,
            waveform = audioWaveform,
            foreground = foreground, surface = soft, onLoad = onLoadAudio
        )
        MessageKind.DOCUMENT -> {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp)).background(soft).padding(10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(9.dp)
            ) {
                Icon(Icons.Outlined.Description, null, tint = foreground, modifier = Modifier.size(25.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(message.mediaFileName ?: "Document", color = foreground, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(
                        "${message.mediaMimeType ?: "File type unavailable"} · ${message.mediaSizeBytes?.let(::formatMediaBytes) ?: "Size unavailable"}",
                        color = foreground.copy(alpha = .72f), fontSize = 10.5.sp
                    )
                    if (message.mediaUnavailable != null) Text(message.mediaUnavailable, color = StudioPalette.Bad, fontSize = 10.sp)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Open", color = foreground, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable(onClick = onLoadMedia))
                        Text("Download", color = foreground, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable(onClick = onDownloadMedia))
                    }
                }
            }
        }
        MessageKind.CONTACT -> {
            val vCardName = Regex("(?im)^FN[^:]*:(.+)$").find(message.text)?.groupValues?.getOrNull(1)?.trim()
            val firstDisplayLine = message.text.lineSequence()
                .map(String::trim)
                .firstOrNull { it.isNotBlank() && !it.equals("BEGIN:VCARD", true) && !it.equals("END:VCARD", true) && !it.contains(':') }
            val contactName = vCardName?.takeIf { it.isNotBlank() }
                ?: firstDisplayLine
                ?: "Contact"
            val phones = Regex("(?im)^TEL[^:]*:(.+)$").findAll(message.text)
                .map { it.groupValues[1].trim() }.filter { it.isNotBlank() }.distinct().toList()
            val emails = Regex("(?im)^EMAIL[^:]*:(.+)$").findAll(message.text)
                .map { it.groupValues[1].trim() }.filter { it.isNotBlank() }.distinct().toList()
            val addresses = Regex("(?im)^ADR[^:]*:(.+)$").findAll(message.text)
                .map { it.groupValues[1].trim().replace(';', ' ').replace(Regex("\\s+"), " ") }
                .filter { it.isNotBlank() }.distinct().toList()
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp)).background(soft).padding(10.dp),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(9.dp)
            ) {
                Icon(Icons.Outlined.Person, null, tint = foreground, modifier = Modifier.size(25.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text("Contact", color = foreground.copy(alpha = .72f), fontSize = 10.5.sp, fontWeight = FontWeight.SemiBold)
                    Text(contactName, color = foreground, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    phones.forEach { Text("Phone · $it", color = foreground, fontSize = 12.sp, lineHeight = 16.sp) }
                    emails.forEach { Text("Email · $it", color = foreground, fontSize = 12.sp, lineHeight = 16.sp) }
                    addresses.forEach { Text("Address · $it", color = foreground, fontSize = 11.5.sp, lineHeight = 15.sp) }
                    if (phones.isEmpty() && emails.isEmpty() && addresses.isEmpty()) {
                        Text(
                            if (message.text.isBlank()) "Contact details are unavailable."
                            else message.text.lines().filter { it.isNotBlank() }.take(5).joinToString("\\n"),
                            color = foreground.copy(alpha = .82f),
                            fontSize = 11.5.sp,
                            lineHeight = 16.sp
                        )
                    }
                }
            }
        }
        MessageKind.LOCATION -> {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp)).background(soft).padding(10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(9.dp)
            ) {
                Icon(Icons.Outlined.LocationOn, null, tint = foreground, modifier = Modifier.size(24.dp))
                Column(Modifier.weight(1f)) {
                    Text("Location", color = foreground, fontSize = 10.5.sp, fontWeight = FontWeight.SemiBold)
                    Text(message.text.ifBlank { "Location details unavailable." }, color = foreground, fontSize = 13.sp, lineHeight = 18.sp)
                    if (message.text.isNotBlank()) Text("Open map", color = foreground, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable(onClick = onOpenLocation))
                }
            }
        }
        MessageKind.POLL -> {
            val lines = message.text.lineSequence().map(String::trim).filter(String::isNotBlank).toList()
            val question = lines.firstOrNull()?.takeIf { !it.startsWith("•") } ?: "Poll"
            val options = lines.drop(if (lines.firstOrNull() == question) 1 else 0)
                .map { it.removePrefix("•").trim() }.filter(String::isNotBlank)
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(soft).padding(10.dp),
                verticalArrangement = Arrangement.spacedBy(7.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Icon(Icons.Outlined.Poll, null, tint = foreground, modifier = Modifier.size(18.dp))
                    Text("POLL", color = foreground.copy(alpha = .72f), fontSize = 9.5.sp, fontWeight = FontWeight.Bold)
                }
                Text(question, color = foreground, fontSize = appearance.messageSize.sp, fontWeight = FontWeight.SemiBold)
                if (options.isEmpty()) {
                    Text(message.text.ifBlank { "Poll options are not available in this saved message." }, color = foreground, fontSize = 12.sp)
                } else {
                    options.forEach { option ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(7.dp))
                                .background(foreground.copy(alpha = .06f)).padding(horizontal = 9.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Box(Modifier.size(14.dp).border(1.dp, foreground.copy(alpha = .65f), CircleShape))
                            Text(option, color = foreground, fontSize = 12.sp)
                        }
                    }
                }
                Text(
                    "Poll voting is not supported by the connected Aharane API.",
                    color = foreground.copy(alpha = .65f),
                    fontSize = 10.sp
                )
            }
        }
        MessageKind.UNSUPPORTED -> Text(
            message.text.ifBlank { "This WhatsApp message type is not supported by the native viewer." },
            color = foreground.copy(alpha = .8f),
            fontSize = 13.sp
        )
    }
}

@Composable
private fun AudioMessagePlayer(
    message: ChatMessage,
    file: File?,
    loading: Boolean,
    error: String?,
    waveform: List<Float>,
    foreground: Color,
    surface: Color,
    onLoad: () -> Unit
) {
    var player by remember(message.messageId, file) { mutableStateOf<MediaPlayer?>(null) }
    var prepared by remember(message.messageId, file) { mutableStateOf(false) }
    var playing by remember(message.messageId, file) { mutableStateOf(false) }
    var duration by remember(message.messageId, file) { mutableIntStateOf(0) }
    var progress by remember(message.messageId, file) { mutableIntStateOf(0) }
    var speed by remember(message.messageId, file) { mutableFloatStateOf(1f) }
    var playbackError by remember(message.messageId, file) { mutableStateOf<String?>(null) }

    DisposableEffect(message.messageId, file) {
        onDispose {
            runCatching { player?.stop() }
            runCatching { player?.release() }
            player = null
        }
    }
    LaunchedEffect(file) {
        playbackError = null
        if (file != null) {
            runCatching {
                val media = MediaPlayer()
                media.setDataSource(file.absolutePath)
                media.setOnPreparedListener {
                    duration = it.duration.coerceAtLeast(0)
                    prepared = true
                    playbackError = null
                }
                media.setOnErrorListener { _, _, _ ->
                    playing = false
                    prepared = false
                    playbackError = "This Android device could not decode this audio format."
                    true
                }
                media.setOnCompletionListener {
                    playing = false
                    progress = 0
                    runCatching { it.seekTo(0) }
                }
                player = media
                media.prepareAsync()
            }.onFailure {
                prepared = false
                playbackError = it.message ?: "This audio file could not be prepared by Android."
            }
        }
    }
    LaunchedEffect(player, playing, prepared) {
        while (player != null && prepared) {
            if (playing) progress = runCatching { player?.currentPosition ?: 0 }.getOrDefault(progress)
            delay(200)
        }
    }

    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(surface).padding(9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        androidx.compose.material3.IconButton(
            onClick = {
                if (file == null) onLoad()
                else if (prepared) {
                    if (playing) { player?.pause(); playing = false }
                    else { player?.start(); playing = true }
                }
            },
            enabled = !loading
        ) {
            Icon(if (playing) Icons.Outlined.Pause else Icons.Outlined.PlayArrow, if (playing) "Pause audio" else "Play audio", tint = foreground)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                message.mediaFileName ?: if (message.isVoiceNote) "WhatsApp voice note" else "Audio file",
                color = foreground, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis
            )
            if (file == null) {
                Text(
                    error ?: when {
                        loading -> "Loading audio…"
                        else -> "${message.mediaMimeType ?: "Audio"} · Tap play to load"
                    },
                    color = foreground.copy(alpha = .72f),
                    fontSize = 10.5.sp
                )
            } else if (playbackError != null) {
                Text(playbackError!!, color = StudioPalette.Bad, fontSize = 10.5.sp, lineHeight = 15.sp)
            } else if (!prepared) {
                Text("Preparing audio…", color = foreground.copy(alpha = .72f), fontSize = 10.5.sp)
            } else {
                if (message.isVoiceNote && waveform.isNotEmpty()) {
                    Canvas(Modifier.fillMaxWidth().height(28.dp)) {
                        val gap = size.width / (waveform.size * 1.7f)
                        val barWidth = gap * .62f
                        val played = if (duration > 0) progress.toFloat() / duration.toFloat() else 0f
                        waveform.forEachIndexed { index, amplitude ->
                            val height = (size.height * (.12f + amplitude * .82f)).coerceAtMost(size.height)
                            val x = index * gap
                            drawRoundRect(
                                color = if (index.toFloat() / waveform.size <= played) foreground else foreground.copy(alpha = .48f),
                                topLeft = Offset(x, (size.height - height) / 2f),
                                size = Size(barWidth, height),
                                cornerRadius = CornerRadius(barWidth / 2f, barWidth / 2f)
                            )
                        }
                    }
                } else if (message.isVoiceNote) {
                    Text("Waveform unavailable for this audio codec.", color = foreground.copy(alpha = .65f), fontSize = 9.5.sp)
                }
                Slider(
                    value = progress.toFloat().coerceIn(0f, duration.coerceAtLeast(1).toFloat()),
                    onValueChange = { progress = it.toInt() },
                    onValueChangeFinished = { player?.seekTo(progress) },
                    valueRange = 0f..duration.coerceAtLeast(1).toFloat()
                )
                Text(
                    "${formatMediaTime(progress / 1000)} / ${formatMediaTime(duration / 1000)}",
                    color = foreground.copy(alpha = .72f), fontSize = 10.sp
                )
            }
        }
        Text(
            "${speed}×", color = foreground, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.clickable(enabled = prepared) {
                speed = when (speed) { 1f -> 1.5f; 1.5f -> 2f; else -> 1f }
                if (Build.VERSION.SDK_INT >= 23) runCatching { player?.playbackParams = PlaybackParams().setSpeed(speed) }
            }.padding(5.dp)
        )
    }
}

private fun mediaKey(message: ChatMessage): String = "${message.key.account.apiValue}:${message.messageId}"
private fun formatMediaBytes(bytes: Long): String = when {
    bytes >= 1024L * 1024L -> "%.1f MB".format(bytes / (1024.0 * 1024.0))
    bytes >= 1024L -> "%.0f KB".format(bytes / 1024.0)
    else -> "$bytes B"
}
private fun formatMediaTime(seconds: Int): String {
    val safe = seconds.coerceAtLeast(0)
    return "${safe / 60}:${(safe % 60).toString().padStart(2, '0')}"
}

private fun sameDay(a: Long, b: Long): Boolean =
    SimpleDateFormat("yyyyMMdd", Locale.getDefault()).format(Date(a)) ==
        SimpleDateFormat("yyyyMMdd", Locale.getDefault()).format(Date(b))

private fun messageAttachmentLabel(kind: MessageKind): String = when (kind) {
    MessageKind.IMAGE -> "Photo"
    MessageKind.VIDEO -> "Video"
    MessageKind.AUDIO -> "Audio message"
    MessageKind.STICKER -> "Sticker"
    MessageKind.DOCUMENT -> "Document"
    MessageKind.CONTACT -> "Contact"
    MessageKind.LOCATION -> "Location"
    MessageKind.POLL -> "Poll"
    MessageKind.REACTION -> "Reaction"
    MessageKind.RESPONSE -> "Message"
    MessageKind.UNSUPPORTED -> "Attachment"
    MessageKind.TEXT -> "Message"
}

@Composable
private fun StudioPaletteAction(label: String, onClick: () -> Unit) {
    Text(
        label,
        color = StudioPalette.Accent,
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 8.dp)
    )
}

@Composable
private fun appearanceColor(value: String): Color =
    runCatching { Color(android.graphics.Color.parseColor(value)) }.getOrDefault(StudioPalette.Background)

private fun readableAppearanceText(background: Color): Color {
    val luminance = .2126f * background.red + .7152f * background.green + .0722f * background.blue
    return if (luminance > .52f) Color(0xFF17201C) else Color.White
}

private fun appearanceLuminance(color: Color): Float =
    .2126f * color.red + .7152f * color.green + .0722f * color.blue


@Composable
private fun AnimatedMediaPreview(file: File, fallback: ImageBitmap?, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var drawable by remember(file) { mutableStateOf<Drawable?>(null) }
    LaunchedEffect(file) {
        drawable = if (Build.VERSION.SDK_INT >= 28) withContext(Dispatchers.IO) {
            runCatching {
                ImageDecoder.decodeDrawable(ImageDecoder.createSource(file))
            }.getOrNull()
        } else null
    }
    val animation = drawable as? Animatable
    DisposableEffect(animation) {
        animation?.start()
        onDispose { animation?.stop() }
    }
    if (drawable != null) {
        AndroidView(
            factory = { viewContext ->
                ImageView(viewContext).apply {
                    scaleType = ImageView.ScaleType.FIT_CENTER
                    contentDescription = "Animated WhatsApp media"
                }
            },
            update = { it.setImageDrawable(drawable) },
            modifier = modifier
        )
    } else if (fallback != null) {
        Image(fallback, "WhatsApp media preview", modifier, contentScale = ContentScale.Fit)
    } else {
        Text("Animated preview is not supported on this Android version.", modifier = modifier)
    }
}

@Composable
private fun InlineVideoPlayer(file: File, radius: Int) {
    val context = LocalContext.current
    var playbackError by remember(file) { mutableStateOf("") }
    val player = remember(file) {
        VideoView(context).apply {
            val controller = MediaController(context)
            controller.setAnchorView(this)
            setMediaController(controller)
            setVideoPath(file.absolutePath)
            setOnPreparedListener { mediaPlayer ->
                mediaPlayer.isLooping = false
                start()
            }
            setOnErrorListener { _, _, _ ->
                playbackError = "This video codec is not supported by this device."
                true
            }
        }
    }
    DisposableEffect(file, player) {
        onDispose { player.stopPlayback() }
    }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        AndroidView(
            factory = { player },
            modifier = Modifier.fillMaxWidth().height(210.dp)
                .clip(RoundedCornerShape(radius.dp))
        )
        if (playbackError.isNotBlank()) {
            Text(playbackError, color = StudioPalette.Bad, fontSize = 11.sp)
        }
    }
}
