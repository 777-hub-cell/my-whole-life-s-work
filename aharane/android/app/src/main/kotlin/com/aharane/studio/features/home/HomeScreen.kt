package com.aharane.studio.features.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import com.aharane.studio.core.design.*

@Composable
fun HomeScreen(onOpenChats: () -> Unit, onOpenMore: () -> Unit) {
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
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StudioStatusDot(online = false, size = 14)
                    Text("Aharane bot", color = StudioPalette.Ink, fontSize = 26.sp,
                        lineHeight = 30.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp)
                    Spacer(Modifier.weight(1f))
                    StudioTag("Not linked")
                }
                Text("Native app connection required", color = StudioPalette.Muted,
                    fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 3.dp))
                Row(
                    Modifier.fillMaxWidth().height(64.dp).padding(top = 16.dp, bottom = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                    verticalAlignment = Alignment.Bottom
                ) {
                    repeat(24) { index ->
                        Box(
                            Modifier.weight(1f).height(if (index % 4 == 0) 7.dp else 4.dp)
                                .background(StudioPalette.Line, RoundedCornerShape(3.dp))
                        )
                    }
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("Messages handled, last 24 hours", color = StudioPalette.Muted,
                        fontSize = 12.5.sp, lineHeight = 17.sp)
                    Spacer(Modifier.weight(1f))
                    Text("—", color = StudioPalette.Muted, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
                }
                Row(Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StudioActionButton("Restart", enabled = false, onClick = {})
                    StudioActionButton("Stop", enabled = false, onClick = {})
                }
            }
        }

        item { StudioSectionHeading("Accounts") }
        item {
            StudioCard {
                StudioRow("Private", "Private WhatsApp account", Icons.Outlined.Lock, "Not linked")
                StudioDivider()
                StudioRow("Public", "Public WhatsApp account", Icons.Outlined.Public, "Not linked")
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
                    onClick = onOpenMore
                )
            }
        }

        item { StudioSectionHeading("Recent activity", action = "View all", onAction = onOpenMore) }
        item {
            StudioCard {
                StudioEmpty(
                    title = "No activity available",
                    description = "Connect your Aharane server to see recent bot activity and diagnostics."
                )
            }
        }
        item { Spacer(Modifier.height(10.dp)) }
    }
}
