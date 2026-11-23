package com.vistora.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vistora.android.domain.LibraryStatus
import com.vistora.android.domain.MediaItem
import com.vistora.android.domain.MediaType
import com.vistora.android.ui.components.PosterTile
import com.vistora.android.ui.components.VistoraIcon
import com.vistora.android.ui.components.VistoraTextField
import com.vistora.android.ui.theme.VistoraPalette

data class LibraryFilters(
    val types: Set<MediaType> = emptySet(),
    val statuses: Set<LibraryStatus> = emptySet(),
    val minimumRating: Int = 0,
    val watchlistOnly: Boolean = false
)

@Composable
fun LibraryScreen(
    items: List<MediaItem>,
    filters: LibraryFilters,
    gridColumns: Int,
    sort: String,
    onSortChange: () -> Unit,
    onOpenTitle: (Long) -> Unit,
    onAdd: () -> Unit,
    onFilters: () -> Unit,
    onGridColumns: () -> Unit,
    onQuickStatusChange: (LibraryStatus?) -> Unit,
    onFiltersChange: (LibraryFilters) -> Unit
) {
    var query by remember { mutableStateOf("") }
    var showSearch by remember { mutableStateOf(false) }

    val filtered = remember(items, query, filters, sort) {
        val base = items.asSequence()
            .filter { filters.types.isEmpty() || it.type in filters.types }
            .filter { filters.statuses.isEmpty() || it.status in filters.statuses }
            .filter { filters.minimumRating == 0 || it.rating >= filters.minimumRating }
            .filter { !filters.watchlistOnly || it.isWatchlisted }
            .filter {
                query.isBlank() || it.title.contains(query.trim(), ignoreCase = true) ||
                    it.genres.any { genre -> genre.contains(query.trim(), true) }
            }.toList()
        when (sort) {
            "Title A–Z", "Title A to Z" -> base.sortedBy { it.title.lowercase() }
            "Title Z–A", "Title Z to A" -> base.sortedByDescending { it.title.lowercase() }
            "Highest rated" -> base.sortedWith(compareByDescending<MediaItem> { it.rating }.thenBy { it.title })
            "Recently added" -> base.sortedByDescending { it.addedAt }
            "Newest release" -> base.sortedByDescending { it.releaseYear ?: 0 }
            else -> base.sortedByDescending { it.updatedAt }
        }
    }
    val activeQuickStatus = filters.statuses.singleOrNull()?.takeIf {
        it == LibraryStatus.WATCHING || it == LibraryStatus.COMPLETED || it == LibraryStatus.PLAN_TO_WATCH
    }
    val hasExtraFilters = filters.types.isNotEmpty() ||
        filters.statuses.any { it != activeQuickStatus } ||
        filters.minimumRating > 0 || filters.watchlistOnly

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 60.dp).padding(top = 6.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    "My Library", color = VistoraPalette.Text,
                    style = androidx.compose.ui.text.TextStyle(fontFamily = FontFamily.Serif, fontSize = 36.sp, lineHeight = 40.sp, fontWeight = FontWeight.Medium)
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    HeaderIcon("search", "Search library") {
                        showSearch = !showSearch
                        if (!showSearch) query = ""
                    }
                    HeaderIcon("filter", "Filters", onFilters)
                }
            }

            if (showSearch) {
                Row(
                    Modifier.fillMaxWidth().padding(bottom = 10.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(VistoraPalette.Surface)
                        .padding(start = 13.dp, end = 5.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    VistoraIcon("search", Modifier.size(18.dp), VistoraPalette.Muted)
                    Spacer(Modifier.width(9.dp))
                    Box(Modifier.weight(1f)) {
                        VistoraTextField(query, { query = it }, "Search your library", Modifier.fillMaxWidth())
                    }
                    if (query.isNotBlank()) {
                        HeaderIcon("close", "Clear search") { query = "" }
                    }
                }
            }

            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = 2.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                QuickPill("All", activeQuickStatus == null && filters.statuses.isEmpty()) { onQuickStatusChange(null) }
                QuickPill("Watching", activeQuickStatus == LibraryStatus.WATCHING) { onQuickStatusChange(LibraryStatus.WATCHING) }
                QuickPill("Completed", activeQuickStatus == LibraryStatus.COMPLETED) { onQuickStatusChange(LibraryStatus.COMPLETED) }
                QuickPill("Plan to Watch", activeQuickStatus == LibraryStatus.PLAN_TO_WATCH) { onQuickStatusChange(LibraryStatus.PLAN_TO_WATCH) }
            }

            if (hasExtraFilters) {
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top = 7.dp),
                    horizontalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    filters.types.forEach { type ->
                        RemovableChip(type.category) { onFiltersChange(filters.copy(types = filters.types - type)) }
                    }
                    filters.statuses.filter { it != activeQuickStatus }.forEach { status ->
                        RemovableChip(status.label) { onFiltersChange(filters.copy(statuses = filters.statuses - status)) }
                    }
                    if (filters.minimumRating > 0) {
                        RemovableChip("${filters.minimumRating}+ stars") { onFiltersChange(filters.copy(minimumRating = 0)) }
                    }
                    if (filters.watchlistOnly) {
                        RemovableChip("Watchlist") { onFiltersChange(filters.copy(watchlistOnly = false)) }
                    }
                }
            }

            Row(
                Modifier.fillMaxWidth().padding(top = 16.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    "All Titles", color = VistoraPalette.Text,
                    style = androidx.compose.ui.text.TextStyle(fontFamily = FontFamily.Serif, fontSize = 24.sp, fontWeight = FontWeight.Medium)
                )
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        sort.replace("Title A–Z", "Title A to Z").replace("Title Z–A", "Title Z to A"),
                        modifier = Modifier.clip(RoundedCornerShape(9.dp)).clickable(onClick = onSortChange).padding(horizontal = 7.dp, vertical = 9.dp),
                        color = VistoraPalette.Secondary, fontSize = 13.sp, fontWeight = FontWeight.Medium
                    )
                    HeaderIcon("sort", "Sort titles", onSortChange)
                    HeaderIcon("grid", "Grid columns", onGridColumns)
                }
            }

            Box(Modifier.fillMaxWidth().height(1.dp).background(VistoraPalette.Line))
            Spacer(Modifier.height(13.dp))

            if (filtered.isEmpty()) {
                Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                    Column(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
                            .background(VistoraPalette.Surface).padding(horizontal = 20.dp, vertical = 26.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            if (items.isEmpty()) "Your library is empty" else "No matches",
                            color = VistoraPalette.Text,
                            style = androidx.compose.ui.text.TextStyle(fontFamily = FontFamily.Serif, fontSize = 24.sp, fontWeight = FontWeight.Medium)
                        )
                        Text(
                            if (items.isEmpty()) "Add the first title you are watching, or pick something in Discover."
                            else "Nothing in your library fits these filters.",
                            color = VistoraPalette.Muted, fontSize = 13.sp, lineHeight = 19.sp
                        )
                        if (items.isEmpty()) {
                            Row(
                                Modifier.padding(top = 7.dp).clip(RoundedCornerShape(999.dp))
                                    .background(VistoraPalette.Burgundy).clickable(onClick = onAdd)
                                    .padding(horizontal = 18.dp, vertical = 11.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                VistoraIcon("plus", Modifier.size(17.dp), VistoraPalette.OnAccent)
                                Spacer(Modifier.width(7.dp))
                                Text("Add a title", color = VistoraPalette.OnAccent, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                            }
                        } else {
                            Text(
                                "Clear filters",
                                modifier = Modifier.clickable { onFiltersChange(LibraryFilters()) }.padding(8.dp),
                                color = VistoraPalette.Rose, fontSize = 13.sp, fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(gridColumns.coerceIn(2, 5)),
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(bottom = 25.dp, top = 1.dp),
                    horizontalArrangement = Arrangement.spacedBy(if (gridColumns >= 4) 8.dp else 12.dp),
                    verticalArrangement = Arrangement.spacedBy(if (gridColumns >= 4) 12.dp else 18.dp)
                ) {
                    items(filtered, key = { it.id }, contentType = { "media-poster" }) { item ->
                        PosterTile(item, { onOpenTitle(item.id) }, showStatus = true, compact = gridColumns >= 4)
                    }
                }
            }
        }

        if (items.isNotEmpty()) {
            Box(
                Modifier.align(Alignment.BottomEnd).padding(end = 2.dp, bottom = 14.dp)
                    .size(58.dp).clip(RoundedCornerShape(19.dp)).background(VistoraPalette.Burgundy)
                    .clickable(role = Role.Button, onClick = onAdd)
                    .semantics { contentDescription = "Add a title"; role = Role.Button },
                contentAlignment = Alignment.Center
            ) {
                VistoraIcon("plus", Modifier.size(27.dp), VistoraPalette.OnAccent)
            }
        }
    }
}

@Composable
private fun HeaderIcon(icon: String, label: String, onClick: () -> Unit) {
    Box(
        Modifier.size(44.dp)
            .semantics { contentDescription = label; role = Role.Button }
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        VistoraIcon(icon, Modifier.size(21.dp), VistoraPalette.Text)
    }
}

@Composable
private fun QuickPill(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        label,
        modifier = Modifier.clip(RoundedCornerShape(999.dp))
            .background(if (selected) VistoraPalette.Burgundy else VistoraPalette.Surface)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 13.dp, vertical = 10.dp),
        color = if (selected) VistoraPalette.OnAccent else VistoraPalette.Secondary,
        fontSize = 13.sp,
        fontWeight = FontWeight.Medium
    )
}

@Composable
private fun RemovableChip(label: String, onRemove: () -> Unit) {
    Row(
        Modifier.clip(RoundedCornerShape(999.dp)).background(VistoraPalette.Raised)
            .padding(start = 11.dp, end = 4.dp, top = 3.dp, bottom = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        Text(label, color = VistoraPalette.Text, fontSize = 12.sp)
        Box(Modifier.size(25.dp).clip(RoundedCornerShape(50)).clickable(onClick = onRemove), contentAlignment = Alignment.Center) {
            VistoraIcon("close", Modifier.size(13.dp), VistoraPalette.Muted)
        }
    }
}
