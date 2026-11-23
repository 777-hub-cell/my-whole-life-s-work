package com.aharane.studio.features.commands

import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class VisualNode(
    val id: String = UUID.randomUUID().toString(),
    val type: String,
    val x: Float = 32f,
    val y: Float = 80f,
    val config: Map<String, String> = emptyMap()
) {
    fun toJson(): JSONObject {
        val values = JSONObject()
        config.forEach { (key, value) ->
            when (key) {
                "aliases" -> values.put(key, JSONArray(value.split(',').map(String::trim).filter(String::isNotBlank)))
                "milliseconds", "count", "selectableCount" -> values.put(key, value.toIntOrNull() ?: 0)
                else -> values.put(key, value)
            }
        }
        return JSONObject()
            .put("id", id)
            .put("type", type)
            .put("x", x.toDouble())
            .put("y", y.toDouble())
            .put("config", values)
    }

    companion object {
        fun fromJson(json: JSONObject): VisualNode {
            val configJson = json.optJSONObject("config") ?: JSONObject()
            val config = buildMap {
                val keys = configJson.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    val value = configJson.opt(key)
                    put(
                        key,
                        when (value) {
                            is JSONArray -> (0 until value.length()).map { value.optString(it) }.joinToString(", ")
                            null, JSONObject.NULL -> ""
                            else -> value.toString()
                        }
                    )
                }
            }
            return VisualNode(
                id = json.optString("id").ifBlank { UUID.randomUUID().toString() },
                type = json.optString("type"),
                x = json.optDouble("x", 32.0).toFloat().coerceIn(0f, 10_000f),
                y = json.optDouble("y", 80.0).toFloat().coerceIn(0f, 10_000f),
                config = config
            )
        }
    }
}

data class VisualEdge(
    val id: String = UUID.randomUUID().toString(),
    val from: String,
    val fromSocket: String,
    val to: String,
    val toSocket: String
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("from", from)
        .put("fromSocket", fromSocket)
        .put("to", to)
        .put("toSocket", toSocket)

    companion object {
        fun fromJson(json: JSONObject) = VisualEdge(
            id = json.optString("id").ifBlank { UUID.randomUUID().toString() },
            from = json.optString("from"),
            fromSocket = json.optString("fromSocket"),
            to = json.optString("to"),
            toSocket = json.optString("toSocket")
        )
    }
}

data class VisualWorkflow(
    val id: String = UUID.randomUUID().toString(),
    val name: String = "New command",
    val account: String = "private",
    val enabled: Boolean = false,
    val nodes: List<VisualNode>,
    val edges: List<VisualEdge>,
    val createdAt: String = "",
    val updatedAt: String = ""
) {
    fun toJson(): JSONObject {
        val nodeRows = JSONArray()
        nodes.forEach { nodeRows.put(it.toJson()) }
        val edgeRows = JSONArray()
        edges.forEach { edgeRows.put(it.toJson()) }
        return JSONObject()
            .put("id", id)
            .put("name", name)
            .put("account", account)
            .put("enabled", enabled)
            .put("version", 1)
            .put("nodes", nodeRows)
            .put("edges", edgeRows)
            .put("createdAt", createdAt)
            .put("updatedAt", updatedAt)
    }

    companion object {
        fun fromJson(json: JSONObject): VisualWorkflow {
            val nodes = json.optJSONArray("nodes") ?: JSONArray()
            val edges = json.optJSONArray("edges") ?: JSONArray()
            return VisualWorkflow(
                id = json.optString("id").ifBlank { UUID.randomUUID().toString() },
                name = json.optString("name", "Untitled command"),
                account = json.optString("account", "private"),
                enabled = json.optBoolean("enabled"),
                nodes = buildList { for (index in 0 until nodes.length()) nodes.optJSONObject(index)?.let { add(VisualNode.fromJson(it)) } },
                edges = buildList { for (index in 0 until edges.length()) edges.optJSONObject(index)?.let { add(VisualEdge.fromJson(it)) } },
                createdAt = json.optString("createdAt"),
                updatedAt = json.optString("updatedAt")
            )
        }

        fun draft(account: String = "private"): VisualWorkflow {
            val trigger = VisualNode(
                type = "trigger.command",
                x = 32f,
                y = 88f,
                config = mapOf("command" to "hello", "aliases" to "")
            )
            val reply = VisualNode(
                type = "message.replyText",
                x = 270f,
                y = 88f,
                config = mapOf("text" to "Hello, {{sender}}!")
            )
            return VisualWorkflow(
                name = "hello",
                account = account,
                enabled = false,
                nodes = listOf(trigger, reply),
                edges = listOf(VisualEdge(from = trigger.id, fromSocket = "next", to = reply.id, toSocket = "in"))
            )
        }
    }
}

data class VisualSocket(
    val id: String,
    val label: String,
    val type: String
) {
    companion object {
        fun fromJson(json: JSONObject) = VisualSocket(
            id = json.optString("id"),
            label = json.optString("label"),
            type = json.optString("type")
        )
    }
}

data class VisualNodeDefinition(
    val type: String,
    val name: String,
    val description: String,
    val inputs: List<VisualSocket>,
    val outputs: List<VisualSocket>,
    val version: Int = 1
) {
    companion object {
        fun fromJson(json: JSONObject): VisualNodeDefinition {
            val ports = json.optJSONObject("ports") ?: JSONObject()
            fun parse(key: String): List<VisualSocket> {
                val rows = ports.optJSONArray(key) ?: JSONArray()
                return buildList {
                    for (index in 0 until rows.length()) rows.optJSONObject(index)?.let { add(VisualSocket.fromJson(it)) }
                }
            }
            return VisualNodeDefinition(
                type = json.optString("type"),
                name = json.optString("name"),
                description = json.optString("description"),
                inputs = parse("inputs"),
                outputs = parse("outputs"),
                version = json.optInt("version", 1)
            )
        }
    }
}

data class VisualNodeCategory(
    val name: String,
    val nodes: List<VisualNodeDefinition>
) {
    companion object {
        fun fromJson(json: JSONObject): VisualNodeCategory {
            val rows = json.optJSONArray("nodes") ?: JSONArray()
            return VisualNodeCategory(
                name = json.optString("category"),
                nodes = buildList {
                    for (index in 0 until rows.length()) rows.optJSONObject(index)?.let { add(VisualNodeDefinition.fromJson(it)) }
                }
            )
        }
    }
}

data class VisualWorkflowIssue(
    val nodeId: String?,
    val severity: String,
    val message: String,
    val fix: String
) {
    companion object {
        fun fromJson(json: JSONObject) = VisualWorkflowIssue(
            nodeId = json.optString("nodeId").takeIf { it.isNotBlank() && it != "null" },
            severity = json.optString("severity", "error"),
            message = json.optString("message"),
            fix = json.optString("fix")
        )
    }
}

data class VisualWorkflowValidation(
    val valid: Boolean = false,
    val errors: List<VisualWorkflowIssue> = emptyList(),
    val warnings: List<VisualWorkflowIssue> = emptyList()
) {
    fun messagesFor(nodeId: String): List<VisualWorkflowIssue> =
        errors.filter { it.nodeId == nodeId } + warnings.filter { it.nodeId == nodeId }

    companion object {
        fun fromJson(json: JSONObject?): VisualWorkflowValidation {
            if (json == null) return VisualWorkflowValidation()
            fun read(key: String): List<VisualWorkflowIssue> {
                val rows = json.optJSONArray(key) ?: JSONArray()
                return buildList { for (index in 0 until rows.length()) rows.optJSONObject(index)?.let { add(VisualWorkflowIssue.fromJson(it)) } }
            }
            return VisualWorkflowValidation(json.optBoolean("valid"), read("errors"), read("warnings"))
        }
    }
}
