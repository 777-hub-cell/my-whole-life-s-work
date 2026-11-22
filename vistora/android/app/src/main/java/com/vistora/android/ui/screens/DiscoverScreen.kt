package com.vistora.android.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vistora.android.domain.CatalogResult
import com.vistora.android.domain.CatalogSearchState
import com.vistora.android.domain.MediaItem
import com.vistora.android.domain.MediaType
import com.vistora.android.domain.SeriesState
import com.vistora.android.ui.components.PosterArt
import com.vistora.android.ui.components.VistoraIcon
import com.vistora.android.ui.components.VistoraTextField
import com.vistora.android.ui.theme.VistoraPalette

private val offlineSuggestions = listOf(
    MediaItem(title = "Spirited Away", type = MediaType.ANIME, releaseYear = 2001, genres = listOf("Fantasy", "Adventure"), synopsis = "A young girl enters a mysterious world of spirits."),
    MediaItem(title = "Interstellar", type = MediaType.MOVIE, releaseYear = 2014, genres = listOf("Sci-Fi", "Drama"), synopsis = "A crew searches for a new home beyond Earth."),
    MediaItem(title = "Crash Landing on You", type = MediaType.K_DRAMA, releaseYear = 2019, totalEpisodes = 16, seriesState = SeriesState.COMPLETED, genres = listOf("Romance", "Drama"), synopsis = "A sudden accident brings two very different lives together."),
    MediaItem(title = "Stranger Things", type = MediaType.TV_SERIES, releaseYear = 2016, totalEpisodes = 34, seriesState = SeriesState.ONGOING, genres = listOf("Mystery", "Sci-Fi"), synopsis = "A small town hides something extraordinary."),
    MediaItem(title = "Your Name", type = MediaType.ANIME, releaseYear = 2016, genres = listOf("Romance", "Fantasy"), synopsis = "Two strangers begin to share an impossible connection."),
    MediaItem(title = "The Bear", type = MediaType.TV_SERIES, releaseYear = 2022, totalEpisodes = 28, seriesState = SeriesState.ONGOING, genres = listOf("Drama"), synopsis = "A young chef returns home to take over a family restaurant.")
)

@Composable
fun DiscoverScreen(
    library: List<MediaItem>,
    searchState: CatalogSearchState,
    tmdbConfigured: Boolean,
    onSearch: (String, MediaType?) -> Unit,
    onClearSearch: () -> Unit,
    onAdd: (CatalogResult) -> Unit
) {
    var query by remember { mutableStateOf("") }
    var selectedType by remember { mutableStateOf<MediaType?>(null) }
    val alreadyAdded = remember(library) { library.map { it.type to it.title.lowercase() }.toSet() }
    val localSuggestions = remember(selectedType, alreadyAdded) {
        offlineSuggestions.filter { item ->
            (selectedType == null || item.type == selectedType) &&
                (item.type to item.title.lowercase()) !in alreadyAdded
        }
    }
    val liveResults = remember(searchState.results, selectedType, alreadyAdded) {
        searchState.results.filter { result ->
            (selectedType == null || result.type == selectedType) &&
                (result.type to result.title.lowercase()) !in alreadyAdded
        }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp).padding(top = 8.dp, bottom = 28.dp)
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Discover", color = VistoraPalette.Text, style = androidx.compose.material3.MaterialTheme.typography.headlineLarge)
            Box(
                Modifier.clip(RoundedCornerShape(6.dp))
                    .background(VistoraPalette.Raised)
                    .padding(horizontal = 8.dp, vertical = 4.dp)
            ) {
                Text(if (tmdbConfigured) "LIVE" else "PREVIEW", color = VistoraPalette.Muted, fontSize = 10.sp, fontWeight = FontWeight.Medium, letterSpacing = 1.sp)
            }
        }

        Spacer(Modifier.height(16.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            VistoraTextField(query, { query = it }, "Search movies, dramas, anime, series", Modifier.weight(1f))
            Box(
                Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)).background(VistoraPalette.Burgundy)
                    .clickable(role = Role.Button, onClick = { onSearch(query, selectedType) }),
                contentAlignment = Alignment.Center
            ) {
                VistoraIcon("search", Modifier.size(21.dp), VistoraPalette.OnAccent)
            }
        }

        Spacer(Modifier.height(13.dp))
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            TypeChip("All", selectedType == null) { selectedType = null; if (query.isNotBlank()) onSearch(query, null) }
            MediaType.entries.forEach { type ->
                TypeChip(type.category, selectedType == type) {
                    selectedType = type
                    if (query.isNotBlank()) onSearch(query, type)
                }
            }
        }

        if (searchState.error != null) {
            Spacer(Modifier.height(14.dp))
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(VistoraPalette.DroppedSurface).padding(14.dp)) {
                Text("Search couldn’t be completed", color = VistoraPalette.DroppedText, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Text(searchState.error, color = VistoraPalette.Secondary, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(top = 4.dp))
            }
        }

        if (query.isNotBlank()) {
            Spacer(Modifier.height(18.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(if (searchState.isLoading) "Searching…" else "${liveResults.size} results", color = VistoraPalette.Text, style = TextStyle(fontFamily = FontFamily.Serif, fontSize = 24.sp))
                Text("Clear", color = VistoraPalette.Rose, fontSize = 13.sp, modifier = Modifier.clickable { query = ""; onClearSearch() }.padding(8.dp))
            }
            if (searchState.isLoading) {
                Text("Searching the selected catalogue…", color = VistoraPalette.Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 16.dp))
            } else if (liveResults.isEmpty() && searchState.error == null) {
                Text("No matches. Try another title or genre.", color = VistoraPalette.Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 16.dp))
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(top = 10.dp)) {
                    liveResults.forEach { result -> CatalogResultRow(result) { onAdd(result) } }
                }
            }
        } else {
            if (localSuggestions.isNotEmpty()) {
                Spacer(Modifier.height(18.dp))
                EditorialSectionHeading("Picked for tonight")
                Spacer(Modifier.height(12.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(localSuggestions.take(4), key = { "featured-${it.type.name}-${it.title}" }) { item ->
                        FeaturedSuggestion(item) {
                            onAdd(item.toCatalogResult())
                        }
                    }
                }

                val grouped = localSuggestions.flatMap { item -> item.genres.map { genre -> genre to item } }
                    .groupBy({ it.first }, { it.second })
                    .entries.sortedByDescending { entry -> entry.value.size }

                grouped.take(5).forEach { (genre, titles) ->
                    Spacer(Modifier.height(26.dp))
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        EditorialSectionHeading(genre)
                        Text("${titles.size} titles", color = VistoraPalette.Muted, fontSize = 12.sp)
                    }
                    Spacer(Modifier.height(12.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(titles.distinctBy { it.title }.take(8), key = { "shelf-$genre-${it.title}" }) { item ->
                            SuggestionPoster(item) { onAdd(item.toCatalogResult()) }
                        }
                    }
                }
            } else {
                Spacer(Modifier.height(26.dp))
                Text("Nothing to show in this category right now.", color = VistoraPalette.Muted, fontSize = 13.sp)
            }
            if (!tmdbConfigured) {
                Spacer(Modifier.height(24.dp))
                Text(
                    "Preview suggestions are examples, not items in your library. Connect your TMDB key in Settings for live film and TV discovery; anime search uses AniList.",
                    color = VistoraPalette.Muted,
                    fontSize = 11.sp,
                    lineHeight = 17.sp
                )
            }
        }
    }
}

private fun MediaItem.toCatalogResult() = CatalogResult(
    providerId = "offline-${type.name}-$title",
    title = title,
    type = type,
    releaseYear = releaseYear,
    totalEpisodes = totalEpisodes,
    seriesState = seriesState,
    synopsis = synopsis,
    genres = genres,
    posterUrl = posterPath,
    source = "VISTORA preview"
)

@Composable
private fun EditorialSectionHeading(title: String) {
    Text(title, color = VistoraPalette.Text, style = TextStyle(fontFamily = FontFamily.Serif, fontSize = 24.sp, lineHeight = 29.sp, fontWeight = FontWeight.Medium))
}

@Composable
private fun FeaturedSuggestion(item: MediaItem, onAdd: () -> Unit) {
    val colors = when (item.type) {
        MediaType.K_DRAMA -> listOf(Color(0xFF5B3456), Color(0xFF29212D))
        MediaType.ANIME -> listOf(Color(0xFF335365), Color(0xFF1C252D))
        MediaType.MOVIE -> listOf(Color(0xFF31505B), Color(0xFF1B2429))
        MediaType.TV_SERIES -> listOf(Color(0xFF5B4B31), Color(0xFF28231F))
    }
    Box(
        Modifier.width(322.dp).height(270.dp).clip(RoundedCornerShape(19.dp))
            .background(Brush.linearGradient(colors))
    ) {
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(Color.White.copy(alpha = .10f), radius = size.width * .36f, center = Offset(size.width * .72f, size.height * .28f))
            drawCircle(Color.White.copy(alpha = .06f), radius = size.width * .58f, center = Offset(size.width * .78f, size.height * .34f))
            drawCircle(Color.Black.copy(alpha = .10f), radius = size.width * .52f, center = Offset(size.width * .04f, size.height * .92f))
            drawRect(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = .68f))))
        }
        Box(
            Modifier.align(Alignment.TopStart).padding(14.dp).clip(RoundedCornerShape(999.dp))
                .background(Color.Black.copy(alpha = .34f)).padding(horizontal = 11.dp, vertical = 5.dp)
        ) {
            Text("${item.type.category}  ·  ${item.genres.firstOrNull() ?: "Featured"}", color = VistoraPalette.OnAccent, fontSize = 11.sp, fontWeight = FontWeight.Medium)
        }
        Column(
            Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(17.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            Text(item.title, color = Color.White, style = TextStyle(fontFamily = FontFamily.Serif, fontSize = 27.sp, lineHeight = 29.sp, fontWeight = FontWeight.Medium), maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(item.synopsis ?: "", color = Color.White.copy(alpha = .88f), fontSize = 12.sp, lineHeight = 17.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Text(listOfNotNull(item.releaseYear?.toString(), item.totalEpisodes.takeIf { it > 0 }?.let { "$it episodes" }).joinToString("  ·  "), color = Color.White.copy(alpha = .78f), fontSize = 11.sp)
                AddPill(onAdd)
            }
        }
    }
}

@Composable
private fun SuggestionPoster(item: MediaItem, onAdd: () -> Unit) {
    Column(Modifier.width(112.dp)) {
        Box {
            PosterArt(item.title, item.type.category, item.posterPath, Modifier.fillMaxWidth())
            Box(
                Modifier.align(Alignment.BottomEnd).padding(6.dp).size(31.dp)
                    .clip(RoundedCornerShape(999.dp)).background(VistoraPalette.Burgundy)
                    .clickable(role = Role.Button, onClick = onAdd),
                contentAlignment = Alignment.Center
            ) { VistoraIcon("plus", Modifier.size(16.dp), VistoraPalette.OnAccent) }
        }
        Text(item.title, color = VistoraPalette.Text, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 7.dp))
        Text(item.releaseYear?.toString() ?: item.type.category, color = VistoraPalette.Muted, fontSize = 11.sp)
    }
}

@Composable
private fun CatalogResultRow(result: CatalogResult, onAdd: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        PosterArt(result.title, result.type.category, result.posterUrl, Modifier.width(72.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(result.title, color = VistoraPalette.Text, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 19.sp)
            Text(listOfNotNull(result.type.category, result.releaseYear?.toString(), result.totalEpisodes.takeIf { it > 0 }?.let { "$it episodes" }).joinToString(" · "), color = VistoraPalette.Muted, fontSize = 11.sp)
            Text(result.genres.take(3).joinToString(" · "), color = VistoraPalette.Secondary, fontSize = 11.sp, maxLines = 1)
        }
        AddPill(onAdd)
    }
}

@Composable
private fun AddPill(onClick: () -> Unit) {
    Row(
        Modifier.height(38.dp).clip(RoundedCornerShape(999.dp)).background(VistoraPalette.Burgundy)
            .clickable(role = Role.Button, onClick = onClick).padding(horizontal = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        VistoraIcon("plus", Modifier.size(15.dp), VistoraPalette.OnAccent)
        Text("Add", color = VistoraPalette.OnAccent, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun TypeChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        label,
        modifier = Modifier.clip(RoundedCornerShape(999.dp))
            .background(if (selected) VistoraPalette.Burgundy else VistoraPalette.Surface)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 13.dp, vertical = 9.dp),
        color = if (selected) VistoraPalette.OnAccent else VistoraPalette.Secondary,
        fontSize = 12.sp,
        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium
    )
}
