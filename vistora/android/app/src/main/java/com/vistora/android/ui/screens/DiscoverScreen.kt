package com.vistora.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
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
    MediaItem(title="Spirited Away",type=MediaType.ANIME,releaseYear=2001,genres=listOf("Fantasy","Adventure"),synopsis="A young girl enters a mysterious world of spirits."),
    MediaItem(title="Interstellar",type=MediaType.MOVIE,releaseYear=2014,genres=listOf("Science Fiction","Drama"),synopsis="A crew searches for a new home beyond Earth."),
    MediaItem(title="Crash Landing on You",type=MediaType.K_DRAMA,releaseYear=2019,totalEpisodes=16,seriesState=SeriesState.COMPLETED,genres=listOf("Romance","Drama")),
    MediaItem(title="Stranger Things",type=MediaType.TV_SERIES,releaseYear=2016,totalEpisodes=34,seriesState=SeriesState.ONGOING,genres=listOf("Mystery","Science Fiction")),
    MediaItem(title="Your Name",type=MediaType.ANIME,releaseYear=2016,genres=listOf("Romance","Fantasy")),
    MediaItem(title="The Bear",type=MediaType.TV_SERIES,releaseYear=2022,totalEpisodes=28,seriesState=SeriesState.ONGOING,genres=listOf("Drama")),
    MediaItem(title="My Mister",type=MediaType.K_DRAMA,releaseYear=2018,totalEpisodes=16,seriesState=SeriesState.COMPLETED,genres=listOf("Drama")),
    MediaItem(title="Parasite",type=MediaType.MOVIE,releaseYear=2019,genres=listOf("Thriller","Drama"))
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
        Modifier.fillMaxSize().padding(horizontal=16.dp).padding(top=7.dp),
        verticalArrangement=Arrangement.spacedBy(10.dp)
    ) {
        Text(
            "Discover",
            color=VistoraPalette.Text,
            style=androidx.compose.ui.text.TextStyle(
                fontFamily=FontFamily.Serif, fontSize=36.sp, lineHeight=40.sp, fontWeight=FontWeight.Medium
            )
        )

        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                .background(VistoraPalette.Surface).padding(start=13.dp,end=5.dp),
            verticalAlignment=Alignment.CenterVertically
        ) {
            VistoraIcon("search",Modifier.size(18.dp),VistoraPalette.Muted)
            Spacer(Modifier.width(9.dp))
            VistoraTextField(
                value=query,
                onValueChange={ query=it },
                placeholder="Search movies, dramas, anime, series",
                modifier=Modifier.weight(1f)
            )
            Box(
                Modifier.size(40.dp).clip(RoundedCornerShape(11.dp))
                    .clickable(enabled=query.isNotBlank()&&!searchState.isLoading) { onSearch(query,selectedType) },
                contentAlignment=Alignment.Center
            ) {
                VistoraIcon("search",Modifier.size(19.dp),if(query.isNotBlank())VistoraPalette.Rose else VistoraPalette.Muted)
            }
        }

        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement=Arrangement.spacedBy(6.dp)
        ) {
            TypeChip("All",selectedType==null){selectedType=null}
            MediaType.entries.forEach { type -> TypeChip(type.category,selectedType==type){selectedType=type} }
        }

        if(!tmdbConfigured && selectedType != MediaType.ANIME) {
            Text(
                "Connect your optional TMDB key in More to search films and TV. Anime search works without a key.",
                color=VistoraPalette.Muted,fontSize=11.sp,lineHeight=16.sp
            )
        }

        when {
            searchState.isLoading -> {
                Row(
                    Modifier.fillMaxWidth().padding(vertical=10.dp),
                    verticalAlignment=Alignment.CenterVertically,
                    horizontalArrangement=Arrangement.spacedBy(10.dp)
                ) {
                    androidx.compose.material3.CircularProgressIndicator(
                        Modifier.size(18.dp),strokeWidth=2.dp,color=VistoraPalette.Rose,trackColor=VistoraPalette.Track
                    )
                    Text("Searching the selected catalogue…",color=VistoraPalette.Secondary,fontSize=13.sp)
                }
            }
            searchState.error != null -> {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                        .background(VistoraPalette.DroppedSurface).padding(14.dp),
                    verticalArrangement=Arrangement.spacedBy(5.dp)
                ) {
                    Text("Search couldn't be completed",color=VistoraPalette.DroppedText,fontSize=13.sp,fontWeight=FontWeight.SemiBold)
                    Text(searchState.error,color=VistoraPalette.Secondary,fontSize=12.sp,lineHeight=17.sp)
                }
            }
            searchState.query.isNotBlank() -> {
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment=Alignment.CenterVertically,
                    horizontalArrangement=Arrangement.SpaceBetween
                ) {
                    Text("${liveResults.size} results",color=VistoraPalette.Secondary,fontSize=13.sp)
                    Text(
                        "Clear search",
                        Modifier.clickable { query=""; onClearSearch() }.padding(vertical=7.dp,horizontal=5.dp),
                        color=VistoraPalette.Rose,fontSize=12.sp,fontWeight=FontWeight.SemiBold
                    )
                }
            }
        }

        if (searchState.query.isNotBlank() && !searchState.isLoading) {
            if(searchState.error==null && liveResults.isEmpty()) {
                Box(Modifier.weight(1f).fillMaxWidth(),contentAlignment=Alignment.Center) {
                    Text("No catalogue results found. Try another title.",color=VistoraPalette.Muted,fontSize=13.sp)
                }
            } else {
                LazyColumn(
                    Modifier.weight(1f),
                    verticalArrangement=Arrangement.spacedBy(11.dp),
                    contentPadding=PaddingValues(bottom=26.dp)
                ) {
                    items(liveResults,key={it.providerId}) { result ->
                        CatalogResultRow(result){onAdd(result)}
                    }
                }
            }
        } else if(searchState.query.isBlank() && !searchState.isLoading) {
            LazyColumn(
                Modifier.weight(1f),
                verticalArrangement=Arrangement.spacedBy(20.dp),
                contentPadding=PaddingValues(bottom=24.dp)
            ) {
                if(localSuggestions.isNotEmpty()) {
                    item {
                        Column(verticalArrangement=Arrangement.spacedBy(11.dp)) {
                            Text(
                                "Picked for tonight",
                                color=VistoraPalette.Text,
                                style=androidx.compose.ui.text.TextStyle(fontFamily=FontFamily.Serif,fontSize=25.sp,fontWeight=FontWeight.Medium)
                            )
                            LazyRow(horizontalArrangement=Arrangement.spacedBy(12.dp)) {
                                items(localSuggestions.take(6),key={"pick-${it.type.name}-${it.title}"}) { item ->
                                    FeaturedSuggestion(item) {
                                        onAdd(item.toCatalogResult())
                                    }
                                }
                            }
                        }
                    }
                }

                val genres = localSuggestions.flatMap { item -> item.genres.map { it to item } }
                    .groupBy({it.first},{it.second})
                    .toSortedMap(compareBy<String> { it })
                genres.forEach { (genre,titles) ->
                    item(key="genre-$genre") {
                        Column(verticalArrangement=Arrangement.spacedBy(10.dp)) {
                            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically) {
                                Text(
                                    genre,
                                    color=VistoraPalette.Text,
                                    style=androidx.compose.ui.text.TextStyle(fontFamily=FontFamily.Serif,fontSize=24.sp,fontWeight=FontWeight.Medium)
                                )
                                Text("${titles.size} titles",color=VistoraPalette.Muted,fontSize=12.sp)
                            }
                            LazyRow(horizontalArrangement=Arrangement.spacedBy(12.dp)) {
                                items(titles.distinctBy { it.title }.take(10),key={"shelf-${genre}-${it.type.name}-${it.title}"}) { item ->
                                    SuggestionTile(item){onAdd(item.toCatalogResult())}
                                }
                            }
                        }
                    }
                }

                if(localSuggestions.isEmpty()) {
                    item {
                        Text(
                            "You've added every offline suggestion in this category. Search the catalogue for more.",
                            color=VistoraPalette.Muted,fontSize=13.sp,lineHeight=19.sp
                        )
                    }
                }
            }
        }
    }
}

private fun MediaItem.toCatalogResult() = CatalogResult(
    providerId="offline-${type.name}-${title}",
    title=title,
    type=type,
    releaseYear=releaseYear,
    totalEpisodes=totalEpisodes,
    seriesState=seriesState,
    synopsis=synopsis,
    genres=genres,
    posterUrl=posterPath,
    source="VISTORA preview"
)

@Composable
private fun CatalogResultRow(result:CatalogResult,onAdd:()->Unit) {
    Row(
        Modifier.fillMaxWidth().padding(vertical=4.dp),
        verticalAlignment=Alignment.CenterVertically,
        horizontalArrangement=Arrangement.spacedBy(13.dp)
    ) {
        PosterArt(result.title,result.type.category,result.posterUrl,Modifier.width(58.dp))
        Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(4.dp)) {
            Text(result.title,color=VistoraPalette.Text,fontWeight=FontWeight.Medium,fontSize=15.sp,maxLines=2,overflow=TextOverflow.Ellipsis)
            Text(
                buildList {
                    add(result.type.label)
                    result.releaseYear?.let { add(it.toString()) }
                    result.totalEpisodes.takeIf { it>0 }?.let { add("$it eps") }
                    if(result.type!=MediaType.MOVIE && result.seriesState!=SeriesState.UNKNOWN) add(result.seriesState.label)
                }.joinToString(" · "),
                color=VistoraPalette.Muted,fontSize=11.sp
            )
            Text(result.genres.take(3).joinToString(" · "),color=VistoraPalette.Secondary,fontSize=11.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
            Text("Source: ${result.source}",color=VistoraPalette.Muted,fontSize=10.sp)
        }
        Text(
            "Add",
            Modifier.clip(RoundedCornerShape(999.dp)).background(VistoraPalette.Burgundy)
                .clickable(onClick=onAdd).padding(horizontal=15.dp,vertical=9.dp),
            color=VistoraPalette.OnAccent,fontSize=12.sp,fontWeight=FontWeight.SemiBold
        )
    }
}

@Composable
private fun FeaturedSuggestion(item:MediaItem,onAdd:()->Unit) {
    Row(
        Modifier.width(292.dp).height(184.dp).clip(RoundedCornerShape(19.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF38262E),Color(0xFF25252C),Color(0xFF16181D))))
            .clickable(onClick=onAdd).padding(13.dp),
        verticalAlignment=Alignment.CenterVertically,
        horizontalArrangement=Arrangement.spacedBy(13.dp)
    ) {
        PosterArt(item.title,item.type.category,item.posterPath,Modifier.width(96.dp))
        Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(6.dp)) {
            Text(item.type.label.uppercase(),color=VistoraPalette.Rose,fontSize=9.sp,fontWeight=FontWeight.Bold,letterSpacing=1.sp)
            Text(item.title,color=Color.White,style=androidx.compose.ui.text.TextStyle(fontFamily=FontFamily.Serif,fontSize=21.sp,lineHeight=23.sp,fontWeight=FontWeight.Medium),maxLines=3,overflow=TextOverflow.Ellipsis)
            Text(item.synopsis.ifBlank{item.genres.joinToString(" · ")},color=Color.White.copy(alpha=.78f),fontSize=11.sp,lineHeight=15.sp,maxLines=2,overflow=TextOverflow.Ellipsis)
            Text("Add to library  +",color=VistoraPalette.OnAccent,fontSize=11.sp,fontWeight=FontWeight.SemiBold)
        }
    }
}

@Composable
private fun SuggestionTile(item:MediaItem,onAdd:()->Unit) {
    Column(Modifier.width(112.dp).clickable(onClick=onAdd)) {
        PosterArt(item.title,item.type.category,item.posterPath,Modifier.fillMaxWidth())
        Text(item.title,color=VistoraPalette.Text,fontSize=13.sp,fontWeight=FontWeight.Medium,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=7.dp))
        Text("${item.type.label} · ${item.releaseYear ?: ""}",color=VistoraPalette.Muted,fontSize=11.sp,maxLines=1)
    }
}

@Composable
private fun TypeChip(label:String,selected:Boolean,onClick:()->Unit) {
    Text(
        label,
        modifier=Modifier.clip(RoundedCornerShape(999.dp))
            .background(if(selected)VistoraPalette.Burgundy else VistoraPalette.Surface)
            .clickable(onClick=onClick).padding(horizontal=13.dp,vertical=9.dp),
        color=if(selected)VistoraPalette.OnAccent else VistoraPalette.Secondary,
        fontSize=13.sp,fontWeight=FontWeight.Medium
    )
}
