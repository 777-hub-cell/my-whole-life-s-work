package com.aharane.studio.features.notes

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.imePadding
import com.aharane.studio.core.design.StudioPalette
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Fully local Notes, including search, autosave, editing and Markdown shortcuts. */
@Composable
fun NotesScreen(store: EncryptedNotesStore, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var notes by remember { mutableStateOf<List<AharaneNote>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    var title by rememberSaveable { mutableStateOf("") }
    var content by remember { mutableStateOf(TextFieldValue("")) }
    var editingRevision by remember { mutableIntStateOf(0) }
    var savedRevision by remember { mutableIntStateOf(0) }
    var saving by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }

    suspend fun refresh() {
        notes = store.all()
    }
    LaunchedEffect(store) {
        try { refresh(); loaded = true } catch (e: Exception) {
            error = e.message ?: "Encrypted notes could not be opened."
        }
    }
    fun open(note: AharaneNote) {
        selectedId = note.id
        title = note.title
        content = TextFieldValue(note.content)
        editingRevision = 0
        savedRevision = 0
        error = ""
    }
    suspend fun save() {
        val id = selectedId ?: return
        if (saving) return
        saving = true
        try {
            val revised = editingRevision
            val saved = store.upsert(AharaneNote(id, title, content.text))
            notes = (notes.filterNot { it.id == id } + saved).sortedByDescending { it.updatedAt }
            savedRevision = revised
            error = ""
        } catch (e: Exception) {
            error = e.message ?: "The note could not be saved. Your draft remains here."
        } finally {
            saving = false
        }
    }
    // Debounce small edits, then persist encrypted. Never clear an unsaved draft
    // after a storage error. New documents are saved immediately on creation.
    LaunchedEffect(selectedId, editingRevision) {
        if (selectedId != null && editingRevision > savedRevision) {
            delay(650)
            save()
        }
    }
    fun exitEditor() {
        if (editingRevision > savedRevision) {
            scope.launch {
                save()
                if (editingRevision == savedRevision) selectedId = null
            }
        } else selectedId = null
    }
    BackHandler { if (selectedId != null) exitEditor() else onBack() }

    Column(
        Modifier.fillMaxSize().imePadding().padding(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(onClick = { if (selectedId != null) exitEditor() else onBack() }) {
                Text("Close")
            }
            Text(
                if (selectedId == null) "Notes" else "Edit note",
                color = StudioPalette.Ink, fontSize = 21.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f).padding(top = 11.dp)
            )
            if (selectedId != null) {
                Button(onClick = { scope.launch { save() } }, enabled = !saving) {
                    Text(if (saving) "Saving…" else if (editingRevision == savedRevision) "Saved" else "Save")
                }
            }
        }
        if (error.isNotBlank()) {
            Text(error, color = StudioPalette.Bad, fontSize = 12.sp)
            OutlinedButton(onClick = {
                scope.launch {
                    try { refresh(); error = "" } catch (e: Exception) {
                        error = e.message ?: "Still unable to open notes."
                    }
                }
            }) { Text("Retry loading") }
        }
        if (selectedId == null) {
            Text("Private notes stay encrypted on this device, even offline.", color = StudioPalette.Muted, fontSize = 12.sp)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = query, onValueChange = { query = it },
                    modifier = Modifier.weight(1f), singleLine = true,
                    placeholder = { Text("Search notes") }, label = { Text("Search") }
                )
                Button(
                    onClick = {
                        scope.launch {
                            try {
                                val note = store.upsert(AharaneNote(title = ""))
                                refresh()
                                open(note)
                            } catch (e: Exception) {
                                error = e.message ?: "Could not create a note."
                            }
                        }
                    },
                    modifier = Modifier.padding(top = 9.dp),
                    enabled = loaded && error.isBlank()
                ) { Text("New note") }
            }
            val matching = notes.filter {
                query.isBlank() || it.title.contains(query, ignoreCase = true) ||
                    it.content.contains(query, ignoreCase = true)
            }
            if (loaded && matching.isEmpty()) {
                Text(
                    if (query.isBlank()) "No notes yet. Create one to get started."
                    else "No notes match your search.",
                    color = StudioPalette.Muted,
                    modifier = Modifier.padding(top = 32.dp)
                )
            }
            LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(matching, key = { it.id }) { note ->
                    Column(
                        modifier = Modifier.fillMaxWidth()
                            .background(StudioPalette.Surface, RoundedCornerShape(10.dp))
                            .clickable { open(note) }.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(5.dp)
                    ) {
                        Text(
                            note.title.ifBlank { "Untitled note" }, color = StudioPalette.Ink,
                            fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                            maxLines = 1, overflow = TextOverflow.Ellipsis
                        )
                        if (note.content.isNotBlank()) Text(
                            note.content, color = StudioPalette.Muted,
                            fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
        } else {
            OutlinedTextField(
                value = title, onValueChange = { if (it.length <= 200) {
                    title = it; editingRevision++
                } },
                label = { Text("Title") }, singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(onClick = {
                    val selection = content.selection
                    val start = selection.min.coerceAtMost(content.text.length)
                    val end = selection.max.coerceAtMost(content.text.length)
                    val original = content.text.substring(start, end)
                    val inserted = "**" + original + "**"
                    content = TextFieldValue(
                        content.text.replaceRange(start, end, inserted),
                        selection = TextRange(start + 2, start + 2 + original.length)
                    )
                    editingRevision++
                }) { Text("Bold") }
                OutlinedButton(onClick = {
                    val pos = content.selection.start.coerceAtMost(content.text.length)
                    content = TextFieldValue(
                        content.text.substring(0, pos) + "- " + content.text.substring(pos),
                        selection = TextRange(pos + 2)
                    )
                    editingRevision++
                }) { Text("List") }
                OutlinedButton(onClick = { deleting = true }) { Text("Delete") }
            }
            OutlinedTextField(
                value = content,
                onValueChange = { if (it.text.length <= 200_000) {
                    content = it; editingRevision++
                } },
                label = { Text("Note") },
                placeholder = { Text("Write a note…") },
                modifier = Modifier.fillMaxWidth().weight(1f),
            )
            Text(
                if (saving) "Saving encrypted note…"
                else if (editingRevision > savedRevision) "Unsaved changes"
                else "Saved on this device",
                color = if (error.isNotBlank()) StudioPalette.Bad else StudioPalette.Muted,
                fontSize = 11.sp
            )
        }
    }
    if (deleting && selectedId != null) {
        AlertDialog(
            onDismissRequest = { deleting = false },
            title = { Text("Delete this note?") },
            text = { Text("This permanently removes only the selected note from this device.") },
            confirmButton = {
                Button(onClick = {
                    val id = selectedId ?: return@Button
                    scope.launch {
                        try {
                            store.delete(id)
                            refresh()
                            selectedId = null
                            deleting = false
                            error = ""
                        } catch (e: Exception) {
                            error = e.message ?: "Note could not be deleted."
                            deleting = false
                        }
                    }
                }) { Text("Delete") }
            },
            dismissButton = { OutlinedButton(onClick = { deleting = false }) { Text("Cancel") } }
        )
    }
}
