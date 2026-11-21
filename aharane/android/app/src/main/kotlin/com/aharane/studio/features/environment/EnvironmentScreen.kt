package com.aharane.studio.features.environment

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
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
    val secret: Boolean = false,
    val configured: Boolean = false
)

@Composable
fun EnvironmentScreen(
    values: List<EnvironmentValue> = emptyList(),
    connected: Boolean = false,
    onSave: suspend (List<EnvironmentValue>) -> Boolean = { false },
    previewMode: Boolean = false
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val drafts = remember(values) { mutableStateListOf<EnvironmentValue>().apply { addAll(values) } }
    var saving by remember { mutableStateOf(false) }

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
                        if (item.key == "AI_API_BASE_URL") {
                            Column(
                                Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 13.dp),
                                verticalArrangement = Arrangement.spacedBy(5.dp)
                            ) {
                                Text(
                                    "SHARED AI REPLY",
                                    color = StudioPalette.Accent,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 1.sp
                                )
                                Text(
                                    "One AI provider is shared by Private and Public chats. Add an API key and model to enable AI Reply on incoming messages.",
                                    color = StudioPalette.Muted,
                                    fontSize = 12.sp,
                                    lineHeight = 17.sp
                                )
                            }
                        }
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
                            if (item.valueType == "boolean") {
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
                                    visualTransformation = if (item.secret) PasswordVisualTransformation() else VisualTransformation.None,
                                    singleLine = item.secret || item.key.endsWith("BOT_NAME") || item.key.endsWith("COMMAND_COOLDOWN") || item.key == "AI_API_BASE_URL" || item.key == "AI_MODEL",
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
                            if (item.key == "AI_API_KEY") {
                                Text(
                                    if (item.configured) "A key is already saved. Leave this blank to keep it, or enter a replacement."
                                    else "No key is configured. Enter an API key to enable AI Reply.",
                                    color = StudioPalette.Muted,
                                    fontSize = 11.5.sp,
                                    lineHeight = 16.sp
                                )
                            } else if (item.key == "AI_CLEAR_API_KEY") {
                                Text(
                                    "Turn on to remove the saved key and disable any server ENV key fallback, then save changes.",
                                    color = StudioPalette.Muted,
                                    fontSize = 11.5.sp,
                                    lineHeight = 16.sp
                                )
                            }
                        }
                    }
                }
            }
        } else {
            item {
                Box(
                    Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 15.dp)
                        .height(1.dp).background(StudioPalette.Line)
                )
            }
        }

        item {
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
                            val saved = runCatching { onSave(drafts.toList()) }.getOrDefault(false)
                            Toast.makeText(
                                context,
                                if (saved) "ENV values saved." else "ENV values could not be saved.",
                                Toast.LENGTH_SHORT
                            ).show()
                            saving = false
                        }
                    }
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
