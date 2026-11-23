package com.vistora.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
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
import androidx.compose.ui.text.TextStyle
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
    onDiscover: () -> Unit,
    onFilters: () -> Unit,
    onGridColumns: () -> Unit
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
            }
            .toList()
        when (sort) {
            "Title A–Z" -> base.sortedBy { it.title.lowercase() }
            "Title Z–A" -> base.sortedByDescending { it.title.lowercase() }
            "Highest rated" -> base.sortedWith(compareByDescending<MediaItem> { it.rating }.thenBy { it.title })
            "Recently added" -> base.sortedByDescending { it.addedAt }
            "Newest release" -> base.sortedByDescending { it.releaseYear ?: 0 }
            else -> base.sortedByDescending { it.updatedAt }
        }
    }
    val hasFilters = filters.types.isNotEmpty() || filters.statuses.isNotEmpty() ||
        filters.minimumRating > 0 || filters.watchlistOnly

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
            Row(
                Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    "My Library",
                    color = VistoraPalette.Text,
                    style = androidx.compose.material3.MaterialTheme.typography.headlineLarge
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    HeaderAction("search", "Search", showSearch) {
                        showSearch = !showSearch
                        if (!showSearch) query = ""
                    }
                    HeaderAction("filter", "Filters", hasFilters, onFilters)
                }
            }

            if (showSearch) {
                VistoraTextField(query, { query = it }, "Search your library", Modifier.fillMaxWidth())
                Spacer(Modifier.height(12.dp))
            }

            Row(
                Modifier.fillMaxWidth().padding(top = 5.dp, bottom = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    if (filtered.isEmpty() && (query.isNotBlank() || hasFilters)) "No matches" else "All Titles",
                    color = VistoraPalette.Text,
                    style = TextStyle(fontFamily = FontFamily.Serif, fontSize = 25.sp, lineHeight = 30.sp, fontWeight = FontWeight.Medium)
                )
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Row(
                        Modifier.clip(RoundedCornerShape(8.dp)).clickable(onClick = onSortChange)
                            .padding(horizontal = 4.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp)
                    ) {
                        Text(sort, color = VistoraPalette.Secondary, fontSize = 12.sp, maxLines = 1)
                        VistoraIcon("sort", Modifier.size(17.dp), VistoraPalette.Secondary)
                    }
                    Box(
                        Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).clickable(onClick = onGridColumns),
                        contentAlignment = Alignment.Center
                    ) {
                        VistoraIcon("grid", Modifier.size(19.dp), VistoraPalette.Secondary)
                    }
                }
            }

            if (hasFilters) {
                Text(
                    buildList {
                        filters.types.forEach { add(it.category) }
                        filters.statuses.forEach { add(it.label) }
                        if (filters.minimumRating > 0) add("${filters.minimumRating}+ stars")
                        if (filters.watchlistOnly) add("Watchlist")
                    }.joinToString("  ·  "),
                    color = VistoraPalette.Rose,
                    fontSize = 11.sp,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
            }

            if (filtered.isEmpty()) {
                if (items.isEmpty() && query.isBlank() && !hasFilters) {
                    EmptyLibrary(onAdd = onAdd, onDiscover = onDiscover, modifier = Modifier.fillMaxWidth().padding(top = 3.dp))
                } else {
                    Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(9.dp)) {
                            Text("No titles match these filters.", color = VistoraPalette.Text, style = androidx.compose.material3.MaterialTheme.typography.titleLarge)
                            Text("Try another search or adjust your filters.", color = VistoraPalette.Muted, fontSize = 14.sp)
                        }
                    }
                }
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(gridColumns.coerceIn(2, 5)),
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(top = 4.dp, bottom = 96.dp),
                    horizontalArrangement = Arrangement.spacedBy(if (gridColumns >= 4) 8.dp else 12.dp),
                    verticalArrangement = Arrangement.spacedBy(if (gridColumns >= 4) 14.dp else 18.dp)
                ) {
                    items(filtered, key = { it.id }, contentType = { "media-poster" }) { item ->
                        PosterTile(item, { onOpenTitle(item.id) }, showStatus = true)
                    }
                }
            }
        }

        // Keep the Add action discoverable even when the library is empty.
        Row(
            Modifier.align(Alignment.BottomEnd).padding(end = 2.dp, bottom = 18.dp)
                .size(58.dp).clip(RoundedCornerShape(19.dp)).background(VistoraPalette.Burgundy)
                .clickable(role = Role.Button, onClick = onAdd)
                .semantics { contentDescription = "Add a title to your library"; role = Role.Button },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            VistoraIcon("plus", Modifier.size(26.dp), VistoraPalette.OnAccent)
        }
    }
}

@Composable
private fun EmptyLibrary(onAdd: () -> Unit, onDiscover: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier.clip(RoundedCornerShape(16.dp))
            .background(VistoraPalette.Surface)
            .border(1.dp, VistoraPalette.LineStrong, RoundedCornerShape(16.dp))
            .padding(horizontal = 18.dp, vertical = 26.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(
            Modifier.size(52.dp).clip(RoundedCornerShape(16.dp)).background(VistoraPalette.Burgundy),
            contentAlignment = Alignment.Center
        ) {
            VistoraIcon("clap", Modifier.size(26.dp), VistoraPalette.OnAccent)
        }
        Text(
            "Your library is empty",
            color = VistoraPalette.Text,
            style = TextStyle(fontFamily = FontFamily.Serif, fontSize = 24.sp, lineHeight = 29.sp, fontWeight = FontWeight.Medium)
        )
        Text(
            "Add the first title you are watching, or pick something in Discover.",
            color = VistoraPalette.Muted,
            fontSize = 14.sp,
            lineHeight = 21.sp,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center
        )
        Spacer(Modifier.height(1.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            PillAction("Add a title", true, onAdd)
            PillAction("Open Discover", false, onDiscover)
        }
    }
}

@Composable
private fun PillAction(label: String, primary: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(999.dp))
            .background(if (primary) VistoraPalette.Burgundy else VistoraPalette.Raised)
            .then(if (primary) Modifier else Modifier.border(1.dp, VistoraPalette.LineStrong, RoundedCornerShape(999.dp)))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        if (primary) VistoraIcon("plus", Modifier.size(15.dp), VistoraPalette.OnAccent)
        Text(label, color = VistoraPalette.OnAccent.takeIf { primary } ?: VistoraPalette.Text, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun HeaderAction(icon: String, label: String, active: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.size(48.dp).clip(RoundedCornerShape(12.dp))
            .background(if (active) VistoraPalette.Raised else androidx.compose.ui.graphics.Color.Transparent)
            .semantics { contentDescription = label; role = Role.Button }
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        VistoraIcon(icon, Modifier.size(21.dp), if (active) VistoraPalette.Rose else VistoraPalette.Text)
    }
}
