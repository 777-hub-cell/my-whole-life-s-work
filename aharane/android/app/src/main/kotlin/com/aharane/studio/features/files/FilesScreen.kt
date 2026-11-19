package com.aharane.studio.features.files
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import com.aharane.studio.features.components.EmptyState

@Composable
fun FilesScreen() {
    LazyColumn(contentPadding = PaddingValues(horizontal = 20.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Text("Files", style = MaterialTheme.typography.headlineMedium) }
        item { EmptyState(Icons.Outlined.FolderOpen, "Your Aharane files will appear here",
            "The native file manager will connect to the existing Aharane workspace. Nothing is copied or changed yet.") }
    }
}
