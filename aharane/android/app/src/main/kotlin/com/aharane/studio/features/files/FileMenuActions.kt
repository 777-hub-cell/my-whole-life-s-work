package com.aharane.studio.features.files

/**
 * The row popup is deliberately identical for files and folders, matching
 * the web Studio. Opening an entry is a row-tap action, not a popup action.
 */
internal data class FileMenuActionSpec(
    val key: String,
    val label: String,
    val destructive: Boolean = false
)

internal fun fileMenuActionSpecs(): List<FileMenuActionSpec> = listOf(
    FileMenuActionSpec(key = "rename", label = "Rename"),
    FileMenuActionSpec(key = "duplicate", label = "Duplicate"),
    FileMenuActionSpec(key = "move", label = "Move"),
    FileMenuActionSpec(key = "download_zip", label = "Download as ZIP"),
    FileMenuActionSpec(key = "delete", label = "Delete", destructive = true)
)
