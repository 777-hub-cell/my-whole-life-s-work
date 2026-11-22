package com.vistora.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import com.vistora.android.domain.MediaItem
import com.vistora.android.domain.MediaType
import com.vistora.android.ui.components.PosterTile
import com.vistora.android.ui.components.VistoraIcon
import com.vistora.android.ui.theme.VistoraPalette

@Composable
fun HomeScreen(
    items: List<MediaItem>,
    onSearch: () -> Unit,
    onNotifications: () -> Unit,
    onOpenTitle: (Long) -> Unit,
    onOpenWatchlist: () -> Unit,
    onOpenCategory: (MediaType) -> Unit
) {
    val watchlist = items.filter { it.isWatchlisted }.sortedByDescending { it.updatedAt }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
            .padding(bottom = 22.dp)
    ) {
        // The wordmark is deliberately typographic: the reference has no app-logo tile.
        Row(
            modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(top = 7.dp, bottom = 9.dp),
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
                    letterSpacing = 3.4.sp
                )
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                HeaderIcon("search", "Search", onSearch)
                HeaderIcon("bell", "Notifications", onNotifications)
            }
        }

        Column(modifier = Modifier.padding(top = 2.dp, bottom = 24.dp)) {
            Text(
                "What you’ve watched,",
                color = VistoraPalette.Text,
                style = TextStyle(
                    fontFamily = FontFamily.Serif,
                    fontSize = 26.sp,
                    lineHeight = 30.sp,
                    fontWeight = FontWeight.Medium,
                    letterSpacing = (-0.35).sp
                )
            )
            Text(
                "and what’s next.",
                color = VistoraPalette.Rose,
                style = TextStyle(
                    fontFamily = FontFamily.Serif,
                    fontSize = 26.sp,
                    lineHeight = 30.sp,
                    fontStyle = FontStyle.Italic,
                    fontWeight = FontWeight.Normal,
                    letterSpacing = (-0.35).sp
                )
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 13.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                "Find something to watch",
                color = VistoraPalette.Text,
                style = TextStyle(fontFamily = FontFamily.Serif, fontSize = 24.sp, lineHeight = 29.sp, fontWeight = FontWeight.Medium),
                modifier = Modifier.weight(1f)
            )
            Text(
                "Open Discover",
                color = VistoraPalette.Muted,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(onClick = onSearch)
                    .padding(start = 8.dp, top = 8.dp, bottom = 8.dp)
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

        Spacer(Modifier.height(24.dp))

        if (watchlist.isNotEmpty()) {
            Row(
                Modifier.fillMaxWidth().padding(bottom = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    "My Watchlist",
                    color = VistoraPalette.Text,
                    style = TextStyle(fontFamily = FontFamily.Serif, fontSize = 24.sp, lineHeight = 29.sp, fontWeight = FontWeight.Medium)
                )
                Text(
                    "View all",
                    color = VistoraPalette.Muted,
                    fontSize = 14.sp,
                    modifier = Modifier.clickable(onClick = onOpenWatchlist).padding(vertical = 8.dp, horizontal = 4.dp)
                )
            }
            LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                items(watchlist.take(12), key = { it.id }) { item ->
                    PosterTile(item, { onOpenTitle(item.id) }, Modifier.width(112.dp), showStatus = false)
                }
            }
        } else {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(VistoraPalette.Surface)
                    .border(1.dp, VistoraPalette.LineStrong.copy(alpha = .72f), RoundedCornerShape(16.dp))
                    .padding(horizontal = 16.dp, vertical = 20.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Text(
                    "Nothing in progress yet. Pick a category above, or add a title from your library.",
                    color = VistoraPalette.Muted,
                    fontSize = 14.sp,
                    lineHeight = 21.sp,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
            }
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
        VistoraIcon(name, Modifier.size(21.dp), VistoraPalette.Text)
    }
}

@Composable
private fun CategoryTile(label: String, icon: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier = modifier
            .height(138.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(VistoraPalette.Surface)
            .border(1.dp, VistoraPalette.Line, RoundedCornerShape(16.dp))
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = "Explore $label"; role = Role.Button }
            .padding(16.dp),
        verticalArrangement = Arrangement.Top,
        horizontalAlignment = Alignment.Start
    ) {
        Box(
            Modifier.size(44.dp).clip(RoundedCornerShape(14.dp))
                .background(VistoraPalette.Rose.copy(alpha = .12f)),
            contentAlignment = Alignment.Center
        ) {
            VistoraIcon(icon, Modifier.size(22.dp), VistoraPalette.Rose)
        }
        Spacer(Modifier.height(18.dp))
        Text(
            label,
            color = VistoraPalette.Text,
            style = TextStyle(fontFamily = FontFamily.Serif, fontSize = 22.sp, lineHeight = 25.sp, fontWeight = FontWeight.Medium),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Text("Explore new", color = VistoraPalette.Muted, fontSize = 12.sp, lineHeight = 17.sp)
    }
}

import androidx.compose.ui.draw.clip
