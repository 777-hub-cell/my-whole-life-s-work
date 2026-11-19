package com.aharane.studio.features.environment

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.aharane.studio.core.design.*

private data class EnvDraft(val key: String, val value: String, val secret: Boolean)

@Composable
fun EnvironmentScreen() {
    val variables = remember { mutableStateListOf<EnvDraft>() }
    val revealed = remember { mutableStateMapOf<String, Boolean>() }
    var revealAll by rememberSaveable { mutableStateOf(false) }
    var addDialog by rememberSaveable { mutableStateOf(false) }
    var renameKey by rememberSaveable { mutableStateOf<String?>(null) }
    var draftKey by rememberSaveable { mutableStateOf("") }
    var draftValue by rememberSaveable { mutableStateOf("") }
    var draftSecret by rememberSaveable { mutableStateOf(false) }
    var menuKey by remember { mutableStateOf<String?>(null) }
    val clipboard = LocalClipboardManager.current

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        item {
            StudioPageTitle("ENV", "Edit any variable. Configuration reads and writes these too.")
            Spacer(Modifier.height(13.dp))
        }
        if (variables.any { it.secret }) {
            item {
                Row(Modifier.fillMaxWidth().heightIn(min = 42.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Show all secrets", color = StudioPalette.Muted, fontSize = 13.sp, modifier = Modifier.weight(1f))
                    NativeSwitch(revealAll) { revealAll = it }
                }
                Spacer(Modifier.height(8.dp))
            }
        }
        item {
            StudioCard {
                if (variables.isEmpty()) {
                    StudioEmpty(
                        title = "No variables yet.",
                        description = "Connect Aharane to load your server environment. Additions made here stay local until the server connection is available."
                    )
                } else {
                    variables.forEachIndexed { index, variable ->
                        if (index > 0) StudioDivider()
                        Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 11.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    variable.key,
                                    color = StudioPalette.Ink,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    fontFamily = FontFamily.Monospace,
                                    modifier = Modifier.weight(1f)
                                )
                                if (variable.secret) {
                                    val visible = revealed[variable.key] ?: revealAll
                                    Text(
                                        if (visible) "Hide" else "Show",
                                        color = StudioPalette.Accent,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        modifier = Modifier.clickable {
                                            revealed[variable.key] = !visible
                                        }.padding(horizontal = 7.dp, vertical = 5.dp)
                                    )
                                }
                                Box(Modifier.size(32.dp), contentAlignment = Alignment.Center) {
                                    androidx.compose.material3.IconButton(
                                        onClick = { menuKey = variable.key },
                                        modifier = Modifier.size(32.dp)
                                    ) {
                                        Icon(Icons.Outlined.MoreVert, "Variable actions",
                                            tint = StudioPalette.Muted, modifier = Modifier.size(19.dp))
                                    }
                                    StudioFloatingMenu(
                                        expanded = menuKey == variable.key,
                                        onDismiss = { menuKey = null },
                                        actions = listOf(
                                            StudioMenuAction("Copy name") {
                                                clipboard.setText(AnnotatedString(variable.key))
                                            },
                                            StudioMenuAction("Copy value") {
                                                clipboard.setText(AnnotatedString(variable.value))
                                            },
                                            StudioMenuAction("Rename") {
                                                renameKey = variable.key
                                                draftKey = variable.key
                                                draftValue = variable.value
                                                draftSecret = variable.secret
                                                addDialog = true
                                            },
                                            StudioMenuAction("Delete", destructive = true) {
                                                variables.remove(variable)
                                                revealed.remove(variable.key)
                                            }
                                        )
                                    )
                                }
                            }
                            Spacer(Modifier.height(7.dp))
                            val visible = !variable.secret || (revealed[variable.key] ?: revealAll)
                            BasicTextField(
                                value = variable.value,
                                onValueChange = { next ->
                                    val at = variables.indexOfFirst { it.key == variable.key }
                                    if (at >= 0) variables[at] = variable.copy(value = next)
                                },
                                singleLine = true,
                                visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
                                textStyle = TextStyle(
                                    color = StudioPalette.Ink, fontSize = 14.sp, lineHeight = 20.sp,
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
        item {
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StudioActionButton("Add variable", modifier = Modifier.weight(1f), onClick = {
                    renameKey = null
                    draftKey = ""
                    draftValue = ""
                    draftSecret = false
                    addDialog = true
                })
                StudioActionButton(
                    "Save changes",
                    modifier = Modifier.weight(1f),
                    primary = true,
                    enabled = false,
                    onClick = {}
                )
            }
            Spacer(Modifier.height(12.dp))
            Text(
                "Changes are local drafts only. Saving to the server will be available after secure server linking.",
                color = StudioPalette.Muted,
                fontSize = 12.5.sp,
                lineHeight = 18.sp
            )
        }
        item { Spacer(Modifier.height(12.dp)) }
    }

    if (addDialog) {
        Dialog(onDismissRequest = { addDialog = false }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(StudioPalette.Surface).padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    if (renameKey == null) "Add variable" else "Rename variable",
                    color = StudioPalette.Ink, fontSize = 19.sp, fontWeight = FontWeight.Bold
                )
                EnvDraftInput(draftKey, { draftKey = it }, "VARIABLE_NAME", true)
                EnvDraftInput(draftValue, { draftValue = it }, "Value", true)
                Row(
                    Modifier.fillMaxWidth().clickable { draftSecret = !draftSecret }.padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Treat value as a secret", color = StudioPalette.Ink, fontSize = 13.sp, modifier = Modifier.weight(1f))
                    NativeSwitch(draftSecret) { draftSecret = it }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    StudioActionButton("Cancel", modifier = Modifier.weight(1f), onClick = { addDialog = false })
                    StudioActionButton("Save draft", modifier = Modifier.weight(1f), primary = true, onClick = {
                        val key = draftKey.trim().uppercase().replace(Regex("[^A-Z0-9_]"), "_")
                        if (key.isNotEmpty() && key.first().let { it == '_' || it.isLetter() } &&
                            key.all { it == '_' || it.isLetterOrDigit() }) {
                            if (renameKey != null) {
                                val at = variables.indexOfFirst { it.key == renameKey }
                                if (at >= 0 && variables.none { it.key == key && it.key != renameKey }) {
                                    variables[at] = EnvDraft(key, draftValue, draftSecret)
                                }
                            } else if (variables.none { it.key == key }) {
                                variables.add(EnvDraft(key, draftValue, draftSecret))
                            }
                            addDialog = false
                        }
                    })
                }
            }
        }
    }
}

@Composable
private fun EnvDraftInput(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    monospace: Boolean
) {
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
            .background(StudioPalette.Surface).border(1.dp, StudioPalette.Line, RoundedCornerShape(10.dp))
            .padding(horizontal = 12.dp, vertical = 11.dp)
    ) {
        if (value.isEmpty()) Text(placeholder, color = StudioPalette.Muted, fontSize = 13.sp)
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = TextStyle(
                color = StudioPalette.Ink, fontSize = 14.sp,
                fontFamily = if (monospace) FontFamily.Monospace else FontFamily.SansSerif
            )
        )
    }
}

@Composable
private fun NativeSwitch(value: Boolean, onChange: (Boolean) -> Unit) {
    Box(
        Modifier.size(width = 38.dp, height = 22.dp).clip(RoundedCornerShape(99.dp))
            .background(if (value) StudioPalette.Accent else StudioPalette.Line)
            .clickable { onChange(!value) }.padding(3.dp),
        contentAlignment = if (value) Alignment.CenterEnd else Alignment.CenterStart
    ) {
        Box(Modifier.size(16.dp).clip(RoundedCornerShape(99.dp)).background(Color.White))
    }
}
