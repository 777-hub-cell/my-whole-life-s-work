package com.aharane.studio.features.more
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Storage
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp

@Composable
fun MoreScreen() {
    LazyColumn(contentPadding = PaddingValues(horizontal = 20.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp)) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("More", style = MaterialTheme.typography.headlineMedium)
                Text("Additional Aharane tools and preferences.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
                MoreRow(Icons.Outlined.AccountCircle, "Accounts and pairing",
                    "Manage the separate Private and Public WhatsApp sessions.")
                MoreRow(Icons.Outlined.Security, "Privacy and security",
                    "Native sign-in, device access and privacy controls.")
                MoreRow(Icons.Outlined.History, "Activity and logs",
                    "Review Aharane service activity and diagnostics.")
                MoreRow(Icons.Outlined.Storage, "Storage",
                    "Inspect workspace, chat and media usage.")
                MoreRow(Icons.Outlined.Settings, "Appearance and settings",
                    "Configure the native app and its presentation.")
            }
        }
        item {
            Text("Native foundation · 0.1.0",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.labelSmall)
        }
    }
}
@Composable
private fun MoreRow(icon: ImageVector, title: String, description: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(description, color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall)
        }
    }
}
