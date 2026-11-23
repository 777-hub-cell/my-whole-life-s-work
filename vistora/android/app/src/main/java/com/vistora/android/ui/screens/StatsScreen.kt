package com.vistora.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vistora.android.domain.LibraryStatus
import com.vistora.android.domain.MediaItem
import com.vistora.android.domain.MediaType
import com.vistora.android.ui.components.SectionHeading
import com.vistora.android.ui.theme.VistoraPalette
import java.util.Locale

@Composable
fun StatsScreen(items: List<MediaItem>) {
    val completed = items.count { it.status == LibraryStatus.COMPLETED }
    val watching = items.count { it.status == LibraryStatus.WATCHING }
    val watchedAndFilms = items.sumOf { it.watchedEpisodes } +
        items.count { it.type == MediaType.MOVIE && it.status == LibraryStatus.COMPLETED }
    val ratings = items.map { it.rating }.filter { it > 0 }
    val average = if (ratings.isEmpty()) "–" else String.format(Locale.getDefault(), "%.1f", ratings.average())
    val statusCounts = LibraryStatus.entries.map { it to items.count { item -> item.status == it } }
    val typeCounts = MediaType.entries.map { it to items.count { item -> item.type == it } }
    val genres = items.flatMap { item -> item.genres.map(String::trim) }.filter(String::isNotBlank)
    val genreLabels = genres.distinctBy { it.lowercase(Locale.ROOT) }.associateBy { it.lowercase(Locale.ROOT) }
    val topGenres = genres.groupingBy { it.lowercase(Locale.ROOT) }.eachCount().entries
        .sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key })
        .take(5).map { (key, count) -> (genreLabels[key] ?: key) to count }
    val ratingCounts = (5 downTo 1).map { score -> score to ratings.count { it == score } }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp).padding(top = 8.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(22.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("Stats", color = VistoraPalette.Text,
                style = TextStyle(fontFamily = FontFamily.Serif, fontSize = 36.sp, lineHeight = 40.sp, fontWeight = FontWeight.Medium))
        }

        if (items.isEmpty()) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(VistoraPalette.Surface)
                    .padding(22.dp),
                verticalArrangement = Arrangement.spacedBy(7.dp)
            ) {
                Text("Your story starts here.", color = VistoraPalette.Text,
                    style = TextStyle(fontFamily = FontFamily.Serif, fontSize = 24.sp, fontWeight = FontWeight.Medium))
                Text("As you add and complete titles, your personal statistics will appear here.",
                    color = VistoraPalette.Muted, fontSize = 13.sp, lineHeight = 19.sp)
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatTile("Completed", completed.toString(), Modifier.weight(1f))
                    StatTile("Episodes and films watched", watchedAndFilms.toString(), Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatTile("Average rating", average, Modifier.weight(1f))
                    StatTile("In progress", watching.toString(), Modifier.weight(1f))
                }
            }

            SectionHeading("By status")
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(Modifier.fillMaxWidth().height(14.dp).clip(RoundedCornerShape(7.dp)).background(VistoraPalette.Track)) {
                    statusCounts.filter { it.second > 0 }.forEach { (status, count) ->
                        Box(Modifier.weight(count.toFloat()).fillMaxHeight().background(statusColor(status)))
                    }
                }
                Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    statusCounts.forEach { (status, count) ->
                        if (count > 0) LegendRow(status.label, count, statusColor(status))
                    }
                }
            }

            SectionHeading("By type")
            Column(verticalArrangement = Arrangement.spacedBy(13.dp)) {
                typeCounts.forEach { (type, count) ->
                    DistributionRow(type.category, count, items.size, VistoraPalette.Rose)
                }
            }

            if (topGenres.isNotEmpty()) {
                SectionHeading("Top genres")
                val maxGenreCount = topGenres.maxOf { it.second }
                Column(verticalArrangement = Arrangement.spacedBy(13.dp)) {
                    topGenres.forEach { (genre, count) -> DistributionRow(genre, count, maxGenreCount, VistoraPalette.Rose) }
                }
            }

            if (ratings.isNotEmpty()) {
                SectionHeading("Your ratings")
                Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
                    ratingCounts.forEach { (score, count) ->
                        DistributionRow("$score stars", count, ratings.size, VistoraPalette.WatchingText)
                    }
                }
            }
        }
    }
}

@Composable
private fun StatTile(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier.clip(RoundedCornerShape(16.dp)).background(VistoraPalette.Surface)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp)
    ) {
        Text(value, color = VistoraPalette.Text,
            style = TextStyle(fontFamily = FontFamily.Serif, fontSize = 38.sp, lineHeight = 40.sp, fontWeight = FontWeight.Medium))
        Text(label, color = VistoraPalette.Muted, fontSize = 12.sp, lineHeight = 16.sp)
    }
}

@Composable
private fun LegendRow(label: String, value: Int, color: Color) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(10.dp).clip(RoundedCornerShape(3.dp)).background(color))
        Text(label, modifier = Modifier.padding(start = 8.dp).weight(1f), color = VistoraPalette.Secondary, fontSize = 13.sp)
        Text(value.toString(), color = VistoraPalette.Muted, fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun DistributionRow(label: String, value: Int, total: Int, color: Color) {
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, color = VistoraPalette.Secondary, fontSize = 13.sp)
            Text(value.toString(), color = VistoraPalette.Text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        }
        Box(Modifier.fillMaxWidth().height(7.dp).clip(RoundedCornerShape(7.dp)).background(VistoraPalette.Track)) {
            if (total > 0 && value > 0) {
                Box(Modifier.fillMaxWidth((value.toFloat() / total).coerceIn(0f, 1f)).fillMaxHeight()
                    .clip(RoundedCornerShape(7.dp)).background(color))
            }
        }
    }
}

private fun statusColor(status: LibraryStatus): Color = when (status) {
    LibraryStatus.WATCHING -> VistoraPalette.WatchingText
    LibraryStatus.COMPLETED -> VistoraPalette.CompletedText
    LibraryStatus.PLAN_TO_WATCH -> VistoraPalette.PlanText
    LibraryStatus.ON_HOLD -> VistoraPalette.HoldText
    LibraryStatus.DROPPED -> VistoraPalette.DroppedText
}
