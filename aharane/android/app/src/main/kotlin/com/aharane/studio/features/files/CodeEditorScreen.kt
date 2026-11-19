package com.aharane.studio.features.files

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BugReport
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Save
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val EditorBackground = Color(0xFF1E1E1E)
private val EditorPanel = Color(0xFF252526)
private val EditorTab = Color(0xFF2D2D2D)
private val EditorLine = Color(0xFF3C3C3C)
private val EditorText = Color(0xFFD4D4D4)
private val EditorMuted = Color(0xFF858585)
private val EditorBlue = Color(0xFF007ACC)

data class StudioEditorDocument(
    val path: String,
    val content: String,
    val languageLabel: String = path.substringAfterLast('.', "Plain text").replaceFirstChar { it.uppercase() }
)

@Composable
fun CodeEditorScreen(
    modifier: Modifier = Modifier,
    onClose: () -> Unit,
    openDocuments: List<StudioEditorDocument> = emptyList(),
    activeDocumentPath: String? = openDocuments.firstOrNull()?.path,
    availableFiles: List<String> = emptyList(),
    editable: Boolean = false,
    lineNumbers: Boolean = true,
    fontSizeSp: Int = 14,
    onOpenFile: (String) -> Unit = {},
    onSelectDocument: (String) -> Unit = {},
    onContentChange: (String, String) -> Unit = { _, _ -> },
    onSave: (String, String) -> Unit = { _, _ -> }
) {
    var explorerOpen by rememberSaveable { mutableStateOf(false) }
    var panelOpen by rememberSaveable { mutableStateOf(false) }
    var panelTab by rememberSaveable { mutableStateOf("Problems") }
    var moreOpen by rememberSaveable { mutableStateOf(false) }
    var editorFocused by remember { mutableStateOf(false) }
    var activeSearch by rememberSaveable { mutableStateOf(false) }
    var searchText by rememberSaveable { mutableStateOf("") }

    val activeDocument = openDocuments.firstOrNull { it.path == activeDocumentPath }
    var editorText by remember(activeDocument?.path, activeDocument?.content) {
        mutableStateOf(activeDocument?.content.orEmpty())
    }
    var dirty by remember(activeDocument?.path, activeDocument?.content) { mutableStateOf(false) }
    val verticalScroll = rememberScrollState()
    val horizontalScroll = rememberScrollState()

    BackHandler(explorerOpen || panelOpen || moreOpen || activeSearch) {
        when {
            moreOpen -> moreOpen = false
            activeSearch -> activeSearch = false
            explorerOpen -> explorerOpen = false
            panelOpen -> panelOpen = false
        }
    }

    Column(modifier.fillMaxSize().background(EditorBackground).navigationBarsPadding()) {
        // Workbench toolbar: compact, dark, and visually separate from the Studio shell.
        Row(
            Modifier.fillMaxWidth().height(46.dp).background(EditorPanel),
            verticalAlignment = Alignment.CenterVertically
        ) {
            EditorTool(Icons.Outlined.Close, "Close editor", onClick = onClose)
            EditorTool(
                Icons.Outlined.FolderOpen,
                if (explorerOpen) "Hide explorer" else "Show explorer",
                onClick = { explorerOpen = !explorerOpen }
            )
            Row(
                Modifier.weight(1f).padding(horizontal = 5.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Aharane", color = EditorMuted, fontSize = 12.sp, maxLines = 1)
                Icon(Icons.Outlined.ChevronRight, null, tint = EditorMuted, modifier = Modifier.size(15.dp))
                Text(
                    activeDocument?.path ?: "Files",
                    color = EditorText,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            EditorTool(
                Icons.Outlined.Save,
                "Save file",
                enabled = editable && dirty && activeDocument != null,
                onClick = {
                    activeDocument?.let { onSave(it.path, editorText); dirty = false }
                }
            )
            EditorTool(
                Icons.Outlined.BugReport,
                if (panelOpen) "Hide bottom panel" else "Show bottom panel",
                onClick = { panelOpen = !panelOpen }
            )
            Box {
                EditorTool(Icons.Outlined.MoreVert, "More editor actions", onClick = { moreOpen = !moreOpen })
                if (moreOpen) {
                    EditorPopupMenu(
                        actions = listOf(
                            "Find in file" to { activeSearch = true; moreOpen = false },
                            "Toggle explorer" to { explorerOpen = !explorerOpen; moreOpen = false },
                            "Toggle problems" to { panelOpen = !panelOpen; moreOpen = false }
                        ),
                        onDismiss = { moreOpen = false }
                    )
                }
            }
        }

        if (activeSearch) {
            Row(
                Modifier.fillMaxWidth().background(EditorPanel).padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Outlined.Search, null, tint = EditorMuted, modifier = Modifier.size(17.dp))
                BasicTextField(
                    value = searchText,
                    onValueChange = { searchText = it },
                    singleLine = true,
                    textStyle = TextStyle(color = EditorText, fontSize = 12.sp, fontFamily = FontFamily.Monospace),
                    modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
                    decorationBox = { inner ->
                        Box {
                            if (searchText.isEmpty()) Text("Find", color = EditorMuted, fontSize = 12.sp)
                            inner()
                        }
                    }
                )
                EditorTool(Icons.Outlined.Close, "Close search", onClick = { activeSearch = false })
            }
        }

        // Open-file tabs mirror the web workbench's horizontally scrolling tab strip.
        Row(
            Modifier.fillMaxWidth().height(40.dp).background(EditorPanel)
                .horizontalScroll(rememberScrollState()),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (openDocuments.isEmpty()) {
                Box(Modifier.width(3.dp).fillMaxHeight().background(EditorBlue))
                Text("No file open", color = EditorMuted, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 12.dp))
            } else {
                openDocuments.forEach { document ->
                    val active = document.path == activeDocumentPath
                    Row(
                        Modifier.fillMaxHeight()
                            .background(if (active) EditorBackground else EditorTab)
                            .clickable { onSelectDocument(document.path) }
                            .then(if (active) Modifier else Modifier)
                            .padding(start = 12.dp, end = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (active) Box(Modifier.width(3.dp).fillMaxHeight().background(EditorBlue))
                        Text(
                            document.path.substringAfterLast('/'),
                            color = if (active) Color.White else EditorMuted,
                            fontSize = 12.sp,
                            maxLines = 1,
                            modifier = Modifier.padding(horizontal = 7.dp)
                        )
                        Text("×", color = EditorMuted, fontSize = 16.sp, modifier = Modifier.padding(start = 5.dp))
                    }
                    Box(Modifier.width(1.dp).fillMaxHeight().background(EditorBackground))
                }
            }
        }

        if (activeDocument == null) {
            Box(Modifier.weight(1f).fillMaxWidth().background(EditorBackground)) {
                Column(
                    Modifier.align(Alignment.Center).padding(horizontal = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("No file open", color = EditorText, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Text(
                        "Select a source file from Explorer to start editing.",
                        color = EditorMuted,
                        fontSize = 12.sp,
                        lineHeight = 18.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 7.dp)
                    )
                    if (availableFiles.isEmpty()) {
                        Text(
                            "Connect to your Aharane server to load the source tree.",
                            color = EditorMuted,
                            fontSize = 11.sp,
                            lineHeight = 16.sp,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(top = 7.dp)
                        )
                    }
                }
                if (explorerOpen) {
                    ExplorerDrawer(
                        files = availableFiles,
                        onOpen = { path -> explorerOpen = false; onOpenFile(path) },
                        onClose = { explorerOpen = false }
                    )
                }
                if (panelOpen) {
                    EditorBottomPanel(
                        modifier = Modifier.align(Alignment.BottomCenter),
                        tab = panelTab,
                        onTabSelected = { panelTab = it },
                        onClose = { panelOpen = false },
                        message = when (panelTab) {
                            "Problems" -> "No problems to display."
                            "Output" -> "No output is available while the server is disconnected."
                            else -> "The live bot console appears when a server is connected."
                        }
                    )
                }
            }
        } else {
            Row(Modifier.weight(1f).fillMaxWidth().background(EditorBackground)) {
                if (lineNumbers) {
                    val lineCount = editorText.count { it == '\n' } + 1
                    val numbers = (1..lineCount).joinToString("\n")
                    Text(
                        numbers,
                        color = Color(0xFF6E7681),
                        fontFamily = FontFamily.Monospace,
                        fontSize = fontSizeSp.sp,
                        lineHeight = (fontSizeSp * 1.5f).sp,
                        textAlign = TextAlign.End,
                        modifier = Modifier.width(45.dp).fillMaxHeight()
                            .background(EditorBackground)
                            .verticalScroll(verticalScroll)
                            .padding(start = 7.dp, end = 9.dp, top = 12.dp, bottom = 56.dp)
                    )
                }
                BasicTextField(
                    value = editorText,
                    onValueChange = { next ->
                        editorText = next
                        dirty = true
                        onContentChange(activeDocument.path, next)
                    },
                    readOnly = !editable,
                    textStyle = TextStyle(
                        color = EditorText,
                        fontFamily = FontFamily.Monospace,
                        fontSize = fontSizeSp.sp,
                        lineHeight = (fontSizeSp * 1.5f).sp
                    ),
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.None,
                        autoCorrectEnabled = false,
                        keyboardType = KeyboardType.Ascii
                    ),
                    modifier = Modifier.weight(1f).fillMaxHeight()
                        .horizontalScroll(horizontalScroll)
                        .verticalScroll(verticalScroll)
                        .onFocusChanged { editorFocused = it.isFocused }
                        .padding(start = 12.dp, end = 16.dp, top = 12.dp, bottom = 56.dp)
                )
                if (explorerOpen) {
                    ExplorerDrawer(
                        files = availableFiles,
                        onOpen = { path -> explorerOpen = false; onOpenFile(path) },
                        onClose = { explorerOpen = false }
                    )
                }
                if (panelOpen) {
                    EditorBottomPanel(
                        tab = panelTab,
                        onTabSelected = { panelTab = it },
                        onClose = { panelOpen = false },
                        message = when (panelTab) {
                            "Problems" -> "No problems to display."
                            "Output" -> "No output is available while the server is disconnected."
                            else -> "The live bot console appears when a server is connected."
                        }
                    )
                }
            }
        }

        if (editorFocused && editable) {
            Row(
                Modifier.fillMaxWidth().background(EditorPanel)
                    .padding(horizontal = 4.dp, vertical = 4.dp)
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                listOf("TAB", "{", "}", "(", ")", "[", "]", ";", "=", ":", "\\").forEach { key ->
                    Box(
                        Modifier.widthIn(min = 38.dp).height(36.dp).clip(RoundedCornerShape(6.dp))
                            .background(EditorLine).clickable {
                                editorText += if (key == "TAB") "  " else key
                                activeDocument?.let { onContentChange(it.path, editorText) }
                                dirty = true
                            }.padding(horizontal = 9.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(key, color = EditorText, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                            fontFamily = FontFamily.Monospace)
                    }
                }
            }
        }

        // VS Code-style compact status strip.
        Row(
            Modifier.fillMaxWidth().height(34.dp).background(EditorBlue).padding(horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Aharane", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            if (dirty) Text("  ●", color = Color.White, fontSize = 10.sp)
            Spacer(Modifier.weight(1f))
            Text(
                if (activeDocument == null) "No file" else if (dirty) "Unsaved" else "Saved",
                color = Color.White.copy(alpha = .9f), fontSize = 10.5.sp
            )
            Spacer(Modifier.width(12.dp))
            Text(activeDocument?.languageLabel ?: "Plain text", color = Color.White, fontSize = 10.5.sp)
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
private fun EditorPopupMenu(
    actions: List<Pair<String, () -> Unit>>,
    onDismiss: () -> Unit
) {
    androidx.compose.ui.window.Popup(
        alignment = Alignment.TopEnd,
        onDismissRequest = onDismiss,
        properties = androidx.compose.ui.window.PopupProperties(focusable = true)
    ) {
        Column(
            Modifier.width(190.dp).clip(RoundedCornerShape(9.dp))
                .background(Color.White)
                .padding(vertical = 5.dp)
        ) {
            actions.forEach { (label, action) ->
                Text(
                    label,
                    color = Color(0xFF171717),
                    fontSize = 13.sp,
                    modifier = Modifier.fillMaxWidth().clickable { onDismiss(); action() }
                        .padding(horizontal = 13.dp, vertical = 11.dp)
                )
            }
        }
    }
}

@Composable
private fun ExplorerDrawer(
    files: List<String>,
    onOpen: (String) -> Unit,
    onClose: () -> Unit
) {
    Row(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f).fillMaxHeight().background(Color.Black.copy(alpha = .38f))
            .clickable(onClick = onClose))
        Column(
            Modifier.fillMaxHeight().widthIn(max = 300.dp).fillMaxWidth(.82f)
                .background(EditorPanel)
        ) {
            Row(
                Modifier.fillMaxWidth().height(42.dp).padding(start = 14.dp, end = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("EXPLORER", color = EditorMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = .7.sp)
                Spacer(Modifier.weight(1f))
                EditorTool(Icons.Outlined.Close, "Close explorer", onClick = onClose)
            }
            Row(
                Modifier.fillMaxWidth().height(34.dp).padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("⌄", color = EditorMuted, fontSize = 13.sp)
                Text("AHARANE", color = EditorText, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                    letterSpacing = .6.sp, modifier = Modifier.padding(start = 7.dp))
            }
            if (files.isEmpty()) {
                Text(
                    "No files loaded. Connect to the Aharane server to browse the source tree.",
                    color = EditorMuted,
                    fontSize = 11.5.sp,
                    lineHeight = 17.sp,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
                )
            } else {
                Column(Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState())) {
                    files.sorted().forEach { path ->
                        Row(
                            Modifier.fillMaxWidth().heightIn(min = 38.dp)
                                .clickable { onOpen(path) }.padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Outlined.Description, null, tint = EditorMuted, modifier = Modifier.size(16.dp))
                            Text(
                                path,
                                color = EditorText,
                                fontSize = 12.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.padding(start = 8.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EditorBottomPanel(
    modifier: Modifier = Modifier,
    tab: String,
    onTabSelected: (String) -> Unit,
    onClose: () -> Unit,
    message: String
) {
    Column(
        modifier.fillMaxWidth().fillMaxHeight(.36f).background(EditorPanel)
    ) {
        Row(
            Modifier.fillMaxWidth().height(39.dp).padding(start = 8.dp, end = 5.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            listOf("Problems", "Output", "Terminal").forEach { label ->
                EditorPanelTab(label, tab == label) { onTabSelected(label) }
            }
            Spacer(Modifier.weight(1f))
            EditorTool(Icons.Outlined.Close, "Close bottom panel", onClick = onClose)
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(EditorLine))
        Text(message, color = EditorMuted, fontSize = 12.sp, modifier = Modifier.padding(14.dp))
    }
}

@Composable
private fun EditorPanelTab(label: String, selected: Boolean, onClick: () -> Unit) {
    Column(
        Modifier.height(39.dp).clickable(onClick = onClick).padding(horizontal = 9.dp),
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
        Box(Modifier.width(26.dp).height(2.dp).background(if (selected) EditorBlue else Color.Transparent))
    }
}
