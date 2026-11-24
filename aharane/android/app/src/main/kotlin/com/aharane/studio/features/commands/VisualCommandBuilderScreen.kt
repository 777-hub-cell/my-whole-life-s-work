package com.aharane.studio.features.commands

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.core.tween
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.aharane.studio.core.design.StudioActionButton
import com.aharane.studio.core.design.LocalStudioMotionEnabled
import com.aharane.studio.core.design.StudioPalette
import com.aharane.studio.core.network.VisualCommandDataSource
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

private data class ActiveSocket(val nodeId: String, val socketId: String, val type: String)

internal const val WORKSPACE_CANVAS_PADDING_DP = 48f
internal fun workspaceNodeOffset(node: VisualNode): Offset =
    Offset(node.x + WORKSPACE_CANVAS_PADDING_DP, node.y + WORKSPACE_CANVAS_PADDING_DP)

@Composable
fun VisualCommandBuilderScreen(
    repository: VisualCommandDataSource,
    connected: Boolean,
    onBack: () -> Unit,
    onManageEngines: () -> Unit = {}
) {
    val scope = rememberCoroutineScope()
    val workspaceScroll = rememberScrollState()
    val workspaceVerticalScroll = rememberScrollState()
    var account by remember { mutableStateOf("private") }
    var workflow by remember { mutableStateOf(VisualWorkflow.draft()) }
    var library by remember { mutableStateOf<List<VisualNodeCategory>>(emptyList()) }
    var savedWorkflows by remember { mutableStateOf<List<VisualWorkflow>>(emptyList()) }
    var savedValidation by remember { mutableStateOf<Map<String, VisualWorkflowValidation>>(emptyMap()) }
    var validation by remember { mutableStateOf(VisualWorkflowValidation()) }
    var selectedNodeId by remember { mutableStateOf<String?>(null) }
    var configNodeId by remember { mutableStateOf<String?>(null) }
    var pendingSocket by remember { mutableStateOf<ActiveSocket?>(null) }
    var category by remember { mutableStateOf("All") }
    var search by remember { mutableStateOf("") }
    var workspaceFraction by remember { mutableFloatStateOf(0.58f) }
    var zoom by remember { mutableFloatStateOf(1f) }
    var workspaceViewportSize by remember { mutableStateOf(IntSize.Zero) }
    var workspaceCoordinates by remember { mutableStateOf<LayoutCoordinates?>(null) }
    val measuredNodeSizes = remember { mutableStateMapOf<String, IntSize>() }
    val measuredSocketPositions = remember { mutableStateMapOf<String, Offset>() }
    val density = LocalDensity.current
    var loading by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var testing by remember { mutableStateOf(false) }
    var dirty by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf("") }
    var result by remember { mutableStateOf<JSONObject?>(null) }
    var showLoad by remember { mutableStateOf(false) }
    var showCustomManager by remember { mutableStateOf(false) }
    var customNodes by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var showDelete by remember { mutableStateOf(false) }
    var undo by remember { mutableStateOf<List<VisualWorkflow>>(emptyList()) }
    var redo by remember { mutableStateOf<List<VisualWorkflow>>(emptyList()) }
    var loadedId by remember { mutableStateOf<String?>(null) }

    fun snapshot() {
        undo = (undo + workflow).takeLast(40)
        redo = emptyList()
    }

    fun edit(transform: (VisualWorkflow) -> VisualWorkflow) {
        snapshot()
        val updated = transform(workflow)
        val commandName = updated.nodes.firstOrNull { it.type == "trigger.command" }
            ?.config?.get("command")?.trim()
        workflow = if (!commandName.isNullOrBlank()) updated.copy(name = commandName) else updated
        dirty = true
        validation = VisualWorkflowValidation()
        notice = ""
    }

    fun switchAccount() {
        val next = if (account == "private") "public" else "private"
        if (dirty) {
            notice = "Save your changes before switching accounts."
        } else {
            account = next
            workflow = VisualWorkflow.draft(next)
            saved = false
            loadedId = null
            validation = VisualWorkflowValidation()
            selectedNodeId = null
            configNodeId = null
            pendingSocket = null
        }
    }

    fun fitWorkspace() {
        val nodes = workflow.nodes
        if (nodes.isNotEmpty() && workspaceViewportSize.width > 0 && workspaceViewportSize.height > 0) {
            val left = nodes.minOf { it.x }
            val top = nodes.minOf { it.y }
            val right = nodes.maxOf { it.x + 206f }
            val bottom = nodes.maxOf { node ->
                node.y + (measuredNodeSizes[node.id]?.height?.let { with(density) { it.toDp().value } } ?: 132f)
            }
            val graphWidthPx = with(density) { (right - left + 96f).coerceAtLeast(260f).dp.toPx() }
            val graphHeightPx = with(density) { (bottom - top + 96f).coerceAtLeast(180f).dp.toPx() }
            val availableWidth = (workspaceViewportSize.width - with(density) { 32.dp.toPx() }).coerceAtLeast(1f)
            val availableHeight = (workspaceViewportSize.height - with(density) { 32.dp.toPx() }).coerceAtLeast(1f)
            zoom = minOf(availableWidth / graphWidthPx, availableHeight / graphHeightPx).coerceIn(0.35f, 1.8f)
        } else {
            zoom = 0.78f
        }
        scope.launch { workspaceScroll.scrollTo(0); workspaceVerticalScroll.scrollTo(0) }
    }

    fun useSaved(row: JSONObject) {
        val item = VisualWorkflow.fromJson(row)
        val commandName = item.nodes.firstOrNull { it.type == "trigger.command" }
            ?.config?.get("command")?.trim()
        workflow = if (!commandName.isNullOrBlank()) item.copy(name = commandName) else item
        validation = VisualWorkflowValidation.fromJson(row.optJSONObject("validation"))
        loadedId = item.id
        saved = true
        dirty = false
        selectedNodeId = null
        configNodeId = null
        pendingSocket = null
        undo = emptyList()
        redo = emptyList()
        showLoad = false
    }

    suspend fun refresh() {
        if (!connected) {
            notice = "Connect to your Aharane server to load saved commands."
            return
        }
        loading = true
        try {
            val response = repository.visualCommands(account)
            val warning = response.optString("storageWarning")
            if (warning.isNotBlank() && warning != "null") notice = warning
            val customRows = response.optJSONArray("customNodes") ?: JSONArray()
            customNodes = (0 until customRows.length()).mapNotNull { customRows.optJSONObject(it) }
            val categories = response.optJSONArray("library") ?: JSONArray()
            library = buildList {
                for (index in 0 until categories.length()) {
                    categories.optJSONObject(index)?.let { add(VisualNodeCategory.fromJson(it)) }
                }
            }
            val rows = response.optJSONArray("workflows") ?: JSONArray()
            val parsed = buildList {
                for (index in 0 until rows.length()) {
                    rows.optJSONObject(index)?.let { add(VisualWorkflow.fromJson(it)) }
                }
            }
            savedWorkflows = parsed
            savedValidation = buildMap {
                for (index in 0 until rows.length()) {
                    val row = rows.optJSONObject(index) ?: continue
                    put(row.optString("id"), VisualWorkflowValidation.fromJson(row.optJSONObject("validation")))
                }
            }
            val currentRow = (0 until rows.length()).mapNotNull { rows.optJSONObject(it) }
                .firstOrNull { it.optString("id") == loadedId }
            if (currentRow != null && !dirty) useSaved(currentRow)
            else if (loadedId == null && !dirty && parsed.isNotEmpty()) {
                val first = (0 until rows.length()).mapNotNull { rows.optJSONObject(it) }.first()
                useSaved(first)
            } else if (loadedId == null && !dirty && parsed.isEmpty()) {
                workflow = VisualWorkflow.draft(account)
                saved = false
                validation = VisualWorkflowValidation()
            }
            if (parsed.isEmpty()) notice = "No saved commands yet. Add nodes to create your first command."
        } catch (error: Exception) {
            notice = error.message ?: "Saved commands could not be loaded."
        } finally {
            loading = false
        }
    }

    LaunchedEffect(connected, account) {
        if (connected) refresh()
        else {
            library = emptyList()
            savedWorkflows = emptyList()
        }
    }

    suspend fun saveDraft(): Boolean {
        val wasEnabled = workflow.enabled
        if (!connected) {
            notice = "Connect to your Aharane server before saving."
            return false
        }
        saving = true
        return try {
            val draft = workflow.copy(enabled = false)
            val response = if (saved) repository.updateVisualCommand(draft.id, draft.toJson())
            else repository.createVisualCommand(draft.toJson())
            val row = response.optJSONObject("workflow")
                ?: throw IllegalStateException("The server did not return the saved workflow.")
            workflow = VisualWorkflow.fromJson(row)
            validation = VisualWorkflowValidation.fromJson(response.optJSONObject("validation"))
            loadedId = workflow.id
            saved = true
            dirty = false
            savedWorkflows = (savedWorkflows.filterNot { it.id == workflow.id } + workflow)
            if (wasEnabled && validation.valid) {
                val activeResponse = repository.updateVisualCommand(workflow.id, workflow.copy(enabled = true).toJson())
                val activeRow = activeResponse.optJSONObject("workflow") ?: row
                workflow = VisualWorkflow.fromJson(activeRow)
                validation = VisualWorkflowValidation.fromJson(activeResponse.optJSONObject("validation"))
                savedWorkflows = savedWorkflows.filterNot { it.id == workflow.id } + workflow
            }
            notice = when {
                wasEnabled && workflow.enabled -> "Changes saved; command remains active."
                wasEnabled -> "Changes saved as a draft because validation found errors."
                validation.valid -> "Draft saved on your Aharane server."
                else -> "Draft saved. Fix the errors before activating it."
            }
            true
        } catch (error: Exception) {
            notice = error.message ?: "The workflow could not be saved."
            if (error is com.aharane.studio.core.network.AharaneApiException && error.statusCode == 422) {
                notice = error.message ?: "The workflow did not pass validation."
            }
            false
        } finally {
            saving = false
        }
    }

    suspend fun saveAndActivate() {
        if (!saveDraft()) return
        if (!validation.valid) {
            notice = "Activation blocked: fix the validation errors first."
            return
        }
        saving = true
        try {
            val active = workflow.copy(enabled = true)
            val response = repository.updateVisualCommand(active.id, active.toJson())
            val row = response.optJSONObject("workflow") ?: active.toJson()
            workflow = VisualWorkflow.fromJson(row)
            validation = VisualWorkflowValidation.fromJson(response.optJSONObject("validation"))
            savedWorkflows = savedWorkflows.filterNot { it.id == workflow.id } + workflow
            dirty = false
            notice = if (workflow.enabled) "Command activated." else "The server kept this workflow as a draft."
        } catch (error: Exception) {
            notice = error.message ?: "The command could not be activated."
        } finally {
            saving = false
        }
    }

    suspend fun safeTest() {
        if (!saveDraft()) return
        testing = true
        try {
            val response = repository.testVisualCommand(workflow.id)
            result = response.optJSONObject("result") ?: response
            notice = if (response.optBoolean("ok")) {
                "Safe test passed. No WhatsApp messages were sent."
            } else {
                "Safe test found a problem. Review the execution trace."
            }
        } catch (error: Exception) {
            notice = error.message ?: "The safe test failed."
        } finally {
            testing = false
        }
    }

    fun addNode(definition: VisualNodeDefinition) {
        val config = when (definition.type) {
            "trigger.command" -> mapOf("command" to "hello", "aliases" to "", "requireQuoted" to "false", "requireReply" to "false", "chatScope" to "direct", "maxMessagesPerRun" to "10")
            "trigger.message" -> mapOf("chatScope" to "direct", "maxMessagesPerRun" to "10")
            "message.sendText", "message.replyText" -> mapOf("text" to "Hello, {{sender}}!")
            "message.react" -> mapOf("emoji" to "👍")
            "message.sendPoll" -> mapOf("title" to "Quick question?", "options" to "Option A\nOption B", "selectableCount" to "1")
            "message.sendLocation" -> mapOf("latitude" to "6.5244", "longitude" to "3.3792", "name" to "Lagos")
            "contact.sendCard" -> mapOf("name" to "Contact name", "phone" to "2348012345678")
            "message.sendButtons" -> mapOf("text" to "Choose an option", "buttons" to "Yes|yes\nNo|no")
            "group.updateSubject" -> mapOf("subject" to "Group name")
            "group.updateDescription" -> mapOf("description" to "Group description")
            "group.participantsUpdate" -> mapOf("action" to "promote", "participants" to "2348012345678")
            "group.settingUpdate" -> mapOf("setting" to "announcement")
            "moderation.blockContact", "moderation.unblockContact" -> mapOf("phone" to "2348012345678")
            "profile.updateName" -> mapOf("name" to "Aharane")
            "profile.updateStatus" -> mapOf("status" to "Available")
            "newsletter.create" -> mapOf("name" to "My newsletter", "description" to "Updates")
            "newsletter.follow", "newsletter.unfollow" -> mapOf("newsletterJid" to "")
            "newsletter.publishText" -> mapOf("newsletterJid" to "", "text" to "Hello from Aharane")
            "condition.equals" -> mapOf("left" to "", "right" to "")
            "condition.contains" -> mapOf("text" to "{{message.text}}", "search" to "")
            "variable.set" -> mapOf("key" to "value", "value" to "")
            "variable.get", "counter.increment" -> mapOf("key" to "count")
            "flow.delay" -> mapOf("milliseconds" to "1000")
            "flow.repeat" -> mapOf("count" to "2")
            "media.sendImage" -> mapOf("caption" to "")
            "media.sendImages" -> mapOf("caption" to "", "limit" to "10")
            else -> when {
                definition.type.startsWith("custom.") -> mapOf("nodeVersion" to definition.version.toString())
                definition.type.startsWith("engine.") -> mapOf("engineVersion" to definition.version.toString())
                else -> emptyMap()
            }
        }
        val newNode = VisualNode(
            type = definition.type,
            x = (workflow.nodes.maxOfOrNull { it.x } ?: 24f) + 230f,
            y = 70f + (workflow.nodes.size % 3) * 34f,
            config = config
        )
        edit { current ->
            var edges = current.edges
            val needsExec = definition.inputs.any { it.id == "in" && it.type == "exec" }
            val previous = current.nodes.asReversed().firstOrNull { source ->
                library.flatMap { it.nodes }.firstOrNull { it.type == source.type }
                    ?.outputs?.any { it.id == "next" && it.type == "exec" } == true &&
                    current.edges.none { it.from == source.id && it.fromSocket == "next" }
            }
            if (needsExec && previous != null) {
                edges = edges + VisualEdge(from = previous.id, fromSocket = "next", to = newNode.id, toSocket = "in")
            }
            current.copy(nodes = current.nodes + newNode, edges = edges)
        }
        selectedNodeId = newNode.id
        configNodeId = newNode.id
    }

    fun tapSocket(node: VisualNode, socket: VisualSocket, output: Boolean) {
        if (output) {
            pendingSocket = ActiveSocket(node.id, socket.id, socket.type)
            notice = "Output selected. Choose an input socket of the same type."
            return
        }
        val source = pendingSocket
        if (source == null) {
            notice = "Select an output socket first."
            return
        }
        if (source.nodeId == node.id) {
            pendingSocket = null
            notice = "A node cannot connect to itself."
            return
        }
        if (source.type != socket.type) {
            notice = "Connection rejected: " + source.type + " cannot connect to " + socket.type + "."
            return
        }
        edit { current ->
            val withoutInput = current.edges.filterNot { it.to == node.id && it.toSocket == socket.id }
            val withoutSource = if (socket.type == "exec") {
                withoutInput.filterNot { it.from == source.nodeId && it.fromSocket == source.socketId }
            } else withoutInput
            current.copy(edges = withoutSource + VisualEdge(
                from = source.nodeId,
                fromSocket = source.socketId,
                to = node.id,
                toSocket = socket.id
            ))
        }
        pendingSocket = null
        notice = "Connection added."
    }

    fun moveNode(id: String, delta: Offset) {
        workflow = workflow.copy(nodes = workflow.nodes.map { node ->
            if (node.id == id) {
                node.copy(
                    x = (node.x + delta.x).coerceIn(0f, 10_000f),
                    y = (node.y + delta.y).coerceIn(0f, 10_000f)
                )
            } else node
        })
        dirty = true
    }

    fun undoChange() {
        val previous = undo.lastOrNull() ?: return
        redo = redo + workflow
        workflow = previous
        undo = undo.dropLast(1)
        dirty = true
        validation = VisualWorkflowValidation()
    }

    fun redoChange() {
        val next = redo.lastOrNull() ?: return
        undo = undo + workflow
        workflow = next
        redo = redo.dropLast(1)
        dirty = true
        validation = VisualWorkflowValidation()
    }

    BackHandler(onBack = onBack)

    val definitions = library.flatMap { it.nodes }
    val selectedCategory = library.filter { category == "All" || it.name == category }
    val visibleNodes = selectedCategory.flatMap { it.nodes }.filter {
        (account != "private" || (it.type != "trigger.message" && !it.type.startsWith("group."))) &&
            (search.isBlank() || it.name.contains(search, true) || it.description.contains(search, true))
    }
    val nodeErrorMap = validation.errors.filter { it.nodeId != null }.groupBy { it.nodeId }
    val configuredNode = workflow.nodes.firstOrNull { it.id == configNodeId }

    Column(
        Modifier.fillMaxSize().background(StudioPalette.Background).navigationBarsPadding().imePadding().padding(horizontal = 12.dp, vertical = 8.dp)
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                "‹  More",
                color = StudioPalette.Accent,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clickable(onClick = onBack).padding(vertical = 6.dp)
            )
            Spacer(Modifier.width(9.dp))
            Column(Modifier.weight(1f)) {
                Text("Visual command builder", color = StudioPalette.Ink, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                Text(if (dirty) "Unsaved changes" else if (workflow.enabled) "Active command" else "Workflow draft", color = StudioPalette.Muted, fontSize = 10.sp)
            }
            StudioActionButton("Load", modifier = Modifier.testTag("workflow-load"), compact = true, enabled = connected && savedWorkflows.isNotEmpty(), onClick = { showLoad = true })
            Spacer(Modifier.width(5.dp))
            StudioActionButton("Save", modifier = Modifier.testTag("workflow-save"), compact = true, primary = true, enabled = connected && !saving && (!saved || dirty), onClick = {
                scope.launch { saveDraft() }
            })
        }

        Row(
            Modifier.fillMaxWidth().padding(vertical = 6.dp).horizontalScroll(rememberScrollState()),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Row(
                Modifier.clip(RoundedCornerShape(8.dp))
                    .background(StudioPalette.Surface)
                    .border(1.dp, StudioPalette.Line, RoundedCornerShape(8.dp))
                    .clickable(onClick = ::switchAccount)
                    .padding(horizontal = 10.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Icon(Icons.Outlined.Person, contentDescription = null, tint = StudioPalette.Accent, modifier = Modifier.size(17.dp))
                Text(if (account == "private") "Private" else "Public", color = StudioPalette.Ink, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                Text("↕", color = StudioPalette.Muted, fontSize = 12.sp)
            }
            Spacer(Modifier.width(2.dp))
            StudioActionButton(if (testing) "Testing…" else "Test safely", compact = true, enabled = connected && !testing && !saving, onClick = {
                scope.launch { safeTest() }
            })
            StudioActionButton(
                if (workflow.enabled) "Deactivate" else "Activate",
                compact = true,
                primary = !workflow.enabled,
                enabled = connected && !saving && !testing,
                onClick = {
                    scope.launch {
                        if (workflow.enabled) {
                            saving = true
                            try {
                                val response = repository.updateVisualCommand(workflow.id, workflow.copy(enabled = false).toJson())
                                val row = response.optJSONObject("workflow") ?: workflow.copy(enabled = false).toJson()
                                workflow = VisualWorkflow.fromJson(row)
                                savedWorkflows = savedWorkflows.filterNot { it.id == workflow.id } + workflow
                                notice = "Command deactivated."
                            } catch (error: Exception) {
                                notice = error.message ?: "Command could not be deactivated."
                            } finally { saving = false }
                        } else saveAndActivate()
                    }
                }
            )
            StudioActionButton("Engine library", compact = true, enabled = connected, onClick = onManageEngines)
            StudioActionButton("Delete", compact = true, destructive = true, enabled = saved && connected, onClick = { showDelete = true })
        }

        val hasValidation = validation.errors.isNotEmpty() || validation.warnings.isNotEmpty()
        val hasErrors = validation.errors.isNotEmpty()
        AnimatedVisibility(
            visible = hasValidation,
            enter = fadeIn(tween(if (LocalStudioMotionEnabled.current) 130 else 0)) +
                expandVertically(tween(if (LocalStudioMotionEnabled.current) 170 else 0)),
            exit = fadeOut(tween(if (LocalStudioMotionEnabled.current) 90 else 0)) +
                shrinkVertically(tween(if (LocalStudioMotionEnabled.current) 120 else 0))
        ) {
            Text(
                if (hasErrors) validation.errors.size.toString() + " errors · " + validation.errors.first().message
                else validation.warnings.size.toString() + " warnings · " + validation.warnings.first().message,
                color = if (hasErrors) StudioPalette.Bad else StudioPalette.Accent,
                fontSize = 10.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(7.dp))
                    .background(if (hasErrors) StudioPalette.Bad.copy(alpha = 0.07f) else StudioPalette.Accent.copy(alpha = 0.07f))
                    .padding(7.dp)
            )
        }

        Column(Modifier.fillMaxWidth().weight(workspaceFraction)) {
            Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("WORKSPACE", color = StudioPalette.Ink, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                Spacer(Modifier.weight(1f))
                Text(workflow.nodes.size.toString() + " nodes · " + workflow.edges.size + " wires", color = StudioPalette.Muted, fontSize = 10.5.sp, modifier = Modifier.testTag("workflow-node-count"))
            }
            Box(Modifier.fillMaxSize().onSizeChanged { workspaceViewportSize = it }.clip(RoundedCornerShape(9.dp)).background(Color(0xFFF2F5F2))) {
                Box(
                    Modifier.horizontalScroll(workspaceScroll).verticalScroll(workspaceVerticalScroll).testTag("workflow-workspace").pointerInput(Unit) {
                        awaitEachGesture {
                            awaitFirstDown(requireUnconsumed = false)
                            var lastDistance = 0f
                            do {
                                val event = awaitPointerEvent(PointerEventPass.Main)
                                val pressed = event.changes.filter { it.pressed }
                                if (pressed.size >= 2) {
                                    val distance = (pressed[0].position - pressed[1].position).getDistance()
                                    if (lastDistance > 0f && distance > 0f) {
                                        zoom = (zoom * (distance / lastDistance)).coerceIn(0.5f, 1.8f)
                                    }
                                    lastDistance = distance
                                    event.changes.forEach { if (it.pressed) it.consume() }
                                } else {
                                    lastDistance = 0f
                                }
                            } while (event.changes.any { it.pressed })
                        }
                    }
                ) {
                    // A stable origin prevents dragging one node from shifting every other node.
                    val canvasOriginX = WORKSPACE_CANVAS_PADDING_DP
                    val canvasOriginY = WORKSPACE_CANVAS_PADDING_DP
                    val maxNodeRight = workflow.nodes.maxOfOrNull { it.x + 206f } ?: 206f
                    val maxNodeBottom = workflow.nodes.maxOfOrNull { node ->
                        node.y + (measuredNodeSizes[node.id]?.height?.let { with(density) { it.toDp().value } } ?: 132f)
                    } ?: 180f
                    // Extra blank canvas makes one-finger panning useful on a phone.
                    val canvasWidth = maxOf(1600.dp, (canvasOriginX + maxNodeRight + 48f).dp)
                    val canvasHeight = maxOf(1200.dp, (canvasOriginY + maxNodeBottom + 48f).dp)
                    // Outer box owns scaled scroll dimensions; inner box preserves
                    // unscaled coordinates for socket measurements.
                    Box(Modifier.width(canvasWidth * zoom).height(canvasHeight * zoom)) {
                    Box(
                        Modifier.requiredWidth(canvasWidth).requiredHeight(canvasHeight).graphicsLayer {
                            scaleX = zoom
                            scaleY = zoom
                            transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, 0f)
                        }.onGloballyPositioned { workspaceCoordinates = it }
                    ) {
                        Canvas(Modifier.fillMaxSize()) {
                            val density = this.density
                            val gridStep = 28.dp.toPx()
                            var x = 0f
                            while (x < size.width) {
                                drawLine(Color(0xFFE3E9E4), Offset(x, 0f), Offset(x, size.height), 0.6.dp.toPx())
                                x += gridStep
                            }
                            var y = 0f
                            while (y < size.height) {
                                drawLine(Color(0xFFE3E9E4), Offset(0f, y), Offset(size.width, y), 0.6.dp.toPx())
                                y += gridStep
                            }
                            workflow.edges.forEach { edge ->
                                val from = workflow.nodes.firstOrNull { it.id == edge.from } ?: return@forEach
                                val to = workflow.nodes.firstOrNull { it.id == edge.to } ?: return@forEach
                                val start = measuredSocketPositions[socketPositionKey(from.id, edge.fromSocket, true)] ?: return@forEach
                                val end = measuredSocketPositions[socketPositionKey(to.id, edge.toSocket, false)] ?: return@forEach
                                val bend = ((end.x - start.x) * 0.48f).coerceAtLeast(34.dp.toPx())
                                val path = Path().apply {
                                    moveTo(start.x, start.y)
                                    cubicTo(start.x + bend, start.y, end.x - bend, end.y, end.x, end.y)
                                }
                                val socketType = definitions.firstOrNull { it.type == from.type }
                                    ?.outputs?.firstOrNull { it.id == edge.fromSocket }?.type
                                val color = when {
                                    edge.fromSocket == "yes" -> Color(0xFF26835D)
                                    edge.fromSocket == "no" -> Color(0xFFC34D53)
                                    socketType == "string" -> Color(0xFF3F78B9)
                                    socketType == "number" -> Color(0xFF99763C)
                                    socketType == "boolean" -> Color(0xFF8A6099)
                                    socketType == "message" -> Color(0xFF4A8992)
                                    else -> Color(0xFF64877A)
                                }
                                drawPath(path, color, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round))
                            }
                        }
                        workflow.nodes.forEach { node ->
                            val definition = definitions.firstOrNull { it.type == node.type } ?: return@forEach
                            NodeCard(
                                node = node,
                                definition = definition,
                                selected = selectedNodeId == node.id,
                                error = nodeErrorMap[node.id].orEmpty().firstOrNull()?.message,
                                onSelect = { selectedNodeId = node.id; configNodeId = node.id },
                                onDragStart = { snapshot() },
                                onMove = { delta -> moveNode(node.id, delta / zoom) },
                                onSocket = { socket, output -> tapSocket(node, socket, output) },
                                onMeasured = { size -> if (measuredNodeSizes[node.id] != size) measuredNodeSizes[node.id] = size },
                                onSocketPosition = { socket, output, coordinates ->
                                    val canvas = workspaceCoordinates
                                    if (canvas != null && canvas.isAttached && coordinates.isAttached) {
                                        val center = runCatching {
                                            canvas.localPositionOf(
                                                coordinates,
                                                Offset(coordinates.size.width / 2f, coordinates.size.height / 2f)
                                            )
                                        }.getOrNull()
                                        if (center != null) {
                                            val key = socketPositionKey(node.id, socket.id, output)
                                            if (measuredSocketPositions[key] != center) measuredSocketPositions[key] = center
                                        }
                                    }
                                },
                            )
                        }
                    }
                }
                }
                Text(
                    "Swipe sideways to pan · pinch to zoom · drag nodes",
                    color = StudioPalette.Muted,
                    fontSize = 10.5.sp,
                    modifier = Modifier.align(Alignment.BottomStart).padding(6.dp)
                        .clip(RoundedCornerShape(5.dp)).background(Color.White.copy(alpha = 0.92f)).padding(5.dp)
                )
                Row(
                    Modifier.align(Alignment.TopEnd).padding(6.dp)
                        .clip(RoundedCornerShape(9.dp))
                        .background(Color.White.copy(alpha = 0.96f))
                        .border(1.dp, Color(0xFFDCE3DE), RoundedCornerShape(9.dp))
                        .padding(3.dp),
                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    WorkspaceToolButton("Undo", enabled = undo.isNotEmpty(), onClick = ::undoChange) {
                        Text("↶", color = StudioPalette.Ink, fontSize = 19.sp)
                    }
                    WorkspaceToolButton("Redo", enabled = redo.isNotEmpty(), onClick = ::redoChange) {
                        Text("↷", color = StudioPalette.Ink, fontSize = 19.sp)
                    }
                    WorkspaceToolButton("Fit workspace", enabled = true, onClick = ::fitWorkspace) {
                        Text("Fit", color = StudioPalette.Ink, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                    }
                    WorkspaceToolButton("Zoom out", enabled = zoom > 0.35f, onClick = { zoom = (zoom - 0.1f).coerceIn(0.35f, 1.8f) }) {
                        Text("−", color = StudioPalette.Ink, fontSize = 19.sp)
                    }
                    WorkspaceToolButton("Zoom in", enabled = zoom < 1.8f, onClick = { zoom = (zoom + 0.1f).coerceIn(0.35f, 1.8f) }) {
                        Text("+", color = StudioPalette.Ink, fontSize = 17.sp)
                    }
                }
            }
        }

        Box(
            Modifier.fillMaxWidth().height(10.dp).pointerInput(Unit) {
                detectDragGestures { change, drag ->
                    change.consume()
                    workspaceFraction = (workspaceFraction + drag.y / 700f).coerceIn(0.34f, 0.76f)
                }
            },
            contentAlignment = Alignment.Center
        ) {
            Box(Modifier.width(48.dp).height(3.dp).clip(CircleShape).background(StudioPalette.Line))
        }

        Column(Modifier.fillMaxWidth().weight(1f - workspaceFraction)) {
            Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("NODE LIBRARY", color = StudioPalette.Ink, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                Spacer(Modifier.weight(1f))
                Text(visibleNodes.size.toString() + " nodes", color = StudioPalette.Muted, fontSize = 10.5.sp)
                Spacer(Modifier.width(8.dp))
                Text(
                    "My nodes",
                    modifier = Modifier.testTag("custom-node-manager").clickable(enabled = connected) { showCustomManager = true }
                        .padding(horizontal = 6.dp, vertical = 5.dp),
                    color = if (connected) StudioPalette.Accent else StudioPalette.Muted,
                    fontSize = 12.sp, fontWeight = FontWeight.SemiBold
                )
            }
            BasicTextField(
                value = search,
                onValueChange = { search = it },
                singleLine = true,
                textStyle = TextStyle(color = StudioPalette.Ink, fontSize = 14.sp),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(7.dp))
                    .background(StudioPalette.Surface).border(1.dp, StudioPalette.Line, RoundedCornerShape(7.dp))
                    .padding(horizontal = 9.dp, vertical = 7.dp),
                decorationBox = { inner ->
                    Box {
                        if (search.isBlank()) Text("Search WhatsApp nodes", color = StudioPalette.Muted, fontSize = 11.sp)
                        inner()
                    }
                }
            )
            Spacer(Modifier.height(5.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(5.dp), contentPadding = PaddingValues(bottom = 5.dp)) {
                item { CategoryChip("All", category == "All") { category = "All" } }
                items(library) { group ->
                    CategoryChip(group.name, category == group.name) { category = group.name }
                }
            }
            if (loading) {
                Text("Loading node library…", color = StudioPalette.Muted, fontSize = 10.sp, modifier = Modifier.padding(6.dp))
            } else if (visibleNodes.isEmpty()) {
                Text(
                    if (connected) "No verified nodes match this search." else "Connect to your Aharane server to load the WhatsApp node library.",
                    color = StudioPalette.Muted, fontSize = 10.sp, modifier = Modifier.padding(6.dp)
                )
            } else {
                LazyColumn(
                    Modifier.fillMaxSize().testTag("visual-command-node-library"),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    contentPadding = PaddingValues(bottom = 8.dp)
                ) {
                    items(visibleNodes, key = { it.type }) { definition ->
                        Box(Modifier.animateItem()) {
                            LibraryNodeRow(definition, connected) { addNode(definition) }
                        }
                    }
                }
            }
        }

        AnimatedVisibility(
            visible = notice.isNotBlank(),
            enter = fadeIn(tween(if (LocalStudioMotionEnabled.current) 130 else 0)) +
                expandVertically(tween(if (LocalStudioMotionEnabled.current) 170 else 0)),
            exit = fadeOut(tween(if (LocalStudioMotionEnabled.current) 90 else 0)) +
                shrinkVertically(tween(if (LocalStudioMotionEnabled.current) 120 else 0))
        ) {
            Text(
                notice,
                color = if (notice.contains("error", true) || notice.contains("failed", true) || notice.contains("rejected", true)) StudioPalette.Bad else StudioPalette.Muted,
                fontSize = 13.5.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth().padding(top = 3.dp)
            )
        }
    }

    if (configuredNode != null) {
        NodeConfigurationDialog(
            node = configuredNode,
            definition = definitions.firstOrNull { it.type == configuredNode.type },
            allowGroupScope = account == "public",
            issues = validation.errors.filter { it.nodeId == configuredNode.id } + validation.warnings.filter { it.nodeId == configuredNode.id },
            onDismiss = { configNodeId = null },
            onApply = { config ->
                edit { current -> current.copy(nodes = current.nodes.map { if (it.id == configuredNode.id) it.copy(config = config) else it }) }
                configNodeId = null
            },
            onDelete = {
                edit { current -> current.copy(
                    nodes = current.nodes.filterNot { it.id == configuredNode.id },
                    edges = current.edges.filterNot { it.from == configuredNode.id || it.to == configuredNode.id }
                ) }
                if (selectedNodeId == configuredNode.id) selectedNodeId = null
                configNodeId = null
            },
            onDisconnect = {
                edit { current -> current.copy(edges = current.edges.filterNot { it.from == configuredNode.id || it.to == configuredNode.id }) }
                pendingSocket = null
                configNodeId = null
            }
        )
    }

    if (showCustomManager) {
        CustomNodeManagerDialog(
            nodes = customNodes,
            onDismiss = { showCustomManager = false },
            onCreate = { node ->
                scope.launch {
                    try {
                        repository.createCustomNode(node)
                        refresh()
                        notice = "Custom node added to your library."
                        showCustomManager = false
                    } catch (error: Exception) {
                        notice = error.message ?: "Could not create custom node."
                    }
                }
            },
            onDelete = { id ->
                scope.launch {
                    try {
                        repository.deleteCustomNode(id)
                        refresh()
                        notice = "Custom node removed."
                    } catch (error: Exception) {
                        notice = error.message ?: "Custom node could not be removed."
                    }
                }
            }
        )
    }

    if (showLoad) {
        Dialog(onDismissRequest = { showLoad = false }) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(StudioPalette.Surface).padding(14.dp)) {
                Text("Saved commands", color = StudioPalette.Ink, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                if (savedWorkflows.isEmpty()) Text("No saved commands for this account.", color = StudioPalette.Muted, fontSize = 11.sp)
                savedWorkflows.forEach { item ->
                    Column(Modifier.fillMaxWidth().clickable {
                        scope.launch {
                            try {
                                val response = repository.visualCommands(account)
                                val rows = response.optJSONArray("workflows") ?: JSONArray()
                                val row = (0 until rows.length()).mapNotNull { rows.optJSONObject(it) }.firstOrNull { it.optString("id") == item.id }
                                if (row != null) useSaved(row)
                            } catch (error: Exception) { notice = error.message ?: "Could not load command." }
                        }
                    }.padding(vertical = 8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(item.name, color = StudioPalette.Ink, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                            Text(if (item.enabled) "Active" else "Draft", color = if (item.enabled) StudioPalette.Accent else StudioPalette.Muted, fontSize = 10.5.sp)
                        }
                        Text(
                            item.nodes.firstOrNull { it.type == "trigger.command" }?.config?.get("command") ?: "Message event",
                            color = StudioPalette.Muted, fontSize = 10.sp
                        )
                    }
                }
                StudioActionButton("Close", modifier = Modifier.fillMaxWidth(), compact = true, onClick = { showLoad = false })
            }
        }
    }

    if (showDelete) {
        Dialog(onDismissRequest = { showDelete = false }) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(StudioPalette.Surface).padding(14.dp)) {
                Text("Delete this command?", color = StudioPalette.Ink, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(6.dp))
                Text("The saved workflow and its counters will be removed from Aharane.", color = StudioPalette.Muted, fontSize = 11.sp)
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    StudioActionButton("Cancel", modifier = Modifier.weight(1f), compact = true, onClick = { showDelete = false })
                    StudioActionButton("Delete", modifier = Modifier.weight(1f), compact = true, destructive = true, onClick = {
                        scope.launch {
                            try {
                                repository.deleteVisualCommand(workflow.id)
                                savedWorkflows = savedWorkflows.filterNot { it.id == workflow.id }
                                workflow = VisualWorkflow.draft(account)
                                saved = false
                                loadedId = null
                                dirty = false
                                validation = VisualWorkflowValidation()
                                notice = "Command deleted."
                                showDelete = false
                            } catch (error: Exception) { notice = error.message ?: "Command could not be deleted." }
                        }
                    })
                }
            }
        }
    }

    if (result != null) SafeTestResultDialog(result!!) { result = null }
}

@Composable
private fun CategoryChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.clip(RoundedCornerShape(7.dp))
            .background(if (selected) StudioPalette.Accent else StudioPalette.Surface)
            .border(1.dp, if (selected) StudioPalette.Accent else StudioPalette.Line, RoundedCornerShape(7.dp))
            .clickable(onClick = onClick).padding(horizontal = 8.dp, vertical = 5.dp)
    ) {
        Text(label, color = if (selected) Color.White else StudioPalette.Ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun LibraryNodeRow(node: VisualNodeDefinition, enabled: Boolean, onAdd: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(7.dp))
            .background(StudioPalette.Surface).border(1.dp, StudioPalette.Line, RoundedCornerShape(7.dp))
            .padding(horizontal = 8.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(node.name, color = StudioPalette.Ink, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
            Text(node.description, color = StudioPalette.Muted, fontSize = 10.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.width(6.dp))
        StudioActionButton("Add", modifier = Modifier.testTag("add-node-" + node.type), compact = true, enabled = enabled, onClick = onAdd)
    }
}

@Composable
private fun NodeCard(
    node: VisualNode,
    definition: VisualNodeDefinition,
    selected: Boolean,
    error: String?,
    onSelect: () -> Unit,
    onDragStart: () -> Unit,
    onMove: (Offset) -> Unit,
    onSocket: (VisualSocket, Boolean) -> Unit,
    onMeasured: (IntSize) -> Unit,
    onSocketPosition: (VisualSocket, Boolean, LayoutCoordinates) -> Unit
) {
    val currentOnMove by rememberUpdatedState(onMove)
    val currentOnDragStart by rememberUpdatedState(onDragStart)
    val nodeOffset = workspaceNodeOffset(node)
    val borderTarget = when {
        error != null -> StudioPalette.Bad
        selected -> StudioPalette.Accent
        else -> Color(0xFFD9E2DC)
    }
    val borderColor by animateColorAsState(
        borderTarget,
        animationSpec = tween(if (LocalStudioMotionEnabled.current) 150 else 0),
        label = "workflow-node-outline"
    )
    Column(
        Modifier.offset(nodeOffset.x.dp, nodeOffset.y.dp).width(236.dp)
            .onSizeChanged(onMeasured).testTag("node-card-" + node.type)
            .clip(RoundedCornerShape(8.dp)).background(Color.White)
            .border(if (selected || error != null) 1.5.dp else 1.dp, borderColor, RoundedCornerShape(8.dp))
            .pointerInput(node.id) {
                detectDragGestures(onDragStart = { currentOnDragStart() }) { change, amount ->
                    change.consume()
                    currentOnMove(Offset(amount.x / density, amount.y / density))
                }
            }
            .clickable(onClick = onSelect)
    ) {
        Row(
            Modifier.fillMaxWidth().background(Color(0xFFF5F8F5)).padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(Modifier.size(7.dp).clip(CircleShape).background(if (error != null) StudioPalette.Bad else StudioPalette.Accent))
            Spacer(Modifier.width(6.dp))
            Text(definition.name, color = StudioPalette.Ink, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (definition.category.isNotBlank()) Text(definition.category, color = StudioPalette.Muted, fontSize = 9.sp, maxLines = 1)
            Spacer(Modifier.weight(1f))
            if (error != null) Text("!", color = StudioPalette.Bad, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        Text(nodeSummary(node), color = StudioPalette.Muted, fontSize = 10.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp))
        if (definition.inputs.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 5.dp, vertical = 2.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                definition.inputs.forEach { socket ->
                    SocketAction(socket, false, "socket-" + node.type + "-in-" + socket.id,
                        onSocket = { onSocket(socket, false) }, onPosition = { onSocketPosition(socket, false, it) })
                }
            }
        }
        if (definition.outputs.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 5.dp, vertical = 4.dp), horizontalArrangement = Arrangement.End) {
                definition.outputs.forEach { socket ->
                    SocketAction(socket, true, "socket-" + node.type + "-out-" + socket.id,
                        onSocket = { onSocket(socket, true) }, onPosition = { onSocketPosition(socket, true, it) })
                }
            }
        }
    }
}

private fun socketPositionKey(nodeId: String, socketId: String, output: Boolean): String =
    nodeId + "|" + (if (output) "out|" else "in|") + socketId

private fun nodeSummary(node: VisualNode): String = when (node.type) {
    "trigger.command" -> "." + node.config["command"].orEmpty() + " command"
    "trigger.message" -> "On authorized incoming message"
    "message.sendText", "message.replyText" -> node.config["text"].orEmpty().ifBlank { "Connect text input" }
    "message.react" -> "React " + node.config["emoji"].orEmpty()
    "message.sendPoll" -> "Poll: " + node.config["title"].orEmpty()
    "media.forwardOriginal" -> "Forward original message and media"
    "group.getInfo" -> "Group metadata"
    "group.updateSubject" -> "Set group name"
    "group.updateDescription" -> "Set group description"
    "group.participantsUpdate" -> node.config["action"].orEmpty() + " participants"
    "group.settingUpdate" -> "Group setting: " + node.config["setting"].orEmpty()
    "moderation.blockContact" -> "Block " + node.config["phone"].orEmpty()
    "moderation.unblockContact" -> "Unblock " + node.config["phone"].orEmpty()
    "profile.updateName" -> "Profile name: " + node.config["name"].orEmpty()
    "profile.updateStatus" -> "Profile status"
    "newsletter.create" -> "Create: " + node.config["name"].orEmpty()
    "newsletter.follow" -> "Follow newsletter"
    "newsletter.unfollow" -> "Unfollow newsletter"
    "newsletter.publishText" -> "Publish newsletter text"
    "message.sendLocation" -> "Location: " + node.config["name"].orEmpty()
    "contact.sendCard" -> "Contact: " + node.config["name"].orEmpty()
    "message.sendButtons" -> "Buttons: " + node.config["buttons"].orEmpty().replace("\n", ", ")
    "message.quotedText" -> "Quoted message text"
    "condition.equals" -> node.config["left"].orEmpty() + " = " + node.config["right"].orEmpty()
    "condition.contains" -> "Contains " + node.config["search"].orEmpty()
    "condition.isOwner" -> "Account owner check"
    "condition.isGroupAdmin" -> "Group administrator check"
    "variable.set" -> "Set " + node.config["key"].orEmpty()
    "variable.get" -> "Get " + node.config["key"].orEmpty()
    "counter.increment" -> "Counter " + node.config["key"].orEmpty()
    "value.toText" -> "Convert number to text"
    "flow.delay" -> "Wait " + node.config["milliseconds"].orEmpty() + " ms"
    "flow.repeat" -> "Repeat " + node.config["count"].orEmpty() + " times"
    "flow.repeatEnd" -> "Return to Repeat"
    "flow.end" -> "Stop execution"
    else -> node.type
}

@Composable
private fun SocketAction(
    socket: VisualSocket,
    output: Boolean,
    tag: String,
    onSocket: () -> Unit,
    onPosition: (LayoutCoordinates) -> Unit
) {
    val color = when (socket.type) {
        "exec" -> Color(0xFF537F6D)
        "string" -> Color(0xFF3F78B9)
        "number" -> Color(0xFF99763C)
        "boolean" -> Color(0xFF8A6099)
        "message" -> Color(0xFF4A8992)
        else -> StudioPalette.Muted
    }
    Row(
        Modifier.clickable(onClick = onSocket).testTag(tag).padding(horizontal = 2.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        if (!output) SocketDot(color, onPosition)
        Text(socket.label, color = color, fontSize = 8.sp, maxLines = 1)
        if (output) SocketDot(color, onPosition)
    }
}

@Composable
private fun SocketDot(color: Color, onPosition: (LayoutCoordinates) -> Unit) {
    Box(Modifier.size(11.dp).onGloballyPositioned(onPosition).clip(CircleShape).background(Color.White).border(1.6.dp, color, CircleShape))
}

@Composable
private fun NodeConfigurationDialog(
    node: VisualNode,
    definition: VisualNodeDefinition?,
    allowGroupScope: Boolean,
    issues: List<VisualWorkflowIssue>,
    onDismiss: () -> Unit,
    onApply: (Map<String, String>) -> Unit,
    onDelete: () -> Unit,
    onDisconnect: () -> Unit
) {
    var config by remember(node.id) { mutableStateOf(node.config) }
    val fields = when (node.type) {
        "trigger.command" -> listOf("command" to "Command name", "aliases" to "Aliases, comma-separated", "maxMessagesPerRun" to "Maximum messages per execution (1–20)")
        "trigger.message" -> listOf("maxMessagesPerRun" to "Maximum messages per execution (1–20)")
        "group.updateSubject" -> listOf("subject" to "New group name")
        "group.updateDescription" -> listOf("description" to "New group description")
        "group.participantsUpdate" -> listOf("action" to "Action (add/remove/promote/demote)", "participants" to "Phone numbers, one per line")
        "group.settingUpdate" -> listOf("setting" to "Setting (announcement/not_announcement/locked/unlocked)")
        "moderation.blockContact", "moderation.unblockContact" -> listOf("phone" to "Contact phone number")
        "profile.updateName" -> listOf("name" to "Profile name")
        "profile.updateStatus" -> listOf("status" to "Profile status")
        "newsletter.create" -> listOf("name" to "Newsletter name", "description" to "Newsletter description")
        "newsletter.follow", "newsletter.unfollow" -> listOf("newsletterJid" to "Newsletter JID")
        "newsletter.publishText" -> listOf("newsletterJid" to "Newsletter JID", "text" to "Post text")
        "message.sendText", "message.replyText" -> listOf("text" to "Message text")
        "message.react" -> listOf("emoji" to "Emoji")
        "message.sendPoll" -> listOf("title" to "Poll question", "options" to "Options, one per line", "selectableCount" to "Selectable answers (1–12)")
        "message.sendLocation" -> listOf("latitude" to "Latitude (-90 to 90)", "longitude" to "Longitude (-180 to 180)", "name" to "Location label")
        "contact.sendCard" -> listOf("name" to "Contact display name", "phone" to "Phone number")
        "message.sendButtons" -> listOf("text" to "Message text", "buttons" to "One per line: Label|id")
        "condition.equals" -> listOf("left" to "Left value", "right" to "Right value")
        "condition.contains" -> listOf("text" to "Text to inspect", "search" to "Contains")
        "variable.set" -> listOf("key" to "Variable name", "value" to "Value")
        "variable.get", "counter.increment" -> listOf("key" to "Variable or counter name")
        "flow.delay" -> listOf("milliseconds" to "Wait duration (0–10000 ms)")
        "flow.repeat" -> listOf("count" to "Repeat count (1–10)")
        "media.sendImage" -> listOf("caption" to "Image caption (optional)")
        "media.sendImages" -> listOf("caption" to "Image caption (optional)", "limit" to "Maximum messages (1–20)")
        else -> if (node.type.startsWith("custom.") || node.type.startsWith("engine.")) definition?.inputs
            ?.filter { it.type != "exec" }?.map { it.id to (it.label + " (" + it.type + ")") }.orEmpty()
        else emptyList()
    }
    Dialog(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(StudioPalette.Surface).padding(13.dp)) {
            Text(definition?.name ?: node.type, color = StudioPalette.Ink, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Text(definition?.description.orEmpty(), color = StudioPalette.Muted, fontSize = 12.5.sp)
            Spacer(Modifier.height(8.dp))
            fields.forEach { (key, label) ->
                Text(label, color = StudioPalette.Ink, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                BasicTextField(
                    value = config[key].orEmpty(),
                    onValueChange = { config = config + (key to it) },
                    singleLine = key !in setOf("text", "options", "buttons", "participants", "description"),
                    textStyle = TextStyle(color = StudioPalette.Ink, fontSize = 14.sp),
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 8.dp)
                        .clip(RoundedCornerShape(6.dp)).background(StudioPalette.Background)
                        .border(1.dp, StudioPalette.Line, RoundedCornerShape(6.dp)).padding(8.dp)
                        .testTag("node-config-field-" + key)
                )
            }
            if (node.type == "trigger.command" || node.type == "trigger.message") {
                Text("Chat scope", color = StudioPalette.Ink, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                val selectedScope = config["chatScope"] ?: "direct"
                Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    listOf("direct" to "Direct", "groups" to "Groups", "both" to "Both").forEach { (value, label) ->
                        val active = selectedScope == value
                        Box(
                            Modifier.clip(RoundedCornerShape(6.dp))
                                .background(if (active) StudioPalette.Accent else StudioPalette.Background)
                                .border(1.dp, if (active) StudioPalette.Accent else StudioPalette.Line, RoundedCornerShape(6.dp))
                                .clickable(enabled = allowGroupScope || value == "direct") {
                                    config = config + ("chatScope" to value)
                                }.padding(horizontal = 8.dp, vertical = 5.dp)
                        ) {
                            Text(label, color = if (active) Color.White else StudioPalette.Ink, fontSize = 13.5.sp)
                        }
                    }
                }
                if (!allowGroupScope) {
                    Text("Private account commands stay in the owner self-chat.", color = StudioPalette.Muted, fontSize = 10.5.sp)
                } else {
                    Text("Group commands run only when enabled for Public groups.", color = StudioPalette.Muted, fontSize = 10.5.sp)
                }
            }
            if (node.type == "trigger.command") {
                listOf("requireQuoted" to "Require a quoted message", "requireReply" to "Only accept replies").forEach { (key, label) ->
                    val checked = config[key] == "true"
                    Row(
                        Modifier.fillMaxWidth().clickable { config = config + (key to (!checked).toString()) }.padding(vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        androidx.compose.material3.Checkbox(
                            checked = checked,
                            onCheckedChange = { config = config + (key to it.toString()) }
                        )
                        Text(label, color = StudioPalette.Ink, fontSize = 11.sp)
                    }
                }
            }
            if (node.type == "message.sendText" || node.type == "message.replyText") {
                Text("Templates: {{message.text}}, {{sender}}, {{args}}, {{arg1}}, {{var:name}}, {{counter:name}}",
                    color = StudioPalette.Muted, fontSize = 10.5.sp)
            }
            if (issues.isNotEmpty()) {
                Spacer(Modifier.height(7.dp))
                Text("Validation", color = StudioPalette.Bad, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                issues.forEach {
                    Text(it.message, color = StudioPalette.Bad, fontSize = 13.5.sp)
                    Text("Fix: " + it.fix, color = StudioPalette.Muted, fontSize = 10.5.sp)
                }
            }
            Spacer(Modifier.height(9.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                StudioActionButton("Delete", compact = true, destructive = true, onClick = onDelete)
                StudioActionButton("Disconnect", compact = true, onClick = onDisconnect)
                Spacer(Modifier.weight(1f))
                StudioActionButton("Cancel", compact = true, onClick = onDismiss)
                StudioActionButton("Apply", compact = true, primary = true, onClick = { onApply(config) })
            }
        }
    }
}

@Composable
private fun SafeTestResultDialog(result: JSONObject, onDismiss: () -> Unit) {
    val trace = result.optJSONArray("trace") ?: JSONArray()
    Dialog(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(StudioPalette.Surface).padding(13.dp)) {
            Text("Safe test", color = StudioPalette.Ink, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(5.dp))
            Text(
                if (result.optBoolean("ok")) "Passed · no live WhatsApp actions were performed"
                else result.optString("error", "The workflow needs attention."),
                color = if (result.optBoolean("ok")) StudioPalette.Accent else StudioPalette.Bad,
                fontSize = 12.5.sp
            )
            Spacer(Modifier.height(7.dp))
            LazyColumn(Modifier.heightIn(max = 300.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                items(trace.length()) { index ->
                    val item = trace.optJSONObject(index) ?: JSONObject()
                    val status = item.optString("status")
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(StudioPalette.Background).padding(7.dp)) {
                        Text(item.optString("type") + " · " + status, color = if (status == "error") StudioPalette.Bad else StudioPalette.Ink, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                        Text(item.optString("message"), color = StudioPalette.Muted, fontSize = 13.5.sp)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            StudioActionButton("Close", modifier = Modifier.fillMaxWidth(), compact = true, onClick = onDismiss)
        }
    }
}
 
@Composable
private fun WorkspaceToolButton(
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
    content: @Composable () -> Unit
) {
    Box(
        Modifier.size(32.dp).clip(RoundedCornerShape(7.dp))
            .background(if (enabled) Color(0xFFF5F7F5) else Color(0xFFECEFEC))
            .border(1.dp, Color(0xFFE0E5E1), RoundedCornerShape(7.dp))
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        content()
    }
}


/**
 * User-defined nodes use a declarative, typed operator contract. Unrestricted
 * scripts are deliberately excluded from the WhatsApp bot runtime.
 */
@Composable
private fun CustomNodeManagerDialog(
    nodes: List<JSONObject>,
    onDismiss: () -> Unit,
    onCreate: (JSONObject) -> Unit,
    onDelete: (String) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var identifier by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var operation by remember { mutableStateOf("uppercase") }
    var confirmDelete by remember { mutableStateOf<String?>(null) }
    val operations = listOf(
        "uppercase" to "Uppercase",
        "concat" to "Combine text",
        "contains" to "Contains text",
        "add" to "Add numbers",
        "and" to "Boolean AND",
        "split" to "Split into list",
        "join" to "Join list"
    )
    fun typedInput(id: String, type: String): JSONObject =
        JSONObject().put("id", id).put("label", id.replaceFirstChar { it.uppercase() }).put("type", type)

    Dialog(onDismissRequest = onDismiss) {
        Column(
            Modifier.fillMaxWidth().heightIn(max = 620.dp)
                .clip(RoundedCornerShape(15.dp))
                .background(StudioPalette.Surface)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(9.dp)
        ) {
            Text("My custom nodes", color = StudioPalette.Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
            Text(
                "Build reusable, executable logic from safe typed operations. Saved nodes are available in the canvas.",
                color = StudioPalette.Muted, fontSize = 12.sp
            )
            nodes.forEach { node ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(node.optString("name"), color = StudioPalette.Ink, fontSize = 13.sp)
                        Text(
                            node.optString("operator") + " · v" + node.optInt("version", 1),
                            color = StudioPalette.Muted, fontSize = 11.sp
                        )
                    }
                    val id = node.optString("id")
                    Text(
                        if (confirmDelete == id) "Confirm remove" else "Remove",
                        color = StudioPalette.Bad, fontSize = 12.sp,
                        modifier = Modifier.clickable {
                            if (confirmDelete == id) {
                                confirmDelete = null
                                onDelete(id)
                            } else confirmDelete = id
                        }.padding(8.dp)
                    )
                }
            }
            Text("Create node", color = StudioPalette.Ink, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            listOf(
                Triple("Node name", name, { value: String -> name = value }),
                Triple("Node ID (lowercase, hyphenated)", identifier, { value: String -> identifier = value }),
                Triple("Description", description, { value: String -> description = value })
            ).forEach { (label, value, update) ->
                Text(label, color = StudioPalette.Ink, fontSize = 12.sp)
                BasicTextField(
                    value = value,
                    onValueChange = update,
                    textStyle = TextStyle(color = StudioPalette.Ink, fontSize = 14.sp),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                        .clip(RoundedCornerShape(7.dp)).background(StudioPalette.Background)
                        .border(1.dp, StudioPalette.Line, RoundedCornerShape(7.dp))
                        .padding(10.dp)
                )
            }
            Text("Operation", color = StudioPalette.Ink, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            operations.forEach { (id, label) ->
                Row(
                    Modifier.fillMaxWidth().clickable { operation = id }.padding(vertical = 3.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    androidx.compose.material3.RadioButton(selected = operation == id, onClick = { operation = id })
                    Text(label, color = StudioPalette.Ink, fontSize = 13.sp)
                }
            }
            val valid = Regex("^[a-z][a-z0-9_-]{0,47}$").matches(identifier) && name.isNotBlank()
            StudioActionButton("Create executable node", modifier = Modifier.fillMaxWidth(), enabled = valid, onClick = {
                val (inputs, outputType) = when (operation) {
                    "uppercase" -> listOf(typedInput("value", "string")) to "string"
                    "concat" -> listOf(typedInput("value", "string"), typedInput("other", "string")) to "string"
                    "contains" -> listOf(typedInput("value", "string"), typedInput("other", "string")) to "boolean"
                    "add" -> listOf(typedInput("value", "number"), typedInput("other", "number")) to "number"
                    "and" -> listOf(typedInput("value", "boolean"), typedInput("other", "boolean")) to "boolean"
                    "split" -> listOf(typedInput("value", "string"), typedInput("other", "string")) to "list"
                    else -> listOf(typedInput("value", "list"), typedInput("other", "string")) to "string"
                }
                onCreate(
                    JSONObject().put("id", identifier).put("name", name)
                        .put("description", description).put("category", "My nodes")
                        .put("version", 1).put("operator", operation)
                        .put("inputs", JSONArray(inputs)).put("outputType", outputType)
                )
            })
            StudioActionButton("Close", modifier = Modifier.fillMaxWidth(), primary = false, onClick = onDismiss)
        }
    }
}
