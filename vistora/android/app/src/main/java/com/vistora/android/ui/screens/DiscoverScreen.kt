package com.vistora.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vistora.android.domain.LibraryStatus
import com.vistora.android.domain.MediaItem
import com.vistora.android.domain.MediaType
import com.vistora.android.domain.SeriesState
import com.vistora.android.ui.components.PosterArt
import com.vistora.android.ui.components.SectionHeading
import com.vistora.android.ui.components.VistoraTextField
import com.vistora.android.ui.theme.VistoraPalette

private val offlineSuggestions = listOf(
    MediaItem(title="Spirited Away",type=MediaType.ANIME,releaseYear=2001,genres=listOf("Fantasy","Adventure"),synopsis="A young girl enters a mysterious world of spirits."),
    MediaItem(title="Interstellar",type=MediaType.MOVIE,releaseYear=2014,genres=listOf("Sci-Fi","Drama"),synopsis="A crew searches for a new home beyond Earth."),
    MediaItem(title="Crash Landing on You",type=MediaType.K_DRAMA,releaseYear=2019,totalEpisodes=16,seriesState=SeriesState.COMPLETED,genres=listOf("Romance","Drama")),
    MediaItem(title="Stranger Things",type=MediaType.TV_SERIES,releaseYear=2016,totalEpisodes=34,seriesState=SeriesState.ONGOING,genres=listOf("Mystery","Sci-Fi")),
    MediaItem(title="Your Name",type=MediaType.ANIME,releaseYear=2016,genres=listOf("Romance","Fantasy")),
    MediaItem(title="The Bear",type=MediaType.TV_SERIES,releaseYear=2022,totalEpisodes=28,seriesState=SeriesState.ONGOING,genres=listOf("Drama"))
)

@Composable
fun DiscoverScreen(
    library:List<MediaItem>,
    onAdd:(MediaItem)->Unit
){
    var query by remember{mutableStateOf("")}
    var selectedType by remember{mutableStateOf<MediaType?>(null)}
    val results=remember(query,selectedType,library){
        offlineSuggestions.filter{s->
            (selectedType==null||s.type==selectedType) &&
            (query.isBlank()||s.title.contains(query,true)||s.genres.any{it.contains(query,true)})
        }.filterNot{s->library.any{it.title.equals(s.title,true)&&it.type==s.type}}
    }
    Column(Modifier.fillMaxSize().padding(horizontal=20.dp).padding(top=18.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
        Column{
            Text("Discover",color=VistoraPalette.Text,style=androidx.compose.material3.MaterialTheme.typography.headlineLarge)
            Text("Find new titles to add to your personal library.",color=VistoraPalette.Muted,fontSize=14.sp,modifier=Modifier.padding(top=4.dp))
        }
        VistoraTextField(query,{query=it},"Search the offline preview catalogue")
        Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(7.dp)){
            TypeChip("All",selectedType==null){selectedType=null}
            MediaType.entries.forEach{type->TypeChip(type.category,selectedType==type){selectedType=type}}
        }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(VistoraPalette.Surface).padding(13.dp),verticalAlignment=Alignment.CenterVertically){
            Column(Modifier.weight(1f)){
                Text("Offline preview",color=VistoraPalette.Text,fontSize=14.sp,fontWeight=FontWeight.SemiBold)
                Text("This sample catalogue works without an internet connection. Live provider search is optional and can be configured later.",color=VistoraPalette.Muted,fontSize=11.sp,lineHeight=16.sp,modifier=Modifier.padding(top=3.dp))
            }
            Text("LOCAL",color=VistoraPalette.CompletedText,fontSize=10.sp,fontWeight=FontWeight.Bold,letterSpacing=1.sp)
        }
        if(results.isEmpty()){
            Box(Modifier.fillMaxSize(),contentAlignment=Alignment.Center){
                Text("No titles in this preview match your search.",color=VistoraPalette.Muted,fontSize=14.sp)
            }
        }else{
            androidx.compose.foundation.lazy.LazyColumn(modifier=Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(12.dp),contentPadding=PaddingValues(bottom=24.dp)){
                items(results,key={it.title}){item->
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(VistoraPalette.Surface).padding(11.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(13.dp)){
                        PosterArt(item.title,item.type.category,null,Modifier.width(76.dp))
                        Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(5.dp)){
                            Text(item.title,color=VistoraPalette.Text,fontWeight=FontWeight.SemiBold,fontSize=14.sp)
                            Text(listOfNotNull(item.type.category,item.releaseYear?.toString(),item.totalEpisodes.takeIf{it>0}?.let{"$it episodes"}).joinToString(" · "),color=VistoraPalette.Muted,fontSize=11.sp)
                            Text(item.genres.joinToString(" · "),color=VistoraPalette.Secondary,fontSize=11.sp)
                        }
                        Box(Modifier.clip(RoundedCornerShape(11.dp)).background(VistoraPalette.Burgundy).clickable{onAdd(item.copy(status=LibraryStatus.PLAN_TO_WATCH,isWatchlisted=true))}.padding(horizontal=13.dp,vertical=11.dp)){
                            Text("Add",color=VistoraPalette.OnAccent,fontSize=12.sp,fontWeight=FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TypeChip(label:String,selected:Boolean,onClick:()->Unit){
    Text(label,modifier=Modifier.clip(RoundedCornerShape(9.dp)).background(if(selected)VistoraPalette.Burgundy else VistoraPalette.Surface).clickable(onClick=onClick).padding(horizontal=10.dp,vertical=9.dp),
        color=if(selected)VistoraPalette.OnAccent else VistoraPalette.Secondary,fontSize=11.sp,fontWeight=if(selected)FontWeight.SemiBold else FontWeight.Medium)
}
