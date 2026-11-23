package com.vistora.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vistora.android.domain.LibraryStatus
import com.vistora.android.domain.MediaItem
import com.vistora.android.domain.MediaType
import com.vistora.android.ui.components.PosterArt
import com.vistora.android.ui.components.SectionHeading
import com.vistora.android.ui.components.VistoraIcon
import com.vistora.android.ui.theme.VistoraPalette

@Composable
fun HomeScreen(
    items: List<MediaItem>,
    onSearch: () -> Unit,
    onNotifications: () -> Unit,
    onOpenTitle: (Long) -> Unit,
    onDiscover: () -> Unit,
    onOpenCategory: (MediaType) -> Unit,
    onOpenStatus: (LibraryStatus) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(top = 4.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                "VISTORA",
                color = VistoraPalette.Text,
                style = TextStyle(
                    fontFamily = FontFamily.Serif,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Medium,
                    letterSpacing = 4.2.sp
                )
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                HeaderIcon("search", "Search", onSearch)
                HeaderIcon("bell", "Notifications", onNotifications)
            }
        }

        Column(modifier = Modifier.padding(bottom = 25.dp)) {
            Text(
                "What you’ve watched,",
                color = VistoraPalette.Text,
                style = TextStyle(
                    fontFamily = FontFamily.Serif,
                    fontSize = 27.sp,
                    lineHeight = 31.sp,
                    fontWeight = FontWeight.Medium,
                    letterSpacing = (-.35).sp
                )
            )
            Text(
                "and what’s next.",
                color = VistoraPalette.Rose,
                style = TextStyle(
                    fontFamily = FontFamily.Serif,
                    fontSize = 27.sp,
                    lineHeight = 32.sp,
                    fontStyle = FontStyle.Italic,
                    fontWeight = FontWeight.Normal,
                    letterSpacing = (-.4).sp
                )
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                "Find something to watch",
                color = VistoraPalette.Text,
                style = TextStyle(fontFamily = FontFamily.Serif, fontSize = 24.sp, fontWeight = FontWeight.Medium)
            )
            Text(
                "Open Discover",
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(role = Role.Button, onClick = onDiscover)
                    .padding(start = 8.dp, top = 7.dp, bottom = 7.dp),
                color = VistoraPalette.Muted,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CategoryTile("Movies", "clap", Modifier.weight(1f)) { onOpenCategory(MediaType.MOVIE) }
                CategoryTile("K-Dramas", "heart", Modifier.weight(1f)) { onOpenCategory(MediaType.K_DRAMA) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CategoryTile("Anime", "torii", Modifier.weight(1f)) { onOpenCategory(MediaType.ANIME) }
                CategoryTile("TV Series", "tv", Modifier.weight(1f)) { onOpenCategory(MediaType.TV_SERIES) }
            }
        }

        StatusShelf("Currently watching", LibraryStatus.WATCHING, items, onOpenTitle, onOpenStatus)
        StatusShelf("Plan to watch", LibraryStatus.PLAN_TO_WATCH, items, onOpenTitle, onOpenStatus)
        StatusShelf("On hold", LibraryStatus.ON_HOLD, items, onOpenTitle, onOpenStatus)
        StatusShelf("Recently finished", LibraryStatus.COMPLETED, items, onOpenTitle, onOpenStatus)

        if (items.isEmpty()) {
            Column(
                Modifier.fillMaxWidth().padding(top = 26.dp, bottom = 24.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(VistoraPalette.Surface)
                    .padding(horizontal = 20.dp, vertical = 22.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("Nothing here yet", color = VistoraPalette.Text,
                    style = TextStyle(fontFamily = FontFamily.Serif, fontSize = 23.sp, fontWeight = FontWeight.Medium))
                Text(
                    "Pick a category above, or add a title from your library.",
                    color = VistoraPalette.Muted, fontSize = 13.sp, lineHeight = 19.sp,
                    modifier = Modifier.padding(top = 6.dp)
                )
            }
        } else {
            Spacer(Modifier.height(18.dp))
        }
    }
}

@Composable
private fun HeaderIcon(name: String, description: String, onClick: () -> Unit) {
    Box(
        Modifier.size(44.dp)
            .semantics { contentDescription = description; role = Role.Button }
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        VistoraIcon(name, Modifier.size(22.dp), VistoraPalette.Text)
    }
}

@Composable
private fun CategoryTile(label: String, icon: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier = modifier
            .heightIn(min = 112.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(VistoraPalette.Surface)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(16.dp),
        verticalArrangement = Arrangement.SpaceBetween,
        horizontalAlignment = Alignment.Start
    ) {
        Box(
            Modifier.size(44.dp).clip(RoundedCornerShape(14.dp))
                .background(VistoraPalette.Rose.copy(alpha = .13f)),
            contentAlignment = Alignment.Center
        ) {
            VistoraIcon(icon, Modifier.size(22.dp), VistoraPalette.Rose)
        }
        Column(modifier = Modifier.padding(top = 16.dp)) {
            Text(
                label,
                color = VistoraPalette.Text,
                style = TextStyle(fontFamily = FontFamily.Serif, fontSize = 21.sp, lineHeight = 23.sp, fontWeight = FontWeight.Medium),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text("Explore new", color = VistoraPalette.Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 2.dp))
        }
    }
}

@Composable
private fun StatusShelf(
    title: String,
    status: LibraryStatus,
    items: List<MediaItem>,
    onOpenTitle: (Long) -> Unit,
    onSeeAll: (LibraryStatus) -> Unit
) {
    val shelf = items.asSequence().filter { it.status == status }
        .sortedByDescending { it.updatedAt }.take(12).toList()
    if (shelf.isEmpty()) return

    Column(modifier = Modifier.padding(top = 28.dp)) {
        SectionHeading(title, "View all", onAction = { onSeeAll(status) })
        LazyRow(
            modifier = Modifier.padding(top = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(end = 4.dp)
        ) {
            items(shelf, key = { it.id }) { item ->
                Column(
                    Modifier.width(112.dp).clickable(role = Role.Button) { onOpenTitle(item.id) }
                ) {
                    PosterArt(item.title, item.type.category, item.posterPath, Modifier.fillMaxWidth())
                    Text(
                        item.title,
                        modifier = Modifier.padding(top = 8.dp),
                        color = VistoraPalette.Text,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    val detail = when {
                        item.isEpisodic && item.watchedEpisodes > 0 -> "${item.type.label} · Ep ${item.watchedEpisodes}"
                        item.releaseYear != null -> "${item.type.label} · ${item.releaseYear}"
                        else -> item.type.label
                    }
                    Text(detail, color = VistoraPalette.Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}
