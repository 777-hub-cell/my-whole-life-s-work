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
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale

private data class EditorPalette(
    val background: Color,
    val panel: Color,
    val tab: Color,
    val line: Color,
    val text: Color,
    val muted: Color,
    val blue: Color
)

private val DarkEditorPalette = EditorPalette(
    Color(0xFF1E1E1E), Color(0xFF252526), Color(0xFF2D2D2D),
    Color(0xFF3C3C3C), Color(0xFFD4D4D4), Color(0xFF858585), Color(0xFF007ACC)
)
private val LightEditorPalette = EditorPalette(
    Color(0xFFF7F8F8), Color(0xFFECEFEE), Color(0xFFE2E7E5),
    Color(0xFFD1D9D6), Color(0xFF202927), Color(0xFF5F6A66), Color(0xFF007ACC)
)
private val LocalEditorPalette = staticCompositionLocalOf { DarkEditorPalette }
private val EditorBackground: Color @Composable get() = LocalEditorPalette.current.background
private val EditorPanel: Color @Composable get() = LocalEditorPalette.current.panel
private val EditorTab: Color @Composable get() = LocalEditorPalette.current.tab
private val EditorLine: Color @Composable get() = LocalEditorPalette.current.line
private val EditorText: Color @Composable get() = LocalEditorPalette.current.text
private val EditorMuted: Color @Composable get() = LocalEditorPalette.current.muted
private val EditorBlue: Color @Composable get() = LocalEditorPalette.current.blue

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
    editorTheme: String = "Dark+",
    onOpenFile: (String) -> Unit = {},
    onSelectDocument: (String) -> Unit = {},
    onCloseDocument: (String) -> Unit = {},
    onContentChange: (String, String) -> Unit = { _, _ -> },
    onSave: (String, String) -> Boolean = { _, _ -> false }
) {
    var explorerOpen by rememberSaveable { mutableStateOf(false) }
    var panelOpen by rememberSaveable { mutableStateOf(false) }
    var panelTab by rememberSaveable { mutableStateOf("Problems") }
    var editorFocused by remember { mutableStateOf(false) }

    val activeDocument = openDocuments.firstOrNull { it.path == activeDocumentPath }
    var editorValue by remember(activeDocument?.path) {
        mutableStateOf(TextFieldValue(activeDocument?.content.orEmpty()))
    }
    var dirty by remember(activeDocument?.path) { mutableStateOf(false) }
    var saveState by remember(activeDocument?.path) { mutableStateOf("saved") }
    LaunchedEffect(activeDocument?.path, activeDocument?.content) {
        if (!dirty) editorValue = TextFieldValue(activeDocument?.content.orEmpty())
    }
    LaunchedEffect(editorValue.text, dirty, activeDocument?.path, editable) {
        if (dirty && editable && activeDocument != null) {
            kotlinx.coroutines.delay(600)
            saveState = if (onSave(activeDocument.path, editorValue.text)) {
                dirty = false
                "saved"
            } else {
                "unsaved"
            }
        }
    }
    val verticalScroll = rememberScrollState()
    val horizontalScroll = rememberScrollState()

    BackHandler {
        when {
            explorerOpen -> explorerOpen = false
            panelOpen -> panelOpen = false
            else -> onClose()
        }
    }

    CompositionLocalProvider(
        LocalEditorPalette provides if (editorTheme.equals("Light+", ignoreCase = true)) LightEditorPalette else DarkEditorPalette
    ) {
    Column(modifier.fillMaxSize().background(EditorBackground).navigationBarsPadding().imePadding()) {
        // Compact native translation of the web Studio workbench header.
        Row(
            Modifier.fillMaxWidth().height(46.dp).background(EditorPanel),
            verticalAlignment = Alignment.CenterVertically
        ) {
            EditorTool(
                Icons.Outlined.FolderOpen,
                if (explorerOpen) "Hide explorer" else "Show explorer",
                onClick = { explorerOpen = !explorerOpen }
            )
            Row(
                Modifier.weight(1f).padding(horizontal = 5.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Home",
                    color = EditorMuted,
                    fontSize = 13.sp,
                    modifier = Modifier.clickable(onClick = onClose)
                )
                Icon(Icons.Outlined.ChevronRight, null, tint = EditorMuted, modifier = Modifier.size(15.dp))
                Text(
                    activeDocument?.path ?: "Files",
                    color = EditorText,
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Text(
                when (saveState) {
                    "saving" -> "Saving…"
                    "unsaved" -> "Unsaved"
                    else -> "Saved"
                },
                color = if (saveState == "unsaved") Color(0xFFE5B567) else Color(0xFF4EC9B0),
                fontSize = 12.sp,
                modifier = Modifier.padding(horizontal = 7.dp)
            )
            EditorTool(Icons.Outlined.Close, "Close editor", onClick = onClose)
        }

        // The web workbench has no empty placeholder tab strip.
        if (openDocuments.isNotEmpty()) {
            Row(
                Modifier.fillMaxWidth().height(40.dp).background(EditorPanel)
                    .horizontalScroll(rememberScrollState()),
                verticalAlignment = Alignment.CenterVertically
            ) {
                openDocuments.forEach { document ->
                    val active = document.path == activeDocumentPath
                    Row(
                        Modifier.fillMaxHeight()
                            .background(if (active) EditorBackground else EditorTab)
                            .clickable { onSelectDocument(document.path) },
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (active) Box(Modifier.width(3.dp).fillMaxHeight().background(EditorBlue))
                        Text(
                            document.path.substringAfterLast('/'),
                            color = if (active) Color.White else EditorMuted,
                            fontSize = 13.sp,
                            maxLines = 1,
                            modifier = Modifier.padding(start = 12.dp, end = 6.dp)
                        )
                        Text(
                            "×",
                            color = EditorMuted,
                            fontSize = 17.sp,
                            modifier = Modifier.clickable { onCloseDocument(document.path) }
                                .padding(start = 4.dp, end = 10.dp, top = 7.dp, bottom = 7.dp)
                        )
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
                        activePath = activeDocumentPath,
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
                            "Problems" -> "No problems in this file."
                            else -> "The live Studio streams the bot’s console here when connected."
                        }
                    )
                }
            }
        } else {
            Box(Modifier.weight(1f).fillMaxWidth().background(EditorBackground)) {
                Row(Modifier.fillMaxSize()) {
                    if (lineNumbers) {
                    val lineCount = editorValue.text.count { it == '\n' } + 1
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
                    value = editorValue,
                    onValueChange = { next ->
                        editorValue = next
                        dirty = true
                        saveState = "saving"
                        onContentChange(activeDocument.path, next.text)
                    },
                    visualTransformation = if (activeDocument.path.endsWith(".js", true) ||
                        activeDocument.path.endsWith(".json", true)) StudioCodeHighlight else VisualTransformation.None,
                    cursorBrush = SolidColor(Color(0xFFAEAFAD)),
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
        }

        if (editorFocused && editable) {
            Row(
                Modifier.fillMaxWidth().background(EditorPanel)
                    .padding(horizontal = 4.dp, vertical = 4.dp)
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                listOf("Tab", "{", "}", "(", ")", "[", "]", ";", "'", "\"",
                    "=", ">", ".", "`").forEach { key ->
                    Box(
                        Modifier.widthIn(min = 40.dp).height(38.dp).clip(RoundedCornerShape(7.dp))
                            .background(EditorLine).clickable {
                                val insertion = if (key == "Tab") "  " else key
                                editorValue = insertEditorText(editorValue, insertion)
                                activeDocument?.let { onContentChange(it.path, editorValue.text) }
                                dirty = true
                                saveState = "saving"
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
            Text(
                "Problems & Console",
                color = Color.White,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clickable { panelOpen = !panelOpen }
                    .padding(horizontal = 4.dp, vertical = 7.dp)
            )
            Spacer(Modifier.weight(1f))
            Text(
                "${activeDocument?.languageLabel ?: "Plain text"} · Auto-save on",
                color = Color.White,
                fontSize = 12.5.sp
            )
        }
    }
    }
}

private fun insertEditorText(value: TextFieldValue, insertion: String): TextFieldValue {
    val start = minOf(value.selection.start, value.selection.end)
    val end = maxOf(value.selection.start, value.selection.end)
    val text = value.text.replaceRange(start, end, insertion)
    val cursor = start + insertion.length
    return TextFieldValue(text = text, selection = TextRange(cursor))
}

private object StudioCodeHighlight : VisualTransformation {
    private val tokenRegex = Regex(
        """//[^\n]*|/\*[\s\S]*?\*/|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|\b(const|let|var|function|async|await|return|if|else|for|while|new|class|throw|try|catch|of|in|typeof)\b|\b(true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*(?=\()"""
    )
    private val keywords = setOf(
        "const", "let", "var", "function", "async", "await", "return", "if", "else",
        "for", "while", "new", "class", "throw", "try", "catch", "of", "in", "typeof"
    )

    override fun filter(text: AnnotatedString): TransformedText {
        val builder = AnnotatedString.Builder(text.text)
        tokenRegex.findAll(text.text).forEach { match ->
            val token = match.value
            val color = when {
                token.startsWith("//") || token.startsWith("/*") -> Color(0xFF6A9955)
                token.startsWith("'") || token.startsWith("\"") || token.startsWith("`") -> Color(0xFFCE9178)
                token in keywords -> Color(0xFF569CD6)
                token in setOf("true", "false", "null", "undefined") -> Color(0xFF569CD6)
                token.firstOrNull()?.isDigit() == true -> Color(0xFFB5CEA8)
                else -> Color(0xFFDCDCAA)
            }
            builder.addStyle(SpanStyle(color = color), match.range.first, match.range.last + 1)
        }
        return TransformedText(builder.toAnnotatedString(), OffsetMapping.Identity)
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

private data class EditorTreeEntry(
    val name: String,
    val path: String,
    val isDirectory: Boolean,
    val children: MutableList<EditorTreeEntry> = mutableListOf()
)

private fun buildEditorTree(paths: List<String>): List<EditorTreeEntry> {
    val root = EditorTreeEntry(name = "AHARANE", path = "", isDirectory = true)
    paths.map { it.trim('/') }.filter { it.isNotBlank() }.forEach { rawPath ->
        val segments = rawPath.split('/').filter { it.isNotBlank() }
        var parent = root
        segments.forEachIndexed { index, segment ->
            val path = segments.take(index + 1).joinToString("/")
            val directory = index < segments.lastIndex
            val entry = parent.children.firstOrNull { it.name == segment }
                ?: EditorTreeEntry(segment, path, directory).also { parent.children.add(it) }
            parent = entry
        }
    }
    fun sortTree(entry: EditorTreeEntry) {
        entry.children.sortWith(
            compareByDescending<EditorTreeEntry> { it.isDirectory }
                .thenBy { it.name.lowercase(Locale.ROOT) }
        )
        entry.children.forEach(::sortTree)
    }
    sortTree(root)
    return root.children
}

@Composable
private fun ExplorerDrawer(
    files: List<String>,
    activePath: String?,
    onOpen: (String) -> Unit,
    onClose: () -> Unit
) {
    val tree = remember(files) { buildEditorTree(files) }
    val expanded = remember(files) { mutableStateMapOf<String, Boolean>() }

    Row(Modifier.fillMaxSize()) {
        Box(
            Modifier.weight(1f).fillMaxHeight()
                .background(Color.Black.copy(alpha = .38f))
                .clickable(onClick = onClose)
        )
        Column(
            Modifier.fillMaxHeight().widthIn(max = 300.dp).fillMaxWidth(.82f)
                .background(EditorPanel)
        ) {
            Row(
                Modifier.fillMaxWidth().height(42.dp).padding(start = 14.dp, end = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "EXPLORER",
                    color = EditorMuted,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = .7.sp
                )
                Spacer(Modifier.weight(1f))
                EditorTool(Icons.Outlined.Close, "Close explorer", onClick = onClose)
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
                    letterSpacing = .6.sp,
                    modifier = Modifier.padding(start = 7.dp)
                )
            }
            if (tree.isEmpty()) {
                Text(
                    "No files loaded. Connect to the Aharane server to browse the source tree.",
                    color = EditorMuted,
                    fontSize = 11.5.sp,
                    lineHeight = 17.sp,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
                )
            } else {
                Column(Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState())) {
                    tree.forEach { entry ->
                        EditorTreeRow(
                            entry = entry,
                            depth = 0,
                            activePath = activePath,
                            expanded = expanded,
                            onOpen = onOpen
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun EditorTreeRow(
    entry: EditorTreeEntry,
    depth: Int,
    activePath: String?,
    expanded: MutableMap<String, Boolean>,
    onOpen: (String) -> Unit
) {
    val isExpanded = entry.isDirectory && expanded[entry.path] == true
    val selected = !entry.isDirectory && entry.path == activePath
    Row(
        Modifier.fillMaxWidth().heightIn(min = 34.dp)
            .background(if (selected) EditorTab else Color.Transparent)
            .clickable {
                if (entry.isDirectory) expanded[entry.path] = !isExpanded
                else onOpen(entry.path)
            }
            .padding(start = (10 + depth * 14).dp, end = 10.dp, top = 7.dp, bottom = 7.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (entry.isDirectory) {
            Text(
                if (isExpanded) "⌄" else "›",
                color = EditorMuted,
                fontSize = 13.sp,
                modifier = Modifier.width(15.dp)
            )
            Icon(
                Icons.Outlined.FolderOpen,
                contentDescription = null,
                tint = Color(0xFFD7BA7D),
                modifier = Modifier.size(16.dp)
            )
        } else {
            Spacer(Modifier.width(15.dp))
            Icon(
                Icons.Outlined.Description,
                contentDescription = null,
                tint = if (selected) Color(0xFF75BEFF) else EditorMuted,
                modifier = Modifier.size(15.dp)
            )
        }
        Text(
            entry.name,
            color = if (selected) Color.White else EditorText,
            fontSize = 12.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = 8.dp)
        )
    }
    if (entry.isDirectory && isExpanded) {
        entry.children.forEach { child ->
            EditorTreeRow(
                entry = child,
                depth = depth + 1,
                activePath = activePath,
                expanded = expanded,
                onOpen = onOpen
            )
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
            listOf("Problems", "Console").forEach { label ->
                EditorPanelTab(label, tab == label) { onTabSelected(label) }
            }
            Spacer(Modifier.weight(1f))
            EditorTool(Icons.Outlined.Close, "Close bottom panel", onClick = onClose)
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(EditorLine))
        Text(message, color = EditorMuted, fontSize = 12.5.sp, modifier = Modifier.padding(14.dp))
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
