package com.aharane.studio.features.commands

/**
 * Safe, reusable operations offered by the visual custom-node creator.
 * Keep this catalogue aligned with the server's custom-node engine operators.
 */
internal data class CustomNodePortSpec(
    val id: String,
    val label: String,
    val type: String
)

internal data class CustomNodeOperatorSpec(
    val id: String,
    val label: String,
    val inputs: List<CustomNodePortSpec>,
    val outputType: String
)

internal object CustomNodeOperatorCatalog {
    private fun input(id: String, label: String, type: String) =
        CustomNodePortSpec(id, label, type)

    val operators: List<CustomNodeOperatorSpec> = listOf(
        CustomNodeOperatorSpec("uppercase", "Uppercase", listOf(input("value", "Value", "string")), "string"),
        CustomNodeOperatorSpec("lowercase", "Lowercase", listOf(input("value", "Value", "string")), "string"),
        CustomNodeOperatorSpec("trim", "Trim whitespace", listOf(input("value", "Value", "string")), "string"),
        CustomNodeOperatorSpec("concat", "Combine text", listOf(input("value", "First text", "string"), input("other", "Second text", "string")), "string"),
        CustomNodeOperatorSpec("contains", "Contains text", listOf(input("value", "Text", "string"), input("other", "Search for", "string")), "boolean"),
        CustomNodeOperatorSpec("equals", "Compare text", listOf(input("value", "First value", "string"), input("other", "Second value", "string")), "boolean"),
        CustomNodeOperatorSpec("length", "Text length", listOf(input("value", "Text", "string")), "number"),
        CustomNodeOperatorSpec("split", "Split text into a list", listOf(input("value", "Text", "string"), input("other", "Separator", "string")), "list"),
        CustomNodeOperatorSpec("join", "Join a list into text", listOf(input("value", "List", "list"), input("other", "Separator", "string")), "string"),
        CustomNodeOperatorSpec("add", "Add numbers", listOf(input("value", "First number", "number"), input("other", "Second number", "number")), "number"),
        CustomNodeOperatorSpec("subtract", "Subtract numbers", listOf(input("value", "First number", "number"), input("other", "Second number", "number")), "number"),
        CustomNodeOperatorSpec("multiply", "Multiply numbers", listOf(input("value", "First number", "number"), input("other", "Second number", "number")), "number"),
        CustomNodeOperatorSpec("divide", "Divide numbers", listOf(input("value", "Numerator", "number"), input("other", "Denominator", "number")), "number"),
        CustomNodeOperatorSpec("and", "Boolean AND", listOf(input("value", "First value", "boolean"), input("other", "Second value", "boolean")), "boolean"),
        CustomNodeOperatorSpec("or", "Boolean OR", listOf(input("value", "First value", "boolean"), input("other", "Second value", "boolean")), "boolean"),
        CustomNodeOperatorSpec("not", "Boolean NOT", listOf(input("value", "Value", "boolean")), "boolean"),
        CustomNodeOperatorSpec("choose", "Choose between two text values", listOf(input("condition", "Condition", "boolean"), input("yes", "When true", "string"), input("no", "When false", "string")), "string")
    )

    fun find(operatorId: String): CustomNodeOperatorSpec? =
        operators.firstOrNull { it.id == operatorId }
}
