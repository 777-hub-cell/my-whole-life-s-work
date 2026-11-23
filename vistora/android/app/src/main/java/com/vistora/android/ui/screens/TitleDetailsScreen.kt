package com.vistora.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DatePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vistora.android.domain.EpisodeNote
import com.vistora.android.domain.LibraryStatus
import com.vistora.android.domain.MediaItem
import com.vistora.android.domain.TrackedDate
import com.vistora.android.ui.components.PosterArt
import com.vistora.android.ui.components.SectionHeading
import com.vistora.android.ui.components.StatusLabel
import com.vistora.android.ui.components.VistoraAction
import com.vistora.android.ui.components.VistoraIcon
import com.vistora.android.ui.components.VistoraTextField
import com.vistora.android.ui.components.VistoraSheet
import com.vistora.android.ui.theme.VistoraPalette
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TitleDetailsScreen(
    item: MediaItem,
    episodeNotes: List<EpisodeNote>,
    initialEpisode: Int? = null,
    onBack: () -> Unit,
    onStatusChange: (LibraryStatus) -> Unit,
    onProgressChange: (Int) -> Unit,
    onRatingChange: (Int) -> Unit,
    onDateChange: (TrackedDate, Long?) -> Unit,
    onSaveEpisodeNote: (Int, String) -> Unit,
    onDeleteEpisodeNote: (Int) -> Unit,
    onSaveOverallThoughts: (String) -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    var showStatus by remember { mutableStateOf(false) }
    var showMenu by remember { mutableStateOf(false) }
    var dateKind by remember(item.id) { mutableStateOf<TrackedDate?>(null) }
    var expandedSynopsis by remember(item.id) { mutableStateOf(false) }
    var selectedEpisode by remember(item.id, initialEpisode) {
        mutableIntStateOf(
            if (item.totalEpisodes > 0) {
                initialEpisode?.takeIf { it in 1..item.totalEpisodes }
                    ?: item.watchedEpisodes.coerceAtLeast(1).coerceAtMost(item.totalEpisodes)
            } else 1
        )
    }
    var episodeDraft by remember(item.id,selectedEpisode) {
        mutableStateOf(episodeNotes.firstOrNull{it.episodeNumber==selectedEpisode}?.body.orEmpty())
    }
    var overallDraft by remember(item.id,item.overallThoughts) { mutableStateOf(item.overallThoughts) }
    var noteTab by remember(item.id,initialEpisode) {
        mutableStateOf(if (initialEpisode != null) "episode" else "overall")
    }

    LaunchedEffect(item.id,selectedEpisode,episodeNotes) {
        episodeDraft=episodeNotes.firstOrNull{it.episodeNumber==selectedEpisode}?.body.orEmpty()
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal=20.dp).padding(bottom=28.dp)
    ) {
        Row(
            Modifier.fillMaxWidth().height(60.dp),
            verticalAlignment=Alignment.CenterVertically,
            horizontalArrangement=Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(7.dp)){
                Box(Modifier.size(48.dp).semantics { contentDescription = "Back"; role = Role.Button }.clip(RoundedCornerShape(13.dp)).clickable(role=Role.Button,onClick=onBack),contentAlignment=Alignment.Center){
                    VistoraIcon("back",Modifier.size(21.dp),VistoraPalette.Text)
                }
                Text("Title Details",color=VistoraPalette.Text,style=TextStyle(fontFamily=FontFamily.Serif,fontSize=22.sp,fontWeight=FontWeight.Medium))
            }
            Box {
                Box(Modifier.size(48.dp).semantics { contentDescription = "More title options"; role = Role.Button }.clip(RoundedCornerShape(13.dp)).clickable(role=Role.Button){showMenu=true},contentAlignment=Alignment.Center){
                    VistoraIcon("more",Modifier.size(21.dp),VistoraPalette.Text)
                }
            }
        }

        Row(
            Modifier.fillMaxWidth().padding(top=5.dp),
            verticalAlignment=Alignment.CenterVertically,
            horizontalArrangement=Arrangement.spacedBy(18.dp)
        ) {
            PosterArt(item.title,item.type.category,item.posterPath,Modifier.width(116.dp))
            Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(8.dp)){
                Text(item.title,color=VistoraPalette.Text,style=TextStyle(fontFamily=FontFamily.Serif,fontWeight=FontWeight.Medium,fontSize=29.sp,lineHeight=31.sp))
                val meta=buildList {
                    add(item.type.category)
                    if(item.type.name!="MOVIE" && item.seriesState.label!="Unknown") add(item.seriesState.label)
                    if(item.totalEpisodes>0) add("${item.totalEpisodes} Episodes")
                    else if(item.releaseYear!=null) add(item.releaseYear.toString())
                }.joinToString(" · ")
                Text(meta,color=VistoraPalette.Secondary,fontSize=13.sp,lineHeight=19.sp)
                Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(2.dp)){
                    (1..5).forEach { star ->
                        Box(Modifier.size(38.dp).semantics { contentDescription = "Rate $star out of 5 stars"; role = Role.Button }.clip(RoundedCornerShape(7.dp)).clickable(role=Role.Button){onRatingChange(star)},contentAlignment=Alignment.Center){
                            VistoraIcon("star",Modifier.size(22.dp),if(star<=item.rating)VistoraPalette.WatchingText else VistoraPalette.Muted,if(star<=item.rating)1.1f else 1.8f)
                        }
                    }
                }
                Text(if(item.rating==0) "Not rated yet" else "${item.rating} out of 5 stars",color=VistoraPalette.Muted,fontSize=12.sp)
            }
        }

        Spacer(Modifier.height(27.dp))
        SectionHeading("Synopsis")
        Text(
            item.synopsis.ifBlank{"No synopsis added yet. You can add one when editing this title."},
            modifier=Modifier.padding(top=9.dp),
            color=VistoraPalette.Secondary,
            style=TextStyle(fontSize=14.sp,lineHeight=22.sp),
            maxLines=if(expandedSynopsis) Int.MAX_VALUE else 3
        )
        if(item.synopsis.length>150) {
            Text(if(expandedSynopsis)"Read less" else "Read more",modifier=Modifier.clickable{expandedSynopsis=!expandedSynopsis}.padding(top=7.dp),
                color=VistoraPalette.Rose,fontSize=13.sp,fontWeight=FontWeight.SemiBold)
        }

        if(item.genres.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(top=14.dp),horizontalArrangement=Arrangement.spacedBy(7.dp)){
                item.genres.take(5).forEach { genre->
                    Text(genre,modifier=Modifier.clip(RoundedCornerShape(10.dp)).background(VistoraPalette.Raised)
                        .border(1.dp,VistoraPalette.Line,RoundedCornerShape(10.dp)).padding(horizontal=11.dp,vertical=7.dp),
                        color=VistoraPalette.Secondary,fontSize=12.sp,fontWeight=FontWeight.Medium)
                }
            }
        }

        Spacer(Modifier.height(22.dp))
        Row(
            Modifier.fillMaxWidth().padding(top=22.dp),
            verticalAlignment=Alignment.CenterVertically,
            horizontalArrangement=Arrangement.spacedBy(9.dp)
        ) {
            StatusLabel(
                status=item.status,
                modifier=Modifier.semantics {
                    contentDescription = "Change library status. Current status: ${item.status.label}"
                    role = Role.Button
                }.clickable(role=Role.Button) { showStatus=true },
                compact=true
            )
            Spacer(Modifier.weight(1f))
            Text(
                "Change",
                modifier=Modifier.clickable(role=Role.Button) { showStatus=true }.padding(vertical=7.dp,horizontal=4.dp),
                color=VistoraPalette.Muted,fontSize=12.sp,fontWeight=FontWeight.Medium
            )
            Box(
                Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).clickable(role=Role.Button) { showStatus=true },
                contentAlignment=Alignment.Center
            ) { VistoraIcon("more",Modifier.size(19.dp),VistoraPalette.Secondary) }
        }
        Box(Modifier.fillMaxWidth().padding(top=13.dp).height(1.dp).background(VistoraPalette.Line))

        if(item.isEpisodic){
            Spacer(Modifier.height(23.dp))
            SectionHeading("My Progress")
            Row(Modifier.fillMaxWidth().padding(top=10.dp),verticalAlignment=Alignment.Bottom,horizontalArrangement=Arrangement.SpaceBetween){
                Text("Episodes watched",color=VistoraPalette.Secondary,fontSize=14.sp)
                Text("${item.watchedEpisodes} / ${item.totalEpisodes}",color=VistoraPalette.Text,
                    style=TextStyle(fontFamily=FontFamily.Serif,fontSize=25.sp,fontWeight=FontWeight.Medium))
            }
            Box(Modifier.fillMaxWidth().padding(top=12.dp).height(9.dp).clip(RoundedCornerShape(8.dp)).background(VistoraPalette.Track)){
                Box(Modifier.fillMaxWidth(item.progressPercent/100f).fillMaxHeight().clip(RoundedCornerShape(8.dp)).background(
                    androidx.compose.ui.graphics.Brush.horizontalGradient(listOf(VistoraPalette.BurgundyHigh,VistoraPalette.Rose))
                ))
            }
            Row(Modifier.fillMaxWidth().padding(top=13.dp),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically){
                Text("${item.progressPercent}% completed",color=VistoraPalette.Muted,fontSize=12.sp)
                Row(horizontalArrangement=Arrangement.spacedBy(9.dp)){
                    StepButton("minus","Decrease watched episodes",enabled=item.watchedEpisodes>0){onProgressChange(-1)}
                    StepButton("plus","Increase watched episodes",enabled=item.watchedEpisodes<item.totalEpisodes){onProgressChange(1)}
                }
            }
            Text("Progress is tracked manually. It never plays an episode here.",color=VistoraPalette.Muted,fontSize=12.sp,modifier=Modifier.padding(top=6.dp))
        }

        Spacer(Modifier.height(25.dp))
        SectionHeading("Dates")
        if (item.isEpisodic) {
            Row(Modifier.fillMaxWidth().padding(top=10.dp),horizontalArrangement=Arrangement.spacedBy(9.dp)) {
                DateCard("Started", item.startedAt, Modifier.weight(1f)) { dateKind = TrackedDate.STARTED }
                DateCard("Finished", item.finishedAt, Modifier.weight(1f)) { dateKind = TrackedDate.FINISHED }
            }
        } else {
            DateCard("Watched on", item.watchedOn, Modifier.fillMaxWidth()) { dateKind = TrackedDate.WATCHED_ON }
        }

        Spacer(Modifier.height(26.dp))
        SectionHeading("Notes")
        if(item.isEpisodic) {
            Row(
                Modifier.fillMaxWidth().padding(top=14.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(VistoraPalette.Field)
                    .border(1.dp,VistoraPalette.Line,RoundedCornerShape(999.dp))
                    .padding(4.dp),
                horizontalArrangement=Arrangement.spacedBy(4.dp)
            ) {
                NoteTab("Overall Thoughts",noteTab=="overall",Modifier.weight(1f)){ noteTab="overall" }
                NoteTab("Episode Notes",noteTab=="episode",Modifier.weight(1f)){ noteTab="episode" }
            }
        }

        if(noteTab=="episode" && item.isEpisodic) {
            Text(
                "Your thoughts, episode by episode. Choose an episode to write, read or revisit a note.",
                modifier=Modifier.padding(top=12.dp),
                color=VistoraPalette.Muted,fontSize=13.sp,lineHeight=19.sp
            )
            Row(
                Modifier.fillMaxWidth().padding(top=14.dp),
                horizontalArrangement=Arrangement.spacedBy(8.dp),
                verticalAlignment=Alignment.CenterVertically
            ) {
                Text("Episode",color=VistoraPalette.Secondary,fontSize=14.sp)
                EpisodeSelector(selectedEpisode,item.totalEpisodes){selectedEpisode=it}
                Spacer(Modifier.weight(1f))
                Text("${episodeNotes.size} saved",color=VistoraPalette.Muted,fontSize=12.sp)
            }
            VistoraTextField(
                value=episodeDraft,
                onValueChange={episodeDraft=it},
                placeholder="What did you think of Episode $selectedEpisode? Favourite moments, theories, reactions, details you noticed…",
                label="Your thoughts",
                minLines=6,
                maxLines=10,
                singleLine=false,
                modifier=Modifier.fillMaxWidth().padding(top=12.dp)
            )
            Row(
                Modifier.fillMaxWidth().padding(top=11.dp),
                horizontalArrangement=Arrangement.End,
                verticalAlignment=Alignment.CenterVertically
            ) {
                if(episodeNotes.any{it.episodeNumber==selectedEpisode}) {
                    Text(
                        "Delete note",
                        modifier=Modifier.clickable{onDeleteEpisodeNote(selectedEpisode);episodeDraft=""}.padding(horizontal=12.dp,vertical=12.dp),
                        color=VistoraPalette.DroppedText,fontSize=13.sp,fontWeight=FontWeight.SemiBold
                    )
                }
                VistoraAction("Save note",onClick={onSaveEpisodeNote(selectedEpisode,episodeDraft)},leading="check")
            }

            if(episodeNotes.isNotEmpty()) {
                Spacer(Modifier.height(20.dp))
                SectionHeading("Saved episode notes")
                Column(Modifier.padding(top=7.dp),verticalArrangement=Arrangement.spacedBy(9.dp)) {
                    episodeNotes.sortedByDescending{it.episodeNumber}.forEach { note ->
                        val active=note.episodeNumber==selectedEpisode
                        Column(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                                .background(if(active)VistoraPalette.Raised else VistoraPalette.Surface)
                                .border(1.dp,if(active)VistoraPalette.Rose.copy(alpha=.55f) else VistoraPalette.Line,RoundedCornerShape(14.dp))
                                .clickable{selectedEpisode=note.episodeNumber}
                                .padding(14.dp)
                        ) {
                            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically) {
                                Text("Episode ${note.episodeNumber}",color=VistoraPalette.Text,fontWeight=FontWeight.SemiBold,fontSize=14.sp)
                                Text(dateLabel(note.updatedAt),color=VistoraPalette.Muted,fontSize=11.sp)
                            }
                            Text(note.body,color=VistoraPalette.Secondary,fontSize=13.sp,lineHeight=19.sp,maxLines=3,modifier=Modifier.padding(top=7.dp))
                        }
                    }
                }
            }
        } else {
            Text(
                "Your overall opinion, favourite characters, reminders or final thoughts.",
                modifier=Modifier.padding(top=12.dp),
                color=VistoraPalette.Muted,fontSize=13.sp,lineHeight=19.sp
            )
            VistoraTextField(
                value=overallDraft,
                onValueChange={overallDraft=it},
                placeholder="What did you think of this title as a whole?",
                minLines=5,
                maxLines=10,
                singleLine=false,
                modifier=Modifier.fillMaxWidth().padding(top=12.dp)
            )
            Row(Modifier.fillMaxWidth().padding(top=10.dp),horizontalArrangement=Arrangement.End) {
                VistoraAction("Save note",onClick={onSaveOverallThoughts(overallDraft)},leading="check",quiet=true)
            }
        }

        Spacer(Modifier.height(30.dp))
    }

    if(showStatus){
        VistoraSheet(onDismiss={showStatus=false}){
            Column(Modifier.fillMaxWidth().padding(horizontal=20.dp).padding(bottom=20.dp)){
                Text("Your library status",style=androidx.compose.material3.MaterialTheme.typography.headlineMedium,color=VistoraPalette.Text)
                Text("Choose how you want to track this title.",color=VistoraPalette.Muted,fontSize=13.sp,modifier=Modifier.padding(top=4.dp,bottom=12.dp))
                LibraryStatus.entries.forEach { status->
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).clickable{onStatusChange(status);showStatus=false}
                        .padding(vertical=12.dp,horizontal=4.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.SpaceBetween){
                        StatusLabel(status)
                        if(status==item.status)VistoraIcon("check",Modifier.size(20.dp),VistoraPalette.Rose)
                    }
                }
            }
        }
    }
    if(showMenu){
        VistoraSheet(onDismiss={showMenu=false}){
            Column(Modifier.fillMaxWidth().padding(horizontal=20.dp).padding(bottom=18.dp)){
                Text(item.title,color=VistoraPalette.Text,style=androidx.compose.material3.MaterialTheme.typography.titleLarge)
                Row(Modifier.fillMaxWidth().clickable{showMenu=false;onEdit()}.padding(vertical=17.dp),verticalAlignment=Alignment.CenterVertically){
                    VistoraIcon("edit",Modifier.size(20.dp),VistoraPalette.Secondary);Spacer(Modifier.width(12.dp));Text("Edit title",color=VistoraPalette.Text)
                }
                Row(Modifier.fillMaxWidth().clickable{showMenu=false;onDelete()}.padding(vertical=17.dp),verticalAlignment=Alignment.CenterVertically){
                    VistoraIcon("trash",Modifier.size(20.dp),VistoraPalette.DroppedText);Spacer(Modifier.width(12.dp));Text("Remove from library",color=VistoraPalette.DroppedText)
                }
            }
        }
    }
    if (dateKind != null) {
        val kind = dateKind!!
        val existing = when (kind) {
            TrackedDate.STARTED -> item.startedAt
            TrackedDate.FINISHED -> item.finishedAt
            TrackedDate.WATCHED_ON -> item.watchedOn
        }
        val pickerState = rememberDatePickerState(initialSelectedDateMillis = existing ?: System.currentTimeMillis())
        val heading = when (kind) {
            TrackedDate.STARTED -> "Started watching"
            TrackedDate.FINISHED -> "Finished watching"
            TrackedDate.WATCHED_ON -> "Watched on"
        }
        VistoraSheet(onDismiss = { dateKind = null }) {
            Column(
                Modifier.fillMaxWidth().heightIn(max=690.dp).verticalScroll(rememberScrollState())
                    .padding(horizontal=16.dp).padding(bottom=20.dp)
            ) {
                Text(heading,color=VistoraPalette.Text,style=androidx.compose.material3.MaterialTheme.typography.headlineMedium)
                Text("Keep a personal record of when you watched this title.",color=VistoraPalette.Muted,fontSize=12.sp,modifier=Modifier.padding(top=4.dp))
                DatePicker(state=pickerState,showModeToggle=false)
                Row(Modifier.fillMaxWidth().padding(top=4.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                    VistoraAction("Clear",{
                        onDateChange(kind,null)
                        dateKind=null
                    },Modifier.weight(1f),quiet=true)
                    VistoraAction("Cancel",{dateKind=null},Modifier.weight(1f),quiet=true)
                    VistoraAction("Save",{
                        pickerState.selectedDateMillis?.let { onDateChange(kind, pickerDateToLocalNoon(it)) }
                        dateKind=null
                    },Modifier.weight(1f))
                }
            }
        }
    }

}



@Composable
private fun NoteTab(label:String,selected:Boolean,modifier:Modifier=Modifier,onClick:()->Unit) {
    Box(
        modifier.heightIn(min=42.dp)
            .clip(RoundedCornerShape(999.dp))
            .background(if(selected)VistoraPalette.Raised else Color.Transparent)
            .clickable(role=Role.Tab,onClick=onClick),
        contentAlignment=Alignment.Center
    ) {
        Text(label,color=if(selected)VistoraPalette.Text else VistoraPalette.Muted,fontSize=13.sp,fontWeight=if(selected)FontWeight.SemiBold else FontWeight.Medium)
    }
}

@Composable
private fun DateCard(label:String,value:Long?,modifier:Modifier=Modifier,onClick:()->Unit) {
    Column(
        modifier.clip(RoundedCornerShape(14.dp))
            .background(VistoraPalette.Surface)
            .border(1.dp,VistoraPalette.Line,RoundedCornerShape(14.dp))
            .clickable(role=Role.Button,onClick=onClick)
            .padding(horizontal=14.dp,vertical=12.dp),
        verticalArrangement=Arrangement.spacedBy(4.dp)
    ) {
        Text(label,color=VistoraPalette.Muted,fontSize=11.sp,fontWeight=FontWeight.Medium)
        Text(value?.let(::dateLabel) ?: "Add date",color=if(value==null)VistoraPalette.Rose else VistoraPalette.Text,fontSize=14.sp,fontWeight=FontWeight.SemiBold)
    }
}

private fun pickerDateToLocalNoon(value:Long):Long {
    val date=Instant.ofEpochMilli(value).atZone(ZoneOffset.UTC).toLocalDate()
    return date.atTime(LocalTime.NOON).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
}

@Composable
private fun StepButton(icon:String,label:String,enabled:Boolean,onClick:()->Unit){
    Box(Modifier.size(48.dp).semantics { contentDescription = label; role = Role.Button }.clip(RoundedCornerShape(14.dp)).background(VistoraPalette.Surface)
        .border(1.dp,VistoraPalette.LineStrong,RoundedCornerShape(14.dp))
        .clickable(enabled=enabled,onClick=onClick),contentAlignment=Alignment.Center){
        VistoraIcon(icon,Modifier.size(21.dp),if(enabled)VistoraPalette.Text else VistoraPalette.Muted.copy(alpha=.45f))
    }
}

@Composable
private fun EpisodeSelector(current:Int,total:Int,onSelect:(Int)->Unit){
    var value by remember(current){mutableStateOf(current.toString())}
    Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(6.dp)){
        Box(Modifier.width(76.dp).heightIn(min=48.dp).clip(RoundedCornerShape(10.dp)).background(VistoraPalette.Field).border(1.dp,VistoraPalette.LineStrong,RoundedCornerShape(10.dp)).padding(horizontal=10.dp,vertical=7.dp)){
            androidx.compose.foundation.text.BasicTextField(
                value=value,
                onValueChange={raw->
                    val clean=raw.filter(Char::isDigit).take(5)
                    value=clean
                    clean.toIntOrNull()?.let{if(it in 1..total)onSelect(it)}
                },
                textStyle=TextStyle(color=VistoraPalette.Text,fontSize=15.sp,fontWeight=FontWeight.SemiBold),
                singleLine=true,
                keyboardOptions=androidx.compose.foundation.text.KeyboardOptions(keyboardType=androidx.compose.ui.text.input.KeyboardType.Number)
            )
        }
        Text("of $total",color=VistoraPalette.Muted,fontSize=13.sp)
    }
}

private fun dateLabel(time:Long):String =
    SimpleDateFormat("MMM d, yyyy", Locale.getDefault()).format(Date(time))
