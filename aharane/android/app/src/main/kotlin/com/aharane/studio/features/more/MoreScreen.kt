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
    Color(0xFF0E7A5C), Color(0xFF3867D6), Color(0xFF8752C7),
    Color(0xFFB34D76), Color(0xFFB56C22), Color(0xFF4D7779)
)

@Composable
fun MoreScreen(
    themeMode: String,
    onThemeModeChanged: (String) -> Unit
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
                StudioPageTitle("Appearance", "Changes apply instantly and are remembered.")
            }
            item { StudioSectionHeading("App") }
            item {
                StudioCard {
                    Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Theme", color = StudioPalette.Ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        Text("Light, dark, or follow your phone.", color = StudioPalette.Muted, fontSize = 12.5.sp)
                        StudioSegmented(
                            options = listOf("System", "Light", "Dark"),
                            selected = when (themeMode) { "light" -> "Light"; "dark" -> "Dark"; else -> "System" },
                            onSelect = { onThemeModeChanged(it.lowercase()) }
                        )
                        StudioDivider()
                        DisabledPreference("Accent color", "Used for buttons, active tabs and highlights.")
                        Row(horizontalArrangement = Arrangement.spacedBy(11.dp), verticalAlignment = Alignment.CenterVertically) {
                            AccentChoices.forEach { color ->
                                Box(
                                    Modifier.size(27.dp).clip(CircleShape).background(color)
                                        .border(1.dp, StudioPalette.Line.copy(alpha = .6f), CircleShape)
                                )
                            }
                            StudioTag("Not available")
                        }
                        StudioDivider()
                        DisabledPreference("Interface size", "Scales text and spacing across the app.", "Default")
                        StudioDivider()
                        DisabledPreference("Corners", "Roundness of cards and buttons.", "Default")
                        StudioDivider()
                        DisabledPreference("Spacing", "Row height in lists.", "Comfortable")
                    }
                }
            }
            item { StudioSectionHeading("Code editor") }
            item {
                StudioCard {
                    Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        DisabledPreference("Color scheme", "The editor has its own look, separate from the app.", "Dark+")
                        StudioDivider()
                        DisabledPreference("Font size", "Code text size.", "14sp")
                        StudioDivider()
                        DisabledPreference("Line numbers", "Show the numbered gutter beside your code.", "On")
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
