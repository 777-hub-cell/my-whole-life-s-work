package com.vistora.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vistora.android.domain.LibraryStatus
import com.vistora.android.domain.MediaItem
import com.vistora.android.domain.MediaType
import com.vistora.android.ui.components.PosterTile
import com.vistora.android.ui.components.SectionHeading
import com.vistora.android.ui.components.VistoraAction
import com.vistora.android.ui.components.VistoraIcon
import com.vistora.android.ui.theme.VistoraPalette

@Composable
fun HomeScreen(
    items: List<MediaItem>,
    onSearch: () -> Unit,
    onNotifications: () -> Unit,
    onOpenTitle: (Long) -> Unit,
    onOpenLibrary: (LibraryStatus?) -> Unit,
    onOpenCategory: (MediaType) -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal=20.dp),
        verticalArrangement=Arrangement.spacedBy(24.dp)
    ) {
        Row(
            Modifier.fillMaxWidth().padding(top=9.dp),
            verticalAlignment=Alignment.CenterVertically,
            horizontalArrangement=Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(38.dp).background(VistoraPalette.Burgundy,RoundedCornerShape(10.dp)),contentAlignment=Alignment.Center) {
                    Text("V",color=VistoraPalette.OnAccent,style=TextStyle(fontFamily=FontFamily.Serif,fontSize=28.sp,fontStyle=androidx.compose.ui.text.font.FontStyle.Italic))
                }
                Text("VISTORA",color=VistoraPalette.Text,fontSize=21.sp,fontWeight=FontWeight.Medium,letterSpacing=3.sp)
            }
            Row(verticalAlignment=Alignment.CenterVertically) {
                IconButton("search","Search",onSearch)
                IconButton("bell","Notifications",onNotifications)
            }
        }
        Column(verticalArrangement=Arrangement.spacedBy(6.dp)) {
            Text("Your entertainment,",style=TextStyle(fontFamily=FontFamily.Serif,fontSize=29.sp,lineHeight=34.sp,fontWeight=FontWeight.Medium,letterSpacing=(-.5).sp),color=VistoraPalette.Text)
            Text("all in one place.",style=TextStyle(fontFamily=FontFamily.Serif,fontSize=30.sp,lineHeight=35.sp,fontStyle=androidx.compose.ui.text.font.FontStyle.Italic),color=VistoraPalette.Rose)
            Text("A little home for everything you've watched and loved.",color=VistoraPalette.Muted,fontSize=14.sp,lineHeight=21.sp)
        }

        SectionHeading("Browse categories")
        Column(verticalArrangement=Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {
                CategoryTile("Movies","clap",Modifier.weight(1f)){onOpenCategory(MediaType.MOVIE)}
                CategoryTile("K-Dramas","heart",Modifier.weight(1f)){onOpenCategory(MediaType.K_DRAMA)}
            }
            Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {
                CategoryTile("Anime","torii",Modifier.weight(1f)){onOpenCategory(MediaType.ANIME)}
                CategoryTile("TV Series","tv",Modifier.weight(1f)){onOpenCategory(MediaType.TV_SERIES)}
            }
        }

        val watching=items.filter { it.status==LibraryStatus.WATCHING }
        TitleShelf("Currently watching",watching,onOpenTitle,onOpenLibrary)
        val planned=items.filter { it.status==LibraryStatus.PLAN_TO_WATCH }
        TitleShelf("Plan to watch",planned,onOpenTitle,onOpenLibrary)
        val completed=items.filter { it.status==LibraryStatus.COMPLETED }.sortedByDescending { it.updatedAt }
        TitleShelf("Recently finished",completed,onOpenTitle,onOpenLibrary)
        Spacer(Modifier.height(10.dp))
    }
}

@Composable
private fun IconButton(name:String,description:String,onClick:()->Unit){
    Box(Modifier.size(44.dp).clickable(onClick=onClick),contentAlignment=Alignment.Center){
        VistoraIcon(name,Modifier.size(21.dp),VistoraPalette.Text)
    }
}

@Composable
private fun CategoryTile(label:String,icon:String,modifier:Modifier=Modifier,onClick:()->Unit){
    Row(
        modifier=modifier.height(82.dp).background(VistoraPalette.Surface,RoundedCornerShape(16.dp))
            .clickable(onClick=onClick).padding(horizontal=15.dp),
        verticalAlignment=Alignment.CenterVertically,
        horizontalArrangement=Arrangement.spacedBy(14.dp)
    ){
        Box(Modifier.size(43.dp).background(VistoraPalette.Rose.copy(alpha=.12f),RoundedCornerShape(13.dp)),contentAlignment=Alignment.Center){
            VistoraIcon(icon,Modifier.size(23.dp),VistoraPalette.Rose)
        }
        Text(label,color=VistoraPalette.Text,style=TextStyle(fontFamily=FontFamily.Serif,fontSize=20.sp,fontWeight=FontWeight.Medium),maxLines=1,overflow=TextOverflow.Ellipsis)
    }
}

@Composable
private fun TitleShelf(
    title:String,
    list:List<MediaItem>,
    onOpenTitle:(Long)->Unit,
    onSeeAll:(LibraryStatus?)->Unit
){
    Column(verticalArrangement=Arrangement.spacedBy(12.dp)){
        SectionHeading(title,if(list.isNotEmpty()) "See all" else null,{onSeeAll(list.firstOrNull()?.status)})
        if(list.isEmpty()){
            Text("Your titles will appear here as you add them.",color=VistoraPalette.Muted,fontSize=13.sp)
        } else {
            LazyRow(horizontalArrangement=Arrangement.spacedBy(12.dp)){
                items(list.take(12),key={it.id}){item->
                    PosterTile(item,{onOpenTitle(item.id)},Modifier.width(116.dp))
                }
            }
        }
    }
}
