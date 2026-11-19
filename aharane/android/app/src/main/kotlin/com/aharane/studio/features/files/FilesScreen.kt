package com.aharane.studio.features.files

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.*

@Composable
fun FilesScreen(onEditorVisibility: (Boolean) -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    val disconnectedDescription = if (query.isBlank()) {
        "Connect your Aharane server to browse, create, upload and edit bot source files here."
    } else {
        "No server files can be searched until this app is connected to your Aharane workspace."
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        item {
            StudioPageTitle("Files", "Browse and edit Aharane source files.")
            Spacer(Modifier.height(14.dp))
        }
        item {
            StudioSearchField(
                value = query,
                onValueChange = { query = it },
                placeholder = "Search files and folders"
            )
            Spacer(Modifier.height(12.dp))
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StudioActionButton("New file", modifier = Modifier.weight(1f), compact = true, enabled = false) {}
                StudioActionButton("Upload", modifier = Modifier.weight(1f), compact = true, enabled = false) {}
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StudioActionButton("New folder", modifier = Modifier.weight(1f), compact = true, enabled = false) {}
                StudioActionButton("Export Bot Source", modifier = Modifier.weight(1f), compact = true, enabled = false) {}
            }
            Row(
                Modifier.fillMaxWidth().padding(top = 13.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("root", color = StudioPalette.Ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        item {
            StudioCard {
                StudioEmpty(
                    title = if (query.isBlank()) "This folder is empty." else "No files match.",
                    description = disconnectedDescription
                )
            }
            Spacer(Modifier.height(10.dp))
            Text(
                "Folders A–Z first, then files A–Z.",
                color = StudioPalette.Muted,
                fontSize = 12.sp,
                lineHeight = 17.sp,
                modifier = Modifier.padding(start = 2.dp)
            )
        }
        item {
            StudioSectionHeading("Code editor")
            StudioCard {
                StudioRow(
                    title = "Source editor",
                    subtitle = "Open the native full-screen workspace",
                    icon = Icons.Outlined.Code,
                    trailingContent = {
                        StudioActionButton(
                            "Open editor",
                            compact = true,
                            primary = true,
                            onClick = { onEditorVisibility(true) }
                        )
                    }
                )
            }
            Spacer(Modifier.height(12.dp))
        }
    }
}
