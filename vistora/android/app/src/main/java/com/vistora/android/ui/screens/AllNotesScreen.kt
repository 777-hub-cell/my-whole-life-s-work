package com.vistora.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vistora.android.domain.EpisodeNote
import com.vistora.android.domain.MediaItem
import com.vistora.android.ui.components.VistoraIcon
import com.vistora.android.ui.components.VistoraTextField
import com.vistora.android.ui.theme.VistoraPalette
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private data class NoteEntry(
    val mediaId: Long,
    val episodeNumber: Int,
    val title: String,
    val subtitle: String,
    val body: String,
    val updatedAt: Long
)

@Composable
fun AllNotesScreen(
    items: List<MediaItem>,
    episodeNotes: List<EpisodeNote>,
    onBack: () -> Unit,
    onOpenNote: (mediaId: Long, episodeNumber: Int) -> Unit
) {
    var query by remember { mutableStateOf("") }
    val entries = remember(items, episodeNotes) {
        buildList {
            items.forEach { item ->
                if (item.overallThoughts.isNotBlank()) {
                    add(
                        NoteEntry(
                            mediaId = item.id,
                            episodeNumber = 0,
                            title = item.title,
                            subtitle = "Overall thoughts",
                            body = item.overallThoughts,
                            updatedAt = item.overallThoughtsUpdatedAt ?: item.updatedAt
                        )
                    )
                }
            }
            val itemById = items.associateBy { it.id }
            episodeNotes.forEach { note ->
                val item = itemById[note.mediaId] ?: return@forEach
                if (note.body.isNotBlank()) {
                    add(
                        NoteEntry(
                            mediaId = item.id,
                            episodeNumber = note.episodeNumber,
                            title = item.title,
                            subtitle = "Episode " + note.episodeNumber,
                            body = note.body,
                            updatedAt = note.updatedAt
                        )
                    )
                }
            }
        }.sortedByDescending { it.updatedAt }
    }
    val filtered = remember(entries, query) {
        val term = query.trim()
        if (term.isBlank()) entries else entries.filter {
            it.title.contains(term, ignoreCase = true) ||
                it.subtitle.contains(term, ignoreCase = true) ||
                it.body.contains(term, ignoreCase = true)
        }
    }

    Column(
        Modifier.fillMaxSize().background(VistoraPalette.Ink)
            .padding(horizontal = 20.dp).padding(top = 18.dp, bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(13.dp)
    ) {
        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){
            Box(Modifier.size(48.dp).semantics { contentDescription = "Back to Settings"; role = Role.Button }.clip(RoundedCornerShape(12.dp)).clickable(role=Role.Button,onClick=onBack),contentAlignment=Alignment.Center){
                VistoraIcon("back",Modifier.size(20.dp),VistoraPalette.Text)
            }
            Column(Modifier.weight(1f)){
                Text("My Notes",color=VistoraPalette.Text,style=androidx.compose.material3.MaterialTheme.typography.headlineLarge)
                Text("Your thoughts across every title.",color=VistoraPalette.Muted,fontSize=13.sp)
            }
        }

        VistoraTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = "Search titles or your thoughts",
            modifier = Modifier.fillMaxWidth()
        )

        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically){
            Text(if(query.isBlank())"Your diary" else "Search results",color=VistoraPalette.Secondary,fontWeight=FontWeight.SemiBold,fontSize=14.sp)
            Text(filtered.size.toString()+" entries",color=VistoraPalette.Muted,fontSize=11.sp)
        }

        if (filtered.isEmpty()) {
            Box(Modifier.weight(1f).fillMaxWidth(),contentAlignment=Alignment.Center){
                Column(horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(8.dp)){
                    Text(if(query.isBlank())"Your notes will appear here." else "No notes found.",color=VistoraPalette.Text,style=androidx.compose.material3.MaterialTheme.typography.titleLarge)
                    Text(
                        if(query.isBlank())"Write thoughts from a title's details page. Episode notes and overall reflections will be collected here."
                        else "Try another title name or a different phrase.",
                        color=VistoraPalette.Muted,fontSize=13.sp,lineHeight=19.sp
                    )
                }
            }
        } else {
            LazyColumn(
                modifier=Modifier.weight(1f),
                verticalArrangement=Arrangement.spacedBy(10.dp),
                contentPadding=PaddingValues(bottom=24.dp)
            ){
                items(filtered,key={if(it.episodeNumber==0)"overall-"+it.mediaId else "episode-"+it.mediaId+"-"+it.episodeNumber}){entry->
                    NoteCard(entry){onOpenNote(entry.mediaId,entry.episodeNumber)}
                }
            }
        }
    }
}

@Composable
private fun NoteCard(entry: NoteEntry, onClick: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
            .background(VistoraPalette.Surface)
            .clickable(role=Role.Button,onClick=onClick)
            .padding(horizontal=15.dp,vertical=14.dp),
        verticalArrangement=Arrangement.spacedBy(7.dp)
    ) {
        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.SpaceBetween){
            Text(entry.title,color=VistoraPalette.Text,fontWeight=FontWeight.SemiBold,fontSize=14.sp,maxLines=1,modifier=Modifier.weight(1f))
            Text(entry.subtitle,color=VistoraPalette.Rose,fontWeight=FontWeight.SemiBold,fontSize=11.sp,modifier=Modifier.padding(start=8.dp))
        }
        Text(entry.body,color=VistoraPalette.Secondary,fontSize=13.sp,lineHeight=19.sp,maxLines=4)
        Text(formatDate(entry.updatedAt),color=VistoraPalette.Muted,fontSize=10.sp)
    }
}

private fun formatDate(value: Long): String =
    SimpleDateFormat("MMM d, yyyy", Locale.getDefault()).format(Date(value))
