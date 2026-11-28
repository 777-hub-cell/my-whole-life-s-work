package com.aharane.studio.features.commands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CustomNodeOperatorCatalogTest {
    @Test
    fun catalogueExposesEverySafeServerCustomNodeOperator() {
        val expected = setOf(
            "concat", "uppercase", "lowercase", "trim", "equals", "contains",
            "add", "subtract", "multiply", "divide", "and", "or", "not",
            "length", "split", "join", "choose"
        )
        assertEquals(expected, CustomNodeOperatorCatalog.operators.map { it.id }.toSet())
    }

    @Test
    fun everyOperatorHasUniqueTypedPortsAndAValidOutputType() {
        val validTypes = setOf("string", "number", "boolean", "list")
        CustomNodeOperatorCatalog.operators.forEach { operator ->
            assertTrue(operator.id.isNotBlank())
            assertTrue(operator.label.isNotBlank())
            assertTrue(operator.outputType in validTypes)
            assertEquals(
                "Input IDs must be unique for ${operator.id}",
                operator.inputs.size,
                operator.inputs.map { it.id }.toSet().size
            )
            operator.inputs.forEach { port ->
                assertTrue("${operator.id} has an invalid input type", port.type in validTypes)
            }
        }
    }

    @Test
    fun chooseNodeHasExplicitTypedTrueAndFalseBranches() {
        val choose = CustomNodeOperatorCatalog.find("choose")!!
        assertEquals(listOf("boolean", "string", "string"), choose.inputs.map { it.type })
        assertEquals(listOf("condition", "yes", "no"), choose.inputs.map { it.id })
        assertEquals("string", choose.outputType)
    }
}
