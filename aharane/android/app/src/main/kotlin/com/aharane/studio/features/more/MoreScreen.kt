package com.aharane.studio.features.more

import androidx.activity.compose.BackHandler

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.HelpOutline
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.outlined.Storage
import androidx.compose.material.icons.outlined.Timeline
import androidx.compose.material3.Icon
import androidx.compose.foundation.Image
import androidx.compose.ui.res.painterResource
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import kotlinx.coroutines.delay
import com.aharane.studio.core.design.*
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.model.ChatSummary
import com.aharane.studio.features.chats.ChatAppearanceStore
import com.aharane.studio.features.chats.ChatAppearanceStudioScreen
import com.aharane.studio.core.storage.EncryptedMediaCache

private val AccentChoices = listOf(
    "#0E7A5C", "#3867D6", "#8752C7", "#B34D76", "#B56C22", "#4D7779"
)

@Composable
fun MoreScreen(
    themeMode: String,
    onThemeModeChanged: (String) -> Unit,
    accentColor: String,
    onAccentColorChanged: (String) -> Unit,
    interfaceSize: String,
    onInterfaceSizeChanged: (String) -> Unit,
    cornerStyle: String,
    onCornerStyleChanged: (String) -> Unit,
    rowSpacing: String,
    onRowSpacingChanged: (String) -> Unit,
    editorTheme: String,
    onEditorThemeChanged: (String) -> Unit,
    editorFontSize: Int,
    onEditorFontSizeChanged: (Int) -> Unit,
    editorLineNumbers: Boolean,
    onEditorLineNumbersChanged: (Boolean) -> Unit,
    page: String,
    onPageChange: (String) -> Unit,
    onOpenEnvironment: () -> Unit = {},
    connected: Boolean = false,
    privateAccountStatus: String = "Status not loaded",
    publicAccountStatus: String = "Status not loaded",
    privateOwnerNumber: String = "",
    publicOwnerNumber: String = "",
    publicBotNumber: String = "",
    allowedPublicSenders: String = "",
    activityEntries: List<String> = emptyList(),
    storageSummary: String = "—",
    storageTotalSummary: String = "—",
    storageFreeSummary: String = "—",
    storageMediaSummary: String = "—",
    storageUsageFraction: Float = 0f,
    largestFiles: List<String> = emptyList(),
    folderSummaries: List<String> = emptyList(),
    onAccountAction: (String) -> Unit = {},
    onSaveOwnerSettings: (String, String, String, String) -> Unit = { _, _, _, _ -> },
    onClearActivity: () -> Unit = {},
    onRefreshActivity: () -> Unit = {},
    onCopyActivity: () -> Unit = {},
    onExportActivity: () -> Unit = {},
    onSignOut: () -> Unit = {},
    onChangePassword: (String, String) -> Unit,
    selectedChatAccount: ChatAccount = ChatAccount.PRIVATE,
    showIndividualChats: Boolean = true,
    showGroupChats: Boolean = true,
    starredItems: List<String> = emptyList(),
    chatTheme: String = "system",
    showChatAvatars: Boolean = true,
    showChatPreviews: Boolean = true,
    showChatTimestamps: Boolean = true,
    chatMessageSize: Int = 14,
    launcherIcon: String = "classic",
    onLauncherIconChanged: (String) -> Unit = {},
    onChatAccountSelected: (ChatAccount) -> Unit = {},
    onVisibilityModeChange: (String, Boolean) -> Unit = { _, _ -> },
    onChatAppearanceChange: (String, Boolean, Boolean, Boolean) -> Unit = { _, _, _, _ -> },
    onChatMessageSizeChanged: (Int) -> Unit = {},
    appearanceStore: ChatAppearanceStore? = null,
    appearanceRevision: Int = 0,
    cachedConversations: List<ChatSummary> = emptyList(),
    mediaCache: EncryptedMediaCache? = null,
    onSyncAllChats: () -> Unit = {},
    syncingAllChats: Boolean = false,
    onClearMediaCache: (ChatAccount) -> Unit = {},
    appLockEnabled: Boolean = false,
    onAppLockToggle: (Boolean) -> Unit = {},
    onAppearanceChanged: () -> Unit = {}
) {
    var dialog by rememberSaveable { mutableStateOf("") }
    var customColorOpen by rememberSaveable { mutableStateOf(false) }
    var customHex by rememberSaveable { mutableStateOf(accentColor) }
    var activityQuery by rememberSaveable { mutableStateOf("") }
    var activityFilter by rememberSaveable { mutableStateOf("All") }
    var activityLive by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(page, activityLive, connected) {
        if (page == "activity" && activityLive && connected) {
            while (true) {
                delay(10_000)
                onRefreshActivity()
            }
        }
    }
    var privateOwnerDraft by rememberSaveable { mutableStateOf(privateOwnerNumber) }
    var publicOwnerDraft by rememberSaveable { mutableStateOf(publicOwnerNumber) }
    var publicBotDraft by rememberSaveable { mutableStateOf(publicBotNumber) }
    var allowedSendersDraft by rememberSaveable { mutableStateOf(allowedPublicSenders) }
    var currentPassword by rememberSaveable { mutableStateOf("") }
    var newPassword by rememberSaveable { mutableStateOf("") }

    LaunchedEffect(privateOwnerNumber, publicOwnerNumber, publicBotNumber, allowedPublicSenders) {
        privateOwnerDraft = privateOwnerNumber
        publicOwnerDraft = publicOwnerNumber
        publicBotDraft = publicBotNumber
        allowedSendersDraft = allowedPublicSenders
    }
    val context = LocalContext.current

    LaunchedEffect(page, activityLive, connected) {
        if (page == "activity" && activityLive && connected) {
            while (true) {
                delay(10_000)
                onRefreshActivity()
            }
        } else if (page != "activity" || !connected) {
            activityLive = false
        }
    }

    BackHandler(enabled = page != "more") {
        onPageChange(if (page == "chat-appearance-studio") "chat-settings" else "more")
    }

    if (page == "appearance") {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp)
        ) {
            item {
                StudioPageTitle("Appearance", "Changes apply instantly and are remembered on this phone.")
            }
            item { StudioSectionHeading("App") }
            item {
                StudioCard {
                    Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                        Text("Theme", color = StudioPalette.Ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        Text("Light, dark, or follow your phone.", color = StudioPalette.Muted, fontSize = 12.5.sp)
                        StudioSegmented(
                            options = listOf("System", "Light", "Dark", "AMOLED"),
                            selected = when (themeMode) { "light" -> "Light"; "dark" -> "Dark"; "amoled" -> "AMOLED"; else -> "System" },
                            onSelect = { onThemeModeChanged(it.lowercase()) }
                        )
                        StudioDivider()
                        Text("Accent color", color = StudioPalette.Ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                        Text("Used for active tabs, buttons and highlights.", color = StudioPalette.Muted, fontSize = 12.sp)
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            AccentChoices.forEach { color ->
                                val selected = accentColor.equals(color, ignoreCase = true)
                                val parsed = runCatching { Color(android.graphics.Color.parseColor(color)) }.getOrDefault(StudioPalette.Accent)
                                Box(
                                    Modifier.size(if (selected) 32.dp else 28.dp)
                                        .clip(CircleShape)
                                        .background(parsed)
                                        .then(if (selected) Modifier.border(2.dp, StudioPalette.Ink, CircleShape) else Modifier)
                                        .clickable { onAccentColorChanged(color) },
                                    contentAlignment = Alignment.Center
                                ) {
                                    if (selected) Text("✓", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                            Box(
                                Modifier.size(30.dp).clip(CircleShape)
                                    .background(StudioPalette.Surface)
                                    .border(1.dp, StudioPalette.Line, CircleShape)
                                    .clickable { customHex = accentColor; customColorOpen = true },
                                contentAlignment = Alignment.Center
                            ) {
                                Text("+", color = StudioPalette.Ink, fontSize = 19.sp, fontWeight = FontWeight.Medium)
                            }
                        }
                        StudioDivider()
                        PreferenceChoice(
                            "Interface size",
                            listOf("Small", "Default", "Large", "Largest"),
                            when (interfaceSize) { "small" -> "Small"; "large" -> "Large"; "largest" -> "Largest"; else -> "Default" }
                        ) { choice ->
                            onInterfaceSizeChanged(when (choice) { "Small" -> "small"; "Large" -> "large"; "Largest" -> "largest"; else -> "default" })
                        }
                        StudioDivider()
                        PreferenceChoice(
                            "Corners",
                            listOf("Sharp", "Default", "Round"),
                            when (cornerStyle) { "sharp" -> "Sharp"; "rounded" -> "Round"; else -> "Default" }
                        ) { choice ->
                            onCornerStyleChanged(when (choice) { "Sharp" -> "sharp"; "Round" -> "rounded"; else -> "default" })
                        }
                        StudioDivider()
                        PreferenceChoice(
                            "Spacing",
                            listOf("Compact", "Comfortable", "Roomy"),
                            when (rowSpacing) { "compact" -> "Compact"; "roomy" -> "Roomy"; else -> "Comfortable" }
                        ) { choice ->
                            onRowSpacingChanged(when (choice) { "Compact" -> "compact"; "Roomy" -> "roomy"; else -> "comfortable" })
                        }
                    }
                }
            }
            item { StudioSectionHeading("App icon") }
            item {
                StudioCard(padding = PaddingValues(10.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        LauncherIconOption("Classic", com.aharane.studio.R.drawable.ic_aharane_mark_classic, launcherIcon == "classic") { onLauncherIconChanged("classic") }
                        LauncherIconOption("Mono", com.aharane.studio.R.drawable.ic_aharane_mark_mono, launcherIcon == "mono") { onLauncherIconChanged("mono") }
                        LauncherIconOption("Night", com.aharane.studio.R.drawable.ic_aharane_mark_night, launcherIcon == "night") { onLauncherIconChanged("night") }
                    }
                    Text(
                        "Choose how Aharane appears on your phone’s home screen. Your selection stays on this device.",
                        color = StudioPalette.Muted, fontSize = 12.sp, lineHeight = 17.sp,
                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 8.dp)
                    )
                }
            }
            item { StudioSectionHeading("Code editor") }
            item {
                StudioCard {
                    Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Color scheme", color = StudioPalette.Ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                        StudioSegmented(
                            options = listOf("Dark+", "AMOLED", "Light"),
                            selected = editorTheme,
                            onSelect = onEditorThemeChanged
                        )
                        StudioDivider()
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Font size", color = StudioPalette.Ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.weight(1f))
                            Text("$editorFontSize px", color = StudioPalette.Muted, fontSize = 12.sp)
                        }
                        StudioPreferenceSlider(
                            value = editorFontSize.toFloat(),
                            onValueChange = { onEditorFontSizeChanged(it.toInt()) },
                            valueRange = 11f..20f,
                            steps = 8
                        )
                        StudioDivider()
                        PreferenceSwitch(
                            title = "Line numbers",
                            description = "Show the numbered gutter beside your code.",
                            checked = editorLineNumbers,
                            onCheckedChange = onEditorLineNumbersChanged
                        )
                    }
                }
            }
            item {
                Row(Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 16.dp)) {
                    StudioActionButton(
                        "Reset to defaults",
                        compact = true,
                        onClick = {
                            onThemeModeChanged("system")
                            onAccentColorChanged("#0E7A5C")
                            onLauncherIconChanged("classic")
                            onInterfaceSizeChanged("default")
                            onCornerStyleChanged("default")
                            onRowSpacingChanged("comfortable")
                            onEditorThemeChanged("Dark+")
                            onEditorFontSizeChanged(14)
                            onEditorLineNumbersChanged(true)
                        }
                    )
                }
            }
        }
    } else if (page == "chat-settings") {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Spacer(Modifier.height(12.dp))
                StudioPageTitle("Chat settings", "Manage your inbox and conversation appearance here.")
                Spacer(Modifier.height(14.dp))
            }
            item {
                StudioCard(padding = PaddingValues(18.dp)) {
                    Text("WhatsApp account", color = StudioPalette.Ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(8.dp))
                    StudioSegmented(
                        options = listOf("Private", "Public"),
                        selected = selectedChatAccount.label,
                        onSelect = { label ->
                            onChatAccountSelected(if (label == "Public") ChatAccount.PUBLIC else ChatAccount.PRIVATE)
                        }
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Inbox visibility is configured separately for each account.",
                        color = StudioPalette.Muted,
                        fontSize = 12.sp,
                        lineHeight = 16.sp
                    )
                }
            }
            item {
                StudioSectionHeading("Inbox visibility")
                StudioCard(padding = PaddingValues(18.dp)) {
                    PreferenceSwitch(
                        title = "Show individual chats",
                        description = "Include one-to-one conversations in this account’s inbox.",
                        checked = showIndividualChats,
                        enabled = connected,
                        onCheckedChange = { onVisibilityModeChange("individuals", it) }
                    )
                    StudioDivider()
                    PreferenceSwitch(
                        title = "Show groups",
                        description = "Include group conversations in this account’s inbox.",
                        checked = showGroupChats,
                        enabled = connected,
                        onCheckedChange = { onVisibilityModeChange("groups", it) }
                    )
                    if (!connected) {
                        Text(
                            "Connect to your Aharane server to change inbox visibility.",
                            color = StudioPalette.Muted,
                            fontSize = 11.5.sp,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                }
            }
            item {
                StudioSectionHeading("Chat appearance")
                StudioCard(padding = PaddingValues(18.dp)) {
                    Text("Theme", color = StudioPalette.Ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                    StudioSegmented(
                        options = listOf("System", "Light", "Dark"),
                        selected = when (chatTheme.lowercase()) {
                            "light" -> "Light"
                            "dark" -> "Dark"
                            else -> "System"
                        },
                        onSelect = {
                            onChatAppearanceChange(it.lowercase(), showChatAvatars, showChatPreviews, showChatTimestamps)
                        }
                    )
                    Spacer(Modifier.height(12.dp))
                    StudioDivider()
                    PreferenceSwitch(
                        title = "Show avatars",
                        description = "Display contact and group avatars in the inbox.",
                        checked = showChatAvatars,
                        enabled = true,
                        onCheckedChange = {
                            onChatAppearanceChange(chatTheme, it, showChatPreviews, showChatTimestamps)
                        }
                    )
                    StudioDivider()
                    PreferenceSwitch(
                        title = "Show message previews",
                        description = "Show the latest message under each chat name.",
                        checked = showChatPreviews,
                        enabled = true,
                        onCheckedChange = {
                            onChatAppearanceChange(chatTheme, showChatAvatars, it, showChatTimestamps)
                        }
                    )
                    StudioDivider()
                    PreferenceSwitch(
                        title = "Show timestamps",
                        description = "Show the last-message time on each inbox row.",
                        checked = showChatTimestamps,
                        enabled = true,
                        onCheckedChange = {
                            onChatAppearanceChange(chatTheme, showChatAvatars, showChatPreviews, it)
                        }
                    )
                    Text(
                        "These appearance choices stay on this phone and also work offline.",
                        color = StudioPalette.Muted,
                        fontSize = 11.5.sp,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            }
            item {
                StudioSectionHeading("Offline chat storage")
                StudioCard(padding = PaddingValues(18.dp)) {
                    val accountKey = selectedChatAccount.apiValue
                    var cacheLimitMb by rememberSaveable(accountKey) {
                        mutableIntStateOf(((mediaCache?.maximumCacheBytes(accountKey) ?: 536870912L) / (1024L * 1024L)).toInt())
                    }
                    val cachedBytes = remember(appearanceRevision, accountKey) {
                        mediaCache?.cacheSizeBytes(accountKey) ?: 0L
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Encrypted media cache", color = StudioPalette.Ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.weight(1f))
                        SliderValueChip(formatStorageBytes(cacheLimitMb.toLong() * 1024L * 1024L))
                    }
                    Text(
                        "Saved media: ${formatStorageBytes(cachedBytes)} · Limit: ${formatStorageBytes(cacheLimitMb.toLong() * 1024L * 1024L)}",
                        color = StudioPalette.Muted, fontSize = 12.sp,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                    StudioPreferenceSlider(
                        value = cacheLimitMb.toFloat(),
                        onValueChange = { cacheLimitMb = it.toInt().coerceIn(100, 2048) },
                        valueRange = 100f..2048f,
                        steps = 18,
                        onValueChangeFinished = { mediaCache?.setMaximumCacheMegabytes(accountKey, cacheLimitMb) }
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StudioActionButton("Clear cache", modifier = Modifier.weight(1f), primary = false, onClick = {
                            onClearMediaCache(selectedChatAccount)
                        })
                        StudioActionButton(if (syncingAllChats) "Syncing…" else "Sync all chats", modifier = Modifier.weight(1f), primary = true, enabled = connected && !syncingAllChats, onClick = onSyncAllChats)
                    }
                    Text(
                        "Only completed, verified attachments are marked offline-ready. View-once media is never cached.",
                        color = StudioPalette.Muted, fontSize = 11.sp, lineHeight = 15.sp,
                        modifier = Modifier.padding(top = 6.dp)
                    )
                }
            }
            item {
                StudioSectionHeading("Advanced appearance")
                StudioCard(padding = PaddingValues(18.dp)) {
                    Text("Chat Appearance Studio", color = StudioPalette.Ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    Text(
                        "Wallpapers, bubbles, typography, layout, media styling and reusable theme profiles.",
                        color = StudioPalette.Muted, fontSize = 12.sp, lineHeight = 17.sp,
                        modifier = Modifier.padding(top = 4.dp, bottom = 10.dp)
                    )
                    StudioActionButton("Open Appearance Studio", modifier = Modifier.fillMaxWidth(), primary = true, onClick = { onPageChange("chat-appearance-studio") })
                    Text(
                        "Global defaults, separate Private/Public overrides and individual conversation customisation.",
                        color = StudioPalette.Muted, fontSize = 11.sp, lineHeight = 15.sp,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            }
            item {
                StudioSectionHeading("Message text size")
                StudioCard(padding = PaddingValues(18.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Message text", color = StudioPalette.Ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.weight(1f))
                        Text("${chatMessageSize} sp", color = StudioPalette.Muted, fontSize = 12.sp)
                    }
                    StudioPreferenceSlider(
                        value = chatMessageSize.toFloat(),
                        onValueChange = { onChatMessageSizeChanged(it.toInt()) },
                        valueRange = 12f..22f,
                        steps = 9
                    )
                    Text(
                        "Changes the size of message text inside conversations.",
                        color = StudioPalette.Muted,
                        fontSize = 12.sp,
                        lineHeight = 16.sp
                    )
                }
            }
        }
    } else if (page == "chat-appearance-studio") {
        if (appearanceStore != null) {
            ChatAppearanceStudioScreen(
                account = selectedChatAccount,
                conversations = cachedConversations,
                store = appearanceStore,
                revision = appearanceRevision,
                onChanged = onAppearanceChanged,
                onBack = { onPageChange("chat-settings") }
            )
        } else {
            Column(Modifier.fillMaxSize().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Appearance preferences are unavailable.", color = StudioPalette.Ink, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Text("The local appearance store could not be opened.", color = StudioPalette.Muted, fontSize = 12.sp)
            }
        }
    } else if (page == "starred") {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp)
        ) {
            item {
                Spacer(Modifier.height(12.dp))
                StudioPageTitle("Starred messages", "Saved messages from the ${selectedChatAccount.label} WhatsApp account.")
                Spacer(Modifier.height(14.dp))
            }
            item {
                StudioCard {
                    if (!connected || starredItems.isEmpty()) {
                        StudioEmpty(
                            title = "No starred messages.",
                            description = if (connected) "Star a message inside a conversation to keep it here."
                            else "Connect to your Aharane server to load starred messages."
                        )
                    } else {
                        starredItems.take(100).forEachIndexed { index, item ->
                            if (index > 0) StudioDivider()
                            Text(
                                item,
                                color = StudioPalette.Ink,
                                fontSize = 12.5.sp,
                                lineHeight = 18.sp,
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 13.dp, vertical = 10.dp)
                            )
                        }
                    }
                }
            }
        }
    } else if (page == "accounts") {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp)
        ) {
            item {
                Spacer(Modifier.height(12.dp))
                StudioPageTitle("Accounts", "Two independent WhatsApp sessions. Pairing numbers are saved in Configuration.")
                Spacer(Modifier.height(14.dp))
            }
            item {
                StudioCard {
                    StudioRow(
                        title = "Private account",
                        subtitle = privateAccountStatus,
                        trailingContent = {
                            StudioActionButton(
                                if (privateAccountStatus.equals("Connected", true)) "Manage" else if (privateAccountStatus.contains("paired", true)) "Reconnect" else "Link account",
                                compact = true,
                                enabled = connected,
                                onClick = { onAccountAction("private") }
                            )
                        }
                    )
                    StudioDivider()
                    StudioRow(
                        title = "Public account",
                        subtitle = publicAccountStatus,
                        trailingContent = {
                            StudioActionButton(
                                if (publicAccountStatus.equals("Connected", true)) "Manage" else if (publicAccountStatus.contains("paired", true)) "Reconnect" else "Link account",
                                compact = true,
                                enabled = connected,
                                onClick = { onAccountAction("public") }
                            )
                        }
                    )
                }
            }
            item { StudioSectionHeading("Owner identities") }
            item {
                StudioCard(padding = PaddingValues(14.dp)) {
                    OwnerNumberField("Private Owner number", privateOwnerDraft, connected) { privateOwnerDraft = it }
                    Spacer(Modifier.height(12.dp))
                    OwnerNumberField("Public Owner number", publicOwnerDraft, connected) { publicOwnerDraft = it }
                    Spacer(Modifier.height(12.dp))
                    OwnerNumberField("Public bot WhatsApp number", publicBotDraft, connected) { publicBotDraft = it }
                    Spacer(Modifier.height(12.dp))
                    OwnerNumberField("Allowed public senders (comma separated)", allowedSendersDraft, connected) { allowedSendersDraft = it }
                    Spacer(Modifier.height(14.dp))
                    StudioActionButton(
                        "Save owner settings",
                        primary = true,
                        enabled = connected,
                        onClick = { onSaveOwnerSettings(privateOwnerDraft, publicOwnerDraft, publicBotDraft, allowedSendersDraft) }
                    )
                    if (!connected) Text(
                        "Connect to your Aharane server to load or save owner identities.",
                        color = StudioPalette.Muted,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            }
        }
    } else if (page == "activity") {    } else if (page == "activity") {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp)
        ) {
            item {
                Spacer(Modifier.height(12.dp))
                StudioPageTitle("Activity and logs", if (connected) "Recent activity from your Aharane server." else "No server activity is available while disconnected.")
                Text(
                    "${activityEntries.size} entries",
                    color = StudioPalette.Muted,
                    fontSize = 12.5.sp,
                    modifier = Modifier.padding(top = 5.dp, bottom = 12.dp)
                )
            }
            item {
                StudioSearchField(
                    value = activityQuery,
                    onValueChange = { activityQuery = it },
                    placeholder = "Search logs"
                )
                Spacer(Modifier.height(12.dp))
            }
            item {
                StudioSegmented(
                    options = listOf("All", "Info", "Warnings", "Errors"),
                    selected = activityFilter,
                    onSelect = { activityFilter = it }
                )
                Spacer(Modifier.height(12.dp))
            }
            item {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    StudioActionButton(if (activityLive) "Pause live" else "Live", compact = true, enabled = connected, onClick = {
                        activityLive = !activityLive
                        if (!activityLive) onRefreshActivity()
                    })
                    StudioActionButton("Copy", compact = true, enabled = connected && activityEntries.isNotEmpty(), onClick = onCopyActivity)
                    StudioActionButton("Export", compact = true, enabled = connected && activityEntries.isNotEmpty(), onClick = onExportActivity)
                    StudioActionButton("Clear", compact = true, destructive = true, enabled = connected && activityEntries.isNotEmpty(), onClick = onClearActivity)
                }
                Spacer(Modifier.height(12.dp))
            }
            item {
                StudioCard {
                    val filtered = activityEntries.filter { line ->
                        (activityQuery.isBlank() || line.contains(activityQuery, ignoreCase = true)) &&
                            (activityFilter == "All" || line.contains(activityFilter, ignoreCase = true))
                    }
                    if (filtered.isEmpty()) {
                        StudioEmpty(
                            title = if (activityQuery.isBlank()) "No log entries yet." else "No log entries match.",
                            description = if (connected) "No activity matches the selected filter." else "Connect to your Aharane server to load activity, warnings, errors and diagnostic details."
                        )
                    } else {
                        filtered.take(60).forEachIndexed { index, line ->
                            if (index > 0) StudioDivider()
                            Text(
                                line,
                                color = StudioPalette.Ink,
                                fontSize = 12.5.sp,
                                lineHeight = 18.sp,
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 13.dp, vertical = 9.dp)
                            )
                        }
                    }
                }
            }
        }
    } else if (page == "storage") {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp)
        ) {
            item {
                Spacer(Modifier.height(12.dp))
                StudioPageTitle("Storage", "What the bot’s files take up.")
                Spacer(Modifier.height(14.dp))
            }
            item {
                StudioCard(padding = PaddingValues(18.dp)) {
                    Text(if (connected) storageSummary else "—", color = StudioPalette.Ink, fontSize = 28.sp, fontWeight = FontWeight.Bold)
                    Text(if (connected) "Used on the Aharane server" else "Connect to load server storage", color = StudioPalette.Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 2.dp))
                    Box(
                        Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 12.dp)
                            .height(7.dp).clip(RoundedCornerShape(6.dp)).background(StudioPalette.Line)
                    ) {
                        Box(
                            Modifier.fillMaxWidth(storageUsageFraction.coerceIn(0f, 1f))
                                .fillMaxHeight().background(StudioPalette.Accent)
                        )
                    }
                    listOf(
                        "Total space" to storageTotalSummary,
                        "Free space" to storageFreeSummary,
                        "Media files" to storageMediaSummary
                    ).forEach { (label, value) ->
                        Row(
                            Modifier.fillMaxWidth().heightIn(min = 36.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(label, color = StudioPalette.Ink, fontSize = 13.sp, modifier = Modifier.weight(1f))
                            Text(if (connected) value else "—", color = StudioPalette.Muted, fontSize = 12.sp)
                        }
                    }
                }
            }
            item {
                StudioSectionHeading("Largest files")
                StudioCard {
                    if (!connected || largestFiles.isEmpty()) {
                        StudioEmpty("No file sizes available.", if (connected) "The server has not returned file sizes for the current workspace." else "Connect to browse file sizes and storage use.")
                    } else {
                        largestFiles.take(5).forEachIndexed { index, line ->
                            if (index > 0) StudioDivider()
                            Text(line, color = StudioPalette.Ink, fontSize = 12.5.sp, modifier = Modifier.fillMaxWidth().padding(horizontal = 13.dp, vertical = 10.dp))
                        }
                    }
                }
            }
            item {
                StudioSectionHeading("By folder")
                StudioCard {
                    if (!connected || folderSummaries.isEmpty()) {
                        StudioEmpty("No folder sizes available.", if (connected) "No folder sizes were returned from the current file tree." else "Connect to browse folder sizes.")
                    } else {
                        folderSummaries.take(8).forEachIndexed { index, line ->
                            if (index > 0) StudioDivider()
                            Text(line, color = StudioPalette.Ink, fontSize = 12.5.sp, modifier = Modifier.fillMaxWidth().padding(horizontal = 13.dp, vertical = 10.dp))
                        }
                    }
                }
            }
            item {
                StudioSectionHeading("MEGA backup setup")
                StudioCard {
                    Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("MEGA", color = StudioPalette.Ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.weight(1f))
                            Text("Setup guidance", color = StudioPalette.Muted, fontSize = 11.sp)
                        }
                        Text(
                            "This section does not verify a live MEGA session or run a backup. Configure these values only when the server-side MEGA integration is enabled; credentials remain in ENV.",
                            color = StudioPalette.Muted,
                            fontSize = 12.5.sp,
                            lineHeight = 18.sp
                        )
                        StudioActionButton("Open ENV", onClick = onOpenEnvironment)
                    }
                }
            }
            item { Spacer(Modifier.height(14.dp)) }
        }
    } else {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(0.dp)
        ) {
            item { StudioPageTitle("More", "Additional tools and information") }

            item {
                Spacer(Modifier.height(18.dp))
                StudioCard {
                    StudioRow(
                        "Accounts & owners",
                        "Pair the two WhatsApp sessions and set their separate Owner identities",
                        icon = null,
                        trailing = "›",
                        onClick = { onPageChange("accounts") }
                    )
                }
            }

            item { StudioSectionHeading("Tools") }
            item {
                StudioCard {
                    StudioRow(
                        "Activity and logs",
                        "Review bot activity and diagnostic records",
                        icon = null,
                        trailing = "›",
                        onClick = { onPageChange("activity") }
                    )
                    StudioDivider()
                    StudioRow(
                        "Storage information",
                        "View disk and storage usage",
                        icon = null,
                        trailing = "›",
                        onClick = { onPageChange("storage") }
                    )
                    StudioDivider()
                    StudioRow(
                        "Starred messages",
                        "Messages you have saved from your chats",
                        icon = null,
                        trailing = "›",
                        onClick = { onPageChange("starred") }
                    )
                }
            }

            item { StudioSectionHeading("Preferences") }
            item {
                StudioCard {
                    StudioRow(
                        "Appearance",
                        "App theme, icon, accent color and editor",
                        icon = null,
                        trailing = "›",
                        onClick = { onPageChange("appearance") }
                    )
                    StudioDivider()
                    PreferenceSwitch(
                        title = "Require device unlock",
                        description = "Lock Aharane when you leave it. Unlock with this phone’s PIN, pattern or password.",
                        checked = appLockEnabled,
                        enabled = true,
                        onCheckedChange = onAppLockToggle
                    )
                    StudioDivider()
                    StudioRow(
                        "Chat settings",
                        "Inbox visibility, themes and message text",
                        icon = null,
                        trailing = "›",
                        onClick = { onPageChange("chat-settings") }
                    )
                }
            }

            item { StudioSectionHeading("Support") }
            item {
                StudioCard {
                    StudioRow(
                        "Help",
                        "Guidance for using Aharane Studio",
                        icon = null,
                        trailing = "›",
                        onClick = { dialog = "help" }
                    )
                    StudioDivider()
                    StudioRow(
                        "About Aharane",
                        "Version and application information",
                        icon = null,
                        trailing = "›",
                        onClick = { dialog = "about" }
                    )
                }
            }
            item {
                Row(
                    Modifier.fillMaxWidth().padding(top = 16.dp, bottom = 18.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    StudioActionButton("Change password", compact = true, enabled = connected, onClick = { dialog = "password-change" })
                    StudioActionButton("Sign out", compact = true, destructive = true, enabled = connected, onClick = onSignOut)
                }
            }
        }
    }

    if (customColorOpen) {
        Dialog(onDismissRequest = { customColorOpen = false }) {
            Column(
                Modifier.fillMaxWidth().heightIn(max = 720.dp).verticalScroll(rememberScrollState())
                    .clip(RoundedCornerShape(20.dp))
                    .background(StudioPalette.Surface).padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("Choose your accent", color = StudioPalette.Ink, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                Text("Pick a colour visually or enter its exact hex value.", color = StudioPalette.Muted, fontSize = 12.5.sp, lineHeight = 18.sp)
                StudioColorWheel(colorHex = customHex, onColorChanged = { customHex = it })
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    val preview = runCatching { Color(android.graphics.Color.parseColor(customHex.trim())) }.getOrDefault(StudioPalette.Accent)
                    Box(Modifier.size(42.dp).clip(RoundedCornerShape(11.dp)).background(preview).border(1.dp, StudioPalette.Line, RoundedCornerShape(11.dp)))
                    Column(Modifier.weight(1f)) {
                        Text("Hex value", color = StudioPalette.Ink, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
                        StudioTextInput(
                            value = customHex,
                            onValueChange = { value ->
                                customHex = value.trim().let { if (it.isNotEmpty() && !it.startsWith("#")) "#$it" else it }
                            },
                            placeholder = "#RRGGBB",
                            singleLine = true,
                            textSize = 14.sp
                        )
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.align(Alignment.End)) {
                    StudioActionButton("Cancel", compact = true, onClick = { customColorOpen = false })
                    StudioActionButton(
                        "Apply",
                        compact = true,
                        primary = true,
                        enabled = Regex("^#?[0-9A-Fa-f]{6}$").matches(customHex.trim()),
                        onClick = {
                            val value = customHex.trim().let { if (it.startsWith("#")) it else "#$it" }
                            onAccentColorChanged(value.uppercase())
                            customColorOpen = false
                        }
                    )
                }
            }
        }
    }

    if (dialog.isNotEmpty()) {
        Dialog(onDismissRequest = { dialog = "" }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
                    .background(StudioPalette.Surface).padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                when (dialog) {
                    "help" -> {
                        Text("Help", color = StudioPalette.Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        HelpItem("Accounts", "Private and Public WhatsApp sessions are kept separate.")
                        HelpItem("Files", "Connect your server to browse and edit source files in the native full-screen editor.")
                        HelpItem("ENV", "Add local environment drafts and mark sensitive values as secrets.")
                        HelpItem("Chats", "Connect your server to load real conversations. Opening a chat must not send read receipts or presence.")
                    }
                    "password-change" -> {
                        Text("Change Studio password", color = StudioPalette.Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        PasswordField("Current password", currentPassword) { currentPassword = it }
                        PasswordField("New password (12–128 characters)", newPassword) { newPassword = it }
                        Text(
                            "Your new password also applies to the Aharane web Studio.",
                            color = StudioPalette.Muted,
                            fontSize = 12.sp,
                            lineHeight = 17.sp
                        )
                    }
                    "about" -> {
                        Text("About Aharane", color = StudioPalette.Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Box(Modifier.size(38.dp).clip(RoundedCornerShape(11.dp)).background(StudioPalette.Accent),
                                contentAlignment = Alignment.Center) {
                                Text("A", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                            }
                            Column {
                                Text("Aharane Local Studio", color = StudioPalette.Ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                Text("Native Android · 0.1.0", color = StudioPalette.Muted, fontSize = 12.5.sp)
                            }
                        }
                        Text(
                            "A native Kotlin and Jetpack Compose companion for Aharane Local Studio. It connects to the same authenticated server, WhatsApp sessions and workspace as the web Studio.",
                            color = StudioPalette.Muted, fontSize = 13.sp, lineHeight = 19.sp
                        )
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    if (dialog == "password-change") {
                        StudioActionButton("Cancel", compact = true, onClick = { dialog = ""; currentPassword = ""; newPassword = "" })
                        Spacer(Modifier.width(8.dp))
                        StudioActionButton(
                            "Change password",
                            compact = true,
                            primary = true,
                            enabled = currentPassword.isNotBlank() && newPassword.toByteArray(Charsets.UTF_8).size in 12..128,
                            onClick = {
                                onChangePassword(currentPassword, newPassword)
                                dialog = ""
                                currentPassword = ""
                                newPassword = ""
                            }
                        )
                    } else {
                        StudioActionButton("Close", primary = true, onClick = { dialog = "" })
                    }
                }
            }
        }
    }
}

private fun formatStorageBytes(bytes: Long): String = when {
    bytes >= 1024L * 1024L * 1024L -> String.format(java.util.Locale.ROOT, "%.1f GB", bytes / (1024.0 * 1024.0 * 1024.0))
    bytes >= 1024L * 1024L -> String.format(java.util.Locale.ROOT, "%.1f MB", bytes / (1024.0 * 1024.0))
    bytes >= 1024L -> String.format(java.util.Locale.ROOT, "%.1f KB", bytes / 1024.0)
    else -> "$bytes B"
}

@Composable
private fun RowScope.LauncherIconOption(
    label: String,
    iconRes: Int,
    selected: Boolean,
    onClick: () -> Unit
) {
    Column(
        Modifier.weight(1f).clip(RoundedCornerShape(12.dp))
            .background(if (selected) StudioPalette.Soft else StudioPalette.Background)
            .border(
                if (selected) 1.5.dp else 1.dp,
                if (selected) StudioPalette.Accent else StudioPalette.Line,
                RoundedCornerShape(12.dp)
            )
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp, horizontal = 5.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(7.dp)
    ) {
        Image(painterResource(iconRes), contentDescription = "$label Aharane app icon", modifier = Modifier.size(52.dp))
        Text(label, color = if (selected) StudioPalette.Accent else StudioPalette.Ink, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        if (selected) Text("Selected", color = StudioPalette.Accent, fontSize = 10.sp)
    }
}

@Composable
private fun PreferenceChoice(
    title: String,
    options: List<String>,
    selected: String,
    onSelected: (String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text(title, color = StudioPalette.Ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
        StudioSegmented(options = options, selected = selected, onSelect = onSelected)
    }
}

@Composable
private fun PreferenceSwitch(
    title: String,
    description: String,
    checked: Boolean,
    enabled: Boolean = true,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        Modifier.fillMaxWidth().defaultMinSize(minHeight = 58.dp)
            .toggleable(value = checked, enabled = enabled, role = Role.Switch, onValueChange = onCheckedChange)
            .padding(vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, color = if (enabled) StudioPalette.Ink else StudioPalette.Muted, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
            Text(description, color = StudioPalette.Muted, fontSize = 12.sp, lineHeight = 16.sp)
        }
        Switch(
            checked = checked,
            onCheckedChange = null,
            enabled = enabled,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Color.White,
                checkedTrackColor = StudioPalette.Accent,
                uncheckedThumbColor = StudioPalette.Muted,
                uncheckedTrackColor = StudioPalette.Line
            )
        )
    }
}

@Composable
private fun SliderValueChip(value: String) {
    Box(
        Modifier.clip(RoundedCornerShape(99.dp))
            .background(StudioPalette.Background)
            .border(1.dp, StudioPalette.Line, RoundedCornerShape(99.dp))
            .padding(horizontal = 9.dp, vertical = 4.dp)
    ) {
        Text(value, color = StudioPalette.Accent, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun StudioPreferenceSlider(
    value: Float,
    onValueChange: (Float) -> Unit,
    valueRange: ClosedFloatingPointRange<Float>,
    steps: Int = 0,
    onValueChangeFinished: () -> Unit = {}
) {
    Slider(
        value = value.coerceIn(valueRange),
        onValueChange = onValueChange,
        onValueChangeFinished = onValueChangeFinished,
        valueRange = valueRange,
        steps = steps,
        modifier = Modifier.fillMaxWidth().height(52.dp),
        colors = SliderDefaults.colors(
            thumbColor = StudioPalette.Accent,
            activeTrackColor = StudioPalette.Accent,
            inactiveTrackColor = StudioPalette.Line,
            activeTickColor = StudioPalette.Surface,
            inactiveTickColor = StudioPalette.Muted.copy(alpha = 0.32f)
        )
    )
}

@Composable
private fun DisabledPreference(title: String, description: String, value: String? = null) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, color = StudioPalette.Ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
            Text(description, color = StudioPalette.Muted, fontSize = 12.sp, lineHeight = 16.sp)
        }
        if (value != null) Text(value, color = StudioPalette.Muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        else StudioTag("Not available")
    }
}

@Composable
private fun HelpItem(title: String, description: String) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(title, color = StudioPalette.Ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
        Text(description, color = StudioPalette.Muted, fontSize = 12.5.sp, lineHeight = 18.sp)
    }
}

@Composable
private fun OwnerNumberField(
    label: String,
    value: String,
    enabled: Boolean,
    onValueChange: (String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(label, color = StudioPalette.Ink, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            readOnly = !enabled,
            singleLine = true,
            cursorBrush = SolidColor(StudioPalette.Accent),
            textStyle = androidx.compose.ui.text.TextStyle(
                color = if (enabled) StudioPalette.Ink else StudioPalette.Muted,
                fontSize = 14.sp
            ),
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp))
                .background(StudioPalette.Background)
                .border(1.dp, StudioPalette.Line, RoundedCornerShape(9.dp))
                .padding(horizontal = 11.dp, vertical = 10.dp)
        )
    }
}

@Composable
private fun PasswordField(label: String, value: String, onValueChange: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(label, color = StudioPalette.Ink, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
            cursorBrush = SolidColor(StudioPalette.Accent),
            textStyle = androidx.compose.ui.text.TextStyle(color = StudioPalette.Ink, fontSize = 14.sp),
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp))
                .background(StudioPalette.Background)
                .border(1.dp, StudioPalette.Line, RoundedCornerShape(9.dp))
                .padding(horizontal = 11.dp, vertical = 10.dp)
        )
    }
}

