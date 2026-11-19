package com.aharane.studio.features.more

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.HelpOutline
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.outlined.Storage
import androidx.compose.material.icons.outlined.Timeline
import androidx.compose.material3.Icon
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
    onEditorLineNumbersChanged: (Boolean) -> Unit
) {
    var page by rememberSaveable { mutableStateOf("more") }
    var dialog by rememberSaveable { mutableStateOf("") }

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
                        .clickable { page = "more" }.padding(vertical = 6.dp)
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
                            options = listOf("System", "Light", "Dark"),
                            selected = when (themeMode) { "light" -> "Light"; "dark" -> "Dark"; else -> "System" },
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
                                    if (selected) {
                                        Text("✓", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                        StudioDivider()
                        PreferenceChoice(
                            "Interface size",
                            listOf("Compact", "Default", "Large"),
                            when (interfaceSize) { "compact" -> "Compact"; "large" -> "Large"; else -> "Default" }
                        ) { choice ->
                            onInterfaceSizeChanged(when (choice) { "Compact" -> "compact"; "Large" -> "large"; else -> "default" })
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
                            listOf("Compact", "Comfortable", "Relaxed"),
                            when (rowSpacing) { "compact" -> "Compact"; "relaxed" -> "Relaxed"; else -> "Comfortable" }
                        ) { choice ->
                            onRowSpacingChanged(when (choice) { "Compact" -> "compact"; "Relaxed" -> "relaxed"; else -> "comfortable" })
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
                            options = listOf("Dark+", "Light+"),
                            selected = if (editorTheme == "Light+") "Light+" else "Dark+",
                            onSelect = onEditorThemeChanged
                        )
                        StudioDivider()
                        Text("Font size", color = StudioPalette.Ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                        StudioSegmented(
                            options = listOf("12", "14", "16", "18"),
                            selected = editorFontSize.toString(),
                            onSelect = { onEditorFontSizeChanged(it.toInt()) }
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
            item { Spacer(Modifier.height(12.dp)) }
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
                        onClick = { dialog = "activity" }
                    )
                    StudioDivider()
                    StudioRow(
                        "Storage information",
                        "View disk and storage usage",
                        Icons.Outlined.Storage,
                        "›",
                        onClick = { dialog = "storage" }
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
                        onClick = { page = "appearance" }
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

    if (dialog.isNotEmpty()) {
        Dialog(onDismissRequest = { dialog = "" }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
                    .background(StudioPalette.Surface).padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                when (dialog) {
                    "activity" -> {
                        Text("Activity and logs", color = StudioPalette.Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Text(
                            "No activity is available because this app is not connected to an Aharane server.",
                            color = StudioPalette.Muted, fontSize = 14.sp, lineHeight = 20.sp
                        )
                    }
                    "storage" -> {
                        Text("Storage information", color = StudioPalette.Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Text(
                            "Server disk usage will appear here after secure server linking. No server storage values are available right now.",
                            color = StudioPalette.Muted, fontSize = 14.sp, lineHeight = 20.sp
                        )
                    }
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
                .clickable { onCheckedChange(!checked) }
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
