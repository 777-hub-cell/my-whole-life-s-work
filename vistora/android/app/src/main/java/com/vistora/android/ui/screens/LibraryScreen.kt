package com.vistora.android.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
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
    onGridColumns: () -> Unit
) {
    var query by remember { mutableStateOf("") }
    var showSearch by remember { mutableStateOf(true) }
    val filtered = remember(items, query, filters, sort) {
        val base = items.asSequence()
            .filter { filters.types.isEmpty() || it.type in filters.types }
            .filter { filters.statuses.isEmpty() || it.status in filters.statuses }
            .filter { filters.minimumRating == 0 || it.rating >= filters.minimumRating }
            .filter { !filters.watchlistOnly || it.isWatchlisted }
            .filter { query.isBlank() || it.title.contains(query.trim(), ignoreCase = true) || it.genres.any { g -> g.contains(query.trim(), true) } }
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

    Box(Modifier.fillMaxSize()) {
    Column(Modifier.fillMaxSize().padding(horizontal = 20.dp)) {
        Row(
            Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("My Library", color = VistoraPalette.Text, style = androidx.compose.material3.MaterialTheme.typography.headlineLarge)
            Row(verticalAlignment = Alignment.CenterVertically) {
                HeaderAction("search", "Search") { showSearch = !showSearch; if (!showSearch) query = "" }
                HeaderAction("filter", "Filters", onFilters)
            }
        }
        if (showSearch) {
            VistoraTextField(query, { query = it }, "Search your library", Modifier.fillMaxWidth())
            Spacer(Modifier.height(13.dp))
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                when {
                    filtered.isEmpty() && items.isEmpty() -> "Your collection"
                    filtered.isEmpty() -> "No matching titles"
                    else -> "Your collection"
                },
                color = VistoraPalette.Secondary, fontSize = 14.sp, fontWeight = FontWeight.Medium
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(sort, color = VistoraPalette.Muted, fontSize = 12.sp,
                    modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(onClick = onSortChange).padding(horizontal = 5.dp, vertical = 8.dp))
                Box(Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).clickable(onClick = onGridColumns), contentAlignment = Alignment.Center) {
                    VistoraIcon("grid", Modifier.size(19.dp), VistoraPalette.Secondary)
                }
            }
        }
        if (filters.types.isNotEmpty() || filters.statuses.isNotEmpty() || filters.minimumRating > 0 || filters.watchlistOnly) {
            Text(
                buildList {
                    filters.types.forEach { add(it.category) }
                    filters.statuses.forEach { add(it.label) }
                    if (filters.minimumRating > 0) add("${filters.minimumRating}+ stars")
                    if (filters.watchlistOnly) add("Watchlist")
                }.joinToString(" · "),
                color = VistoraPalette.Rose, fontSize = 11.sp, modifier = Modifier.padding(top = 3.dp)
            )
        }
        Spacer(Modifier.height(12.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(VistoraPalette.LineStrong))
        Spacer(Modifier.height(14.dp))
        if (filtered.isEmpty()) {
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        if (items.isEmpty()) "Your library starts here." else "No titles match these filters.",
                        color = VistoraPalette.Text, style = androidx.compose.material3.MaterialTheme.typography.titleLarge
                    )
                    Text(
                        if (items.isEmpty()) "Add a film or series to begin building your collection." else "Try another search or adjust your filters.",
                        color = VistoraPalette.Muted, fontSize = 14.sp
                    )
                    if (items.isEmpty()) {
                        Row(
                            Modifier.clip(RoundedCornerShape(13.dp)).background(VistoraPalette.Burgundy).clickable(onClick = onAdd)
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            VistoraIcon("plus", Modifier.size(18.dp), VistoraPalette.OnAccent)
                            Spacer(Modifier.width(7.dp))
                            Text("Add your first title", color = VistoraPalette.OnAccent, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(gridColumns.coerceIn(2, 5)),
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(bottom = 28.dp),
                horizontalArrangement = Arrangement.spacedBy(if (gridColumns >= 4) 8.dp else 12.dp),
                verticalArrangement = Arrangement.spacedBy(if (gridColumns >= 4) 14.dp else 18.dp)
            ) {
                items(filtered, key = { it.id }, contentType = { "media-poster" }) { item ->
                    PosterTile(item, { onOpenTitle(item.id) }, showStatus = true)
                }
            }
        }
    }
        if (items.isNotEmpty()) {
            Row(
                Modifier.align(Alignment.BottomEnd).padding(end=20.dp,bottom=18.dp)
                    .size(58.dp).clip(RoundedCornerShape(19.dp)).background(VistoraPalette.Burgundy)
                    .clickable(role=Role.Button,onClick=onAdd)
                    .semantics { contentDescription = "Add a title to your library" },
                verticalAlignment=Alignment.CenterVertically,
                horizontalArrangement=Arrangement.Center
            ) {
                VistoraIcon("plus",Modifier.size(26.dp),VistoraPalette.OnAccent)
            }
        }
    }
}

@Composable
private fun HeaderAction(icon: String, label: String, onClick: () -> Unit) {
    Column(
        Modifier.width(46.dp).height(48.dp).clip(RoundedCornerShape(10.dp)).clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        VistoraIcon(icon, Modifier.size(20.dp), VistoraPalette.Secondary)
        Text(label, color = VistoraPalette.Muted, fontSize = 9.sp)
    }
}
