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

/** Plain-text summary of effective grants and advisory diagnostics from GET /engines/:id/capabilities. */
private fun describeCapabilities(info: JSONObject): String {
    val capabilities = info.optJSONObject("capabilities") ?: return ""
    val permissions = capabilities.optJSONArray("permissions") ?: JSONArray()
    val lines = mutableListOf<String>()
    for (index in 0 until permissions.length()) {
        val permission = permissions.optJSONObject(index) ?: continue
        val hosts = permission.optJSONArray("hosts") ?: JSONArray()
        val names = (0 until hosts.length()).map { hosts.optString(it) }
        val grant = if (permission.optBoolean("granted")) names.joinToString(", ") else "not granted"
        lines.add(permission.optString("id") + ": " + grant)
    }
    val findings = info.optJSONObject("diagnostics")?.optJSONArray("findings") ?: JSONArray()
    for (index in 0 until findings.length()) {
        val finding = findings.optJSONObject(index) ?: continue
        lines.add(finding.optString("severity") + ": " + finding.optString("message"))
    }
    return lines.joinToString("\n")
}

/** Plain-text summary of a run envelope: success and outputs, or the structured outcome and message. */
private fun describeRun(result: JSONObject): String {
    val revision = result.optJSONObject("engine")?.optInt("revision", 0) ?: 0
    val denied = result.optJSONArray("denials")?.length() ?: 0
    val header = if (result.optBoolean("ok")) {
        "Succeeded in " + result.optLong("durationMs") + " ms, revision " + revision
    } else {
        result.optString("outcome") + ": " + result.optString("message")
    }
    val deniedLine = if (denied > 0) "\nDenied calls: " + denied else ""
    val outputs = result.optJSONObject("outputs")?.toString(2) ?: ""
    return header + deniedLine + (if (outputs.isNotBlank()) "\n" + outputs else "")
}

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
    var savedRevision by remember { mutableIntStateOf(0) }
    var inputs by remember { mutableStateOf("query:string") }
    var outputs by remember { mutableStateOf("results:list") }
    var allowedHosts by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("export async function run(inputs) {\n  return { results: [inputs.query] }\n}") }
    var deletingId by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    var search by remember { mutableStateOf("") }
    var testOpen by remember { mutableStateOf(false) }
    var testInput by remember { mutableStateOf("{}") }
    var testResult by remember { mutableStateOf("") }
    var testCapabilities by remember { mutableStateOf("") }
    var testing by remember { mutableStateOf(false) }

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
            "Engines run in a restricted JavaScript runtime. External requests require approved HTTPS hostnames below.",
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
                OutlinedTextField(value = allowedHosts, onValueChange = { allowedHosts = it.take(2000) }, label = { Text("Approved HTTPS hosts · optional") }, placeholder = { Text("images.example.com, api.example.com") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
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
                                    .put("permissions", JSONArray().apply { if (allowedHosts.isNotBlank()) put("network.fetch") })
                                    .put("allowedHosts", JSONArray(allowedHosts.split(Regex("[,\\n]+")).map { it.trim().lowercase() }.filter { it.isNotBlank() }.distinct()))
                                    .put("timeoutMs", 10000)
                                    .put("maxResults", 10)
                                if (editingId == null) repository.createEngine(manifest, code)
                                else repository.updateEngine(id, manifest, code, savedVersion, savedRevision)
                                editorVisible = false
                                error = ""
                                refresh()
                            } catch (failure: Exception) {
                                error = failure.message ?: "Could not save Engine."
                            } finally { saving = false }
                        }
                    }
                ) { Text(if (saving) "Saving…" else "Save Engine") }
                if (editingId != null && savedRevision > 0) {
                    OutlinedButton(
                        modifier = Modifier.fillMaxWidth(),
                        enabled = connected && !saving,
                        onClick = {
                            val target = editingId ?: return@OutlinedButton
                            testResult = ""
                            testCapabilities = ""
                            testOpen = true
                            scope.launch {
                                try { testCapabilities = describeCapabilities(repository.engineCapabilities(target)) }
                                catch (failure: Exception) { testCapabilities = "" }
                            }
                        }
                    ) { Text("Test run") }
                }
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
                    id = ""; name = ""; version = "1"; savedVersion = 0; savedRevision = 0
                    inputs = "query:string"; outputs = "results:list"; allowedHosts = ""
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
                                        savedRevision = item.optInt("revision", 0)
                                        inputs = (manifest.optJSONArray("inputs") ?: JSONArray()).let { array ->
                                            (0 until array.length()).mapNotNull { array.optJSONObject(it) }
                                                .joinToString(", ") { it.optString("id") + ":" + it.optString("type") }
                                        }
                                        outputs = (manifest.optJSONArray("outputs") ?: JSONArray()).let { array ->
                                            (0 until array.length()).mapNotNull { array.optJSONObject(it) }
                                                .joinToString(", ") { it.optString("id") + ":" + it.optString("type") }
                                        }
                                        allowedHosts = (manifest.optJSONArray("allowedHosts") ?: JSONArray()).let { array ->
                                            (0 until array.length()).mapNotNull { array.optString(it).takeIf(String::isNotBlank) }.joinToString(", ")
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
    if (testOpen) {
        AlertDialog(
            onDismissRequest = { if (!testing) testOpen = false },
            title = { Text("Test run · revision " + savedRevision) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Runs the saved revision, not unsaved edits. Only approved HTTPS hosts can be reached.",
                        fontSize = 12.sp, color = StudioPalette.Muted
                    )
                    if (testCapabilities.isNotBlank()) {
                        Text(testCapabilities, fontSize = 12.sp, color = StudioPalette.Muted)
                    }
                    OutlinedTextField(
                        value = testInput, onValueChange = { testInput = it.take(8000) },
                        label = { Text("Inputs as JSON") }, modifier = Modifier.fillMaxWidth()
                    )
                    if (testResult.isNotBlank()) {
                        Text(
                            testResult, fontSize = 12.sp, color = StudioPalette.Ink,
                            fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !testing,
                    onClick = {
                        val target = editingId ?: return@TextButton
                        val values = try { JSONObject(testInput) } catch (failure: org.json.JSONException) {
                            testResult = "Inputs must be a JSON object, for example {\"query\":\"cats\"}."
                            return@TextButton
                        }
                        scope.launch {
                            testing = true
                            testResult = "Running…"
                            try { testResult = describeRun(repository.runEngine(target, savedRevision, values)) }
                            catch (failure: Exception) { testResult = failure.message ?: "Test run failed." }
                            finally { testing = false }
                        }
                    }
                ) { Text(if (testing) "Running…" else "Run") }
            },
            dismissButton = { TextButton(enabled = !testing, onClick = { testOpen = false }) { Text("Close") } }
        )
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
