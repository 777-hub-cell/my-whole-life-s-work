package com.aharane.studio.features.more

import androidx.compose.foundation.background
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.aharane.studio.core.design.*

@Composable
fun MoreScreen(
    themeMode: String,
    onThemeModeChanged: (String) -> Unit
) {
    var dialog by rememberSaveable { mutableStateOf("") }

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
                    onClick = { dialog = "appearance" }
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

    if (dialog.isNotEmpty()) {
        Dialog(onDismissRequest = { dialog = "" }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
                    .background(StudioPalette.Surface).padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                when (dialog) {
                    "appearance" -> {
                        Text("Appearance", color = StudioPalette.Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Text("Choose how Aharane Studio looks on this device.", color = StudioPalette.Muted,
                            fontSize = 13.sp, lineHeight = 18.sp)
                        StudioSegmented(
                            options = listOf("System", "Light", "Dark"),
                            selected = when (themeMode) {
                                "light" -> "Light"
                                "dark" -> "Dark"
                                else -> "System"
                            },
                            onSelect = {
                                onThemeModeChanged(it.lowercase())
                                dialog = ""
                            }
                        )
                        Text("The display and body typefaces match the Aharane web Studio. Accent, text-size and editor preferences are not connected yet.",
                            color = StudioPalette.Muted, fontSize = 12.5.sp, lineHeight = 18.sp)
                    }
                    "activity" -> {
                        Text("Activity and logs", color = StudioPalette.Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Text("No activity is available because this app is not connected to an Aharane server.",
                            color = StudioPalette.Muted, fontSize = 14.sp, lineHeight = 20.sp)
                    }
                    "storage" -> {
                        Text("Storage information", color = StudioPalette.Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Text("Server disk usage will be shown here after secure server linking. No server storage values are available right now.",
                            color = StudioPalette.Muted, fontSize = 14.sp, lineHeight = 20.sp)
                    }
                    "help" -> {
                        Text("Help", color = StudioPalette.Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        HelpItem("Accounts", "Private and Public WhatsApp sessions are kept separate.")
                        HelpItem("Files", "Open folders to browse. Select a file to edit it in the native source editor. Drafts in this build stay on this screen and are not sent to the server.")
                        HelpItem("ENV", "Add and edit environment-variable drafts. Secret values can be revealed individually or together.")
                        HelpItem("Chats", "The inbox and full-screen conversation view will populate when secure server linking is available.")
                    }
                    "about" -> {
                        Text("About Aharane", color = StudioPalette.Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Box(Modifier.size(38.dp).clip(RoundedCornerShape(11.dp)).background(StudioPalette.Accent),
                                contentAlignment = Alignment.Center) {
                                Text("A", color = androidx.compose.ui.graphics.Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                            }
                            Column {
                                Text("Aharane Local Studio", color = StudioPalette.Ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                Text("Native Android · 0.1.0", color = StudioPalette.Muted, fontSize = 12.5.sp)
                            }
                        }
                        Text("A native Android translation of the Aharane Control Centre. The web Studio remains the source of truth for server operations until the Android connection layer is completed.",
                            color = StudioPalette.Muted, fontSize = 13.sp, lineHeight = 19.sp)
                    }
                }
                StudioActionButton("Close", primary = true, modifier = Modifier.align(Alignment.End),
                    onClick = { dialog = "" })
            }
        }
    }
}

@Composable
private fun HelpItem(title: String, description: String) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(title, color = StudioPalette.Ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
        Text(description, color = StudioPalette.Muted, fontSize = 12.5.sp, lineHeight = 18.sp)
    }
}
