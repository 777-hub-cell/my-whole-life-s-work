package com.vistora.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vistora.android.domain.CatalogResult
import com.vistora.android.domain.CatalogSearchState
import com.vistora.android.domain.MediaItem
import com.vistora.android.domain.MediaType
import com.vistora.android.domain.SeriesState
import com.vistora.android.ui.components.PosterArt
import com.vistora.android.ui.components.VistoraAction
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

    Column(Modifier.fillMaxSize().padding(horizontal=20.dp).padding(top=18.dp),verticalArrangement=Arrangement.spacedBy(14.dp)) {
        Column {
            Text("Discover",color=VistoraPalette.Text,style=androidx.compose.material3.MaterialTheme.typography.headlineLarge)
            Text("Find something new for your library.",color=VistoraPalette.Muted,fontSize=14.sp,modifier=Modifier.padding(top=4.dp))
        }
        VistoraTextField(query,{query=it},"Search films, dramas and anime",Modifier.fillMaxWidth())
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(7.dp)){
            TypeChip("All",selectedType==null){selectedType=null}
            MediaType.entries.forEach{type->TypeChip(type.category,selectedType==type){selectedType=type}}
        }
        VistoraAction(
            label=if(searchState.isLoading)"Searching…" else "Search catalogue",
            onClick={onSearch(query,selectedType)},
            modifier=Modifier.fillMaxWidth(),
            leading="search",
            enabled=query.isNotBlank()&&!searchState.isLoading
        )
        if(!tmdbConfigured&&selectedType!=MediaType.ANIME){
            Text("Film and TV search needs your optional TMDB key in Settings. Anime search uses AniList and works without a key.",
                color=VistoraPalette.Muted,fontSize=11.sp,lineHeight=16.sp)
        }
        if(searchState.isLoading){
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(VistoraPalette.Surface).padding(15.dp),
                verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){
                androidx.compose.material3.CircularProgressIndicator(Modifier.size(20.dp),strokeWidth=2.dp,color=VistoraPalette.Rose,trackColor=VistoraPalette.Track)
                Text("Searching the selected catalogue…",color=VistoraPalette.Secondary,fontSize=13.sp)
            }
        }
        if(searchState.error!=null){
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(VistoraPalette.DroppedSurface).padding(14.dp),
                verticalArrangement=Arrangement.spacedBy(6.dp)){
                Text("Search couldn't be completed",color=VistoraPalette.DroppedText,fontSize=13.sp,fontWeight=FontWeight.SemiBold)
                Text(searchState.error,color=VistoraPalette.Secondary,fontSize=12.sp,lineHeight=17.sp)
            }
        }
        if(searchState.query.isNotBlank()&&!searchState.isLoading&&searchState.error==null){
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically){
                Text(liveResults.size.toString()+" results",color=VistoraPalette.Secondary,fontSize=13.sp)
                Text("Clear search",modifier=Modifier.clickable{query="";onClearSearch()}.padding(6.dp),color=VistoraPalette.Rose,fontSize=12.sp,fontWeight=FontWeight.SemiBold)
            }
        }else if(searchState.query.isBlank()){
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(VistoraPalette.Surface).padding(13.dp),verticalAlignment=Alignment.CenterVertically){
                Column(Modifier.weight(1f)){
                    Text("Offline preview",color=VistoraPalette.Text,fontSize=14.sp,fontWeight=FontWeight.SemiBold)
                    Text("These examples are bundled with the app. Your own library and notes remain available without internet.",
                        color=VistoraPalette.Muted,fontSize=11.sp,lineHeight=16.sp,modifier=Modifier.padding(top=3.dp))
                }
                Text("LOCAL",color=VistoraPalette.CompletedText,fontSize=10.sp,fontWeight=FontWeight.Bold,letterSpacing=1.sp)
            }
        }
        if(searchState.query.isBlank()){
            LazyColumn(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(11.dp),contentPadding=PaddingValues(bottom=26.dp)){
                items(localSuggestions,key={"offline-"+it.type.name+"-"+it.title}){item->
                    OfflineSuggestion(item){
                        onAdd(CatalogResult(
                            providerId="offline-"+item.type.name+"-"+item.title,
                            title=item.title,type=item.type,releaseYear=item.releaseYear,totalEpisodes=item.totalEpisodes,
                            seriesState=item.seriesState,synopsis=item.synopsis,genres=item.genres,posterUrl=null,source="VISTORA preview"
                        ))
                    }
                }
            }
        }else if(!searchState.isLoading&&searchState.error==null){
            if(liveResults.isEmpty()){
                Box(Modifier.weight(1f).fillMaxWidth(),contentAlignment=Alignment.Center){
                    Text("No catalogue results found. Try another title.",color=VistoraPalette.Muted,fontSize=13.sp)
                }
            }else{
                LazyColumn(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(11.dp),contentPadding=PaddingValues(bottom=26.dp)){
                    items(liveResults,key={it.providerId}){result->CatalogResultRow(result){onAdd(result)}}
                }
            }
        }else{
            Spacer(Modifier.weight(1f))
        }
    }
}

@Composable
private fun CatalogResultRow(result:CatalogResult,onAdd:()->Unit){
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp)).background(VistoraPalette.Surface).padding(10.dp),
        verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
        PosterArt(result.title,result.type.category,null,Modifier.width(72.dp))
        Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(4.dp)){
            Text(result.title,color=VistoraPalette.Text,fontWeight=FontWeight.SemiBold,fontSize=14.sp,lineHeight=18.sp)
            Text(listOfNotNull(result.type.category,result.releaseYear?.toString(),result.totalEpisodes.takeIf{it>0}?.let{"$it episodes"}).joinToString(" · "),
                color=VistoraPalette.Muted,fontSize=11.sp)
            Text(result.genres.take(3).joinToString(" · "),color=VistoraPalette.Secondary,fontSize=11.sp,maxLines=1)
            Text("Source: "+result.source,color=VistoraPalette.Muted,fontSize=10.sp)
        }
        Box(Modifier.width(54.dp)){VistoraAction("Add",onAdd,Modifier.fillMaxWidth())}
    }
}

@Composable
private fun OfflineSuggestion(item:MediaItem,onAdd:()->Unit){
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp)).background(VistoraPalette.Surface).padding(10.dp),
        verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
        PosterArt(item.title,item.type.category,null,Modifier.width(72.dp))
        Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(4.dp)){
            Text(item.title,color=VistoraPalette.Text,fontWeight=FontWeight.SemiBold,fontSize=14.sp)
            Text(listOfNotNull(item.type.category,item.releaseYear?.toString(),item.totalEpisodes.takeIf{it>0}?.let{"$it episodes"}).joinToString(" · "),
                color=VistoraPalette.Muted,fontSize=11.sp)
            Text(item.genres.joinToString(" · "),color=VistoraPalette.Secondary,fontSize=11.sp)
        }
        Box(Modifier.width(54.dp)){VistoraAction("Add",onAdd,Modifier.fillMaxWidth())}
    }
}

@Composable
private fun TypeChip(label:String,selected:Boolean,onClick:()->Unit){
    Text(label,modifier=Modifier.clip(RoundedCornerShape(9.dp)).background(if(selected)VistoraPalette.Burgundy else VistoraPalette.Surface)
        .clickable(onClick=onClick).padding(horizontal=10.dp,vertical=9.dp),
        color=if(selected)VistoraPalette.OnAccent else VistoraPalette.Secondary,fontSize=11.sp,fontWeight=if(selected)FontWeight.SemiBold else FontWeight.Medium)
}
