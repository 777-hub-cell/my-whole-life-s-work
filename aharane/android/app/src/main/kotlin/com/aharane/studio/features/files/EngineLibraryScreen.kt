package com.aharane.studio.features.files

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.StudioPalette
import com.aharane.studio.core.network.AharaneRepository
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

private data class EngineRow(val id: String, val name: String, val version: Int, val description: String)

private fun portDefinitions(source: String): JSONArray {
    val result = JSONArray()
    val ids = mutableSetOf<String>()
    for (entry in source.split(',')) {
        val item = entry.trim()
        if (item.isBlank()) continue
        val parts = item.split(':')
        require(parts.size == 2) { "Ports must look like query:string, results:list." }
        val id = parts[0].trim()
        val type = parts[1].trim()
        require(id.matches(Regex("[a-z][a-zA-Z0-9_]{0,31}"))) { "Invalid port name: $id" }
        require(ids.add(id)) { "Duplicate port: $id" }
        require(type in setOf("string", "number", "boolean", "text", "image", "media", "json", "list")) { "Unsupported port type: $type" }
        result.put(JSONObject().put("id", id).put("type", type).put("required", true))
    }
    return result
}

@Composable
fun EngineLibraryScreen(
    repository: AharaneRepository,
    connected: Boolean,
    onBack: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var entries by remember { mutableStateOf<List<EngineRow>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var editingId by remember { mutableStateOf<String?>(null) }
    var editorVisible by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var id by remember { mutableStateOf("") }
    var version by remember { mutableStateOf("1") }
    var savedVersion by remember { mutableIntStateOf(0) }
    var inputs by remember { mutableStateOf("query:string") }
    var outputs by remember { mutableStateOf("results:list") }
    var code by remember { mutableStateOf("export async function run(inputs) {\n  return { results: [inputs.query] }\n}") }
    var deletingId by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    var search by remember { mutableStateOf("") }

    fun refresh() {
        if (!connected) {
            error = "Connect to your Aharane server to manage Engines."
            return
        }
        scope.launch {
            loading = true
            try {
                val response = repository.engineLibrary()
                val rows = response.optJSONArray("engines") ?: JSONArray()
                entries = buildList {
                    for (index in 0 until rows.length()) {
                        val entry = rows.optJSONObject(index) ?: continue
                        add(EngineRow(entry.optString("id"), entry.optString("name"), entry.optInt("version"), entry.optString("description")))
                    }
                }
                error = ""
            } catch (failure: Exception) {
                error = failure.message ?: "Could not load Engines."
            } finally { loading = false }
        }
    }

    LaunchedEffect(connected) { refresh() }

    Column(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { if (editorVisible) editorVisible = false else onBack() }) {
                Text(if (editorVisible) "Engines" else "Back")
            }
            Spacer(Modifier.weight(1f))
            Text(if (editorVisible) "Engine code" else "Engines", fontSize = 19.sp, fontWeight = FontWeight.Bold, color = StudioPalette.Ink)
            Spacer(Modifier.weight(1f))
            if (!editorVisible) {
                TextButton(onClick = { refresh() }, enabled = connected && !loading) { Text("Refresh") }
            }
        }
        Text(
            "Engine code is stored safely. Execution is unavailable until the isolated runtime is verified.",
            fontSize = 12.sp, color = StudioPalette.Muted
        )
        if (error.isNotBlank()) {
            Text(error, fontSize = 12.sp, color = StudioPalette.Bad)
        }
        if (editorVisible) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(value = name, onValueChange = { name = it.take(80) }, label = { Text("Engine name") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                OutlinedTextField(value = id, onValueChange = { if (editingId == null) id = it.lowercase().take(48) }, label = { Text("Engine ID") }, enabled = editingId == null, modifier = Modifier.fillMaxWidth(), singleLine = true)
                OutlinedTextField(value = version, onValueChange = { version = it.filter(Char::isDigit).take(5) }, label = { Text("Version") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                OutlinedTextField(value = inputs, onValueChange = { inputs = it }, label = { Text("Inputs · query:string") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                OutlinedTextField(value = outputs, onValueChange = { outputs = it }, label = { Text("Outputs · results:list") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                OutlinedTextField(
                    value = code, onValueChange = { if (it.length <= 65536) code = it },
                    label = { Text("JavaScript · export async function run(inputs)") },
                    modifier = Modifier.fillMaxWidth().weight(1f),
                    textStyle = androidx.compose.ui.text.TextStyle(fontSize = 13.sp, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
                )
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    enabled = connected && !saving,
                    onClick = {
                        scope.launch {
                            saving = true
                            try {
                                val manifest = JSONObject()
                                    .put("id", id)
                                    .put("name", name)
                                    .put("version", version.toIntOrNull() ?: 0)
                                    .put("entryPoint", "run")
                                    .put("inputs", portDefinitions(inputs))
                                    .put("outputs", portDefinitions(outputs))
                                    .put("permissions", JSONArray())
                                    .put("timeoutMs", 10000)
                                    .put("maxResults", 10)
                                if (editingId == null) repository.createEngine(manifest, code)
                                else repository.updateEngine(id, manifest, code, savedVersion)
                                editorVisible = false
                                error = ""
                                refresh()
                            } catch (failure: Exception) {
                                error = failure.message ?: "Could not save Engine."
                            } finally { saving = false }
                        }
                    }
                ) { Text(if (saving) "Saving…" else "Save Engine") }
            }
        } else {
            OutlinedTextField(
                value = search, onValueChange = { search = it },
                label = { Text("Search Engines") },
                modifier = Modifier.fillMaxWidth(), singleLine = true
            )
            Button(
                enabled = connected,
                onClick = {
                    editingId = null
                    id = ""; name = ""; version = "1"; savedVersion = 0
                    inputs = "query:string"; outputs = "results:list"
                    code = "export async function run(inputs) {\n  return { results: [inputs.query] }\n}"
                    editorVisible = true; error = ""
                },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Create Engine") }
            LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                val visible = entries.filter { it.name.contains(search, true) || it.id.contains(search, true) }
                if (visible.isEmpty()) {
                    item {
                        Text(
                            if (loading) "Loading Engines…" else "No Engines here yet.",
                            color = StudioPalette.Muted, fontSize = 13.sp
                        )
                    }
                }
                items(visible, key = { it.id }) { engine ->
                    Row(
                        Modifier.fillMaxWidth().background(StudioPalette.Surface, RoundedCornerShape(12.dp))
                            .clickable {
                                scope.launch {
                                    try {
                                        val item = repository.readEngine(engine.id)
                                        val manifest = item.optJSONObject("manifest") ?: JSONObject()
                                        editingId = engine.id
                                        id = engine.id
                                        name = manifest.optString("name")
                                        version = manifest.optInt("version", 1).toString()
                                        savedVersion = manifest.optInt("version", 1)
                                        inputs = (manifest.optJSONArray("inputs") ?: JSONArray()).let { array ->
                                            (0 until array.length()).mapNotNull { array.optJSONObject(it) }
                                                .joinToString(", ") { it.optString("id") + ":" + it.optString("type") }
                                        }
                                        outputs = (manifest.optJSONArray("outputs") ?: JSONArray()).let { array ->
                                            (0 until array.length()).mapNotNull { array.optJSONObject(it) }
                                                .joinToString(", ") { it.optString("id") + ":" + it.optString("type") }
                                        }
                                        code = item.optString("code")
                                        editorVisible = true
                                        error = ""
                                    } catch (failure: Exception) { error = failure.message ?: "Engine unavailable." }
                                }
                            }.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(engine.name, color = StudioPalette.Ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                            Text(engine.id + " · v" + engine.version, color = StudioPalette.Muted, fontSize = 11.sp)
                        }
                        TextButton(onClick = { deletingId = engine.id }) { Text("Delete") }
                    }
                }
            }
        }
    }
    if (deletingId != null) {
        AlertDialog(
            onDismissRequest = { deletingId = null },
            title = { Text("Delete Engine?") },
            text = { Text("Commands using this Engine cannot be deleted silently. Dependencies will be checked.") },
            confirmButton = {
                TextButton(onClick = {
                    val target = deletingId ?: return@TextButton
                    deletingId = null
                    scope.launch {
                        try { repository.deleteEngine(target); refresh() }
                        catch (failure: Exception) { error = failure.message ?: "Could not delete Engine." }
                    }
                }) { Text("Delete") }
            },
            dismissButton = { TextButton(onClick = { deletingId = null }) { Text("Cancel") } }
        )
    }
}
