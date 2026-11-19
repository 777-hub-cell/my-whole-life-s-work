package com.aharane.studio.features.files

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import java.util.Locale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.*

data class StudioFileEntry(
    val name: String,
    /** Relative path from the bot's source root, using '/' separators. */
    val path: String,
    val isDirectory: Boolean,
    val sizeLabel: String? = null,
    val modifiedLabel: String? = null
)

@Composable
fun FilesScreen(
    onEditorVisibility: (Boolean) -> Unit,
    entries: List<StudioFileEntry> = emptyList(),
    connected: Boolean = false,
    onCreateFile: () -> Unit = {},
    onCreateFolder: () -> Unit = {},
    onUpload: () -> Unit = {},
    onExportSource: () -> Unit = {},
    onEntryAction: (StudioFileEntry, String) -> Unit = { _, _ -> },
    onBulkAction: (List<StudioFileEntry>, String) -> Unit = { _, _ -> }
) {
    var query by rememberSaveable { mutableStateOf("") }
    var currentPath by rememberSaveable { mutableStateOf("") }
    var menuPath by remember { mutableStateOf<String?>(null) }
    val selectedPaths = remember { mutableStateListOf<String>() }

    val visibleEntries = remember(entries, query, currentPath) {
        entries.asSequence()
            .filter { entry ->
                val parent = entry.path.substringBeforeLast('/', "")
                parent == currentPath
            }
            .filter { query.isBlank() || it.name.contains(query, ignoreCase = true) }
            .sortedWith(compareByDescending<StudioFileEntry> { it.isDirectory }
                .thenBy { it.name.lowercase(Locale.ROOT) })
            .toList()
    }
    val selectedEntries = visibleEntries.filter { it.path in selectedPaths }
    val breadcrumbs = currentPath.split('/').filter { it.isNotBlank() }

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
            StudioSearchField(
                value = query,
                onValueChange = { query = it },
                placeholder = "Search files and folders"
            )
            Spacer(Modifier.height(12.dp))
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StudioActionButton(
                    "New file", modifier = Modifier.weight(1f), compact = true,
                    enabled = connected, onClick = onCreateFile
                )
                StudioActionButton(
                    "Upload", modifier = Modifier.weight(1f), compact = true,
                    enabled = connected, onClick = onUpload
                )
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StudioActionButton(
                    "New folder", modifier = Modifier.weight(1f), compact = true,
                    enabled = connected, onClick = onCreateFolder
                )
                StudioActionButton(
                    "Export Bot Source", modifier = Modifier.weight(1f), compact = true,
                    enabled = connected, onClick = onExportSource
                )
            }
            Row(
                Modifier.fillMaxWidth().padding(top = 13.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "root",
                    color = if (breadcrumbs.isEmpty()) StudioPalette.Ink else StudioPalette.Accent,
                    fontSize = 13.sp,
                    fontWeight = if (breadcrumbs.isEmpty()) FontWeight.SemiBold else FontWeight.Medium,
                    modifier = Modifier.clip(RoundedCornerShape(6.dp)).clickable {
                        currentPath = ""
                        selectedPaths.clear()
                        query = ""
                    }.padding(vertical = 5.dp, horizontal = 2.dp)
                )
                breadcrumbs.forEachIndexed { index, segment ->
                    Text(" / ", color = StudioPalette.Muted, fontSize = 13.sp)
                    Text(
                        segment,
                        color = if (index == breadcrumbs.lastIndex) StudioPalette.Ink else StudioPalette.Accent,
                        fontSize = 13.sp,
                        fontWeight = if (index == breadcrumbs.lastIndex) FontWeight.SemiBold else FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.clip(RoundedCornerShape(6.dp)).clickable {
                            currentPath = breadcrumbs.take(index + 1).joinToString("/")
                            selectedPaths.clear()
                            query = ""
                        }.padding(vertical = 5.dp, horizontal = 2.dp)
                    )
                }
            }
        }
        item {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 40.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    Modifier.clickable {
                        if (visibleEntries.isNotEmpty()) {
                            if (selectedPaths.containsAll(visibleEntries.map { it.path })) {
                                selectedPaths.removeAll(visibleEntries.map { it.path }.toSet())
                            } else {
                                visibleEntries.forEach { if (it.path !in selectedPaths) selectedPaths.add(it.path) }
                            }
                        }
                    },
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val allSelected = visibleEntries.isNotEmpty() &&
                        selectedPaths.containsAll(visibleEntries.map { it.path })
                    Box(
                        Modifier.size(19.dp).clip(RoundedCornerShape(5.dp))
                            .background(if (allSelected) StudioPalette.Accent else StudioPalette.Surface)
                            .border(1.dp, if (allSelected) StudioPalette.Accent else StudioPalette.Line, RoundedCornerShape(5.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        if (allSelected) Text("✓", color = androidx.compose.ui.graphics.Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                    Text(
                        "Select all",
                        color = StudioPalette.Ink,
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(start = 8.dp)
                    )
                }
                Spacer(Modifier.weight(1f))
                if (selectedEntries.isNotEmpty()) {
                    Text(
                        "${selectedEntries.size} selected",
                        color = StudioPalette.Muted,
                        fontSize = 11.5.sp,
                        modifier = Modifier.padding(end = 8.dp)
                    )
                    StudioActionButton(
                        "Move", compact = true, enabled = connected,
                        onClick = { onBulkAction(selectedEntries, "move") }
                    )
                    Spacer(Modifier.width(5.dp))
                    StudioActionButton(
                        "ZIP", compact = true, enabled = connected,
                        onClick = { onBulkAction(selectedEntries, "zip") }
                    )
                    Spacer(Modifier.width(5.dp))
                    StudioActionButton(
                        "Delete", compact = true, destructive = true, enabled = connected,
                        onClick = { onBulkAction(selectedEntries, "delete") }
                    )
                }
            }
            Spacer(Modifier.height(4.dp))
        }
        item {
            StudioCard {
                if (visibleEntries.isEmpty()) {
                    StudioEmpty(
                        title = if (query.isBlank()) "This folder is empty." else "No files match.",
                        description = if (connected) {
                            if (query.isBlank()) "Create a file or folder to start working here."
                            else "Try another file or folder name."
                        } else {
                            if (query.isBlank()) "Connect your Aharane server to browse, create, upload and edit bot source files here."
                            else "No server files can be searched until this app is connected to your Aharane workspace."
                        }
                    )
                    Text(
                        "Folders A–Z first, then files A–Z.",
                        color = StudioPalette.Muted,
                        fontSize = 12.sp,
                        lineHeight = 17.sp,
                        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 13.dp)
                    )
                } else {
                    visibleEntries.forEachIndexed { index, entry ->
                        if (index > 0) StudioDivider()
                        FileEntryRow(
                            entry = entry,
                            selected = entry.path in selectedPaths,
                            menuExpanded = menuPath == entry.path,
                            onToggleSelected = {
                                if (!selectedPaths.remove(entry.path)) selectedPaths.add(entry.path)
                            },
                            onOpen = {
                                if (entry.isDirectory) {
                                    currentPath = entry.path
                                    query = ""
                                    selectedPaths.clear()
                                } else onEntryAction(entry, "open")
                            },
                            onMenuToggle = {
                                menuPath = if (menuPath == entry.path) null else entry.path
                            },
                            onMenuDismiss = { menuPath = null },
                            onAction = { action ->
                                menuPath = null
                                onEntryAction(entry, action)
                            }
                        )
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
        }
        if (visibleEntries.isEmpty()) {
            item {
                StudioSectionHeading("Code editor")
                StudioCard {
                    StudioRow(
                        title = "Source editor",
                        subtitle = "Open the native full-screen workspace",
                        icon = Icons.Outlined.Code,
                        trailingContent = {
                            StudioActionButton(
                                "Open editor",
                                compact = true,
                                primary = true,
                                onClick = { onEditorVisibility(true) }
                            )
                        }
                    )
                }
                Spacer(Modifier.height(12.dp))
            }
        }
    }
}

@Composable
private fun FileEntryRow(
    entry: StudioFileEntry,
    selected: Boolean,
    menuExpanded: Boolean,
    onToggleSelected: () -> Unit,
    onOpen: () -> Unit,
    onMenuToggle: () -> Unit,
    onMenuDismiss: () -> Unit,
    onAction: (String) -> Unit
) {
    Row(
        Modifier.fillMaxWidth().defaultMinSize(minHeight = 60.dp)
            .padding(start = 12.dp, end = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(9.dp)
    ) {
        Box(
            Modifier.size(21.dp).clip(RoundedCornerShape(5.dp))
                .background(if (selected) StudioPalette.Accent else StudioPalette.Background)
                .clickable(onClick = onToggleSelected),
            contentAlignment = Alignment.Center
        ) {
            if (selected) Text("✓", color = androidx.compose.ui.graphics.Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
        Box(
            Modifier.size(38.dp).clip(RoundedCornerShape(11.dp))
                .background(if (entry.isDirectory) StudioPalette.Soft else StudioPalette.Background)
                .clickable(onClick = onOpen),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                if (entry.isDirectory) Icons.Outlined.Folder else Icons.Outlined.Description,
                contentDescription = null,
                tint = StudioPalette.Accent,
                modifier = Modifier.size(20.dp)
            )
        }
        Column(
            Modifier.weight(1f).clickable(onClick = onOpen).padding(vertical = 9.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Text(
                entry.name,
                color = StudioPalette.Ink,
                fontSize = 13.5.sp,
                lineHeight = 18.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                if (entry.isDirectory) "Open folder" else entry.sizeLabel ?: "Source file",
                color = StudioPalette.Muted,
                fontSize = 11.5.sp,
                lineHeight = 15.sp,
                maxLines = 1
            )
        }
        Box(Modifier.size(36.dp), contentAlignment = Alignment.Center) {
            Box(
                Modifier.size(34.dp).clip(CircleShape).clickable(onClick = onMenuToggle),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Outlined.MoreVert, "File actions", tint = StudioPalette.Muted, modifier = Modifier.size(19.dp))
            }
            StudioFloatingMenu(
                expanded = menuExpanded,
                onDismiss = onMenuDismiss,
                actions = buildList {
                    add(StudioMenuAction("Open") { onAction("open") })
                    add(StudioMenuAction("Rename") { onAction("rename") })
                    add(StudioMenuAction("Move") { onAction("move") })
                    if (!entry.isDirectory) add(StudioMenuAction("Download") { onAction("download") })
                    add(StudioMenuAction("Delete", destructive = true) { onAction("delete") })
                }
            )
        }
    }
}
