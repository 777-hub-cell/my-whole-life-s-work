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
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.*
import com.aharane.studio.core.model.ChatAccount

@Composable
fun HomeScreen(
    onOpenChats: () -> Unit,
    onOpenMore: () -> Unit,
    onOpenConfiguration: () -> Unit,
    onOpenActivity: () -> Unit = onOpenMore,
    serviceConnected: Boolean = false,
    onAccountAction: (ChatAccount) -> Unit = {},
    serviceSubtitle: String = "Not connected to Aharane service",
    privateAccountStatus: String = "Status not loaded",
    publicAccountStatus: String = "Status not loaded",
    privateActionLabel: String = "Link account",
    publicActionLabel: String = "Link account",
    onAccountAction: (ChatAccount) -> Unit = {},
    recentActivity: List<String> = emptyList()
) {
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
                            serviceSubtitle,
                            color = StudioPalette.Muted,
                            fontSize = 12.5.sp,
                            lineHeight = 17.sp
                        )
                    }
                    Row(
                        Modifier.clip(RoundedCornerShape(99.dp))
                            .background(if (serviceConnected) Color(0xFFE1F3EB) else Color(0xFFF8E8E6))
                            .padding(horizontal = 11.dp, vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(7.dp)
                    ) {
                        Box(
                            Modifier.size(8.dp).clip(CircleShape)
                                .background(if (serviceConnected) StudioPalette.Accent else StudioPalette.Bad)
                        )
                        Text(
                            if (serviceConnected) "Online" else "Offline",
                            color = if (serviceConnected) StudioPalette.Accent else StudioPalette.Bad,
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
                    state = privateAccountStatus,
                    onAction = { onAccountAction(ChatAccount.PRIVATE) }
                )
                StudioDivider()
                AccountRow(
                    account = ChatAccount.PUBLIC,
                    state = publicAccountStatus,
                    onAction = { onAccountAction(ChatAccount.PUBLIC) }
                )
            }
        }

        item { StudioSectionHeading("Setup") }
        item {
            StudioCard {
                StudioRow(
                    title = "Configuration",
                    subtitle = "Private Owner · Public Owner · Public bot number",
                    icon = Icons.Outlined.Tune,
                    trailing = "›",
                    onClick = onOpenConfiguration,
                    subtitleMaxLines = 1
                )
            }
        }

        item {
            Row(
                Modifier.fillMaxWidth().padding(top = 18.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Recent activity",
                    color = StudioPalette.Ink,
                    fontFamily = androidx.compose.material3.MaterialTheme.typography.titleLarge.fontFamily,
                    fontSize = 17.sp,
                    lineHeight = 22.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(Modifier.weight(1f))
                Text(
                    "View all",
                    color = StudioPalette.Accent,
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clickable(onClick = onOpenActivity).padding(5.dp)
                )
            }
        }
        item {
            StudioCard {
                if (recentActivity.isEmpty()) {
                    Text(
                        "No recent activity.",
                        color = StudioPalette.Muted,
                        fontSize = 13.sp,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 18.dp)
                    )
                } else {
                    recentActivity.take(3).forEachIndexed { index, line ->
                        if (index > 0) StudioDivider()
                        Text(
                            line,
                            color = StudioPalette.Ink,
                            fontSize = 12.5.sp,
                            lineHeight = 18.sp,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp)
                        )
                    }
                }
            }
        }
        item { Spacer(Modifier.height(10.dp)) }
    }
}

@Composable
private fun AccountRow(
    account: ChatAccount,
    state: String,
    actionLabel: String,
    onAction: () -> Unit
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
                    .clip(CircleShape)
                    .background(if (state.equals("Connected", true)) StudioPalette.Accent else StudioPalette.Bad)
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
        StudioActionButton(
            if (state.equals("Connected", true)) "Manage" else if (state.contains("paired", true)) "Reconnect" else "Link account",
            compact = true,
            primary = !state.equals("Connected", true),
            onClick = onAction
        )
    }
}
