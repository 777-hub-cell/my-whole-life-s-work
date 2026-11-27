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

        assertEquals(Offset(2_458f, 2_310f), secondBefore)
        assertEquals(secondBefore, workspaceNodeOffset(second))
        assertEquals(Offset(2_500f, 2_720f), workspaceNodeOffset(movedFirst))
    }

    @Test
    fun zoomKeepsTheCanvasPointUnderTheFingersAtTheSameViewportPosition() {
        val oldScroll = Offset(380f, 210f)
        val oldAnchor = Offset(150f, 260f)
        val newAnchor = Offset(188f, 292f)
        val oldZoom = 1.1f
        val newZoom = 1.65f

        val newScroll = workspaceScrollForZoom(oldScroll, oldAnchor, newAnchor, oldZoom, newZoom)

        val contentPointBefore = (oldScroll + oldAnchor) / oldZoom
        val contentPointAfter = (newScroll + newAnchor) / newZoom
        assertEquals(contentPointBefore.x, contentPointAfter.x, 0.001f)
        assertEquals(contentPointBefore.y, contentPointAfter.y, 0.001f)
    }
}
