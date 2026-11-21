package com.aharane.studio.features.configuration

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import kotlinx.coroutines.launch
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.*

private data class PreviewConfiguration(
    val botName: String,
    val prefix: String,
    val ownerNumber: String,
    val autoRead: Boolean,
    val showTyping: Boolean,
    val rejectCalls: Boolean,
    val alwaysOnline: Boolean,
    val cooldown: String,
    val welcomeMessage: String
)

private fun previewConfiguration(profile: String) = if (profile == "Public") {
    PreviewConfiguration(
        botName = "Aharane Public",
        prefix = "!",
        ownerNumber = "15557654321",
        autoRead = false,
        showTyping = true,
        rejectCalls = true,
        alwaysOnline = false,
        cooldown = "5",
        welcomeMessage = "Hi! Send !menu to see what I can do."
    )
} else {
    PreviewConfiguration(
        botName = "Aharane",
        prefix = ".",
        ownerNumber = "15551234567",
        autoRead = true,
        showTyping = true,
        rejectCalls = true,
        alwaysOnline = false,
        cooldown = "3",
        welcomeMessage = "Welcome, @user! Type .menu to see what I can do."
    )
}

@Composable
fun ConfigurationScreen(
    onBack: () -> Unit,
    onEditConfig: () -> Unit,
    previewMode: Boolean = false,
    connected: Boolean = false,
    serverValues: Map<String, String> = emptyMap(),
    ownerNumberValue: String = "",
    onSave: suspend (String, Map<String, String>) -> Boolean = { _, _ -> false }
) {
    var profile by rememberSaveable { mutableStateOf("Private") }
    val initial = remember(profile, previewMode, connected, serverValues, ownerNumberValue) {
        if (previewMode) previewConfiguration(profile)
        else if (connected) {
            val prefix = if (profile == "Private") "PRIVATE_" else "PUBLIC_"
            PreviewConfiguration(
                botName = serverValues[prefix + "BOT_NAME"].orEmpty(),
                prefix = serverValues[prefix + "COMMAND_PREFIX"].orEmpty(),
                ownerNumber = if (profile == "Private") serverValues["PRIVATE_OWNER_NUMBER"] ?: ownerNumberValue else serverValues["PUBLIC_BOT_NUMBER"] ?: ownerNumberValue,
                autoRead = serverValues[prefix + "AUTO_READ"].equals("true", true),
                showTyping = serverValues[prefix + "SHOW_TYPING"].equals("true", true),
                rejectCalls = serverValues[prefix + "REJECT_CALLS"].equals("true", true),
                alwaysOnline = serverValues[prefix + "ALWAYS_ONLINE"].equals("true", true),
                cooldown = serverValues[prefix + "COMMAND_COOLDOWN"].orEmpty(),
                welcomeMessage = serverValues[prefix + "WELCOME_MESSAGE"].orEmpty()
            )
        } else PreviewConfiguration("", "", "", false, false, false, false, "", "")
    }
    var botName by rememberSaveable(profile, previewMode) { mutableStateOf(initial.botName) }
    var prefix by rememberSaveable(profile, previewMode) { mutableStateOf(initial.prefix) }
    var ownerNumber by rememberSaveable(profile, previewMode) { mutableStateOf(initial.ownerNumber) }
    var autoRead by rememberSaveable(profile, previewMode) { mutableStateOf(initial.autoRead) }
    var showTyping by rememberSaveable(profile, previewMode) { mutableStateOf(initial.showTyping) }
    var rejectCalls by rememberSaveable(profile, previewMode) { mutableStateOf(initial.rejectCalls) }
    var alwaysOnline by rememberSaveable(profile, previewMode) { mutableStateOf(initial.alwaysOnline) }
    var cooldown by rememberSaveable(profile, previewMode) { mutableStateOf(initial.cooldown) }
    var welcomeMessage by rememberSaveable(profile, previewMode) { mutableStateOf(initial.welcomeMessage) }
    var dirty by rememberSaveable(profile, previewMode) { mutableStateOf(false) }
    val context = LocalContext.current
    val saveScope = rememberCoroutineScope()
    var saving by remember { mutableStateOf(false) }
    val editable = previewMode || connected

    fun resetDraft() {
        botName = initial.botName
        prefix = initial.prefix
        ownerNumber = initial.ownerNumber
        autoRead = initial.autoRead
        showTyping = initial.showTyping
        rejectCalls = initial.rejectCalls
        alwaysOnline = initial.alwaysOnline
        cooldown = initial.cooldown
        welcomeMessage = initial.welcomeMessage
        dirty = false
    }

    LaunchedEffect(initial) {
        if (!dirty) resetDraft()
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        item {
            Text(
                "‹  Back to Home",
                color = StudioPalette.Accent,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clip(RoundedCornerShape(8.dp))
                    .clickable(onClick = onBack).padding(vertical = 6.dp)
            )
            Spacer(Modifier.height(9.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Configuration",
                    color = StudioPalette.Ink,
                    fontFamily = androidx.compose.material3.MaterialTheme.typography.headlineLarge.fontFamily,
                    fontSize = 30.sp,
                    lineHeight = 33.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = (-0.75).sp,
                    modifier = Modifier.weight(1f)
                )
                Box(
                    Modifier.size(42.dp).clip(CircleShape).background(StudioPalette.Surface)
                        .border(1.dp, StudioPalette.Line, CircleShape)
                        .clickable {
                            profile = if (profile == "Private") "Public" else "Private"
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        if (profile == "Private") Icons.Outlined.Lock else Icons.Outlined.Public,
                        contentDescription = "Switch configuration account",
                        tint = StudioPalette.Accent,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
            Text(
                "$profile account · changes sync with the ENV tab.",
                color = StudioPalette.Muted,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                modifier = Modifier.padding(top = 5.dp)
            )
            if (previewMode) {
                Text(
                    "Debug preview · example values stay on this device and are not sent to a server.",
                    color = StudioPalette.Accent,
                    fontSize = 11.5.sp,
                    lineHeight = 16.sp,
                    modifier = Modifier.padding(top = 7.dp)
                )
            } else if (!connected) {
                Text(
                    "Connect your Aharane server to load the current values. No settings have been changed.",
                    color = StudioPalette.Muted,
                    fontSize = 11.5.sp,
                    lineHeight = 16.sp,
                    modifier = Modifier.padding(top = 7.dp)
                )
            }
            Spacer(Modifier.height(3.dp))
        }

        item { StudioSectionHeading("General") }
        item {
            StudioCard {
                ConfigField("Bot name", "BOT_NAME", botName, editable, onValueChange = { botName = it; dirty = true })
                StudioDivider()
                ConfigField("Command prefix", "PREFIX", prefix, editable, onValueChange = { prefix = it; dirty = true }, singleLine = true)
                StudioDivider()
                ConfigField(
                    if (profile == "Public") "Account number" else "Owner number",
                    if (profile == "Public") "PUBLIC_NUMBER" else "OWNER_NUMBER",
                    ownerNumber,
                    editable,
                    onValueChange = { ownerNumber = it; dirty = true },
                    keyboardType = KeyboardType.Phone
                )
            }
        }

        item { StudioSectionHeading("Behavior") }
        item {
            StudioCard {
                ConfigToggle("Mark messages as read", "Show blue ticks when the bot sees a message.", "AUTO_READ",
                    autoRead, editable) { autoRead = it; dirty = true }
                StudioDivider()
                ConfigToggle("Show typing", "Display “typing…” while the bot prepares a reply.", "SHOW_TYPING",
                    showTyping, editable) { showTyping = it; dirty = true }
                StudioDivider()
                ConfigToggle("Decline calls", "Automatically reject incoming calls.", "REJECT_CALLS",
                    rejectCalls, editable) { rejectCalls = it; dirty = true }
                StudioDivider()
                ConfigToggle("Always online", "Keep the bot’s status as online.", "ALWAYS_ONLINE",
                    alwaysOnline, editable) { alwaysOnline = it; dirty = true }
                StudioDivider()
                ConfigField(
                    "Command cooldown",
                    "COMMAND_COOLDOWN · seconds between commands from the same person",
                    cooldown,
                    editable,
                    onValueChange = { cooldown = it.filter(Char::isDigit).take(3); dirty = true },
                    keyboardType = KeyboardType.Number,
                    singleLine = true
                )
            }
        }

        item { StudioSectionHeading("Messages") }
        item {
            StudioCard {
                ConfigField(
                    "Welcome message",
                    "WELCOME_MESSAGE",
                    welcomeMessage,
                    editable,
                    onValueChange = { welcomeMessage = it; dirty = true },
                    singleLine = false,
                    minLines = 3
                )
            }
        }

        item { StudioSectionHeading("Advanced") }
        item {
            StudioCard {
                StudioRow(
                    title = "Edit config.js",
                    subtitle = "Open the file in the code editor",
                    icon = Icons.Outlined.Tune,
                    trailing = "›",
                    onClick = onEditConfig
                )
            }
            Spacer(Modifier.height(13.dp))
            if (previewMode) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        if (dirty) "Unsaved preview draft" else "Preview values · local only",
                        color = StudioPalette.Muted,
                        fontSize = 12.5.sp,
                        lineHeight = 18.sp,
                        modifier = Modifier.weight(1f)
                    )
                    if (dirty) {
                        StudioActionButton("Discard", compact = true, onClick = ::resetDraft)
                    }
                }
                Spacer(Modifier.height(9.dp))
                StudioActionButton(
                    "Save preview draft",
                    modifier = Modifier.fillMaxWidth(),
                    primary = true,
                    enabled = dirty,
                    onClick = {
                        dirty = false
                        Toast.makeText(context, "Preview draft updated; nothing was sent to a server.", Toast.LENGTH_SHORT).show()
                    }
                )
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Live settings are unavailable while the server is disconnected.",
                        color = StudioPalette.Muted,
                        fontSize = 12.5.sp,
                        lineHeight = 18.sp,
                        modifier = Modifier.weight(1f)
                    )
                    StudioTag("Not connected")
                }
                Spacer(Modifier.height(9.dp))
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    StudioActionButton(
                        "Discard",
                        modifier = Modifier.weight(1f),
                        enabled = editable && dirty && !saving,
                        onClick = ::resetDraft
                    )
                    StudioActionButton(
                        if (saving) "Saving…" else "Save changes",
                        modifier = Modifier.weight(1f),
                        primary = true,
                        enabled = editable && dirty && !saving,
                        onClick = {
                            val prefixKey = if (profile == "Private") "PRIVATE_" else "PUBLIC_"
                            val values = mapOf(
                                prefixKey + "BOT_NAME" to botName,
                                prefixKey + "COMMAND_PREFIX" to prefix,
                                prefixKey + "AUTO_READ" to autoRead.toString(),
                                prefixKey + "SHOW_TYPING" to showTyping.toString(),
                                prefixKey + "REJECT_CALLS" to rejectCalls.toString(),
                                prefixKey + "ALWAYS_ONLINE" to alwaysOnline.toString(),
                                prefixKey + "COMMAND_COOLDOWN" to cooldown,
                                prefixKey + "WELCOME_MESSAGE" to welcomeMessage,
                                (if (profile == "Private") "PRIVATE_OWNER_NUMBER" else "PUBLIC_BOT_NUMBER") to ownerNumber
                            )
                            if (previewMode) {
                                Toast.makeText(context, "Preview settings are local only.", Toast.LENGTH_SHORT).show()
                                dirty = false
                            } else {
                                saveScope.launch {
                                    saving = true
                                    val saved = runCatching { onSave(profile, values) }.getOrDefault(false)
                                    if (saved) dirty = false
                                    else Toast.makeText(context, "Configuration could not be saved.", Toast.LENGTH_LONG).show()
                                    saving = false
                                }
                            }
                        }
                    )
                }
            }
        }
        item { Spacer(Modifier.height(12.dp)) }
    }
}

@Composable
private fun ConfigField(
    label: String,
    key: String,
    value: String,
    enabled: Boolean,
    onValueChange: (String) -> Unit,
    keyboardType: KeyboardType = KeyboardType.Text,
    singleLine: Boolean = true,
    minLines: Int = 1
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 11.dp)) {
        Text(label, color = StudioPalette.Ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Text(
            key,
            color = StudioPalette.Muted,
            fontSize = 11.sp,
            fontFamily = FontFamily.Monospace,
            lineHeight = 15.sp,
            modifier = Modifier.padding(top = 2.dp, bottom = 7.dp)
        )
        BasicTextField(
                    cursorBrush = SolidColor(StudioPalette.Accent),
            value = value,
            onValueChange = onValueChange,
            enabled = enabled,
            singleLine = singleLine,
            minLines = minLines,
            textStyle = TextStyle(color = StudioPalette.Ink, fontSize = 13.sp, lineHeight = 19.sp),
            keyboardOptions = KeyboardOptions(
                keyboardType = keyboardType,
                autoCorrectEnabled = false
            ),
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                .background(StudioPalette.Background)
                .border(1.dp, StudioPalette.Line, RoundedCornerShape(10.dp))
                .padding(horizontal = 12.dp, vertical = 11.dp),
            decorationBox = { innerTextField ->
                Box {
                    if (value.isEmpty()) {
                        Text(
                            if (enabled) "Enter ${label.lowercase()}" else "Connect to load",
                            color = StudioPalette.Muted,
                            fontSize = 13.sp
                        )
                    }
                    innerTextField()
                }
            }
        )
    }
}

@Composable
private fun ConfigToggle(
    title: String,
    description: String,
    key: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 66.dp).padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, color = StudioPalette.Ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Text(description, color = StudioPalette.Muted, fontSize = 12.5.sp, lineHeight = 17.sp)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    key,
                    color = StudioPalette.Muted,
                    fontSize = 10.5.sp,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier.weight(1f)
                )
                if (!enabled) StudioTag("Not loaded")
            }
        }
        val track = if (checked) StudioPalette.Accent else StudioPalette.Line
        Box(
            Modifier.size(width = 38.dp, height = 22.dp).clip(RoundedCornerShape(99.dp))
                .background(if (enabled) track else StudioPalette.Line)
                .clickable(enabled = enabled) { onCheckedChange(!checked) },
            contentAlignment = if (checked) Alignment.CenterEnd else Alignment.CenterStart
        ) {
            Box(Modifier.padding(horizontal = 3.dp).size(16.dp).clip(CircleShape).background(StudioPalette.Surface))
        }
    }
}
