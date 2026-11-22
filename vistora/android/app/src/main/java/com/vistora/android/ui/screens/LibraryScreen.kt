package com.vistora.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vistora.android.domain.LibraryStatus
import com.vistora.android.domain.MediaItem
import com.vistora.android.domain.MediaType
import com.vistora.android.ui.components.PosterTile
import com.vistora.android.ui.components.SectionHeading
import com.vistora.android.ui.components.VistoraIcon
import com.vistora.android.ui.components.VistoraTextField
import com.vistora.android.ui.theme.VistoraPalette

@Composable
fun LibraryScreen(
    items: List<MediaItem>,
    initialType: MediaType? = null,
    initialStatus: LibraryStatus? = null,
    onOpenTitle: (Long) -> Unit,
    onAdd: () -> Unit,
    onFilters: () -> Unit,
    onGridColumns: () -> Unit
) {
    var query by remember { mutableStateOf("") }
    var type by remember(initialType) { mutableStateOf(initialType) }
    var status by remember(initialStatus) { mutableStateOf(initialStatus) }
    var columns by remember { mutableIntStateOf(2) }
    var sort by remember { mutableStateOf("Recently updated") }

    val filtered = remember(items,query,type,status,sort) {
        val base=items.asSequence()
            .filter { type == null || it.type == type }
            .filter { status == null || it.status == status }
            .filter { query.isBlank() || it.title.contains(query.trim(),ignoreCase=true) || it.genres.any { g->g.contains(query.trim(),true) } }
            .toList()
        when(sort){
            "Title A–Z"->base.sortedBy{it.title.lowercase()}
            "Title Z–A"->base.sortedByDescending{it.title.lowercase()}
            "Highest rated"->base.sortedWith(compareByDescending<MediaItem>{it.rating}.thenBy{it.title})
            "Recently added"->base.sortedByDescending{it.addedAt}
            "Newest release"->base.sortedByDescending{it.releaseYear ?: 0}
            else->base.sortedByDescending{it.updatedAt}
        }
    }

    Column(Modifier.fillMaxSize().padding(horizontal=20.dp)) {
        Row(Modifier.fillMaxWidth().padding(top=14.dp,bottom=12.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.SpaceBetween){
            Text("My Library",color=VistoraPalette.Text,style=androidx.compose.material3.MaterialTheme.typography.headlineLarge)
            Row(verticalAlignment=Alignment.CenterVertically){
                SmallHeaderAction("search","Search"){ /* focus is below */ }
                SmallHeaderAction("filter","Filters",onFilters)
            }
        }
        VistoraTextField(query,{query=it},"Search your library",Modifier.fillMaxWidth())
        Spacer(Modifier.height(13.dp))
        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.SpaceBetween){
            Text(buildString{
                append(if(filtered.isEmpty()) "No titles yet" else "Your collection")
                if(type!=null) append(" · ${type!!.category}")
            },color=VistoraPalette.Secondary,fontSize=14.sp,fontWeight=FontWeight.Medium)
            Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(5.dp)){
                Text(sort,color=VistoraPalette.Muted,fontSize=12.sp,modifier=Modifier.clickable { sort=when(sort){"Recently updated"->"Recently added";"Recently added"->"Title A–Z";"Title A–Z"->"Highest rated";"Highest rated"->"Newest release";else->"Recently updated"} })
                Box(Modifier.size(38.dp).clickable(onClick=onGridColumns),contentAlignment=Alignment.Center){VistoraIcon("grid",Modifier.size(19.dp),VistoraPalette.Secondary)}
            }
        }
        Spacer(Modifier.height(12.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(VistoraPalette.LineStrong))
        Spacer(Modifier.height(14.dp))
        if(filtered.isEmpty()){
            Box(Modifier.fillMaxWidth().weight(1f),contentAlignment=Alignment.Center){
                Column(horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(10.dp)){
                    Text(if(items.isEmpty()) "Your library starts here." else "No titles match these filters.",color=VistoraPalette.Text,style=androidx.compose.material3.MaterialTheme.typography.titleLarge)
                    Text(if(items.isEmpty()) "Add a film or series to begin building your collection." else "Try a different search or clear the filters.",color=VistoraPalette.Muted,fontSize=14.sp)
                    if(items.isEmpty()) {
                        Row(Modifier.clickable(onClick=onAdd).background(VistoraPalette.Burgundy,RoundedCornerShape(13.dp)).padding(horizontal=16.dp,vertical=12.dp),verticalAlignment=Alignment.CenterVertically){
                            VistoraIcon("plus",Modifier.size(18.dp),VistoraPalette.OnAccent);Spacer(Modifier.width(7.dp));Text("Add your first title",color=VistoraPalette.OnAccent,fontWeight=FontWeight.SemiBold)
                        }
                    }
                }
            }
        }else{
            LazyVerticalGrid(
                columns=GridCells.Fixed(columns),
                modifier=Modifier.weight(1f),
                contentPadding=PaddingValues(bottom=28.dp),
                horizontalArrangement=Arrangement.spacedBy(if(columns>=4)8.dp else 12.dp),
                verticalArrangement=Arrangement.spacedBy(if(columns>=4)14.dp else 18.dp)
            ){
                items(filtered,key={it.id},contentType={"media-poster"}){item->
                    PosterTile(item,{onOpenTitle(item.id)},showStatus=true)
                }
            }
        }
    }
}

@Composable
private fun SmallHeaderAction(icon:String,label:String,onClick:()->Unit){
    Column(Modifier.width(46.dp).height(48.dp).clickable(onClick=onClick),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center){
        VistoraIcon(icon,Modifier.size(20.dp),VistoraPalette.Secondary)
        Text(label,color=VistoraPalette.Muted,fontSize=9.sp)
    }
}
