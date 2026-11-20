package com.aharane.studio.features.home

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
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
import androidx.compose.ui.graphics.drawscope.Stroke
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
                        HomeConnectionIndicator(connected = serviceConnected, size = 20.dp)
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
                    actionLabel = privateActionLabel,
                    onAction = { onAccountAction(ChatAccount.PRIVATE) }
                )
                StudioDivider()
                AccountRow(
                    account = ChatAccount.PUBLIC,
                    state = publicAccountStatus,
                    actionLabel = publicActionLabel,
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
                        when {
                            serviceSubtitle == "Preview only" -> "Preview activity samples are not available."
                            !serviceConnected -> "Connect to your Aharane server to load recent activity."
                            else -> "No recent activity."
                        },
                        color = StudioPalette.Muted,
                        fontSize = 13.sp,
                        lineHeight = 18.sp,
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
private fun HomeConnectionIndicator(
    connected: Boolean,
    size: androidx.compose.ui.unit.Dp,
    modifier: Modifier = Modifier
) {
    val tint = if (connected) Color(0xFF16865F) else Color(0xFFD84A45)
    val transition = rememberInfiniteTransition(label = "home-connection-pulse")
    val progress = transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1900, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "home-connection-ring"
    ).value
    Canvas(modifier.size(size)) {
        val center = androidx.compose.ui.geometry.Offset(this.size.width / 2f, this.size.height / 2f)
        val maxRadius = this.size.minDimension * .43f
        drawCircle(
            color = tint.copy(alpha = (1f - progress) * .34f),
            radius = this.size.minDimension * (.23f + progress * .18f),
            center = center,
            style = Stroke(width = this.size.minDimension * .075f)
        )
        drawCircle(color = tint, radius = maxRadius * .55f, center = center)
        val stroke = this.size.minDimension * .09f
        if (connected) {
            drawLine(Color.White, androidx.compose.ui.geometry.Offset(this.size.width * .34f, this.size.height * .51f), androidx.compose.ui.geometry.Offset(this.size.width * .46f, this.size.height * .64f), strokeWidth = stroke, cap = androidx.compose.ui.graphics.StrokeCap.Round)
            drawLine(Color.White, androidx.compose.ui.geometry.Offset(this.size.width * .46f, this.size.height * .64f), androidx.compose.ui.geometry.Offset(this.size.width * .69f, this.size.height * .37f), strokeWidth = stroke, cap = androidx.compose.ui.graphics.StrokeCap.Round)
        } else {
            drawLine(Color.White, androidx.compose.ui.geometry.Offset(this.size.width * .39f, this.size.height * .39f), androidx.compose.ui.geometry.Offset(this.size.width * .61f, this.size.height * .61f), strokeWidth = stroke, cap = androidx.compose.ui.graphics.StrokeCap.Round)
            drawLine(Color.White, androidx.compose.ui.geometry.Offset(this.size.width * .61f, this.size.height * .39f), androidx.compose.ui.geometry.Offset(this.size.width * .39f, this.size.height * .61f), strokeWidth = stroke, cap = androidx.compose.ui.graphics.StrokeCap.Round)
        }
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
            HomeConnectionIndicator(
                connected = state.equals("Connected", true),
                size = 22.dp,
                modifier = Modifier.align(Alignment.BottomEnd)
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
            actionLabel,
            compact = true,
            primary = !state.equals("Connected", true),
            onClick = onAction
        )
    }
}
