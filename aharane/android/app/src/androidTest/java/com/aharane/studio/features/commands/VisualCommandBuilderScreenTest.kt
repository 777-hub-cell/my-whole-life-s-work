package com.aharane.studio.features.commands

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import com.aharane.studio.core.design.AharaneTheme
import com.aharane.studio.core.network.VisualCommandDataSource
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
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
        compose.onNodeWithText("Apply").performClick()

        compose.onNodeWithTag("add-node-message.sendText").performClick()
        compose.onNodeWithTag("node-config-field-text").performTextClearance()
        compose.onNodeWithTag("node-config-field-text").performTextInput("Hello from the builder")
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
        compose.onNodeWithText("Apply").performClick()
        compose.onNodeWithTag("workflow-load").performClick()
        compose.onNodeWithText("welcome").performClick()
        compose.onNodeWithTag("node-card-trigger.command").performClick()
        compose.onNodeWithTag("node-config-field-command").assertTextEquals("welcome")
        compose.onNodeWithTag("workflow-node-count").assertTextEquals("3 nodes · 2 wires")

        compose.onNodeWithText("Test safely").performClick()
        compose.waitUntil(5_000) { source.safeTestCount == 1 }
        compose.onNodeWithText("Passed · no live WhatsApp actions were performed").assertIsDisplayed()

        assertEquals("welcome", source.savedWorkflow()?.optString("name"))
        assertEquals("welcome", source.savedWorkflow()?.optJSONArray("nodes")
            ?.optJSONObject(0)?.optJSONObject("config")?.optString("command"))
        assertEquals("Hello from the builder", source.savedWorkflow()?.optJSONArray("nodes")
            ?.optJSONObject(2)?.optJSONObject("config")?.optString("text"))
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
        compose.onNodeWithText("Test safely").assertIsNotEnabled()
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
        fun socket(id: String, label: String) =
            JSONObject().put("id", id).put("label", label).put("type", "exec")
        fun definition(type: String, name: String, inputs: JSONArray, outputs: JSONArray) =
            JSONObject().put("type", type).put("name", name).put("description", name)
                .put("ports", JSONObject().put("inputs", inputs).put("outputs", outputs))
        val trigger = definition("trigger.command", "Command trigger", JSONArray(), JSONArray().put(socket("next", "Next")))
        val reply = definition("message.replyText", "Reply text", JSONArray().put(socket("in", "In")), JSONArray().put(socket("next", "Next")))
        val sendText = definition("message.sendText", "Send text", JSONArray().put(socket("in", "In")), JSONArray().put(socket("next", "Next")))
        return JSONArray().put(JSONObject().put("category", "Starter nodes")
            .put("nodes", JSONArray().put(trigger).put(reply).put(sendText)))
    }
}
