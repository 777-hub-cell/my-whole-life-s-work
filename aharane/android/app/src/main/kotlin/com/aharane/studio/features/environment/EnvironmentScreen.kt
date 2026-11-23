package com.aharane.studio.features.environment

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.*
import kotlinx.coroutines.launch

data class EnvironmentValue(
    val key: String,
    val value: String,
    val readOnly: Boolean = false,
    val valueType: String? = null,
    val secret: Boolean = false
)

@Composable
fun EnvironmentScreen(
    values: List<EnvironmentValue> = emptyList(),
    connected: Boolean = false,
    onSave: suspend (List<EnvironmentValue>) -> Boolean = { false },
    previewMode: Boolean = false
) {
    val scope = rememberCoroutineScope()
    val drafts = remember(values) { mutableStateListOf<EnvironmentValue>().apply { addAll(values) } }
    var saving by remember { mutableStateOf(false) }
    var saveMessage by remember { mutableStateOf("") }
    var saveSucceeded by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        item {
            StudioPageTitle(
                "ENV",
                "Managed environment values for the Private and Public accounts. Command prefixes are fixed by Aharane."
            )
            if (previewMode) {
                Text(
                    "PREVIEW · Example values only. Changes are kept locally in this demo and are never sent to a server.",
                    color = StudioPalette.Accent,
                    fontSize = 11.5.sp,
                    lineHeight = 16.sp,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
            Spacer(Modifier.height(18.dp))
        }

        if (drafts.isNotEmpty()) {
            item {
                StudioCard {
                    drafts.forEachIndexed { index, item ->
                        if (index > 0) StudioDivider()
                        Column(
                            Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 11.dp),
                            verticalArrangement = Arrangement.spacedBy(7.dp)
                        ) {
                            Text(
                                item.key + if (item.readOnly) " · Fixed" else "",
                                color = StudioPalette.Ink,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                fontFamily = FontFamily.Monospace
                            )
                            if (item.secret) {
                                Text(
                                    item.value,
                                    color = StudioPalette.Muted,
                                    fontSize = 12.5.sp,
                                    modifier = Modifier.fillMaxWidth()
                                        .clip(RoundedCornerShape(9.dp))
                                        .background(StudioPalette.SurfaceVariant)
                                        .padding(horizontal = 12.dp, vertical = 11.dp)
                                )
                            } else if (item.valueType == "boolean") {
                                Row(
                                    Modifier.fillMaxWidth().clickable(enabled = (connected || previewMode) && !item.readOnly) {
                                        drafts[index] = item.copy(
                                            value = if (item.value.equals("true", true)) "false" else "true"
                                        )
                                    },
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        if (item.value.equals("true", true)) "On" else "Off",
                                        color = StudioPalette.Muted,
                                        fontSize = 13.sp,
                                        modifier = Modifier.weight(1f)
                                    )
                                    NativeToggle(
                                        checked = item.value.equals("true", true),
                                        enabled = (connected || previewMode) && !item.readOnly
                                    )
                                }
                            } else {
                                BasicTextField(
                    cursorBrush = SolidColor(StudioPalette.Accent),
                                    value = item.value,
                                    onValueChange = { value ->
                                        if ((connected || previewMode) && !item.readOnly) drafts[index] = item.copy(value = value)
                                    },
                                    readOnly = item.readOnly || (!connected && !previewMode),
                                    singleLine = item.key.endsWith("BOT_NAME") || item.key.endsWith("COMMAND_COOLDOWN"),
                                    minLines = if (item.key.endsWith("WELCOME_MESSAGE")) 3 else 1,
                                    maxLines = if (item.key.endsWith("WELCOME_MESSAGE")) 5 else 1,
                                    textStyle = TextStyle(
                                        color = if (item.readOnly || (!connected && !previewMode)) StudioPalette.Muted else StudioPalette.Ink,
                                        fontSize = 14.sp,
                                        lineHeight = 20.sp,
                                        fontFamily = FontFamily.Monospace
                                    ),
                                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                                        .background(StudioPalette.Surface)
                                        .border(1.dp, StudioPalette.Line, RoundedCornerShape(10.dp))
                                        .padding(horizontal = 12.dp, vertical = 11.dp)
                                )
                            }
                        }
                    }
                }
            }
        } else {
            item {
                StudioCard(padding = PaddingValues(horizontal = 16.dp, vertical = 22.dp)) {
                    Column(
                        Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(9.dp)
                    ) {
                        Box(
                            Modifier.size(46.dp).clip(CircleShape).background(StudioPalette.Soft),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Outlined.Terminal, contentDescription = null, tint = StudioPalette.Accent, modifier = Modifier.size(22.dp))
                        }
                        Text(
                            if (connected || previewMode) "No environment values yet"
                            else "Connect to Aharane",
                            color = StudioPalette.Ink,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            if (connected || previewMode) "Managed values will appear here when this server exposes them. Command prefixes remain fixed by Aharane."
                            else "Connect your server to view and manage its environment values.",
                            color = StudioPalette.Muted,
                            fontSize = 12.5.sp,
                            lineHeight = 18.sp,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }
        }

        item {
            if (drafts.isNotEmpty()) {
                Row(
                    Modifier.fillMaxWidth().padding(top = 2.dp, bottom = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    StudioActionButton(
                        if (saving) "Saving…" else "Save changes",
                        primary = true,
                        enabled = (connected || previewMode) && !saving,
                        onClick = {
                            scope.launch {
                                saving = true
                                val result = runCatching { onSave(drafts.toList()) }
                                saveSucceeded = result.getOrDefault(false)
                                saveMessage = when {
                                    saveSucceeded -> "Changes saved."
                                    result.exceptionOrNull()?.message?.isNotBlank() == true -> result.exceptionOrNull()?.message.orEmpty()
                                    else -> "Changes could not be saved. Check the connection and try again."
                                }
                                saving = false
                            }
                        }
                    )
                }
            }
            AnimatedVisibility(
                visible = saveMessage.isNotBlank(),
                enter = fadeIn(tween(if (LocalStudioMotionEnabled.current) 140 else 0)) +
                    expandVertically(tween(if (LocalStudioMotionEnabled.current) 170 else 0)),
                exit = fadeOut(tween(if (LocalStudioMotionEnabled.current) 100 else 0)) +
                    shrinkVertically(tween(if (LocalStudioMotionEnabled.current) 130 else 0))
            ) {
                Text(
                    saveMessage,
                    color = if (saveSucceeded) StudioPalette.Accent else StudioPalette.Bad,
                    fontSize = 12.sp,
                    lineHeight = 17.sp,
                    modifier = Modifier.padding(top = 4.dp, bottom = 10.dp)
                )
            }
            if (!connected && !previewMode) {
                Text(
                    "Connect your Aharane server to load and save these values.",
                    color = StudioPalette.Muted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp,
                    modifier = Modifier.padding(bottom = 12.dp)
                )
            }
        }
    }
}

@Composable
private fun NativeToggle(checked: Boolean, enabled: Boolean) {
    Box(
        Modifier.width(42.dp).height(24.dp).clip(CircleShape)
            .background(if (checked) StudioPalette.Accent else StudioPalette.Line)
            .padding(3.dp),
        contentAlignment = if (checked) Alignment.CenterEnd else Alignment.CenterStart
    ) {
        Box(
            Modifier.size(18.dp).clip(CircleShape)
                .background(if (enabled) Color.White else StudioPalette.Surface)
        )
    }
}
