package com.aharane.studio.features.files

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.aharane.studio.core.design.*

private data class NativeFileEntry(
    val name: String,
    val parent: String,
    val directory: Boolean,
    val contents: String = ""
) {
    val fullPath: String get() = if (parent.isBlank()) name else "$parent/$name"
}

@Composable
fun FilesScreen(onEditorVisibility: (Boolean) -> Unit = {}) {
    val entries = remember { mutableStateListOf<NativeFileEntry>() }
    var currentFolder by rememberSaveable { mutableStateOf("") }
    var query by rememberSaveable { mutableStateOf("") }
    var editingPath by rememberSaveable { mutableStateOf<String?>(null) }
    var editorText by rememberSaveable(editingPath) {
        mutableStateOf(entries.firstOrNull { it.fullPath == editingPath }?.contents.orEmpty())
    }
    var editorMenu by remember { mutableStateOf(false) }
    var explorerOpen by rememberSaveable { mutableStateOf(false) }
    var focusedEditor by remember { mutableStateOf(false) }
    var nameDialog by rememberSaveable { mutableStateOf("") }
    var pendingAction by rememberSaveable { mutableStateOf("") }
    var pendingFile by rememberSaveable { mutableStateOf("") }
    var menuFile by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf(setOf<String>()) }

    LaunchedEffect(editingPath) { onEditorVisibility(editingPath != null) }

    if (editingPath != null) {
        val current = entries.firstOrNull { it.fullPath == editingPath }
        val fileName = current?.name ?: editingPath!!.substringAfterLast('/')
        NativeEditor(
            fileName = fileName,
            content = editorText,
            onContentChange = { editorText = it },
            onBack = { editingPath = null; focusedEditor = false },
            onSave = {
                val index = entries.indexOfFirst { it.fullPath == editingPath }
                if (index >= 0) entries[index] = entries[index].copy(contents = editorText)
            },
            entries = entries,
            explorerOpen = explorerOpen,
            onToggleExplorer = { explorerOpen = !explorerOpen },
            onOpenFile = { entry ->
                if (!entry.directory) {
                    editingPath = entry.fullPath
                    editorText = entry.contents
                    explorerOpen = false
                } else {
                    currentFolder = entry.fullPath
                    editingPath = null
                    explorerOpen = false
                }
            },
            onEditorMenu = { editorMenu = !editorMenu },
            editorMenuOpen = editorMenu,
            onCloseMenu = { editorMenu = false },
            onNewFile = {
                pendingAction = "file"
                nameDialog = ""
                editorMenu = false
            },
            onSaveDraft = {
                val index = entries.indexOfFirst { it.fullPath == editingPath }
                if (index >= 0) entries[index] = entries[index].copy(contents = editorText)
            },
            onFocusChanged = { focusedEditor = it }
        )
        if (pendingAction == "file") {
            FileNameDialog(
                title = "New file",
                value = nameDialog,
                onValueChange = { nameDialog = it },
                onDismiss = { pendingAction = "" },
                onConfirm = {
                    val valid = nameDialog.trim()
                    if (valid.isNotEmpty() && entries.none { it.parent == currentFolder && it.name == valid }) {
                        val entry = NativeFileEntry(valid, currentFolder, false)
                        entries.add(entry)
                        editingPath = entry.fullPath
                        editorText = ""
                    }
                    pendingAction = ""
                }
            )
        }
        return
    }

    val visibleEntries = entries.filter { it.parent == currentFolder }
        .filter { it.name.contains(query, ignoreCase = true) }
        .sortedWith(compareBy<NativeFileEntry>({ !it.directory }, { it.name.lowercase() }))

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        item {
            StudioPageTitle("Files", "Browse and edit Aharane source files.")
            Spacer(Modifier.height(14.dp))
        }
        item {
            StudioSearchField(query, { query = it }, "Search files and folders")
            Spacer(Modifier.height(12.dp))
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StudioActionButton(
                    "New file", compact = true, modifier = Modifier.weight(1f),
                    onClick = { pendingAction = "file"; nameDialog = "" }
                )
                StudioActionButton(
                    "Upload", compact = true, modifier = Modifier.weight(1f),
                    onClick = { pendingAction = "upload" }
                )
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StudioActionButton(
                    "New folder", compact = true, modifier = Modifier.weight(1f),
                    onClick = { pendingAction = "folder"; nameDialog = "" }
                )
                StudioActionButton(
                    "Export Bot Source", compact = true, modifier = Modifier.weight(1f),
                    enabled = false, onClick = {}
                )
            }
        }
        item {
            Row(
                Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(3.dp)
            ) {
                Text(
                    "root",
                    color = if (currentFolder.isBlank()) StudioPalette.Ink else StudioPalette.Muted,
                    fontSize = 13.sp,
                    fontWeight = if (currentFolder.isBlank()) FontWeight.SemiBold else FontWeight.Medium,
                    modifier = Modifier.clip(RoundedCornerShape(7.dp)).clickable { currentFolder = ""; query = "" }
                        .padding(horizontal = 6.dp, vertical = 5.dp)
                )
                if (currentFolder.isNotBlank()) {
                    val parts = currentFolder.split("/")
                    parts.forEachIndexed { index, part ->
                        Icon(Icons.Outlined.ChevronRight, null, tint = StudioPalette.Line, modifier = Modifier.size(15.dp))
                        Text(
                            part,
                            color = if (index == parts.lastIndex) StudioPalette.Ink else StudioPalette.Muted,
                            fontSize = 13.sp,
                            fontWeight = if (index == parts.lastIndex) FontWeight.SemiBold else FontWeight.Medium,
                            modifier = Modifier.clip(RoundedCornerShape(7.dp)).clickable {
                                currentFolder = parts.take(index + 1).joinToString("/")
                                query = ""
                            }.padding(horizontal = 4.dp, vertical = 5.dp)
                        )
                    }
                }
            }
        }
        item {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 40.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Select all",
                    color = StudioPalette.Muted,
                    fontSize = 13.sp,
                    modifier = Modifier.weight(1f).clickable {
                        selected = if (selected.size == visibleEntries.size) emptySet()
                        else visibleEntries.map { it.fullPath }.toSet()
                    }.padding(vertical = 8.dp)
                )
                if (selected.isNotEmpty()) {
                    Text("\${selected.size} selected", color = StudioPalette.Muted, fontSize = 12.sp)
                }
            }
        }
        item {
            StudioCard {
                if (visibleEntries.isEmpty()) {
                    Column(
                        Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 25.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            if (query.isBlank()) "This folder is empty." else "No files match.",
                            color = StudioPalette.Muted,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            if (currentFolder.isBlank()) {
                                "Create a file or folder to start. Server files will appear after your Studio is connected."
                            } else {
                                "Create a file here, or return to root to browse other folders."
                            },
                            color = StudioPalette.Muted,
                            fontSize = 13.sp,
                            lineHeight = 18.sp
                        )
                    }
                } else {
                    visibleEntries.forEachIndexed { index, entry ->
                        if (index > 0) StudioDivider()
                        Box(Modifier.fillMaxWidth()) {
                            Row(
                                Modifier.fillMaxWidth().heightIn(min = 60.dp)
                                    .clickable {
                                        if (entry.directory) currentFolder = entry.fullPath
                                        else {
                                            editingPath = entry.fullPath
                                            editorText = entry.contents
                                        }
                                    }.padding(start = 14.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Box(
                                    Modifier.size(38.dp).clip(RoundedCornerShape(11.dp))
                                        .background(if (entry.directory) StudioPalette.Soft else StudioPalette.Background),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        if (entry.directory) Icons.Outlined.Folder else Icons.Outlined.Description,
                                        null,
                                        tint = if (entry.directory) StudioPalette.Accent else StudioPalette.Muted,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                    Text(entry.name, color = StudioPalette.Ink, fontSize = 14.sp,
                                        fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        if (entry.directory) "Open folder" else "Local draft · \${editorLineCount(entry.contents)} lines",
                                        color = StudioPalette.Muted, fontSize = 12.5.sp, maxLines = 1
                                    )
                                }
                                Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) {
                                    androidx.compose.material3.IconButton(
                                        onClick = { menuFile = entry.fullPath },
                                        modifier = Modifier.size(40.dp)
                                    ) {
                                        Icon(Icons.Outlined.MoreVert, "File actions",
                                            tint = StudioPalette.Muted, modifier = Modifier.size(20.dp))
                                    }
                                    StudioFloatingMenu(
                                        expanded = menuFile == entry.fullPath,
                                        onDismiss = { menuFile = null },
                                        actions = listOf(
                                            StudioMenuAction(if (entry.directory) "Open folder" else "Open editor") {
                                                if (entry.directory) currentFolder = entry.fullPath
                                                else { editingPath = entry.fullPath; editorText = entry.contents }
                                            },
                                            StudioMenuAction("Rename") {
                                                pendingAction = "rename"
                                                pendingFile = entry.fullPath
                                                nameDialog = entry.name
                                            },
                                            StudioMenuAction("Delete", destructive = true) {
                                                entries.removeAll { it.fullPath == entry.fullPath || it.parent.startsWith(entry.fullPath + "/") }
                                            }
                                        )
                                    )
                                }
                            }
                            if (selected.contains(entry.fullPath)) {
                                Box(Modifier.align(Alignment.CenterStart).padding(start = 4.dp).size(3.dp, 34.dp)
                                    .clip(RoundedCornerShape(3.dp)).background(StudioPalette.Accent))
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            Text(
                "Folders A–Z first, then files A–Z.",
                color = StudioPalette.Muted,
                fontSize = 12.sp,
                modifier = Modifier.padding(start = 2.dp)
            )
        }
        item { Spacer(Modifier.height(10.dp)) }
    }

    if (pendingAction == "file" || pendingAction == "folder" || pendingAction == "rename") {
        FileNameDialog(
            title = when (pendingAction) {
                "folder" -> "New folder"
                "rename" -> "Rename item"
                else -> "New file"
            },
            value = nameDialog,
            onValueChange = { nameDialog = it },
            onDismiss = { pendingAction = "" },
            onConfirm = {
                val name = nameDialog.trim()
                if (name.isNotEmpty()) {
                    when (pendingAction) {
                        "rename" -> {
                            val old = entries.firstOrNull { it.fullPath == pendingFile }
                            if (old != null && entries.none { it.parent == old.parent && it.name == name }) {
                                val ix = entries.indexOf(old)
                                entries[ix] = old.copy(name = name)
                            }
                        }
                        "folder" -> {
                            if (entries.none { it.parent == currentFolder && it.name == name }) {
                                entries.add(NativeFileEntry(name, currentFolder, true))
                            }
                        }
                        else -> {
                            if (entries.none { it.parent == currentFolder && it.name == name }) {
                                val entry = NativeFileEntry(name, currentFolder, false)
                                entries.add(entry)
                                editingPath = entry.fullPath
                                editorText = ""
                            }
                        }
                    }
                    selected = emptySet()
                }
                pendingAction = ""
            }
        )
    }
    if (pendingAction == "upload") {
        FileNoticeDialog(
            title = "Upload files",
            message = "File upload needs a secure connection to your Aharane server. The native upload control will be enabled when server linking is implemented.",
            onDismiss = { pendingAction = "" }
        )
    }
}

private fun editorLineCount(text: String) = text.count { it == '\n' } + 1

@Composable
private fun NativeEditor(
    fileName: String,
    content: String,
    onContentChange: (String) -> Unit,
    onBack: () -> Unit,
    onSave: () -> Unit,
    entries: SnapshotStateList<NativeFileEntry>,
    explorerOpen: Boolean,
    onToggleExplorer: () -> Unit,
    onOpenFile: (NativeFileEntry) -> Unit,
    onEditorMenu: () -> Unit,
    editorMenuOpen: Boolean,
    onCloseMenu: () -> Unit,
    onNewFile: () -> Unit,
    onSaveDraft: () -> Unit,
    onFocusChanged: (Boolean) -> Unit
) {
    val editorBg = Color(0xFF1E1E1E)
    val panel = Color(0xFF252526)
    val tabBg = Color(0xFF2D2D2D)
    val textColor = Color(0xFFD4D4D4)
    val muted = Color(0xFF858585)
    val blue = Color(0xFF007ACC)
    val lineNumbers = (1..editorLineCount(content)).joinToString("\n")

    Column(Modifier.fillMaxSize().background(editorBg).navigationBarsPadding()) {
        Row(
            Modifier.fillMaxWidth().height(46.dp).background(panel).padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            EditorIcon("‹", onBack)
            EditorIcon("☰", onToggleExplorer)
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                Text("root", color = muted, fontSize = 12.sp)
                Text("  ›  ", color = muted, fontSize = 12.sp)
                Text(fileName, color = textColor, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Text("Local draft", color = Color(0xFF4EC9B0), fontSize = 11.sp, modifier = Modifier.padding(horizontal = 5.dp))
            Box {
                EditorIcon("⋮", onEditorMenu)
                StudioFloatingMenu(
                    expanded = editorMenuOpen,
                    onDismiss = onCloseMenu,
                    actions = listOf(
                        StudioMenuAction("Save now", onClick = onSaveDraft),
                        StudioMenuAction("New file", onClick = onNewFile),
                        StudioMenuAction("Close editor", onClick = onBack)
                    )
                )
            }
            EditorIcon("✓", onSave)
        }
        Row(
            Modifier.fillMaxWidth().height(42.dp).background(tabBg).horizontalScroll(rememberScrollState()),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                Modifier.background(editorBg).height(42.dp).padding(start = 12.dp, end = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(Modifier.width(2.dp).fillMaxHeight().background(blue))
                Text(fileName, color = Color.White, fontSize = 12.5.sp,
                    modifier = Modifier.padding(start = 10.dp))
                Text("  ×", color = muted, fontSize = 16.sp, modifier = Modifier.padding(start = 9.dp).clickable { onBack() })
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            Row(Modifier.fillMaxSize().background(editorBg)) {
                Box(
                    Modifier.width(48.dp).fillMaxHeight().background(editorBg)
                        .verticalScroll(rememberScrollState()).padding(top = 12.dp, end = 9.dp),
                    contentAlignment = Alignment.TopEnd
                ) {
                    Text(lineNumbers, color = Color(0xFF6E7681), fontFamily = FontFamily.Monospace,
                        fontSize = 13.sp, lineHeight = 21.sp, textAlign = TextAlign.End)
                }
                BasicTextField(
                    value = content,
                    onValueChange = onContentChange,
                    modifier = Modifier.weight(1f).fillMaxHeight().verticalScroll(rememberScrollState())
                        .padding(start = 12.dp, top = 12.dp, end = 12.dp)
                        .onFocusChanged { onFocusChanged(it.isFocused) },
                    textStyle = TextStyle(
                        color = textColor, fontFamily = FontFamily.Monospace, fontSize = 13.sp,
                        lineHeight = 21.sp
                    ),
                    cursorBrush = SolidColor(Color(0xFFAEAFAD)),
                    decorationBox = { inner -> Box(Modifier.fillMaxSize()) { inner() } }
                )
            }
            if (explorerOpen) {
                Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .38f)).clickable { onToggleExplorer() })
                Column(
                    Modifier.width(280.dp).fillMaxHeight().shadow(8.dp).background(panel)
                ) {
                    Row(Modifier.fillMaxWidth().height(42.dp).padding(horizontal = 14.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        Text("EXPLORER", color = muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(1f))
                        Text("×", color = muted, fontSize = 20.sp, modifier = Modifier.clickable { onToggleExplorer() })
                    }
                    entries.filter { it.parent.isBlank() }
                        .sortedWith(compareBy<NativeFileEntry>({ !it.directory }, { it.name.lowercase() }))
                        .forEach { entry ->
                            Row(
                                Modifier.fillMaxWidth().height(40.dp).clickable { onOpenFile(entry) }
                                    .padding(horizontal = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(if (entry.directory) Icons.Outlined.Folder else Icons.Outlined.Description,
                                    null, tint = muted, modifier = Modifier.size(16.dp))
                                Text(entry.name, color = textColor, fontSize = 13.sp, maxLines = 1)
                            }
                        }
                    Text(
                        if (entries.isEmpty()) "No local files yet" else "Local workspace",
                        color = muted, fontSize = 12.sp, modifier = Modifier.padding(14.dp)
                    )
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().height(42.dp).background(panel).horizontalScroll(rememberScrollState())
                .padding(horizontal = 5.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            listOf("TAB", "{ }", "=>", ";", "(", ")", "[", "]", "'", "\"").forEach { token ->
                Box(
                    Modifier.defaultMinSize(minWidth = 38.dp).fillMaxHeight()
                        .clip(RoundedCornerShape(6.dp)).background(Color(0xFF3C3C3C))
                        .clickable { onContentChange(content + if (token == "TAB") "    " else token) }
                        .padding(horizontal = 10.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(token, color = textColor, fontFamily = FontFamily.Monospace,
                        fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().height(34.dp).background(blue).padding(horizontal = 11.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Local workspace", color = Color.White, fontSize = 11.5.sp, fontWeight = FontWeight.Medium)
            Spacer(Modifier.weight(1f))
            Text("UTF-8    LF    \${editorLineCount(content)} lines", color = Color.White.copy(alpha = .9f), fontSize = 11.sp)
        }
    }
}

@Composable
private fun EditorIcon(label: String, onClick: () -> Unit) {
    Box(
        Modifier.size(38.dp).clip(RoundedCornerShape(8.dp)).clickable(onClick = onClick)
            .padding(4.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(label, color = Color(0xFFD4D4D4), fontSize = 20.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun FileNameDialog(
    title: String,
    value: String,
    onValueChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                .background(StudioPalette.Surface).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(title, color = StudioPalette.Ink, fontSize = 19.sp, fontWeight = FontWeight.Bold)
            StudioSearchField(value, onValueChange, "Name")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                StudioActionButton("Cancel", modifier = Modifier.weight(1f), onClick = onDismiss)
                StudioActionButton("Create", primary = true, modifier = Modifier.weight(1f), onClick = onConfirm)
            }
        }
    }
}

@Composable
private fun FileNoticeDialog(title: String, message: String, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                .background(StudioPalette.Surface).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(title, color = StudioPalette.Ink, fontSize = 19.sp, fontWeight = FontWeight.Bold)
            Text(message, color = StudioPalette.Muted, fontSize = 14.sp, lineHeight = 20.sp)
            StudioActionButton("Close", primary = true, modifier = Modifier.align(Alignment.End), onClick = onDismiss)
        }
    }
}
