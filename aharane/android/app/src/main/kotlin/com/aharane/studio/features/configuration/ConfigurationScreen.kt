package com.aharane.studio.features.configuration

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.*

@Composable
fun ConfigurationScreen(
    onBack: () -> Unit,
    onEditConfig: () -> Unit
) {
    var profile by rememberSaveable { mutableStateOf("Private") }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        item {
            Text(
                "‹  Back to Home",
                color = StudioPalette.Accent,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clip(RoundedCornerShape(8.dp))
                    .clickable(onClick = onBack).padding(vertical = 6.dp)
            )
            Spacer(Modifier.height(9.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Configuration",
                    color = StudioPalette.Ink,
                    fontFamily = androidx.compose.material3.MaterialTheme.typography.headlineLarge.fontFamily,
                    fontSize = 30.sp,
                    lineHeight = 33.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = (-0.75).sp,
                    modifier = Modifier.weight(1f)
                )
                Box(
                    Modifier.size(42.dp).clip(CircleShape).background(StudioPalette.Surface)
                        .border(1.dp, StudioPalette.Line, CircleShape)
                        .clickable { profile = if (profile == "Private") "Public" else "Private" },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        if (profile == "Private") Icons.Outlined.Lock else Icons.Outlined.Public,
                        contentDescription = "Switch configuration account",
                        tint = StudioPalette.Accent,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
            Text(
                "$profile account · changes sync with the ENV tab.",
                color = StudioPalette.Muted,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                modifier = Modifier.padding(top = 5.dp)
            )
            Spacer(Modifier.height(3.dp))
        }

        item { StudioSectionHeading("General") }
        item {
            StudioCard {
                ConfigField("Bot name", "BOT_NAME")
                StudioDivider()
                ConfigField("Command prefix", "PREFIX")
                StudioDivider()
                ConfigField(if (profile == "Public") "Account number" else "Owner number",
                    if (profile == "Public") "PUBLIC_NUMBER" else "OWNER_NUMBER")
            }
        }

        item { StudioSectionHeading("Behavior") }
        item {
            StudioCard {
                ConfigToggle("Mark messages as read", "Show blue ticks when the bot sees a message.", "AUTO_READ")
                StudioDivider()
                ConfigToggle("Show typing", "Display “typing…” while the bot prepares a reply.", "SHOW_TYPING")
                StudioDivider()
                ConfigToggle("Decline calls", "Automatically reject incoming calls.", "REJECT_CALLS")
                StudioDivider()
                ConfigToggle("Always online", "Keep the bot’s status as online.", "ALWAYS_ONLINE")
                StudioDivider()
                Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Command cooldown", color = StudioPalette.Ink,
                                fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                            Text("Wait time between commands from the same person.",
                                color = StudioPalette.Muted, fontSize = 12.5.sp, lineHeight = 17.sp)
                        }
                        Text("—", color = StudioPalette.Muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                    Box(
                        Modifier.fillMaxWidth().padding(top = 15.dp)
                            .height(4.dp).clip(RoundedCornerShape(99.dp)).background(StudioPalette.Line)
                    )
                    Text("COMMAND_COOLDOWN · Not loaded", color = StudioPalette.Muted,
                        fontSize = 11.sp, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                        modifier = Modifier.padding(top = 7.dp))
                }
            }
        }

        item { StudioSectionHeading("Messages") }
        item {
            StudioCard {
                Column(Modifier.fillMaxWidth().padding(14.dp)) {
                    Text("Welcome message", color = StudioPalette.Ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Text("WELCOME_MESSAGE", color = StudioPalette.Muted,
                        fontSize = 11.sp, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                        modifier = Modifier.padding(top = 2.dp, bottom = 7.dp))
                    Box(
                        Modifier.fillMaxWidth().heightIn(min = 88.dp)
                            .clip(RoundedCornerShape(10.dp)).background(StudioPalette.Background)
                            .border(1.dp, StudioPalette.Line, RoundedCornerShape(10.dp))
                            .padding(12.dp)
                    ) {
                        Text(
                            "Connect to load the welcome message",
                            color = StudioPalette.Muted,
                            fontSize = 13.sp,
                            lineHeight = 19.sp
                        )
                    }
                }
            }
        }

        item { StudioSectionHeading("Advanced") }
        item {
            StudioCard {
                StudioRow(
                    title = "Edit config.js",
                    subtitle = "Open the file in the code editor",
                    icon = Icons.Outlined.Tune,
                    trailing = "›",
                    onClick = onEditConfig
                )
            }
            Spacer(Modifier.height(13.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Connect your Aharane server to load and change live settings.",
                    color = StudioPalette.Muted,
                    fontSize = 12.5.sp,
                    lineHeight = 18.sp,
                    modifier = Modifier.weight(1f)
                )
                StudioTag("Not connected")
            }
            Spacer(Modifier.height(12.dp))
            StudioActionButton("Save changes", modifier = Modifier.fillMaxWidth(),
                primary = true, enabled = false, onClick = {})
        }
        item { Spacer(Modifier.height(12.dp)) }
    }
}

@Composable
private fun ConfigField(label: String, key: String) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 11.dp)) {
        Text(label, color = StudioPalette.Ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Text(key, color = StudioPalette.Muted, fontSize = 11.sp,
            fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
            modifier = Modifier.padding(top = 2.dp, bottom = 7.dp))
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                .background(StudioPalette.Background).border(1.dp, StudioPalette.Line, RoundedCornerShape(10.dp))
                .padding(horizontal = 12.dp, vertical = 10.dp)
        ) {
            Text("Connect to load", color = StudioPalette.Muted, fontSize = 13.sp)
        }
    }
}

@Composable
private fun ConfigToggle(title: String, description: String, key: String) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 66.dp).padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, color = StudioPalette.Ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Text(description, color = StudioPalette.Muted, fontSize = 12.5.sp, lineHeight = 17.sp)
            Text(key, color = StudioPalette.Muted, fontSize = 10.5.sp,
                fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
        }
        Box(
            Modifier.size(width = 38.dp, height = 22.dp).clip(RoundedCornerShape(99.dp))
                .background(StudioPalette.Line),
            contentAlignment = Alignment.CenterStart
        ) {
            Box(Modifier.padding(start = 3.dp).size(16.dp).clip(CircleShape).background(StudioPalette.Surface))
        }
    }
}
