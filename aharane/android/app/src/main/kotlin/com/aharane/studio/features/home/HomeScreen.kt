package com.aharane.studio.features.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.aharane.studio.core.design.*
import com.aharane.studio.core.model.ChatAccount

@Composable
fun HomeScreen(
    onOpenChats: () -> Unit,
    onOpenMore: () -> Unit,
    onOpenConfiguration: () -> Unit,
    onOpenActivity: () -> Unit = onOpenMore
) {
    var pairingAccount by remember { mutableStateOf<ChatAccount?>(null) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        item {
            StudioPageTitle("Welcome back", "Your Aharane workspace.")
            Spacer(Modifier.height(18.dp))
        }
        item {
            StudioCard(padding = PaddingValues(16.dp)) {
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 42.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(
                            "Aharane service",
                            color = StudioPalette.Ink,
                            fontSize = 15.sp,
                            lineHeight = 19.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            "Not connected to Aharane service",
                            color = StudioPalette.Muted,
                            fontSize = 12.5.sp,
                            lineHeight = 17.sp
                        )
                    }
                    Row(
                        Modifier.clip(RoundedCornerShape(99.dp))
                            .background(Color(0xFFF8E8E6))
                            .padding(horizontal = 11.dp, vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(7.dp)
                    ) {
                        Box(Modifier.size(8.dp).clip(CircleShape).background(StudioPalette.Bad))
                        Text(
                            "Offline",
                            color = StudioPalette.Bad,
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
                StudioDivider()
                Text(
                    "Each WhatsApp account has its own connection and controls. An offline account does not stop the other one.",
                    color = StudioPalette.Muted,
                    fontSize = 13.sp,
                    lineHeight = 19.sp,
                    modifier = Modifier.padding(top = 9.dp)
                )
            }
        }

        item { StudioSectionHeading("WhatsApp accounts") }
        item {
            StudioCard {
                AccountRow(
                    account = ChatAccount.PRIVATE,
                    state = "Status not loaded",
                    onLink = { pairingAccount = ChatAccount.PRIVATE }
                )
                StudioDivider()
                AccountRow(
                    account = ChatAccount.PUBLIC,
                    state = "Not paired",
                    onLink = { pairingAccount = ChatAccount.PUBLIC }
                )
            }
        }

        item { StudioSectionHeading("Setup") }
        item {
            StudioCard {
                StudioRow(
                    title = "Configuration",
                    subtitle = "Private Owner · Not loaded · Public Owner · Not loaded · Public bot number · Not loaded",
                    icon = Icons.Outlined.Tune,
                    trailing = "›",
                    onClick = onOpenConfiguration,
                    subtitleMaxLines = 1
                )
            }
        }

        item { StudioSectionHeading("Recent activity") }
        item {
            StudioCard {
                Box(Modifier.fillMaxWidth().height(26.dp))
            }
        }
        item { Spacer(Modifier.height(10.dp)) }
    }

    if (pairingAccount != null) {
        Dialog(onDismissRequest = { pairingAccount = null }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(StudioPalette.Surface).padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(11.dp)
            ) {
                Text(
                    "Link ${pairingAccount!!.label} account",
                    color = StudioPalette.Ink,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    "The native app is not connected to your Aharane server yet. Account pairing will work after secure server linking is added.",
                    color = StudioPalette.Muted,
                    fontSize = 13.sp,
                    lineHeight = 19.sp
                )
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    StudioActionButton(
                        "Open configuration",
                        compact = true,
                        onClick = {
                            pairingAccount = null
                            onOpenConfiguration()
                        }
                    )
                    Spacer(Modifier.width(8.dp))
                    StudioActionButton(
                        "Close",
                        compact = true,
                        primary = true,
                        onClick = { pairingAccount = null }
                    )
                }
            }
        }
    }
}

@Composable
private fun AccountRow(
    account: ChatAccount,
    state: String,
    onLink: () -> Unit
) {
    val isPrivate = account == ChatAccount.PRIVATE
    Row(
        Modifier.fillMaxWidth().defaultMinSize(minHeight = 65.dp)
            .padding(horizontal = 13.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(11.dp)
    ) {
        Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) {
            Box(
                Modifier.fillMaxSize().clip(CircleShape).background(StudioPalette.Soft),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    if (isPrivate) "P" else "A",
                    color = StudioPalette.Accent,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
            Box(
                Modifier.align(Alignment.BottomEnd).size(12.dp)
                    .clip(CircleShape).background(StudioPalette.Bad)
                    .border(1.5.dp, StudioPalette.Surface, CircleShape)
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                if (isPrivate) "Private WhatsApp" else "Public WhatsApp",
                color = StudioPalette.Ink,
                fontSize = 14.sp,
                lineHeight = 18.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(state, color = StudioPalette.Muted, fontSize = 12.5.sp, lineHeight = 17.sp)
        }
        StudioActionButton("Link account", compact = true, primary = true, onClick = onLink)
    }
}
