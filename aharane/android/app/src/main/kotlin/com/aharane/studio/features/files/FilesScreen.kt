package com.aharane.studio.features.files

import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.*

@Composable
fun FilesScreen() {
    val context = LocalContext.current
    var query by remember { mutableStateOf("") }
    val unavailable = { action: String ->
        Toast.makeText(context, "Connect Aharane to use $action.", Toast.LENGTH_SHORT).show()
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
            StudioSearchField(value = query, onValueChange = { query = it },
                placeholder = "Search files and folders")
            Spacer(Modifier.height(12.dp))
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StudioActionButton("New file", modifier = Modifier.weight(1f)) { unavailable("creating files") }
                StudioActionButton("Upload", modifier = Modifier.weight(1f)) { unavailable("uploading files") }
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StudioActionButton("New folder", modifier = Modifier.weight(1f)) { unavailable("creating folders") }
                StudioActionButton("Export Bot Source", modifier = Modifier.weight(1f)) { unavailable("exporting bot source") }
            }
            Row(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("root", color = StudioPalette.Ink, fontSize = 13.sp)
            }
        }
        item {
            StudioCard {
                Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp)) {
                    Text("□  Select all", color = StudioPalette.Muted, fontSize = 13.sp)
                }
                StudioDivider()
                StudioEmpty(
                    title = if (query.isBlank()) "This folder is empty." else "No files match.",
                    description = "Connect to your Aharane workspace to browse and edit source files."
                )
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}
