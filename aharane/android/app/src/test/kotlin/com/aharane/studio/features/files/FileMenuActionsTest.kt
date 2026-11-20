package com.aharane.studio.features.files

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FileMenuActionsTest {
    @Test
    fun popupMatchesTheWebStudioActionOrderAndLabels() {
        val actions = fileMenuActionSpecs()
        assertEquals(
            listOf("Rename", "Duplicate", "Move", "Download as ZIP", "Delete"),
            actions.map { it.label }
        )
        assertEquals(
            listOf("rename", "duplicate", "move", "download_zip", "delete"),
            actions.map { it.key }
        )
        assertTrue(actions.last().destructive)
        assertTrue(actions.dropLast(1).none { it.destructive })
    }

    @Test
    fun openingAnEntryIsNotAContextMenuAction() {
        assertTrue(fileMenuActionSpecs().none { it.key == "open" || it.label == "Open" })
    }
}
