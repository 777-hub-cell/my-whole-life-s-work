package com.aharane.studio.features.files

import android.widget.Toast

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import java.util.Locale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.*
import com.aharane.studio.core.network.AharaneUpdatePackage

data class StudioFileEntry(
    val name: String,
    /** Relative path from the bot's source root, using '/' separators. */
    val path: String,
    val isDirectory: Boolean,
    val sizeLabel: String? = null,
    val modifiedLabel: String? = null
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FilesScreen(
    onEditorVisibility: (Boolean) -> Unit,
    entries: List<StudioFileEntry> = emptyList(),
    connected: Boolean = false,
    initialPath: String = "",
    onDirectoryChanged: (String) -> Unit = {},
    previewOnly: Boolean = false,
    pendingEdits: Boolean = false,
    changedCount: Int = 0,
    onApplyEdits: () -> Unit = {},
    onDiscardEdits: () -> Unit = {},
    onCreateFile: () -> Unit = {},
    onCreateFolder: () -> Unit = {},
    onUpload: () -> Unit = {},
    onExportSource: () -> Unit = {},
    onEntryAction: (StudioFileEntry, String) -> Unit = { _, _ -> },
    onBulkAction: (List<StudioFileEntry>, String) -> Unit = { _, _ -> },
    updatePackages: List<AharaneUpdatePackage> = emptyList(),
    updateStatusLabel: String = "",
    packageProgressLabel: String = "",
    packageProgress: Float = 0f,
    packageError: String = "",
    activePackageId: String? = null,
    onRefreshPackages: () -> Unit = {},
    onUploadPackage: () -> Unit = {},
    onDeployPackage: (AharaneUpdatePackage) -> Unit = {},
    onRemovePackage: (AharaneUpdatePackage) -> Unit = {}
) {
    var query by rememberSaveable { mutableStateOf("") }
    var currentPath by rememberSaveable { mutableStateOf(initialPath) }
    LaunchedEffect(currentPath) { onDirectoryChanged(currentPath) }
    var menuPath by remember { mutableStateOf<String?>(null) }
    val selectedPaths = remember { mutableStateListOf<String>() }
    var packagesOpen by rememberSaveable { mutableStateOf(false) }
    var pendingPackageDeployment by remember { mutableStateOf<AharaneUpdatePackage?>(null) }
    var pendingPackageRemoval by remember { mutableStateOf<AharaneUpdatePackage?>(null) }
    var draftConfirmation by rememberSaveable { mutableStateOf("") }
    val context = LocalContext.current

    fun serverAction(label: String, action: () -> Unit) {
        if (connected) action() else Toast.makeText(
            context,
            "Connect to your Aharane server to $label.",
            Toast.LENGTH_SHORT
        ).show()
    }

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
        if (pendingEdits && connected) {
            item {
                StudioCard(padding = PaddingValues(13.dp)) {
                    Text(
                        "$changedCount saved source change(s) are waiting to be applied.",
                        color = StudioPalette.Ink,
                        fontSize = 13.sp,
                        lineHeight = 18.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        "Apply validates the staged project and restarts Aharane. Discard removes the draft and keeps the running release unchanged.",
                        color = StudioPalette.Muted,
                        fontSize = 11.5.sp,
                        lineHeight = 16.sp,
                        modifier = Modifier.padding(top = 5.dp, bottom = 10.dp)
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StudioActionButton("Apply changes", compact = true, primary = true, onClick = { draftConfirmation = "apply" })
                        StudioActionButton("Discard", compact = true, destructive = true, onClick = { draftConfirmation = "discard" })
                    }
                }
                Spacer(Modifier.height(12.dp))
            }
        }
        item {
            StudioSearchField(
                value = query,
                onValueChange = { query = it },
                placeholder = "Search files and folders",
                showIcon = false
            )
            Spacer(Modifier.height(12.dp))
        }
        item {
            FlowRow(
                maxItemsInEachRow = 3,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                StudioActionButton("New file", compact = true, onClick = { serverAction("create files", onCreateFile) })
                StudioActionButton("Upload", compact = true, onClick = { serverAction("upload files", onUpload) })
                StudioActionButton("New folder", compact = true, onClick = { serverAction("create folders", onCreateFolder) })
                StudioActionButton("Export Bot Source", compact = true, onClick = { serverAction("export source", onExportSource) })
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
                        "Move", compact = true,
                        onClick = { serverAction("move files", { onBulkAction(selectedEntries, "move") }) }
                    )
                    Spacer(Modifier.width(5.dp))
                    StudioActionButton(
                        "ZIP", compact = true,
                        onClick = { serverAction("export selected files", { onBulkAction(selectedEntries, "zip") }) }
                    )
                    Spacer(Modifier.width(5.dp))
                    StudioActionButton(
                        "Delete", compact = true, destructive = true,
                        onClick = { serverAction("delete files", { onBulkAction(selectedEntries, "delete") }) }
                    )
                }
            }
            Spacer(Modifier.height(4.dp))
        }
        item {
            StudioCard {
                if (visibleEntries.isEmpty()) {
                    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp)) {
                        Text(
                            if (query.isBlank()) "This folder is empty. Create a file to start."
                            else "No match for “$query”.",
                            color = StudioPalette.Muted,
                            fontSize = 14.sp,
                            lineHeight = 20.sp,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth().padding(top = 3.dp, bottom = 32.dp)
                        )
                        Text(
                            "Folders A–Z first, then files A–Z.",
                            color = StudioPalette.Muted,
                            fontSize = 12.5.sp,
                            lineHeight = 17.sp
                        )
                        Row(
                            Modifier.fillMaxWidth().padding(top = 30.dp, bottom = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                "Code editor",
                                color = StudioPalette.Ink,
                                fontSize = 17.sp,
                                lineHeight = 22.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(Modifier.weight(1f))
                            StudioActionButton(
                                "Open editor",
                                compact = true,
                                onClick = { onEditorVisibility(true) }
                            )
                        }
                    }
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
                                if (action == "open" && entry.isDirectory) {
                                    currentPath = entry.path
                                    query = ""
                                    selectedPaths.clear()
                                } else if (connected) {
                                    onEntryAction(entry, action)
                                } else {
                                    Toast.makeText(context, "Connect to your Aharane server to manage files.", Toast.LENGTH_SHORT).show()
                                }
                            }
                        )
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
        }
        item {
            Row(
                Modifier.fillMaxWidth().padding(top = 24.dp, bottom = 7.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Update packages",
                    color = StudioPalette.Ink,
                    fontFamily = MaterialTheme.typography.titleLarge.fontFamily,
                    fontSize = 17.sp,
                    lineHeight = 22.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = (-0.15).sp
                )
                Spacer(Modifier.weight(1f))
                StudioActionButton("View all", compact = true, onClick = {
                    packagesOpen = true
                    onRefreshPackages()
                })
            }
            Text(
                "${updatePackages.size} saved ZIP package(s)",
                color = StudioPalette.Muted,
                fontSize = 12.5.sp,
                modifier = Modifier.padding(bottom = 8.dp)
            )
            if (updatePackages.isNotEmpty()) {
                updatePackages.take(2).forEach { pkg ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                            Text(pkg.filename, color = StudioPalette.Ink, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("v${pkg.version} · ${pkg.sizeLabel} · ${pkg.fileCount} files", color = StudioPalette.Muted, fontSize = 11.sp)
                        }
                        StudioActionButton("Update bot", compact = true, enabled = activePackageId == null, onClick = { pendingPackageDeployment = pkg })
                    }
                }
            }
            if (updateStatusLabel.isNotBlank()) {
                Text(updateStatusLabel, color = StudioPalette.Muted, fontSize = 11.5.sp, modifier = Modifier.padding(top = 3.dp, bottom = 10.dp))
            }
        }
    }
    if (packagesOpen) {
        androidx.compose.ui.window.Dialog(onDismissRequest = { packagesOpen = false }) {
            Column(
                Modifier.fillMaxWidth().heightIn(max = 650.dp).clip(RoundedCornerShape(18.dp))
                    .background(StudioPalette.Surface).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(9.dp)
            ) {
                Text("Update packages", color = StudioPalette.Ink, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                Text(
                    if (previewOnly) "Demo package library · no server changes are made in Preview mode."
                    else "Saved Aharane ZIP updates. Validation is required before a package can be deployed.",
                    color = StudioPalette.Muted, fontSize = 12.sp, lineHeight = 17.sp
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    StudioActionButton("Upload ZIP", compact = true, primary = true, enabled = connected || previewOnly, onClick = onUploadPackage)
                    StudioActionButton("Refresh", compact = true, enabled = connected || previewOnly, onClick = onRefreshPackages)
                }
                if (packageProgressLabel.isNotBlank()) {
                    Text(packageProgressLabel, color = if (packageError.isBlank()) StudioPalette.Muted else StudioPalette.Bad, fontSize = 12.sp)
                    if (packageProgress in 0f..1f && packageProgressLabel.contains("Uploading", true)) {
                        LinearProgressIndicator(progress = packageProgress, modifier = Modifier.fillMaxWidth())
                    }
                }
                if (packageError.isNotBlank()) {
                    Text(packageError, color = StudioPalette.Bad, fontSize = 12.sp, lineHeight = 17.sp)
                }
                if (updateStatusLabel.isNotBlank()) {
                    Text(updateStatusLabel, color = StudioPalette.Muted, fontSize = 11.5.sp, lineHeight = 16.sp)
                }
                if (updatePackages.isEmpty()) {
                    StudioEmpty(
                        "No saved ZIP packages.",
                        if (connected) "Upload a ZIP containing aharane-update.json. The server will verify the manifest and archive before listing it here."
                        else "Connect to the Aharane server to load the saved package library."
                    )
                } else {
                    androidx.compose.foundation.lazy.LazyColumn(
                        Modifier.fillMaxWidth().heightIn(max = 390.dp),
                        verticalArrangement = Arrangement.spacedBy(7.dp)
                    ) {
                        items(updatePackages, key = { it.updateId }) { pkg ->
                            StudioCard(padding = PaddingValues(11.dp)) {
                                Text(pkg.filename, color = StudioPalette.Ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                Text(
                                    "Version ${pkg.version} · ${pkg.sizeLabel} · ${pkg.fileCount} files",
                                    color = StudioPalette.Muted,
                                    fontSize = 11.5.sp,
                                    modifier = Modifier.padding(top = 3.dp)
                                )
                                Text(
                                    "Validated · ${pkg.validatedAt ?: pkg.createdAt}",
                                    color = StudioPalette.Accent,
                                    fontSize = 11.sp,
                                    modifier = Modifier.padding(top = 2.dp, bottom = 8.dp)
                                )
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                                    StudioActionButton(
                                        if (activePackageId == pkg.updateId) "Deploying…" else "Update bot",
                                        compact = true,
                                        primary = true,
                                        enabled = connected && activePackageId == null,
                                        onClick = { pendingPackageDeployment = pkg }
                                    )
                                    StudioActionButton(
                                        "Remove",
                                        compact = true,
                                        destructive = true,
                                        enabled = connected && activePackageId == null,
                                        onClick = { pendingPackageRemoval = pkg }
                                    )
                                }
                            }
                        }
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    StudioActionButton("Close", compact = true, onClick = { packagesOpen = false })
                }
            }
        }
    }

    if (pendingPackageDeployment != null) {
        val selectedPackage = pendingPackageDeployment!!
        androidx.compose.ui.window.Dialog(onDismissRequest = { pendingPackageDeployment = null }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(StudioPalette.Surface).padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text("Update Aharane?", color = StudioPalette.Ink, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                Text(
                    "Deploy ${selectedPackage.filename} (version ${selectedPackage.version})? The server will prepare a separate release, run its checks, switch releases and restore the previous release if the health check fails.",
                    color = StudioPalette.Muted, fontSize = 12.5.sp, lineHeight = 18.sp
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    StudioActionButton("Cancel", compact = true, onClick = { pendingPackageDeployment = null })
                    Spacer(Modifier.width(7.dp))
                    StudioActionButton("Confirm update", compact = true, primary = true, enabled = connected || previewOnly, onClick = {
                        pendingPackageDeployment = null
                        onDeployPackage(selectedPackage)
                    })
                }
            }
        }
    }

    if (pendingPackageRemoval != null) {
        val selectedPackage = pendingPackageRemoval!!
        androidx.compose.ui.window.Dialog(onDismissRequest = { pendingPackageRemoval = null }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(StudioPalette.Surface).padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text("Remove update package?", color = StudioPalette.Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                Text("Remove ${selectedPackage.filename} from the saved package library? This does not change the running bot.", color = StudioPalette.Muted, fontSize = 12.5.sp, lineHeight = 18.sp)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    StudioActionButton("Cancel", compact = true, onClick = { pendingPackageRemoval = null })
                    Spacer(Modifier.width(7.dp))
                    StudioActionButton("Remove", compact = true, destructive = true, enabled = connected || previewOnly, onClick = {
                        pendingPackageRemoval = null
                        onRemovePackage(selectedPackage)
                    })
                }
            }
        }
    }

    if (draftConfirmation.isNotBlank()) {
        androidx.compose.ui.window.Dialog(onDismissRequest = { draftConfirmation = "" }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(StudioPalette.Surface).padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    if (draftConfirmation == "apply") "Apply saved source changes?"
                    else "Discard saved source changes?",
                    color = StudioPalette.Ink,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    if (draftConfirmation == "apply")
                        "Aharane will validate the project, switch to the staged release and restart. If the health check fails, the previous release is restored."
                    else
                        "The staged edits will be deleted. The currently running Aharane release will not be changed.",
                    color = StudioPalette.Muted,
                    fontSize = 12.5.sp,
                    lineHeight = 18.sp
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    StudioActionButton("Cancel", compact = true, onClick = { draftConfirmation = "" })
                    Spacer(Modifier.width(8.dp))
                    StudioActionButton(
                        if (draftConfirmation == "apply") "Apply" else "Discard",
                        compact = true,
                        primary = true,
                        destructive = draftConfirmation == "discard",
                        onClick = {
                            val action = draftConfirmation
                            draftConfirmation = ""
                            if (action == "apply") onApplyEdits() else onDiscardEdits()
                        }
                    )
                }
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
                actions = (
                    if (entry.path.startsWith("Aharane update packages/") && entry.name.endsWith(".zip", true)) {
                        listOf(
                            FileMenuActionSpec("update_bot", "Update bot"),
                            FileMenuActionSpec("remove_package", "Remove", destructive = true)
                        )
                    } else {
                        fileMenuActionSpecs()
                    }
                ).map { action ->
                    StudioMenuAction(
                        title = action.label,
                        destructive = action.destructive
                    ) { onAction(action.key) }
                }
            )
        }
    }


}
