package com.aharane.studio.features.commands

import androidx.compose.ui.geometry.Offset
import org.junit.Assert.assertEquals
import org.junit.Test

class VisualCommandBuilderLayoutTest {
    @Test
    fun movingOneNodeDoesNotChangeAnotherNodesCanvasPosition() {
        val first = VisualNode(type = "trigger.command", x = 24f, y = 70f)
        val second = VisualNode(type = "message.sendText", x = 258f, y = 110f)
        val secondBefore = workspaceNodeOffset(second)

        val movedFirst = first.copy(x = 300f, y = 520f)

        assertEquals(Offset(306f, 158f), secondBefore)
        assertEquals(secondBefore, workspaceNodeOffset(second))
        assertEquals(Offset(348f, 568f), workspaceNodeOffset(movedFirst))
    }
}
