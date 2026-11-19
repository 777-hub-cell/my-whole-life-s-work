package com.aharane.studio.features.more

import androidx.activity.compose.BackHandler

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
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
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.aharane.studio.core.design.*

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
    onOpenEnvironment: () -> Unit = {}
) {
    var dialog by rememberSaveable { mutableStateOf("") }
    var customColorOpen by rememberSaveable { mutableStateOf(false) }
    var customHex by rememberSaveable { mutableStateOf(accentColor) }
    var activityQuery by rememberSaveable { mutableStateOf("") }
    var activityFilter by rememberSaveable { mutableStateOf("All · 0") }

    BackHandler(enabled = page != "more") { onPageChange("more") }

    if (page == "appearance") {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp)
        ) {
            item {
                Text(
                    "‹  Back to More",
                    color = StudioPalette.Accent,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clip(RoundedCornerShape(8.dp))
                        .clickable { onPageChange("more") }.padding(vertical = 6.dp)
                )
                Spacer(Modifier.height(10.dp))
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
                        Slider(
                            value = editorFontSize.toFloat(),
                            onValueChange = { onEditorFontSizeChanged(it.toInt()) },
                            valueRange = 11f..20f,
                            steps = 8,
                            colors = SliderDefaults.colors(
                                thumbColor = StudioPalette.Accent,
                                activeTrackColor = StudioPalette.Accent,
                                inactiveTrackColor = StudioPalette.Line
                            )
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
    } else if (page == "activity") {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp)
        ) {
            item {
                BackToMore { onPageChange("more") }
                Spacer(Modifier.height(12.dp))
                StudioPageTitle("Activity and logs", "No server activity is available while disconnected.")
                Text(
                    "0 entries",
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
                    options = listOf("All · 0", "Info · 0", "Warnings · 0", "Errors · 0"),
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
                    StudioActionButton("Live", compact = true, enabled = false)
                    StudioActionButton("Copy", compact = true, enabled = false)
                    StudioActionButton("Export", compact = true, enabled = false)
                    StudioActionButton("Clear", compact = true, destructive = true, enabled = false)
                }
                Spacer(Modifier.height(12.dp))
            }
            item {
                StudioCard {
                    StudioEmpty(
                        title = if (activityQuery.isBlank()) "No log entries yet." else "No log entries match.",
                        description = "Connect to your Aharane server to load activity, warnings, errors and diagnostic details."
                    )
                }
            }
        }
    } else if (page == "storage") {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp)
        ) {
            item {
                BackToMore { onPageChange("more") }
                Spacer(Modifier.height(12.dp))
                StudioPageTitle("Storage", "What the bot’s files take up.")
                Spacer(Modifier.height(14.dp))
            }
            item {
                StudioCard(padding = PaddingValues(18.dp)) {
                    Text("—", color = StudioPalette.Ink, fontSize = 28.sp, fontWeight = FontWeight.Bold)
                    Text("of — limit", color = StudioPalette.Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 2.dp))
                    Row(
                        Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 10.dp)
                            .height(7.dp).clip(RoundedCornerShape(6.dp)).background(StudioPalette.Line)
                    ) { }
                    listOf("Code and text", "Images", "Videos", "Audio").forEachIndexed { index, label ->
                        Row(
                            Modifier.fillMaxWidth().heightIn(min = 42.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                Modifier.size(8.dp).clip(CircleShape).background(
                                    listOf(Color(0xFF3B82F6), StudioPalette.Accent, Color(0xFFD6336C), Color(0xFFE0A100))[index]
                                )
                            )
                            Text(label, color = StudioPalette.Ink, fontSize = 13.sp, modifier = Modifier.padding(start = 10.dp).weight(1f))
                            Text("—", color = StudioPalette.Muted, fontSize = 12.sp)
                        }
                    }
                    Text(
                        "Server storage values are not available until you connect this app.",
                        color = StudioPalette.Muted,
                        fontSize = 11.5.sp,
                        lineHeight = 16.sp,
                        modifier = Modifier.padding(top = 6.dp)
                    )
                }
            }
            item {
                StudioSectionHeading("Largest files")
                StudioCard { StudioEmpty("No files yet.", "Connect to browse file sizes and storage use.") }
            }
            item {
                StudioSectionHeading("By folder")
                StudioCard { StudioEmpty("No folders yet.", "Folder usage appears after the file tree loads.") }
            }
            item {
                StudioSectionHeading("MEGA backup")
                StudioCard {
                    Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("MEGA", color = StudioPalette.Ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.weight(1f))
                            StudioTag("Not connected")
                        }
                        Text(
                            "Back up the bot’s files to your MEGA account. The Studio reads MEGA_EMAIL and MEGA_PASSWORD from ENV, so your password stays with your other secrets.",
                            color = StudioPalette.Muted,
                            fontSize = 12.5.sp,
                            lineHeight = 18.sp
                        )
                        StudioActionButton("Add credentials in ENV", onClick = onOpenEnvironment)
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

            item { StudioSectionHeading("Tools") }
            item {
                StudioCard {
                    StudioRow(
                        "Activity and logs",
                        "Review bot activity and diagnostic records",
                        Icons.Outlined.Timeline,
                        "›",
                        onClick = { onPageChange("activity") }
                    )
                    StudioDivider()
                    StudioRow(
                        "Storage information",
                        "View disk and storage usage",
                        Icons.Outlined.Storage,
                        "›",
                        onClick = { onPageChange("storage") }
                    )
                }
            }

            item { StudioSectionHeading("Preferences") }
            item {
                StudioCard {
                    StudioRow(
                        "Appearance",
                        "Theme, accent color, text size and editor",
                        Icons.Outlined.Palette,
                        "›",
                        onClick = { onPageChange("appearance") }
                    )
                }
            }

            item { StudioSectionHeading("Support") }
            item {
                StudioCard {
                    StudioRow(
                        "Help",
                        "Guidance for using Aharane Studio",
                        Icons.Outlined.HelpOutline,
                        "›",
                        onClick = { dialog = "help" }
                    )
                    StudioDivider()
                    StudioRow(
                        "About Aharane",
                        "Version and application information",
                        Icons.Outlined.Info,
                        "›",
                        onClick = { dialog = "about" }
                    )
                }
            }
            item { Spacer(Modifier.height(12.dp)) }
        }
    }

    if (customColorOpen) {
        Dialog(onDismissRequest = { customColorOpen = false }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(StudioPalette.Surface).padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("Custom accent", color = StudioPalette.Ink, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                Text("Enter a six-digit hex color.", color = StudioPalette.Muted, fontSize = 12.5.sp)
                BasicTextField(
                    value = customHex,
                    onValueChange = { customHex = it },
                    singleLine = true,
                    textStyle = androidx.compose.ui.text.TextStyle(color = StudioPalette.Ink, fontSize = 15.sp),
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                        .background(StudioPalette.Background).border(1.dp, StudioPalette.Line, RoundedCornerShape(10.dp))
                        .padding(horizontal = 12.dp, vertical = 12.dp)
                )
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
                            "A native Android translation of the Aharane Control Centre. Server operations remain on the web Studio until secure Android linking is complete.",
                            color = StudioPalette.Muted, fontSize = 13.sp, lineHeight = 19.sp
                        )
                    }
                }
                StudioActionButton("Close", primary = true, modifier = Modifier.align(Alignment.End), onClick = { dialog = "" })
            }
        }
    }
}

@Composable
private fun BackToMore(onClick: () -> Unit) {
    Text(
        "‹  Back to More",
        color = StudioPalette.Accent,
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick).padding(vertical = 6.dp)
    )
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
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        Modifier.fillMaxWidth().clickable { onCheckedChange(!checked) }
            .padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, color = StudioPalette.Ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
            Text(description, color = StudioPalette.Muted, fontSize = 12.sp, lineHeight = 16.sp)
        }
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
