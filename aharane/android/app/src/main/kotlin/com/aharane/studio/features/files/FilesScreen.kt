package com.aharane.studio.features.files

import android.widget.Toast
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberSaveable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.*

@Composable
fun FilesScreen(onEditorVisibility: (Boolean) -> Unit) {
    val context = LocalContext.current
    var query by rememberSaveable { mutableStateOf("") }
    val unavailable: (String) -> Unit = { action ->
        Toast.makeText(context, "Connect Aharane to use " + action + ".", Toast.LENGTH_SHORT).show()
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
                StudioActionButton("New file", modifier = Modifier.weight(1f), compact = true) {
                    unavailable("creating files")
                }
                StudioActionButton("Upload", modifier = Modifier.weight(1f), compact = true) {
                    unavailable("uploading files")
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StudioActionButton("New folder", modifier = Modifier.weight(1f), compact = true) {
                    unavailable("creating folders")
                }
                StudioActionButton("Export Bot Source", modifier = Modifier.weight(1f), compact = true) {
                    unavailable("exporting bot source")
                }
            }
            Row(
                Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text("root", color = StudioPalette.Ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        item {
            StudioCard {
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 40.dp).padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(Modifier.size(18.dp).border(1.dp, StudioPalette.Line, RoundedCornerShape(4.dp)))
                    Text(
                        "Select all",
                        color = StudioPalette.Muted,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(start = 9.dp)
                    )
                }
                StudioDivider()
                StudioEmpty(
                    title = if (query.isBlank()) "This folder is empty." else "No match for “" + query + "”",
                    description = if (query.isBlank()) {
                        "Create a file to start. Connect to your Aharane workspace to browse and edit server files."
                    } else {
                        "Try another file or folder name."
                    }
                )
                Text(
                    "Folders A–Z first, then files A–Z.",
                    color = StudioPalette.Muted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp,
                    modifier = Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, bottom = 14.dp)
                )
            }
        }
        item {
            StudioSectionHeading("Code editor")
            StudioCard {
                StudioRow(
                    title = "Source editor",
                    subtitle = "Open the native code workspace",
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
            Spacer(Modifier.height(14.dp))
        }
    }
}
