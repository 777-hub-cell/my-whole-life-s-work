package com.aharane.studio.features.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.*

@Composable
fun HomeScreen(
    onOpenChats: () -> Unit,
    onOpenMore: () -> Unit,
    onOpenConfiguration: () -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        item {
            StudioPageTitle("Welcome back", "Your private bot workspace.")
            Spacer(Modifier.height(18.dp))
        }
        item {
            StudioCard(padding = PaddingValues(20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    StudioStatusDot(online = false, size = 11)
                    Spacer(Modifier.width(9.dp))
                    Text(
                        "Aharane bot",
                        color = StudioPalette.Ink,
                        fontSize = 26.sp,
                        lineHeight = 30.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = (-0.55).sp,
                        modifier = Modifier.weight(1f)
                    )
                    StudioTag("Not connected")
                }
                Text(
                    "Connect your server to control the bot and see live activity.",
                    color = StudioPalette.Muted,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                    modifier = Modifier.padding(top = 5.dp)
                )
                Row(
                    Modifier.fillMaxWidth().height(64.dp).padding(top = 16.dp, bottom = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                    verticalAlignment = Alignment.Bottom
                ) {
                    repeat(24) { index ->
                        Box(
                            Modifier.weight(1f)
                                .height(if (index % 5 == 0) 8.dp else if (index % 3 == 0) 6.dp else 4.dp)
                                .background(StudioPalette.Line, RoundedCornerShape(3.dp))
                        )
                    }
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Messages handled, last 24 hours",
                        color = StudioPalette.Muted,
                        fontSize = 12.5.sp,
                        lineHeight = 17.sp
                    )
                    Spacer(Modifier.weight(1f))
                    Text("—", color = StudioPalette.Muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
                Row(
                    Modifier.padding(top = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    StudioActionButton("Restart", enabled = false, onClick = {})
                    StudioActionButton("Stop", destructive = true, enabled = false, onClick = {})
                }
            }
        }

        item { StudioSectionHeading("Accounts") }
        item {
            StudioCard {
                StudioRow(
                    title = "Private",
                    subtitle = "Private WhatsApp account",
                    icon = Icons.Outlined.Lock,
                    trailingContent = {
                        StudioTag("Not linked")
                        Text("›", color = StudioPalette.Muted, fontSize = 21.sp)
                    },
                    onClick = onOpenChats
                )
                StudioDivider()
                StudioRow(
                    title = "Public",
                    subtitle = "Public WhatsApp account",
                    icon = Icons.Outlined.Public,
                    trailingContent = {
                        StudioTag("Not linked")
                        Text("›", color = StudioPalette.Muted, fontSize = 21.sp)
                    },
                    onClick = onOpenChats
                )
            }
        }

        item { StudioSectionHeading("Setup") }
        item {
            StudioCard {
                StudioRow(
                    title = "Configuration",
                    subtitle = "Prefix, access and bot behaviour",
                    icon = Icons.Outlined.Settings,
                    trailing = "›",
                    onClick = onOpenConfiguration
                )
            }
        }

        item { StudioSectionHeading("Recent activity", action = "View all", onAction = onOpenMore) }
        item {
            StudioCard {
                Column(
                    Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 22.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("No activity available", color = StudioPalette.Muted,
                        fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    Text(
                        "Connect your Aharane server to see recent bot activity and diagnostics.",
                        color = StudioPalette.Muted,
                        fontSize = 13.sp,
                        lineHeight = 18.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 5.dp)
                    )
                }
            }
        }
        item { Spacer(Modifier.height(12.dp)) }
    }
}
