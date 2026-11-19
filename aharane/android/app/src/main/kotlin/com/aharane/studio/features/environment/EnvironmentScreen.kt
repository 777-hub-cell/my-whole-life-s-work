package com.aharane.studio.features.environment
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.aharane.studio.features.components.EmptyState

@Composable
fun EnvironmentScreen() {
    LazyColumn(contentPadding = PaddingValues(horizontal = 20.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Text("Environment", style = MaterialTheme.typography.headlineMedium) }
        item { EmptyState(Icons.Outlined.Terminal, "Runtime configuration",
            "Environment settings will be loaded from your authenticated Aharane server.") }
        item {
            Surface(Modifier.fillMaxWidth(), RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.surface,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Server-owned secrets", style = MaterialTheme.typography.titleSmall)
                    Text("Private values and credentials will not be copied into the APK or stored as plaintext on this phone.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
