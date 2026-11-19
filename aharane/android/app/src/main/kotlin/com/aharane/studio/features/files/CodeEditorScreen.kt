package com.aharane.studio.features.files

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BugReport
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Save
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val EditorBackground = Color(0xFF1E1E1E)
private val EditorPanel = Color(0xFF252526)
private val EditorTab = Color(0xFF2D2D2D)
private val EditorLine = Color(0xFF3C3C3C)
private val EditorText = Color(0xFFD4D4D4)
private val EditorMuted = Color(0xFF858585)
private val EditorBlue = Color(0xFF007ACC)

@Composable
fun CodeEditorScreen(
    modifier: Modifier = Modifier,
    onClose: () -> Unit
) {
    var explorerOpen by rememberSaveable { mutableStateOf(false) }
    var panelOpen by rememberSaveable { mutableStateOf(false) }
    var panelTab by rememberSaveable { mutableStateOf("Problems") }

    BackHandler {
        when {
            explorerOpen -> explorerOpen = false
            panelOpen -> panelOpen = false
            else -> onClose()
        }
    }

    Column(modifier.fillMaxSize().background(EditorBackground).navigationBarsPadding()) {
        Row(
            Modifier.fillMaxWidth().height(46.dp).background(EditorPanel),
            verticalAlignment = Alignment.CenterVertically
        ) {
            EditorTool(Icons.Outlined.Close, "Close editor", onClose)
            EditorTool(
                Icons.Outlined.FolderOpen,
                if (explorerOpen) "Hide explorer" else "Show explorer"
            ) { explorerOpen = !explorerOpen }

            Row(
                Modifier.weight(1f).padding(horizontal = 5.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Aharane", color = EditorMuted, fontSize = 12.sp, maxLines = 1)
                Icon(Icons.Outlined.ChevronRight, null, tint = EditorMuted, modifier = Modifier.size(15.dp))
                Text("Files", color = EditorText, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            }

            EditorTool(Icons.Outlined.Save, "Save", enabled = false) {}
            EditorTool(
                Icons.Outlined.BugReport,
                if (panelOpen) "Hide problems" else "Show problems"
            ) { panelOpen = !panelOpen }
            EditorTool(Icons.Outlined.MoreVert, "More editor actions") { explorerOpen = !explorerOpen }
        }

        Row(
            Modifier.fillMaxWidth().height(40.dp).background(EditorPanel),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(Modifier.width(3.dp).fillMaxHeight().background(EditorBlue))
            Text(
                "No file open",
                color = EditorMuted,
                fontSize = 12.5.sp,
                modifier = Modifier.padding(horizontal = 12.dp)
            )
        }

        Box(Modifier.weight(1f).fillMaxWidth().background(EditorBackground)) {
            Column(
                Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text(
                    "No file open",
                    color = EditorText,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    "Select a source file from Explorer to start editing.",
                    color = EditorMuted,
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(start = 28.dp, end = 28.dp, top = 7.dp)
                )
            }

            if (explorerOpen) {
                Box(
                    Modifier.fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.38f))
                        .clickable { explorerOpen = false }
                )
                Column(
                    Modifier.align(Alignment.CenterStart)
                        .fillMaxHeight()
                        .fillMaxWidth(0.82f)
                        .widthIn(max = 300.dp)
                        .background(EditorPanel)
                ) {
                    Row(
                        Modifier.fillMaxWidth().height(40.dp).padding(start = 14.dp, end = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            "EXPLORER",
                            color = EditorMuted,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            letterSpacing = 0.7.sp
                        )
                        Spacer(Modifier.weight(1f))
                        EditorTool(Icons.Outlined.Close, "Close explorer") { explorerOpen = false }
                    }
                    Row(
                        Modifier.fillMaxWidth().height(34.dp).padding(horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("⌄", color = EditorMuted, fontSize = 13.sp)
                        Text(
                            "AHARANE",
                            color = EditorText,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.6.sp,
                            modifier = Modifier.padding(start = 7.dp)
                        )
                    }
                    Box(
                        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)
                            .clip(RoundedCornerShape(6.dp)).background(Color(0xFF202020))
                            .padding(11.dp)
                    ) {
                        Text("No files loaded", color = EditorMuted, fontSize = 12.sp)
                    }
                    Text(
                        "Connect to your Aharane server to browse source files.",
                        color = EditorMuted,
                        fontSize = 11.sp,
                        lineHeight = 16.sp,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 3.dp)
                    )
                }
            }

            if (panelOpen) {
                Column(
                    Modifier.align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .height(204.dp)
                        .background(EditorPanel)
                ) {
                    Row(
                        Modifier.fillMaxWidth().height(39.dp).padding(start = 8.dp, end = 5.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        EditorPanelTab("Problems", panelTab == "Problems") { panelTab = "Problems" }
                        EditorPanelTab("Output", panelTab == "Output") { panelTab = "Output" }
                        EditorPanelTab("Terminal", panelTab == "Terminal") { panelTab = "Terminal" }
                        Spacer(Modifier.weight(1f))
                        EditorTool(Icons.Outlined.Close, "Close bottom panel") { panelOpen = false }
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(EditorLine))
                    Text(
                        when (panelTab) {
                            "Problems" -> "No problems to display."
                            "Output" -> "No output is available while the server is disconnected."
                            else -> "The live bot console appears when a server is connected."
                        },
                        color = EditorMuted,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(14.dp)
                    )
                }
            }
        }

        Row(
            Modifier.fillMaxWidth().height(34.dp).background(EditorBlue).padding(horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Aharane", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            Text("Ln 1, Col 1", color = Color.White, fontSize = 11.sp)
            Spacer(Modifier.width(12.dp))
            Text("Plain text", color = Color.White, fontSize = 11.sp)
        }
    }
}

@Composable
private fun EditorTool(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    description: String,
    enabled: Boolean = true,
    onClick: () -> Unit
) {
    Box(
        Modifier.size(40.dp).clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            icon,
            contentDescription = description,
            tint = if (enabled) EditorText else EditorMuted.copy(alpha = 0.4f),
            modifier = Modifier.size(18.dp)
        )
    }
}

@Composable
private fun EditorPanelTab(
    label: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    Column(
        Modifier.height(39.dp).clickable(onClick = onClick)
            .padding(horizontal = 9.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            label.uppercase(),
            color = if (selected) Color.White else EditorMuted,
            fontSize = 10.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            letterSpacing = 0.4.sp
        )
        Spacer(Modifier.height(5.dp))
        Box(
            Modifier.width(26.dp).height(2.dp)
                .background(if (selected) EditorBlue else Color.Transparent)
        )
    }
}
