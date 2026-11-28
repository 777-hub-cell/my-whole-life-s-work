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
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import com.aharane.studio.core.design.LocalStudioMotionEnabled
import com.aharane.studio.core.design.StudioPalette
import com.aharane.studio.core.network.VisualCommandDataSource
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import kotlin.math.roundToInt

private object CommandStudioPalette {
    val Background = Color(0xFF090E0D)
    val Surface = Color(0xFF141B19)
    val Line = Color(0xFF26322F)
    val Ink = Color(0xFFE9F1EE)
    val Muted = Color(0xFF8FA19B)
    val Accent = Color(0xFF3FAE8C)
    val Bad = Color(0xFFFF7A6E)
    val Soft = Color(0xFF123B31)
    val Canvas = Color(0xFF0E1513)
    val Node = Color(0xFF171F1D)
    val NodeHeader = Color(0xFF212C28)
}

private fun nodeAccent(category: String): Color = when {
    category.contains("trigger", true) || category.contains("event", true) -> Color(0xFF3FAE8C)
    category.contains("message", true) -> Color(0xFF5A8FD6)
    category.contains("contact", true) || category.contains("chat", true) -> Color(0xFFC9A24D)
    category.contains("group", true) || category.contains("participant", true) -> Color(0xFFA085D4)
    category.contains("condition", true) -> Color(0xFFB18ACB)
    category.contains("flow", true) -> Color(0xFF65B6B0)
    category.contains("variable", true) -> Color(0xFFE0B24A)
    else -> CommandStudioPalette.Accent
}

private fun nodeIconResource(type: String): Int = when {
    type.startsWith("trigger.") -> com.aharane.studio.R.drawable.ic_node_trigger
    type.startsWith("message.") || type.startsWith("newsletter.") -> com.aharane.studio.R.drawable.ic_node_message
    type.startsWith("contact.") || type.startsWith("group.") || type.startsWith("profile.") -> com.aharane.studio.R.drawable.ic_node_people
    type.startsWith("moderation.") -> com.aharane.studio.R.drawable.ic_node_shield
    type.startsWith("condition.") || type.startsWith("flow.") -> com.aharane.studio.R.drawable.ic_node_flow
    type.startsWith("media.") -> com.aharane.studio.R.drawable.ic_node_media
    else -> com.aharane.studio.R.drawable.ic_node_tools
}

private fun commandBuilderPreviewLibrary(): List<VisualNodeCategory> = listOf(
    VisualNodeCategory(
        "Triggers and events",
        listOf(
            VisualNodeDefinition(
                type = "trigger.command",
                name = "Command trigger",
                description = "Start this workflow when a permitted command is received.",
                category = "Triggers and events",
                inputs = emptyList(),
                outputs = listOf(VisualSocket("next", "Next", "exec"))
            )
        )
    ),
    VisualNodeCategory(
        "Messages",
        listOf(
            VisualNodeDefinition(
                type = "message.sendText",
                name = "Send text",
                description = "Send a message to the chat that started this workflow.",
                category = "Messages",
                inputs = listOf(VisualSocket("in", "In", "exec"), VisualSocket("text", "Text", "string")),
                outputs = listOf(VisualSocket("next", "Next", "exec"), VisualSocket("sent", "Sent message", "message"))
            ),
            VisualNodeDefinition(
                type = "message.replyText",
                name = "Reply to message",
                description = "Reply to the triggering WhatsApp message with a quote.",
                category = "Messages",
                inputs = listOf(VisualSocket("in", "In", "exec"), VisualSocket("text", "Text", "string")),
                outputs = listOf(VisualSocket("next", "Next", "exec"), VisualSocket("sent", "Sent message", "message"))
            ),
            VisualNodeDefinition(
                type = "message.react",
                name = "React to message",
                description = "React to the triggering message with an emoji.",
                category = "Messages",
                inputs = listOf(VisualSocket("in", "In", "exec"), VisualSocket("emoji", "Emoji", "string")),
                outputs = listOf(VisualSocket("next", "Next", "exec"))
            )
        )
    ),
    VisualNodeCategory(
        "Media and attachments",
        listOf(
            VisualNodeDefinition(
                type = "media.sendMedia",
                name = "Send media",
                description = "Send an Engine-produced image, video, audio file, document or sticker.",
                category = "Media and attachments",
                inputs = listOf(VisualSocket("in", "In", "exec"), VisualSocket("media", "Media", "media"), VisualSocket("caption", "Caption", "string")),
                outputs = listOf(VisualSocket("next", "Next", "exec"), VisualSocket("sent", "Sent media", "message"))
            )
        )
    ),
    VisualNodeCategory(
        "View Once",
        listOf(
            VisualNodeDefinition(
                type = "message.sendViewOnceText",
                name = "Send View Once text",
                description = "Send text using the phased WhatsApp View Once text beta.",
                category = "View Once",
                inputs = listOf(VisualSocket("in", "In", "exec"), VisualSocket("text", "Text", "string")),
                outputs = listOf(VisualSocket("next", "Next", "exec"), VisualSocket("sent", "Sent View Once text", "message"))
            ),
            VisualNodeDefinition(
                type = "media.sendViewOnce",
                name = "Send View Once media",
                description = "Send an Engine-produced photo, video or audio message with View Once.",
                category = "View Once",
                inputs = listOf(VisualSocket("in", "In", "exec"), VisualSocket("media", "Media", "media"), VisualSocket("caption", "Caption", "string")),
                outputs = listOf(VisualSocket("next", "Next", "exec"), VisualSocket("sent", "Sent View Once media", "message"))
            )
        )
    ),
    VisualNodeCategory(
        "Conditions and comparisons",
        listOf(
            VisualNodeDefinition(
                type = "condition.equals",
                name = "Text equals",
                description = "Compare two values and branch to YES or NO.",
                category = "Conditions and comparisons",
                inputs = listOf(VisualSocket("in", "In", "exec"), VisualSocket("left", "Left value", "string"), VisualSocket("right", "Right value", "string")),
                outputs = listOf(VisualSocket("yes", "YES", "exec"), VisualSocket("no", "NO", "exec"))
            )
        )
    ),
    VisualNodeCategory(
        "Variables and conversions",
        listOf(
            VisualNodeDefinition(
                type = "value.toText",
                name = "Number to text",
                description = "Convert a numeric output, such as a counter, into text.",
                category = "Variables and conversions",
                inputs = listOf(VisualSocket("value", "Number", "number")),
                outputs = listOf(VisualSocket("value", "Text", "string"))
            ),
            VisualNodeDefinition(
                type = "value.toNumber",
                name = "Text to number",
                description = "Convert numeric text into a finite number; invalid or empty values fail safely.",
                category = "Variables and conversions",
                inputs = listOf(VisualSocket("value", "Text", "string")),
                outputs = listOf(VisualSocket("value", "Number", "number"))
            ),
            VisualNodeDefinition(
                type = "value.toBoolean",
                name = "Text to boolean",
                description = "Convert true/false, yes/no, on/off or 1/0 text into a boolean.",
                category = "Variables and conversions",
                inputs = listOf(VisualSocket("value", "Text", "string")),
                outputs = listOf(VisualSocket("value", "Boolean", "boolean"))
            ),
            VisualNodeDefinition(
                type = "value.toList",
                name = "Text to list",
                description = "Split text into a trimmed list using a configurable separator.",
                category = "Variables and conversions",
                inputs = listOf(VisualSocket("value", "Text", "string"), VisualSocket("separator", "Separator", "string")),
                outputs = listOf(VisualSocket("value", "List", "list"))
            )
        )
    ),
    VisualNodeCategory(
        "Flow control",
        listOf(
            VisualNodeDefinition(
                type = "flow.delay",
                name = "Wait",
                description = "Pause this workflow run for a short interval.",
                category = "Flow control",
                inputs = listOf(VisualSocket("in", "In", "exec")),
                outputs = listOf(VisualSocket("next", "Next", "exec"))
            ),
            VisualNodeDefinition(
                type = "flow.end",
                name = "End workflow",
                description = "Stop this workflow run.",
                category = "Flow control",
                inputs = listOf(VisualSocket("in", "In", "exec")),
                outputs = emptyList()
            )
        )
    )
)

private data class ActiveSocket(val nodeId: String, val socketId: String, val type: String)

internal const val WORKSPACE_CANVAS_PADDING_DP = 2200f
// Single source of truth for node-card width: fit-to-screen and canvas-extent maths previously
// assumed 206 dp while the card is drawn 236 dp wide, which clipped the right-most node.
internal const val NODE_CARD_WIDTH_DP = 236f
internal const val WORKSPACE_MIN_ZOOM = 0.25f
internal const val WORKSPACE_MAX_ZOOM = 2.8f

internal fun workspaceScrollForZoom(
    scrollOffset: Offset,
    previousAnchor: Offset,
    nextAnchor: Offset,
    oldZoom: Float,
    newZoom: Float
): Offset {
    val safeOldZoom = oldZoom.coerceAtLeast(0.001f)
    val contentX = (scrollOffset.x + previousAnchor.x) / safeOldZoom
    val contentY = (scrollOffset.y + previousAnchor.y) / safeOldZoom
    return Offset(
        (contentX * newZoom - nextAnchor.x).coerceAtLeast(0f),
        (contentY * newZoom - nextAnchor.y).coerceAtLeast(0f)
    )
}
internal fun workspaceNodeOffset(node: VisualNode): Offset =
    Offset(node.x + WORKSPACE_CANVAS_PADDING_DP, node.y + WORKSPACE_CANVAS_PADDING_DP)

@Composable
fun VisualCommandBuilderScreen(
    repository: VisualCommandDataSource,
    connected: Boolean,
    onBack: () -> Unit,
    onManageEngines: () -> Unit = {},
    previewMode: Boolean = false
) {
    val scope = rememberCoroutineScope()
    val workspaceScroll = rememberScrollState()
    val workspaceVerticalScroll = rememberScrollState()
    var account by remember { mutableStateOf("private") }
    var workflow by remember { mutableStateOf(VisualWorkflow.draft()) }
    var library by remember(previewMode) {
        mutableStateOf(if (previewMode) commandBuilderPreviewLibrary() else emptyList())
    }
    var savedWorkflows by remember { mutableStateOf<List<VisualWorkflow>>(emptyList()) }
    var savedValidation by remember { mutableStateOf<Map<String, VisualWorkflowValidation>>(emptyMap()) }
    var validation by remember { mutableStateOf(VisualWorkflowValidation()) }
    var selectedNodeId by remember { mutableStateOf<String?>(null) }
    var configNodeId by remember { mutableStateOf<String?>(null) }
    var pendingSocket by remember { mutableStateOf<ActiveSocket?>(null) }
    var category by remember { mutableStateOf("All") }
    var search by remember { mutableStateOf("") }
    var workspaceFraction by remember { mutableFloatStateOf(0.46f) }
    var zoom by remember(previewMode) { mutableFloatStateOf(if (previewMode) 0.58f else 1f) }
    var workspaceViewportSize by remember { mutableStateOf(IntSize.Zero) }
    var pendingZoomScroll by remember { mutableStateOf<Offset?>(null) }
    var workspaceCoordinates by remember { mutableStateOf<LayoutCoordinates?>(null) }
    var autoFitWorkflowId by remember { mutableStateOf<String?>(null) }

    fun zoomAround(factor: Float, anchor: Offset = Offset(workspaceViewportSize.width / 2f, workspaceViewportSize.height / 2f)) {
        val nextZoom = (zoom * factor).coerceIn(WORKSPACE_MIN_ZOOM, WORKSPACE_MAX_ZOOM)
        if (nextZoom == zoom) return
        pendingZoomScroll = workspaceScrollForZoom(
            pendingZoomScroll ?: Offset(workspaceScroll.value.toFloat(), workspaceVerticalScroll.value.toFloat()),
            anchor,
            anchor,
            zoom,
            nextZoom
        )
        zoom = nextZoom
    }

    LaunchedEffect(zoom, pendingZoomScroll) {
        val target = pendingZoomScroll ?: return@LaunchedEffect
        // The scaled content size is published on the next frame. Applying the
        // scroll correction then keeps the point under the user's pinch centroid
        // from visibly drifting toward the canvas origin.
        withFrameNanos { }
        workspaceScroll.scrollTo(target.x.roundToInt().coerceIn(0, workspaceScroll.maxValue))
        workspaceVerticalScroll.scrollTo(target.y.roundToInt().coerceIn(0, workspaceVerticalScroll.maxValue))
        pendingZoomScroll = null
    }

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
    var libraryExpanded by remember { mutableStateOf(true) }
    var showMoreActions by remember { mutableStateOf(false) }
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
            val right = nodes.maxOf { it.x + NODE_CARD_WIDTH_DP }
            val bottom = nodes.maxOf { node ->
                node.y + (measuredNodeSizes[node.id]?.height?.let { with(density) { it.toDp().value } } ?: 132f)
            }
            val graphWidthPx = with(density) { (right - left + 96f).coerceAtLeast(260f).dp.toPx() }
            val graphHeightPx = with(density) { (bottom - top + 96f).coerceAtLeast(180f).dp.toPx() }
            val availableWidth = (workspaceViewportSize.width - with(density) { 32.dp.toPx() }).coerceAtLeast(1f)
            val availableHeight = (workspaceViewportSize.height - with(density) { 32.dp.toPx() }).coerceAtLeast(1f)
            val fittedZoom = minOf(availableWidth / graphWidthPx, availableHeight / graphHeightPx)
                .coerceIn(WORKSPACE_MIN_ZOOM, WORKSPACE_MAX_ZOOM)
            zoom = fittedZoom
            val graphCenterX = with(density) {
                (WORKSPACE_CANVAS_PADDING_DP + (left + right) / 2f).dp.toPx()
            } * fittedZoom
            val graphCenterY = with(density) {
                (WORKSPACE_CANVAS_PADDING_DP + (top + bottom) / 2f).dp.toPx()
            } * fittedZoom
            scope.launch {
                // Changing zoom changes the scaled content dimensions. Do not clamp
                // the centre target against the old (often zero) scroll range: wait
                // until both axes publish their new bounds, with a bounded fallback
                // for a transiently detached canvas.
                var frames = 0
                while (
                    frames < 30 &&
                    (workspaceScroll.maxValue == 0 || workspaceVerticalScroll.maxValue == 0)
                ) {
                    withFrameNanos { }
                    frames += 1
                }
                // Let the final size/layout pass settle before applying the centre.
                withFrameNanos { }
                workspaceScroll.scrollTo(
                    (graphCenterX - workspaceViewportSize.width / 2f).roundToInt()
                        .coerceIn(0, workspaceScroll.maxValue)
                )
                workspaceVerticalScroll.scrollTo(
                    (graphCenterY - workspaceViewportSize.height / 2f).roundToInt()
                        .coerceIn(0, workspaceVerticalScroll.maxValue)
                )
            }
        } else {
            zoom = 0.78f
        }
    }

    // Centre each newly opened draft or saved workflow in the open canvas once
    // the viewport has real dimensions. Editing nodes never steals the viewport.
    LaunchedEffect(workflow.id, workspaceViewportSize) {
        if (workspaceViewportSize.width > 0 &&
            workspaceViewportSize.height > 0 &&
            autoFitWorkflowId != workflow.id
        ) {
            autoFitWorkflowId = workflow.id
            fitWorkspace()
        }
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

    LaunchedEffect(connected, account, previewMode) {
        if (connected) refresh()
        else if (!previewMode) {
            library = emptyList()
            savedWorkflows = emptyList()
        } else {
            library = commandBuilderPreviewLibrary()
            savedWorkflows = emptyList()
            notice = "Preview sample nodes · changes stay on this device."
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
            if (error is com.aharane.studio.core.network.AharaneApiException && error.statusCode == 409 &&
                (error.message ?: "").contains("Reload")) {
                // Revision conflict: the working graph on screen is left untouched so no edits are lost.
                notice = "This workflow was changed elsewhere, so nothing was overwritten. Your edits are still on screen; reopen it from Saved to load the latest version."
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
            "message.sendViewOnceText" -> mapOf("text" to "This message can be opened once.")
            "media.sendViewOnce" -> mapOf("kind" to "image", "caption" to "")
            "media.sendMedia" -> mapOf("kind" to "image", "caption" to "")
            "message.editOriginal" -> mapOf("text" to "Updated message")
            "message.pinOriginal" -> mapOf("seconds" to "86400", "action" to "pin")
            "message.keepOriginal" -> mapOf("action" to "keep")
            "chat.setDisappearing" -> mapOf("seconds" to "86400")
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
            "value.toList" -> mapOf("separator" to ",")
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
        workflow = previous.copy(revision = workflow.revision)
        undo = undo.dropLast(1)
        dirty = true
        validation = VisualWorkflowValidation()
    }

    fun redoChange() {
        val next = redo.lastOrNull() ?: return
        undo = undo + workflow
        workflow = next.copy(revision = workflow.revision)
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
        Modifier.fillMaxSize().background(CommandStudioPalette.Background).navigationBarsPadding().imePadding().padding(horizontal = 12.dp, vertical = 8.dp)
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Command builder", color = CommandStudioPalette.Ink, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(Modifier.size(7.dp).clip(CircleShape).background(if (dirty) Color(0xFFF0A500) else CommandStudioPalette.Accent))
                    Text(
                        when {
                            dirty -> "Unsaved changes"
                            workflow.enabled -> "Active"
                            else -> "Saved draft"
                        },
                        color = CommandStudioPalette.Muted,
                        fontSize = 11.sp,
                        maxLines = 1
                    )
                }
            }
            CommandActionButton(
                "▶ Test",
                compact = true,
                enabled = connected && !testing && !saving,
                modifier = Modifier.testTag("workflow-test"),
                onClick = { scope.launch { safeTest() } }
            )
            Spacer(Modifier.width(5.dp))
            CommandActionButton(
                "Save",
                compact = true,
                primary = true,
                enabled = connected && !saving && (!saved || dirty),
                modifier = Modifier.testTag("workflow-save"),
                onClick = { scope.launch { saveDraft() } }
            )
            Box {
                Box(
                    Modifier.size(40.dp).clip(RoundedCornerShape(12.dp))
                        .background(CommandStudioPalette.Surface)
                        .border(1.dp, CommandStudioPalette.Line, RoundedCornerShape(12.dp))
                        .clickable { showMoreActions = true }
                        .testTag("workflow-more-actions"),
                    contentAlignment = Alignment.Center
                ) {
                    Text("⋯", color = CommandStudioPalette.Ink, fontSize = 23.sp, lineHeight = 24.sp)
                }
                DropdownMenu(
                    expanded = showMoreActions,
                    onDismissRequest = { showMoreActions = false },
                    modifier = Modifier.background(CommandStudioPalette.Surface)
                ) {
                    DropdownMenuItem(
                        text = { Text("Delete command", color = CommandStudioPalette.Bad) },
                        enabled = saved && connected,
                        onClick = { showMoreActions = false; showDelete = true },
                        modifier = Modifier.testTag("workflow-delete")
                    )
                }
            }
        }

        Column(
            Modifier.fillMaxWidth().padding(vertical = 7.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(9.dp)
            ) {
                CommandHeaderIcon(
                    icon = if (account == "private") Icons.Outlined.Lock else Icons.Outlined.Public,
                    description = if (account == "private") "Switch to Public WhatsApp" else "Switch to Private WhatsApp",
                    enabled = !saving,
                    onClick = { switchAccount() }
                )
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        if (account == "private") "Private WhatsApp" else "Public WhatsApp",
                        color = CommandStudioPalette.Ink,
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text("Switch account", color = CommandStudioPalette.Muted, fontSize = 10.5.sp)
                }
                CommandHeaderIcon(
                    icon = if (workflow.enabled) Icons.Outlined.Pause else Icons.Outlined.PlayArrow,
                    description = if (workflow.enabled) "Pause command" else "Activate command",
                    enabled = connected && !saving,
                    onClick = {
                        if (!workflow.enabled) {
                            scope.launch { saveAndActivate() }
                        } else if (!saving) {
                            scope.launch {
                                saving = true
                                try {
                                    val response = repository.updateVisualCommand(
                                        workflow.id, workflow.copy(enabled = false).toJson()
                                    )
                                    val row = response.optJSONObject("workflow")
                                        ?: workflow.copy(enabled = false).toJson()
                                    workflow = VisualWorkflow.fromJson(row)
                                    savedWorkflows = savedWorkflows.filterNot { it.id == workflow.id } + workflow
                                    notice = "Command paused."
                                } catch (error: Exception) {
                                    notice = error.message ?: "Command could not be paused."
                                } finally { saving = false }
                            }
                        }
                    }
                )
                Text(
                    if (workflow.enabled) "Active" else "Paused",
                    color = if (workflow.enabled) CommandStudioPalette.Accent else CommandStudioPalette.Muted,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                CommandActionButton(
                    "Saved commands",
                    modifier = Modifier.weight(1f).testTag("workflow-load"),
                    compact = true,
                    enabled = connected && savedWorkflows.isNotEmpty(),
                    onClick = { showLoad = true }
                )
                CommandActionButton(
                    "Engine library",
                    modifier = Modifier.weight(1f),
                    compact = true,
                    enabled = connected,
                    onClick = onManageEngines
                )
            }
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
                color = if (hasErrors) CommandStudioPalette.Bad else CommandStudioPalette.Accent,
                fontSize = 10.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(7.dp))
                    .background(if (hasErrors) CommandStudioPalette.Bad.copy(alpha = 0.07f) else CommandStudioPalette.Accent.copy(alpha = 0.07f))
                    .padding(7.dp)
            )
        }

        Column(Modifier.fillMaxWidth().weight(workspaceFraction)) {
            Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("WORKSPACE", color = CommandStudioPalette.Ink, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                Spacer(Modifier.weight(1f))
                Text(workflow.nodes.size.toString() + " nodes · " + workflow.edges.size + " wires", color = CommandStudioPalette.Muted, fontSize = 10.5.sp, modifier = Modifier.testTag("workflow-node-count"))
            }
            Box(
                Modifier.fillMaxSize()
                    .onSizeChanged { workspaceViewportSize = it }
                    .clip(RoundedCornerShape(18.dp))
                    .background(CommandStudioPalette.Canvas)
                    .border(1.dp, Color(0xFF1D2926), RoundedCornerShape(18.dp))
                    .pointerInput(Unit) {
                        awaitEachGesture {
                            awaitFirstDown(requireUnconsumed = false)
                            var previousDistance = 0f
                            var previousCentroid = Offset.Zero
                            do {
                                val event = awaitPointerEvent(PointerEventPass.Initial)
                                val pressed = event.changes.filter { it.pressed }
                                if (pressed.size >= 2) {
                                    val first = pressed[0].position
                                    val second = pressed[1].position
                                    val centroid = (first + second) / 2f
                                    val distance = (first - second).getDistance()
                                    if (previousDistance > 0f && distance > 0f) {
                                        val nextZoom = (zoom * (distance / previousDistance))
                                            .coerceIn(WORKSPACE_MIN_ZOOM, WORKSPACE_MAX_ZOOM)
                                        pendingZoomScroll = workspaceScrollForZoom(
                                            pendingZoomScroll ?: Offset(workspaceScroll.value.toFloat(), workspaceVerticalScroll.value.toFloat()),
                                            previousCentroid,
                                            centroid,
                                            zoom,
                                            nextZoom
                                        )
                                        zoom = nextZoom
                                    }
                                    previousDistance = distance
                                    previousCentroid = centroid
                                    event.changes.forEach { if (it.pressed) it.consume() }
                                } else {
                                    previousDistance = 0f
                                    previousCentroid = Offset.Zero
                                }
                            } while (event.changes.any { it.pressed })
                        }
                    }
            ) {
                Box(
                    Modifier.horizontalScroll(workspaceScroll)
                        .verticalScroll(workspaceVerticalScroll)
                        .testTag("workflow-workspace")
                ) {
                    // A stable origin prevents dragging one node from shifting every other node.
                    val canvasOriginX = WORKSPACE_CANVAS_PADDING_DP
                    val canvasOriginY = WORKSPACE_CANVAS_PADDING_DP
                    val maxNodeRight = workflow.nodes.maxOfOrNull { it.x + NODE_CARD_WIDTH_DP } ?: NODE_CARD_WIDTH_DP
                    val maxNodeBottom = workflow.nodes.maxOfOrNull { node ->
                        node.y + (measuredNodeSizes[node.id]?.height?.let { with(density) { it.toDp().value } } ?: 132f)
                    } ?: 180f
                    // Extra blank canvas makes one-finger panning useful on a phone.
                    // The graph is centred inside a broad virtual workspace, leaving
                    // generous room to pan on every side instead of reaching an edge quickly.
                    val canvasWidth = maxOf(5200.dp, (canvasOriginX + maxNodeRight + WORKSPACE_CANVAS_PADDING_DP).dp)
                    val canvasHeight = maxOf(5200.dp, (canvasOriginY + maxNodeBottom + WORKSPACE_CANVAS_PADDING_DP).dp)
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
                            val gridStep = 26.dp.toPx()
                            val dotRadius = 1.15.dp.toPx()
                            // The virtual workspace is intentionally large. Draw only
                            // the dots currently visible through the viewport instead
                            // of traversing the entire 5,200 dp canvas on each redraw.
                            val safeZoom = zoom.coerceAtLeast(0.001f)
                            val visibleLeft = workspaceScroll.value / safeZoom
                            val visibleTop = workspaceVerticalScroll.value / safeZoom
                            val visibleRight = (visibleLeft + workspaceViewportSize.width / safeZoom).coerceAtMost(size.width)
                            val visibleBottom = (visibleTop + workspaceViewportSize.height / safeZoom).coerceAtMost(size.height)
                            var y = (visibleTop / gridStep).toInt() * gridStep
                            while (y <= visibleBottom) {
                                var x = (visibleLeft / gridStep).toInt() * gridStep
                                while (x <= visibleRight) {
                                    drawCircle(Color(0xFF2A3A35), radius = dotRadius, center = Offset(x, y))
                                    x += gridStep
                                }
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
                    "Drag nodes · pinch to zoom · swipe to pan",
                    color = CommandStudioPalette.Muted,
                    fontSize = 10.5.sp,
                    modifier = Modifier.align(Alignment.BottomStart).padding(8.dp)
                        .clip(RoundedCornerShape(10.dp)).background(Color(0xFF141B19).copy(alpha = 0.94f))
                        .border(1.dp, CommandStudioPalette.Line, RoundedCornerShape(10.dp)).padding(horizontal = 9.dp, vertical = 6.dp)
                )
                Row(
                    Modifier.align(Alignment.TopEnd).padding(6.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF141B19).copy(alpha = 0.96f))
                        .border(1.dp, CommandStudioPalette.Line, RoundedCornerShape(12.dp))
                        .padding(3.dp),
                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    WorkspaceToolButton("Undo", enabled = undo.isNotEmpty(), onClick = ::undoChange) {
                        Text("↶", color = CommandStudioPalette.Ink, fontSize = 19.sp)
                    }
                    WorkspaceToolButton("Redo", enabled = redo.isNotEmpty(), onClick = ::redoChange) {
                        Text("↷", color = CommandStudioPalette.Ink, fontSize = 19.sp)
                    }
                    WorkspaceToolButton("Fit workspace", enabled = true, onClick = ::fitWorkspace) {
                        Text("Fit", color = CommandStudioPalette.Ink, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                    }
                    WorkspaceToolButton("Zoom out", enabled = zoom > WORKSPACE_MIN_ZOOM, onClick = { zoomAround(0.9f) }) {
                        Text("−", color = CommandStudioPalette.Ink, fontSize = 19.sp)
                    }
                    WorkspaceToolButton("Zoom in", enabled = zoom < WORKSPACE_MAX_ZOOM, onClick = { zoomAround(1.1f) }) {
                        Text("+", color = CommandStudioPalette.Ink, fontSize = 17.sp)
                    }
                }
            }
        }

        Box(
            Modifier.fillMaxWidth().height(10.dp).pointerInput(Unit) {
                detectDragGestures { change, drag ->
                    change.consume()
                    workspaceFraction = (workspaceFraction + drag.y / 700f).coerceIn(0.28f, 0.72f)
                }
            },
            contentAlignment = Alignment.Center
        ) {
            Box(Modifier.width(48.dp).height(3.dp).clip(CircleShape).background(CommandStudioPalette.Line))
        }

        Column(
            Modifier.fillMaxWidth().weight(1f - workspaceFraction)
                .clip(RoundedCornerShape(20.dp)).background(CommandStudioPalette.Surface)
                .border(1.dp, CommandStudioPalette.Line, RoundedCornerShape(20.dp)).padding(10.dp)
        ) {
            Row(Modifier.fillMaxWidth().padding(bottom = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("NODE LIBRARY", color = CommandStudioPalette.Ink, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                Spacer(Modifier.width(8.dp))
                Text(visibleNodes.size.toString() + " nodes", color = CommandStudioPalette.Muted, fontSize = 10.5.sp)
                Spacer(Modifier.weight(1f))
                Text(
                    "My nodes",
                    modifier = Modifier.testTag("custom-node-manager").clickable(enabled = connected) { showCustomManager = true }
                        .padding(horizontal = 8.dp, vertical = 7.dp),
                    color = if (connected) CommandStudioPalette.Accent else CommandStudioPalette.Muted,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Box(
                    Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(CommandStudioPalette.Background)
                        .border(1.dp, CommandStudioPalette.Line, RoundedCornerShape(10.dp))
                        .clickable { libraryExpanded = !libraryExpanded }
                        .testTag("library-expand-toggle"),
                    contentAlignment = Alignment.Center
                ) {
                    Text(if (libraryExpanded) "▾" else "▴", color = CommandStudioPalette.Ink, fontSize = 17.sp)
                }
            }
            BasicTextField(
                value = search,
                onValueChange = { search = it },
                singleLine = true,
                textStyle = TextStyle(color = CommandStudioPalette.Ink, fontSize = 14.sp),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp))
                    .background(CommandStudioPalette.Background)
                    .border(1.dp, CommandStudioPalette.Line, RoundedCornerShape(13.dp))
                    .heightIn(min = 44.dp).padding(horizontal = 13.dp, vertical = 12.dp)
                    .testTag("node-library-search"),
                decorationBox = { inner ->
                    Box {
                        if (search.isBlank()) Text("⌕  Search nodes", color = CommandStudioPalette.Muted, fontSize = 14.sp)
                        inner()
                    }
                }
            )
            Spacer(Modifier.height(8.dp))
            LazyRow(
                Modifier.fillMaxWidth().height(42.dp).testTag("node-library-categories"),
                horizontalArrangement = Arrangement.spacedBy(7.dp),
                verticalAlignment = Alignment.CenterVertically,
                contentPadding = PaddingValues(horizontal = 2.dp)
            ) {
                item { CategoryChip("All", category == "All") { category = "All" } }
                items(library, key = { it.name }) { group ->
                    CategoryChip(group.name, category == group.name) { category = group.name }
                }
            }
            if (loading) {
                Text("Loading node library…", color = CommandStudioPalette.Muted, fontSize = 12.sp, modifier = Modifier.padding(7.dp))
            } else if (visibleNodes.isEmpty()) {
                Text(
                    if (connected) "No verified nodes match this search." else "Connect to your Aharane server to load the WhatsApp node library.",
                    color = CommandStudioPalette.Muted, fontSize = 12.sp, modifier = Modifier.padding(7.dp)
                )
            } else if (libraryExpanded || search.isNotBlank()) {
                // Searching should reveal all matching nodes even while the compact
                // library is collapsed; otherwise valid matches beyond the first four vanish.
                LazyColumn(
                    Modifier.fillMaxSize().testTag("visual-command-node-library"),
                    verticalArrangement = Arrangement.spacedBy(7.dp),
                    contentPadding = PaddingValues(bottom = 8.dp)
                ) {
                    items(visibleNodes, key = { it.type }) { definition ->
                        Box(Modifier.animateItem()) {
                            LibraryNodeRow(definition, connected) { addNode(definition) }
                        }
                    }
                }
            } else {
                LazyColumn(
                    Modifier.fillMaxSize().testTag("visual-command-node-library"),
                    verticalArrangement = Arrangement.spacedBy(7.dp),
                    contentPadding = PaddingValues(bottom = 8.dp)
                ) {
                    items(visibleNodes.take(4), key = { it.type }) { definition ->
                        LibraryNodeRow(definition, connected) { addNode(definition) }
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
                color = if (notice.contains("error", true) || notice.contains("failed", true) || notice.contains("rejected", true)) CommandStudioPalette.Bad else CommandStudioPalette.Muted,
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
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(CommandStudioPalette.Surface).padding(14.dp)) {
                Text("Saved commands", color = CommandStudioPalette.Ink, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                if (savedWorkflows.isEmpty()) Text("No saved commands for this account.", color = CommandStudioPalette.Muted, fontSize = 11.sp)
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
                            Text(item.name, color = CommandStudioPalette.Ink, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                            Text(if (item.enabled) "Active" else "Draft", color = if (item.enabled) CommandStudioPalette.Accent else CommandStudioPalette.Muted, fontSize = 10.5.sp)
                        }
                        Text(
                            item.nodes.firstOrNull { it.type == "trigger.command" }?.config?.get("command") ?: "Message event",
                            color = CommandStudioPalette.Muted, fontSize = 10.sp
                        )
                    }
                }
                CommandActionButton("Close", modifier = Modifier.fillMaxWidth(), compact = true, onClick = { showLoad = false })
            }
        }
    }

    if (showDelete) {
        Dialog(onDismissRequest = { showDelete = false }) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(CommandStudioPalette.Surface).padding(14.dp)) {
                Text("Delete this command?", color = CommandStudioPalette.Ink, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(6.dp))
                Text("The saved workflow and its counters will be removed from Aharane.", color = CommandStudioPalette.Muted, fontSize = 11.sp)
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    CommandActionButton("Cancel", modifier = Modifier.weight(1f), compact = true, onClick = { showDelete = false })
                    CommandActionButton("Delete", modifier = Modifier.weight(1f), compact = true, destructive = true, onClick = {
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
private fun CommandHeaderIcon(
    icon: ImageVector,
    description: String,
    enabled: Boolean = true,
    onClick: () -> Unit
) {
    Box(
        Modifier.size(40.dp)
            .clip(CircleShape)
            .background(CommandStudioPalette.Surface)
            .border(1.dp, CommandStudioPalette.Line, CircleShape)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            icon,
            contentDescription = description,
            tint = if (enabled) CommandStudioPalette.Accent else CommandStudioPalette.Muted,
            modifier = Modifier.size(19.dp)
        )
    }
}

@Composable
private fun CommandActionButton(
    label: String,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
    enabled: Boolean = true,
    primary: Boolean = false,
    destructive: Boolean = false,
    onClick: () -> Unit
) {
    val fill = when {
        primary -> CommandStudioPalette.Accent
        destructive -> Color(0xFF2C1B1A)
        else -> Color(0xFF1B2623)
    }
    val ink = when {
        primary -> Color(0xFF04251C)
        destructive -> CommandStudioPalette.Bad
        else -> CommandStudioPalette.Ink
    }
    Box(
        modifier.clip(RoundedCornerShape(if (compact) 12.dp else 14.dp))
            .background(if (enabled) fill else fill.copy(alpha = 0.45f))
            .border(1.dp, if (primary) CommandStudioPalette.Accent else if (destructive) CommandStudioPalette.Bad.copy(alpha = 0.55f) else CommandStudioPalette.Line,
                RoundedCornerShape(if (compact) 12.dp else 14.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .heightIn(min = if (compact) 40.dp else 44.dp)
            .padding(horizontal = if (compact) 11.dp else 15.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(label, color = if (enabled) ink else ink.copy(alpha = 0.45f), fontSize = if (compact) 12.sp else 13.sp,
            fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
private fun CommandSegment(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.clip(RoundedCornerShape(999.dp))
            .background(if (selected) CommandStudioPalette.Accent.copy(alpha = 0.18f) else Color.Transparent)
            .border(
                1.dp,
                if (selected) CommandStudioPalette.Accent.copy(alpha = 0.55f) else Color.Transparent,
                RoundedCornerShape(999.dp)
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp)
    ) {
        Text(
            label,
            color = if (selected) CommandStudioPalette.Ink else CommandStudioPalette.Muted,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1
        )
    }
}

@Composable
private fun CategoryChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.widthIn(min = 62.dp)
            .clip(RoundedCornerShape(999.dp))
            .background(if (selected) CommandStudioPalette.Soft else CommandStudioPalette.Background)
            .border(
                1.dp,
                if (selected) CommandStudioPalette.Accent.copy(alpha = 0.5f) else CommandStudioPalette.Line,
                RoundedCornerShape(999.dp)
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 13.dp, vertical = 8.dp)
            .testTag("node-library-category-" + label.lowercase().replace(" ", "-")),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        Text(
            label,
            color = if (selected) CommandStudioPalette.Ink else CommandStudioPalette.Muted,
            fontSize = 11.5.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1
        )
        if (selected) {
            Icon(
                painter = painterResource(com.aharane.studio.R.drawable.ic_node_flow),
                contentDescription = null,
                tint = CommandStudioPalette.Accent,
                modifier = Modifier.size(13.dp)
            )
        }
    }
}

@Composable
private fun LibraryNodeChip(node: VisualNodeDefinition, enabled: Boolean, onAdd: () -> Unit) {
    val accent = nodeAccent(node.category)
    Column(
        Modifier.width(190.dp)
            .heightIn(min = 108.dp)
            .clip(RoundedCornerShape(15.dp))
            .background(CommandStudioPalette.Node)
            .border(1.dp, CommandStudioPalette.Line, RoundedCornerShape(15.dp))
            .padding(11.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(
                    Modifier.size(25.dp).clip(RoundedCornerShape(8.dp)).background(accent.copy(alpha = 0.17f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        painter = painterResource(nodeIconResource(node.type)),
                        contentDescription = null,
                        tint = accent,
                        modifier = Modifier.size(15.dp)
                    )
                }
                Text(
                    node.category.uppercase(),
                    color = accent,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Text(
                node.name,
                color = CommandStudioPalette.Ink,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                node.description,
                color = CommandStudioPalette.Muted,
                fontSize = 10.5.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }
        Spacer(Modifier.height(9.dp))
        CommandActionButton(
            "＋ Add node",
            modifier = Modifier.fillMaxWidth().testTag("add-node-" + node.type),
            compact = true,
            enabled = enabled,
            onClick = onAdd
        )
    }
}

@Composable
private fun LibraryNodeRow(node: VisualNodeDefinition, enabled: Boolean, onAdd: () -> Unit) {
    val accent = nodeAccent(node.category)
    Row(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(13.dp))
            .background(CommandStudioPalette.Node)
            .border(1.dp, CommandStudioPalette.Line, RoundedCornerShape(13.dp))
            .padding(horizontal = 11.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(accent.copy(alpha = 0.17f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                painter = painterResource(nodeIconResource(node.type)),
                contentDescription = null,
                tint = accent,
                modifier = Modifier.size(19.dp)
            )
        }
        Spacer(Modifier.width(9.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(node.name, color = CommandStudioPalette.Ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Text(
                node.description,
                color = CommandStudioPalette.Muted,
                fontSize = 11.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }
        Spacer(Modifier.width(8.dp))
        CommandActionButton(
            "Add",
            modifier = Modifier.testTag("add-node-" + node.type),
            compact = true,
            enabled = enabled,
            onClick = onAdd
        )
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
    val accent = nodeAccent(definition.category)
    val borderTarget = when {
        error != null -> CommandStudioPalette.Bad
        selected -> accent
        else -> Color(0xFF2E3B37)
    }
    val borderColor by animateColorAsState(
        borderTarget,
        animationSpec = tween(if (LocalStudioMotionEnabled.current) 150 else 0),
        label = "workflow-node-outline"
    )
    Column(
        Modifier.offset(nodeOffset.x.dp, nodeOffset.y.dp).width(NODE_CARD_WIDTH_DP.dp)
            .onSizeChanged(onMeasured).testTag("node-card-" + node.type)
            .clip(RoundedCornerShape(18.dp)).background(CommandStudioPalette.Node)
            .border(if (selected || error != null) 1.6.dp else 1.dp, borderColor, RoundedCornerShape(18.dp))
            .pointerInput(node.id) {
                detectDragGestures(onDragStart = { currentOnDragStart() }) { change, amount ->
                    change.consume()
                    currentOnMove(Offset(amount.x / density, amount.y / density))
                }
            }
            .clickable(onClick = onSelect)
    ) {
        Row(
            Modifier.fillMaxWidth().background(CommandStudioPalette.NodeHeader)
                .padding(horizontal = 11.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(9.dp)
        ) {
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(11.dp)).background(accent.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center) {
                Icon(
                    painter = painterResource(nodeIconResource(node.type)),
                    contentDescription = null,
                    tint = accent,
                    modifier = Modifier.size(19.dp)
                )
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                if (definition.category.isNotBlank()) {
                    Text(definition.category.uppercase(), color = accent, fontSize = 9.5.sp,
                        fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Text(definition.name, color = CommandStudioPalette.Ink, fontSize = 13.5.sp,
                    fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (error != null) {
                Box(Modifier.size(22.dp).clip(CircleShape).background(Color(0xFF3C211F)), contentAlignment = Alignment.Center) {
                    Text("!", color = CommandStudioPalette.Bad, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        Text(
            nodeSummary(node),
            color = Color(0xFFC9D6D1),
            fontSize = 12.sp,
            lineHeight = 17.sp,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 11.dp, vertical = 9.dp)
                .clip(RoundedCornerShape(11.dp)).background(CommandStudioPalette.Canvas)
                .border(1.dp, Color(0xFF243230), RoundedCornerShape(11.dp))
                .padding(horizontal = 10.dp, vertical = 9.dp)
        )
        if (definition.inputs.isNotEmpty()) {
            Column(
                Modifier.fillMaxWidth().padding(horizontal = 7.dp, vertical = 2.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                definition.inputs.forEach { socket ->
                    SocketAction(socket, false, "socket-" + node.type + "-in-" + socket.id,
                        onSocket = { onSocket(socket, false) }, onPosition = { onSocketPosition(socket, false, it) })
                }
            }
        }
        if (definition.outputs.isNotEmpty()) {
            Column(
                Modifier.fillMaxWidth().padding(horizontal = 7.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
                horizontalAlignment = Alignment.End
            ) {
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
    "message.sendViewOnceText" -> "View Once text"
    "media.sendViewOnce" -> "View Once " + node.config["kind"].orEmpty()
    "media.sendMedia" -> "Send " + node.config["kind"].orEmpty()
    "message.editOriginal" -> "Edit triggering message"
    "message.deleteOriginal" -> "Delete triggering message"
    "message.pinOriginal" -> (node.config["action"] ?: "pin").replaceFirstChar { it.uppercase() } + " triggering message"
    "message.keepOriginal" -> (node.config["action"] ?: "keep").replaceFirstChar { it.uppercase() } + " triggering message"
    "chat.setDisappearing" -> "Timer " + node.config["seconds"].orEmpty() + " seconds"
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
    "value.toNumber" -> "Convert text to number"
    "value.toBoolean" -> "Convert text to boolean"
    "value.toList" -> "Split text using " + node.config["separator"].orEmpty().ifBlank { "," }
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
        else -> CommandStudioPalette.Muted
    }
    Row(
        Modifier.clickable(onClick = onSocket).testTag(tag).heightIn(min = 30.dp)
            .padding(horizontal = 3.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        if (!output) SocketDot(color, onPosition)
        Text(socket.label, color = color, fontSize = 11.sp, maxLines = 1)
        if (output) SocketDot(color, onPosition)
    }
}

@Composable
private fun SocketDot(color: Color, onPosition: (LayoutCoordinates) -> Unit) {
    Box(Modifier.size(13.dp).onGloballyPositioned(onPosition).clip(CircleShape)
        .background(Color(0xFF10171A)).border(2.dp, color, CircleShape))
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
        "trigger.command" -> listOf("command" to "Command name", "aliases" to "Aliases, comma-separated", "maxMessagesPerRun" to "Maximum messages per execution (1–500)")
        "trigger.message" -> listOf("maxMessagesPerRun" to "Maximum messages per execution (1–500)")
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
        "message.sendViewOnceText" -> listOf("text" to "View Once text (beta; requires account rollout)")
        "media.sendViewOnce" -> listOf("kind" to "Media type (image/video/audio)", "caption" to "Caption (optional)")
        "media.sendMedia" -> listOf("kind" to "Media type (image/video/audio/document/sticker)", "caption" to "Caption (optional)")
        "message.editOriginal" -> listOf("text" to "Replacement text")
        "message.deleteOriginal" -> emptyList()
        "message.pinOriginal" -> listOf("action" to "Action (pin/unpin)", "seconds" to "Duration in seconds (86400/604800/2592000)")
        "message.keepOriginal" -> listOf("action" to "Action (keep/unkeep)")
        "chat.setDisappearing" -> listOf("seconds" to "Timer seconds (0/86400/604800/7776000)")
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
        "value.toList" -> listOf("separator" to "List separator (default comma)")
        else -> if (node.type.startsWith("custom.") || node.type.startsWith("engine.")) definition?.inputs
            ?.filter { it.type != "exec" }?.map { it.id to (it.label + " (" + it.type + ")") }.orEmpty()
        else emptyList()
    }
    Dialog(onDismissRequest = onDismiss) {
        Column(
            Modifier.fillMaxWidth().heightIn(max = 650.dp).clip(RoundedCornerShape(18.dp))
                .background(CommandStudioPalette.Surface).verticalScroll(rememberScrollState()).padding(18.dp)
        ) {
            Text(definition?.category ?: "NODE", color = CommandStudioPalette.Accent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Text(definition?.name ?: node.type, color = CommandStudioPalette.Ink, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(5.dp))
            Text(definition?.description.orEmpty(), color = CommandStudioPalette.Muted, fontSize = 13.5.sp, lineHeight = 19.sp)
            Spacer(Modifier.height(8.dp))
            fields.forEach { (key, label) ->
                Text(label, color = CommandStudioPalette.Ink, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
                BasicTextField(
                    value = config[key].orEmpty(),
                    onValueChange = { config = config + (key to it) },
                    singleLine = key !in setOf("text", "options", "buttons", "participants", "description"),
                    textStyle = TextStyle(color = CommandStudioPalette.Ink, fontSize = 14.5.sp),
                    modifier = Modifier.fillMaxWidth().padding(top = 5.dp, bottom = 10.dp)
                        .clip(RoundedCornerShape(9.dp)).background(CommandStudioPalette.Background)
                        .border(1.dp, CommandStudioPalette.Line, RoundedCornerShape(9.dp)).padding(horizontal = 12.dp, vertical = 12.dp)
                        .testTag("node-config-field-" + key)
                )
            }
            if (node.type == "trigger.command" || node.type == "trigger.message") {
                Text("Chat scope", color = CommandStudioPalette.Ink, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                val selectedScope = config["chatScope"] ?: "direct"
                Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    listOf("direct" to "Direct", "groups" to "Groups", "both" to "Both").forEach { (value, label) ->
                        val active = selectedScope == value
                        Box(
                            Modifier.clip(RoundedCornerShape(6.dp))
                                .background(if (active) CommandStudioPalette.Accent else CommandStudioPalette.Background)
                                .border(1.dp, if (active) CommandStudioPalette.Accent else CommandStudioPalette.Line, RoundedCornerShape(6.dp))
                                .clickable(enabled = allowGroupScope || value == "direct") {
                                    config = config + ("chatScope" to value)
                                }.padding(horizontal = 8.dp, vertical = 5.dp)
                        ) {
                            Text(label, color = if (active) Color.White else CommandStudioPalette.Ink, fontSize = 13.5.sp)
                        }
                    }
                }
                if (!allowGroupScope) {
                    Text("Private account commands stay in the owner self-chat.", color = CommandStudioPalette.Muted, fontSize = 10.5.sp)
                } else {
                    Text("Group commands run only when enabled for Public groups.", color = CommandStudioPalette.Muted, fontSize = 10.5.sp)
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
                        Text(label, color = CommandStudioPalette.Ink, fontSize = 11.sp)
                    }
                }
            }
            if (node.type == "message.sendText" || node.type == "message.replyText") {
                Text("Templates: {{message.text}}, {{sender}}, {{args}}, {{arg1}}, {{var:name}}, {{counter:name}}",
                    color = CommandStudioPalette.Muted, fontSize = 10.5.sp)
            }
            if (issues.isNotEmpty()) {
                Spacer(Modifier.height(7.dp))
                Text("Validation", color = CommandStudioPalette.Bad, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                issues.forEach {
                    Text(it.message, color = CommandStudioPalette.Bad, fontSize = 13.5.sp)
                    Text("Fix: " + it.fix, color = CommandStudioPalette.Muted, fontSize = 10.5.sp)
                }
            }
            Spacer(Modifier.height(9.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                CommandActionButton("Delete", compact = true, destructive = true, onClick = onDelete)
                CommandActionButton("Disconnect", compact = true, onClick = onDisconnect)
                Spacer(Modifier.weight(1f))
                CommandActionButton("Cancel", compact = true, onClick = onDismiss)
                CommandActionButton("Apply", compact = true, primary = true, onClick = { onApply(config) })
            }
        }
    }
}

@Composable
private fun SafeTestResultDialog(result: JSONObject, onDismiss: () -> Unit) {
    val trace = result.optJSONArray("trace") ?: JSONArray()
    Dialog(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(CommandStudioPalette.Surface).padding(13.dp)) {
            Text("Safe test", color = CommandStudioPalette.Ink, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(5.dp))
            Text(
                if (result.optBoolean("ok")) "Passed · no live WhatsApp actions were performed"
                else result.optString("error", "The workflow needs attention."),
                color = if (result.optBoolean("ok")) CommandStudioPalette.Accent else CommandStudioPalette.Bad,
                fontSize = 12.5.sp
            )
            Spacer(Modifier.height(7.dp))
            LazyColumn(Modifier.heightIn(max = 300.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                items(trace.length()) { index ->
                    val item = trace.optJSONObject(index) ?: JSONObject()
                    val status = item.optString("status")
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(CommandStudioPalette.Background).padding(7.dp)) {
                        Text(item.optString("type") + " · " + status, color = if (status == "error") CommandStudioPalette.Bad else CommandStudioPalette.Ink, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                        Text(item.optString("message"), color = CommandStudioPalette.Muted, fontSize = 13.5.sp)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            CommandActionButton("Close", modifier = Modifier.fillMaxWidth(), compact = true, onClick = onDismiss)
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
        Modifier.size(40.dp).clip(RoundedCornerShape(11.dp))
            .background(if (enabled) Color(0xFF1B2623) else Color(0xFF141B19))
            .border(1.dp, CommandStudioPalette.Line, RoundedCornerShape(11.dp))
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
    val operations = CustomNodeOperatorCatalog.operators
    Dialog(onDismissRequest = onDismiss) {
        Column(
            Modifier.fillMaxWidth().heightIn(max = 620.dp)
                .clip(RoundedCornerShape(15.dp))
                .background(CommandStudioPalette.Surface)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(9.dp)
        ) {
            Text("My custom nodes", color = CommandStudioPalette.Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
            Text(
                "Build reusable, executable logic from safe typed operations. Saved nodes are available in the canvas.",
                color = CommandStudioPalette.Muted, fontSize = 12.sp
            )
            nodes.forEach { node ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(node.optString("name"), color = CommandStudioPalette.Ink, fontSize = 13.sp)
                        Text(
                            node.optString("operator") + " · v" + node.optInt("version", 1),
                            color = CommandStudioPalette.Muted, fontSize = 11.sp
                        )
                    }
                    val id = node.optString("id")
                    Text(
                        if (confirmDelete == id) "Confirm remove" else "Remove",
                        color = CommandStudioPalette.Bad, fontSize = 12.sp,
                        modifier = Modifier.clickable {
                            if (confirmDelete == id) {
                                confirmDelete = null
                                onDelete(id)
                            } else confirmDelete = id
                        }.padding(8.dp)
                    )
                }
            }
            Text("Create node", color = CommandStudioPalette.Ink, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            listOf(
                Triple("Node name", name, { value: String -> name = value }),
                Triple("Node ID (lowercase, hyphenated)", identifier, { value: String -> identifier = value }),
                Triple("Description", description, { value: String -> description = value })
            ).forEach { (label, value, update) ->
                Text(label, color = CommandStudioPalette.Ink, fontSize = 12.sp)
                BasicTextField(
                    value = value,
                    onValueChange = update,
                    textStyle = TextStyle(color = CommandStudioPalette.Ink, fontSize = 14.sp),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                        .clip(RoundedCornerShape(7.dp)).background(CommandStudioPalette.Background)
                        .border(1.dp, CommandStudioPalette.Line, RoundedCornerShape(7.dp))
                        .padding(10.dp)
                )
            }
            Text("Operation", color = CommandStudioPalette.Ink, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            operations.forEach { spec ->
                Row(
                    Modifier.fillMaxWidth().clickable { operation = spec.id }.padding(vertical = 3.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    androidx.compose.material3.RadioButton(
                        selected = operation == spec.id,
                        onClick = { operation = spec.id }
                    )
                    Text(spec.label, color = CommandStudioPalette.Ink, fontSize = 13.sp)
                }
            }
            val valid = Regex("^[a-z][a-z0-9_-]{0,47}$").matches(identifier) && name.isNotBlank()
            CommandActionButton("Create executable node", modifier = Modifier.fillMaxWidth(), enabled = valid, onClick = {
                val selected = CustomNodeOperatorCatalog.find(operation)
                    ?: CustomNodeOperatorCatalog.operators.first()
                val inputs = JSONArray().apply {
                    selected.inputs.forEach { port ->
                        put(
                            JSONObject()
                                .put("id", port.id)
                                .put("label", port.label)
                                .put("type", port.type)
                        )
                    }
                }
                onCreate(
                    JSONObject().put("id", identifier).put("name", name)
                        .put("description", description).put("category", "My nodes")
                        .put("version", 1).put("operator", selected.id)
                        .put("inputs", inputs).put("outputType", selected.outputType)
                )
            })
            CommandActionButton("Close", modifier = Modifier.fillMaxWidth(), primary = false, onClick = onDismiss)
        }
    }
}
