package com.aharane.studio.features.more

import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.ui.draw.clip
import com.aharane.studio.core.design.*

@Composable
fun MoreScreen(
    themeMode: String,
    onThemeModeChanged: (String) -> Unit
) {
    val context = LocalContext.current
    var appearanceOpen by remember { mutableStateOf(false) }
    val unavailable: (String) -> Unit = { label ->
        Toast.makeText(context, label + " will be available after connecting to Aharane.", Toast.LENGTH_SHORT).show()
    }

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
                    trailing = "›",
                    onClick = { unavailable("Activity and logs") }
                )
                StudioDivider()
                StudioRow(
                    "Storage information",
                    "View disk and storage usage",
                    trailing = "›",
                    onClick = { unavailable("Storage information") }
                )
            }
        }

        item { StudioSectionHeading("Preferences") }
        item {
            StudioCard {
                StudioRow(
                    "Appearance",
                    "Theme, accent color, text size and editor",
                    trailing = "›",
                    onClick = { appearanceOpen = true }
                )
            }
        }

        item { StudioSectionHeading("Support") }
        item {
            StudioCard {
                StudioRow(
                    "Help",
                    "Guidance for using Aharane Studio",
                    trailing = "›",
                    onClick = { unavailable("Help") }
                )
                StudioDivider()
                StudioRow(
                    "About Aharane",
                    "Version and application information",
                    trailing = "›",
                    onClick = { unavailable("About Aharane") }
                )
            }
        }
        item { Spacer(Modifier.height(10.dp)) }
    }

    if (appearanceOpen) {
        Dialog(onDismissRequest = { appearanceOpen = false }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
                    .background(StudioPalette.Surface).padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    "Appearance",
                    color = StudioPalette.Ink,
                    fontSize = 19.sp,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
                )
                Text(
                    "Choose how Aharane Studio looks on this device.",
                    color = StudioPalette.Muted,
                    fontSize = 13.sp,
                    lineHeight = 18.sp
                )
                StudioSegmented(
                    options = listOf("System", "Light", "Dark"),
                    selected = themeMode.replaceFirstChar { it.uppercase() },
                    onSelect = { onThemeModeChanged(it.lowercase()) }
                )
                StudioActionButton(
                    "Done",
                    modifier = Modifier.align(Alignment.End),
                    primary = true,
                    onClick = { appearanceOpen = false }
                )
            }
        }
    }
}
