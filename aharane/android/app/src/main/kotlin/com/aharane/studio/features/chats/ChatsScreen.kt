package com.aharane.studio.features.chats
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.model.ChatFilter
import com.aharane.studio.features.components.EmptyState

@Composable
fun ChatsScreen(
    account: ChatAccount,
    onAccountSelected: (ChatAccount) -> Unit,
    filter: ChatFilter,
    onFilterSelected: (ChatFilter) -> Unit
) {
    LazyColumn(contentPadding = PaddingValues(horizontal = 20.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Chats", style = MaterialTheme.typography.headlineMedium)
                Text("Your Aharane WhatsApp conversations.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("WhatsApp account", style = MaterialTheme.typography.titleSmall)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ChatAccount.entries.forEach { candidate ->
                        FilterChip(account == candidate, { onAccountSelected(candidate) },
                            label = { Text(candidate.label) })
                    }
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ChatFilter.entries.forEach { candidate ->
                    FilterChip(filter == candidate, { onFilterSelected(candidate) },
                        label = { Text(candidate.label) })
                }
            }
        }
        item {
            EmptyState(Icons.Outlined.ChatBubbleOutline, "Your inbox will appear here",
                "Connect this app securely to your Aharane server to load live conversations. No sample chats are shown.")
        }
        item {
            Text("Private and Public inboxes stay separate. Existing privacy, read-receipt and presence rules remain authoritative when native sign-in and sync are connected.",
                Modifier.fillMaxWidth().padding(top = 4.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall)
        }
    }
}
