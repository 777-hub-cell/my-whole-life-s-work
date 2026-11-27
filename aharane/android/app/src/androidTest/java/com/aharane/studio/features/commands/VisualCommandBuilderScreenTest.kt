package com.aharane.studio.features.commands

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertExists
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.junit4.createComposeRule
import android.view.KeyEvent
import androidx.test.platform.app.InstrumentationRegistry
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import com.aharane.studio.core.design.AharaneTheme
import com.aharane.studio.core.network.VisualCommandDataSource
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class VisualCommandBuilderScreenTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun editAddConnectSaveReloadAndSafeTestWorkflow() {
        val source = FakeVisualCommandDataSource()
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                VisualCommandBuilderScreen(repository = source, connected = true, onBack = {})
            }
        }
        compose.waitUntil(5_000) { source.readCount > 0 }

        compose.onNodeWithTag("node-card-trigger.command").performClick()
        compose.onNodeWithTag("node-config-field-command").performTextClearance()
        compose.onNodeWithTag("node-config-field-command").performTextInput("welcome")
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        compose.waitForIdle()
        compose.onNodeWithText("Apply").performClick()

        compose.onNodeWithTag("visual-command-node-library")
            .performScrollToNode(hasTestTag("add-node-message.sendText"))
        compose.onNodeWithTag("add-node-message.sendText").performClick()
        // The dialog is composed after the newly added node enters the canvas.
        // Allow a little more time on slower CI emulators before declaring a UI regression.
        compose.waitUntil(15_000) {
            compose.onAllNodesWithTag("node-config-field-text").fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithTag("node-config-field-text").performTextClearance()
        compose.onNodeWithTag("node-config-field-text").performTextInput("Hello from the builder")
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        compose.waitForIdle()
        compose.onNodeWithText("Apply").performClick()

        compose.onNodeWithTag("socket-message.replyText-out-next").performClick()
        compose.onNodeWithTag("socket-message.sendText-in-in").performClick()
        compose.onNodeWithTag("workflow-node-count").assertTextEquals("3 nodes · 2 wires")

        compose.onNodeWithTag("workflow-save").performClick()
        compose.waitUntil(5_000) { source.createCount == 1 }
        // The command name belongs to the trigger node; there is no separate
        // workflow-name text field. Change it locally, then reload the saved
        // version to verify the command name comes back from that node.
        compose.onNodeWithTag("node-card-trigger.command").performClick()
        compose.onNodeWithTag("node-config-field-command").performTextClearance()
        compose.onNodeWithTag("node-config-field-command").performTextInput("unsaved-local")
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        compose.waitForIdle()
        compose.onNodeWithText("Apply").performClick()
        compose.onNodeWithTag("workflow-load").performClick()
        compose.onNodeWithText("welcome").performClick()
        compose.onNodeWithTag("node-card-trigger.command").performClick()
        compose.onNodeWithTag("node-config-field-command").assertTextEquals("welcome")
        compose.onNodeWithTag("workflow-node-count").assertTextEquals("3 nodes · 2 wires")

        compose.onNodeWithTag("workflow-test").performClick()
        compose.waitUntil(5_000) { source.safeTestCount == 1 }
        compose.onNodeWithText("Passed · no live WhatsApp actions were performed").assertIsDisplayed()

        assertEquals("welcome", source.savedWorkflow()?.optString("name"))
        assertEquals("welcome", source.savedWorkflow()?.optJSONArray("nodes")
            ?.optJSONObject(0)?.optJSONObject("config")?.optString("command"))
        assertEquals("Hello from the builder", source.savedWorkflow()?.optJSONArray("nodes")
            ?.optJSONObject(2)?.optJSONObject("config")?.optString("text"))
    }

    @Test
    fun customNodeManagerExposesTheCompleteSafeTypedOperatorSet() {
        val source = FakeVisualCommandDataSource()
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                VisualCommandBuilderScreen(repository = source, connected = true, onBack = {})
            }
        }
        compose.waitUntil(5_000) { source.readCount > 0 }

        compose.onNodeWithTag("custom-node-manager").performClick()
        listOf(
            "Uppercase",
            "Lowercase",
            "Trim whitespace",
            "Combine text",
            "Contains text",
            "Compare text",
            "Text length",
            "Split text into a list",
            "Join a list into text",
            "Add numbers",
            "Subtract numbers",
            "Multiply numbers",
            "Divide numbers",
            "Boolean AND",
            "Boolean OR",
            "Boolean NOT",
            "Choose between two text values"
        ).forEach { label ->
            compose.onNodeWithText(label).assertExists()
        }
    }

    @Test
    fun conversionNodesCanBeSearchedAddedAndConfigured() {
        val source = FakeVisualCommandDataSource()
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                VisualCommandBuilderScreen(repository = source, connected = true, onBack = {})
            }
        }
        compose.waitUntil(5_000) { source.readCount > 0 }

        compose.onNodeWithTag("node-library-search").performTextInput("Text to number")
        compose.onNodeWithTag("add-node-value.toNumber").performClick()
        compose.onNodeWithText("Apply").performClick()
        compose.onNodeWithTag("node-card-value.toNumber").assertExists()

        compose.onNodeWithTag("node-library-search").performTextClearance()
        compose.onNodeWithTag("node-library-search").performTextInput("Text to list")
        compose.onNodeWithTag("add-node-value.toList").performClick()
        compose.onNodeWithTag("node-config-field-separator").assertIsDisplayed()
        compose.onNodeWithTag("node-config-field-separator").performTextClearance()
        compose.onNodeWithTag("node-config-field-separator").performTextInput(";")
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        compose.waitForIdle()
        compose.onNodeWithText("Apply").performClick()
        compose.onNodeWithTag("node-card-value.toList").assertExists()
    }

    @Test
    fun canvasHasMeasuredBoundsAndNodesAreVisibleInsideIt() {
        val source = FakeVisualCommandDataSource()
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                VisualCommandBuilderScreen(repository = source, connected = true, onBack = {})
            }
        }
        compose.waitUntil(5_000) { source.readCount > 0 }
        compose.waitForIdle()

        val workspace = compose.onNodeWithTag("workflow-workspace").fetchSemanticsNode().boundsInRoot
        assertTrue("Canvas must have non-zero measured bounds", workspace.width > 100f && workspace.height > 100f)

        compose.onNodeWithTag("node-card-trigger.command").assertIsDisplayed()
        compose.onNodeWithTag("node-card-message.replyText").assertIsDisplayed()
        val trigger = compose.onNodeWithTag("node-card-trigger.command").fetchSemanticsNode().boundsInRoot
        val reply = compose.onNodeWithTag("node-card-message.replyText").fetchSemanticsNode().boundsInRoot
        assertTrue("Nodes must have non-zero size", trigger.width > 50f && trigger.height > 30f && reply.width > 50f && reply.height > 30f)
        assertTrue("Trigger must sit inside the canvas viewport", trigger.left >= workspace.left - 1f && trigger.top >= workspace.top - 1f)
    }

    @Test
    fun draggingOneNodeLeavesTheOtherInPlaceAndBlankGridCanPan() {
        val source = FakeVisualCommandDataSource()
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                VisualCommandBuilderScreen(repository = source, connected = true, onBack = {})
            }
        }
        compose.waitUntil(5_000) { source.readCount > 0 }

        val trigger = compose.onNodeWithTag("node-card-trigger.command")
        val reply = compose.onNodeWithTag("node-card-message.replyText")
        val triggerBefore = trigger.fetchSemanticsNode().boundsInRoot
        val replyBefore = reply.fetchSemanticsNode().boundsInRoot

        trigger.performTouchInput {
            down(center)
            moveTo(center + Offset(0f, 120f), delayMillis = 350)
            up()
        }
        compose.waitForIdle()

        val triggerAfter = trigger.fetchSemanticsNode().boundsInRoot
        val replyAfter = reply.fetchSemanticsNode().boundsInRoot
        assertTrue("Dragged node should move down", triggerAfter.top > triggerBefore.top + 45f)
        assertEquals("Other node must keep its vertical position", replyBefore.top, replyAfter.top, 2f)

        val workspaceBounds = compose.onNodeWithTag("workflow-workspace")
            .fetchSemanticsNode().boundsInRoot
        compose.onNodeWithTag("workflow-workspace").performTouchInput {
            val x = 14f
            down(Offset(x, workspaceBounds.height * 0.88f))
            moveTo(Offset(x, workspaceBounds.height * 0.18f), delayMillis = 400)
            up()
        }
        compose.waitForIdle()

        val replyAfterPan = reply.fetchSemanticsNode().boundsInRoot
        assertTrue("Blank-grid swipe should pan the workspace", kotlin.math.abs(replyAfterPan.top - replyAfter.top) > 8f)
    }

    @Test
    fun disconnectedBuilderKeepsServerWritesDisabled() {
        val source = FakeVisualCommandDataSource()
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                VisualCommandBuilderScreen(repository = source, connected = false, onBack = {})
            }
        }
        compose.onNodeWithText("Connect to your Aharane server to load the WhatsApp node library.")
            .assertIsDisplayed()
        compose.onNodeWithTag("workflow-save").assertIsNotEnabled()
        compose.onNodeWithTag("workflow-test").assertIsNotEnabled()
        assertEquals(0, source.createCount)
    }
}

private class FakeVisualCommandDataSource : VisualCommandDataSource {
    private val workflows = linkedMapOf<String, JSONObject>()
    var readCount = 0
        private set
    var createCount = 0
        private set
    var safeTestCount = 0
        private set

    override suspend fun visualCommands(account: String): JSONObject {
        readCount += 1
        val rows = JSONArray()
        workflows.values.filter { it.optString("account") == account }.forEach { row ->
            rows.put(JSONObject(row.toString()).put("validation", validValidation()))
        }
        return JSONObject().put("library", nodeLibrary()).put("workflows", rows)
    }

    override suspend fun createVisualCommand(workflow: JSONObject): JSONObject {
        val row = JSONObject(workflow.toString())
            .put("createdAt", "2026-11-20T00:00:00.000Z")
            .put("updatedAt", "2026-11-20T00:00:00.000Z")
        workflows[row.optString("id")] = JSONObject(row.toString())
        createCount += 1
        return saveResponse(row)
    }

    override suspend fun updateVisualCommand(id: String, workflow: JSONObject): JSONObject {
        val row = JSONObject(workflow.toString()).put("id", id)
        workflows[id] = JSONObject(row.toString())
        return saveResponse(row)
    }

    override suspend fun deleteVisualCommand(id: String): JSONObject {
        workflows.remove(id)
        return JSONObject().put("ok", true)
    }

    override suspend fun testVisualCommand(id: String, messageText: String): JSONObject {
        safeTestCount += 1
        return JSONObject().put("ok", true).put(
            "result", JSONObject().put("ok", true).put("trace", JSONArray())
        )
    }

    fun savedWorkflow(): JSONObject? = workflows.values.firstOrNull()?.let { JSONObject(it.toString()) }

    private fun saveResponse(row: JSONObject): JSONObject =
        JSONObject().put("workflow", JSONObject(row.toString())).put("validation", validValidation())

    private fun validValidation(): JSONObject =
        JSONObject().put("valid", true).put("errors", JSONArray()).put("warnings", JSONArray())

    private fun nodeLibrary(): JSONArray {
        fun socket(id: String, label: String, type: String = "exec") =
            JSONObject().put("id", id).put("label", label).put("type", type)
        fun definition(type: String, name: String, inputs: JSONArray, outputs: JSONArray) =
            JSONObject().put("type", type).put("name", name).put("description", name)
                .put("ports", JSONObject().put("inputs", inputs).put("outputs", outputs))
        val trigger = definition("trigger.command", "Command trigger", JSONArray(), JSONArray().put(socket("next", "Next")))
        val reply = definition("message.replyText", "Reply text", JSONArray().put(socket("in", "In")), JSONArray().put(socket("next", "Next")))
        val sendText = definition("message.sendText", "Send text", JSONArray().put(socket("in", "In")), JSONArray().put(socket("next", "Next")))
        val toNumber = definition(
            "value.toNumber", "Text to number",
            JSONArray().put(socket("value", "Text", "string")),
            JSONArray().put(socket("value", "Number", "number"))
        )
        val toList = definition(
            "value.toList", "Text to list",
            JSONArray().put(socket("value", "Text", "string")).put(socket("separator", "Separator", "string")),
            JSONArray().put(socket("value", "List", "list"))
        )
        return JSONArray().put(JSONObject().put("category", "Starter nodes")
            .put("nodes", JSONArray().put(trigger).put(reply).put(sendText).put(toNumber).put(toList)))
    }
}
