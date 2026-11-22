package com.vistora.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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

@Composable
fun StatsScreen(items: List<MediaItem>) {
    val completed = items.count { it.status == LibraryStatus.COMPLETED }
    val watching = items.count { it.status == LibraryStatus.WATCHING }
    val episodes = items.sumOf { it.watchedEpisodes }
    val ratings = items.map { it.rating }.filter { it > 0 }
    val average = if (ratings.isEmpty()) "—" else String.format("%.1f", ratings.average())
    val statusCounts = LibraryStatus.entries.map { status -> status to items.count { it.status == status } }
    val typeCounts = MediaType.entries.map { type -> type to items.count { it.type == type } }
    val genreCounts = items.flatMap { it.genres }.groupingBy { it }.eachCount()
        .entries.sortedByDescending { it.value }.take(5)

    Column(
        Modifier.fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
            .padding(top = 8.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        Text("Stats", color = VistoraPalette.Text, style = androidx.compose.material3.MaterialTheme.typography.headlineLarge)

        Spacer(Modifier.height(18.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatTile("Completed", completed.toString(), Modifier.weight(1f))
            StatTile("Episodes and films watched", (episodes + completedFilms(items)).toString(), Modifier.weight(1f))
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatTile("Average rating", average, Modifier.weight(1f))
            StatTile("In progress", watching.toString(), Modifier.weight(1f))
        }

        Spacer(Modifier.height(30.dp))
        SectionHeading("By status")
        Spacer(Modifier.height(14.dp))
        Row(
            Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(8.dp)).background(VistoraPalette.Track),
            horizontalArrangement = Arrangement.Start
        ) {
            if (items.isNotEmpty()) {
                statusCounts.filter { it.second > 0 }.forEach { (status, count) ->
                    Box(Modifier.weight(count.toFloat()).fillMaxHeight().background(statusColor(status)))
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        statusCounts.chunked(2).forEach { pair ->
            Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                pair.forEach { (status, count) ->
                    Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        Box(Modifier.size(9.dp).clip(RoundedCornerShape(3.dp)).background(statusColor(status)))
                        Text(status.label, color = VistoraPalette.Secondary, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = 1)
                        Text(count.toString(), color = VistoraPalette.Muted, fontSize = 12.sp)
                    }
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }

        Spacer(Modifier.height(26.dp))
        SectionHeading("By type")
        Spacer(Modifier.height(15.dp))
        typeCounts.forEach { (type, count) ->
            DistributionRow(type.category, count, items.size, VistoraPalette.Rose)
            Spacer(Modifier.height(13.dp))
        }

        if (genreCounts.isNotEmpty()) {
            Spacer(Modifier.height(14.dp))
            SectionHeading("Top genres")
            Spacer(Modifier.height(15.dp))
            val maxGenre = genreCounts.maxOf { it.value }.coerceAtLeast(1)
            genreCounts.forEach { (genre, count) ->
                DistributionRow(genre, count, maxGenre, VistoraPalette.BurgundyHigh)
                Spacer(Modifier.height(13.dp))
            }
        }

        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            SectionHeading("Your ratings", modifier = Modifier.weight(1f))
            Text("${ratings.size} rated", color = VistoraPalette.Muted, fontSize = 12.sp)
        }
        Spacer(Modifier.height(14.dp))
        if (ratings.isEmpty()) {
            Text("Your ratings will appear here.", color = VistoraPalette.Muted, fontSize = 13.sp)
        } else {
            (5 downTo 1).forEach { score ->
                DistributionRow("$score stars", ratings.count { it == score }, ratings.size, VistoraPalette.WatchingText)
                Spacer(Modifier.height(10.dp))
            }
        }
    }
}

private fun completedFilms(items: List<MediaItem>) =
    items.count { it.type == MediaType.MOVIE && it.status == LibraryStatus.COMPLETED }

@Composable
private fun StatTile(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier.clip(RoundedCornerShape(17.dp))
            .background(VistoraPalette.Surface)
            .border(1.dp, VistoraPalette.Line, RoundedCornerShape(17.dp))
            .padding(horizontal = 16.dp, vertical = 13.dp)
            .heightIn(min = 91.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        Text(
            value,
            color = VistoraPalette.Text,
            style = TextStyle(fontFamily = FontFamily.Serif, fontSize = 34.sp, fontWeight = FontWeight.Medium, lineHeight = 38.sp)
        )
        Text(label, color = VistoraPalette.Muted, fontSize = 12.sp, lineHeight = 17.sp)
    }
}

@Composable
private fun DistributionRow(label: String, value: Int, total: Int, color: androidx.compose.ui.graphics.Color) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(label, color = VistoraPalette.Secondary, fontSize = 13.sp, modifier = Modifier.widthIn(min = 86.dp, max = 106.dp), maxLines = 1)
        Box(Modifier.weight(1f).height(6.dp).clip(RoundedCornerShape(6.dp)).background(VistoraPalette.Track)) {
            if (total > 0 && value > 0) {
                Box(
                    Modifier.fillMaxWidth((value.toFloat() / total).coerceIn(0f, 1f))
                        .fillMaxHeight()
                        .clip(RoundedCornerShape(6.dp))
                        .background(color)
                )
            }
        }
        Text(value.toString(), color = VistoraPalette.Muted, fontSize = 12.sp, modifier = Modifier.width(25.dp))
    }
}

private fun statusColor(status: LibraryStatus) = when (status) {
    LibraryStatus.WATCHING -> VistoraPalette.WatchingText
    LibraryStatus.COMPLETED -> VistoraPalette.CompletedText
    LibraryStatus.PLAN_TO_WATCH -> VistoraPalette.PlanText
    LibraryStatus.ON_HOLD -> VistoraPalette.HoldText
    LibraryStatus.DROPPED -> VistoraPalette.DroppedText
}
