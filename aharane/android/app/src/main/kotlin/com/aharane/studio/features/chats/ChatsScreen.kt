package com.aharane.studio.features.chats

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.*
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.model.ChatFilter

@Composable
fun ChatsScreen(
    account: ChatAccount,
    onAccountSelected: (ChatAccount) -> Unit,
    filter: ChatFilter,
    onFilterSelected: (ChatFilter) -> Unit
) {
    var query by rememberSaveable { mutableStateOf("") }
    val switchIcon = if (account == ChatAccount.PRIVATE) Icons.Outlined.Lock else Icons.Outlined.Public

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    StudioPageTitle("Chats")
                }
                Box(
                    Modifier.size(46.dp).clip(CircleShape)
                        .background(StudioPalette.Surface)
                        .border(1.dp, StudioPalette.Line, CircleShape)
                        .clickable {
                            onAccountSelected(if (account == ChatAccount.PRIVATE) ChatAccount.PUBLIC else ChatAccount.PRIVATE)
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(switchIcon, contentDescription = "Switch WhatsApp account",
                        tint = StudioPalette.Accent, modifier = Modifier.size(22.dp))
                    Box(Modifier.align(Alignment.BottomEnd).size(13.dp).clip(CircleShape)
                        .background(StudioPalette.Surface), contentAlignment = Alignment.Center) {
                        StudioStatusDot(online = false, size = 8)
                    }
                }
            }
            Text(
                "${account.label} · 0 conversations",
                color = StudioPalette.Muted,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                modifier = Modifier.padding(top = 6.dp, bottom = 12.dp)
            )
        }
        item {
            StudioSearchField(
                value = query,
                onValueChange = { query = it },
                placeholder = "Search chats and messages"
            )
            Spacer(Modifier.height(12.dp))
        }
        item {
            StudioSegmented(
                options = ChatFilter.entries.map { it.label },
                selected = filter.label,
                onSelect = { label -> ChatFilter.entries.firstOrNull { it.label == label }?.let(onFilterSelected) }
            )
            Spacer(Modifier.height(14.dp))
        }
        item {
            StudioCard {
                StudioEmpty(
                    title = if (query.isBlank()) "No chats yet" else "No chats match",
                    description = "Connect Aharane Local Studio to your server to load ${account.label.lowercase()} conversations."
                )
            }
            Spacer(Modifier.height(16.dp))
            Text(
                "Private and Public inboxes remain separate.",
                color = StudioPalette.Muted,
                fontSize = 12.5.sp,
                lineHeight = 18.sp,
                fontWeight = FontWeight.Medium
            )
        }
    }
}
