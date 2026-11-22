package com.vistora.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
fun StatsScreen(items:List<MediaItem>){
    val completed=items.count{it.status==LibraryStatus.COMPLETED}
    val watching=items.count{it.status==LibraryStatus.WATCHING}
    val episodes=items.sumOf{it.watchedEpisodes}
    val filmsWatched=items.count{it.type==MediaType.MOVIE && it.status==LibraryStatus.COMPLETED}
    val ratings=items.map{it.rating}.filter{it>0}
    val average=if(ratings.isEmpty())"—" else String.format("%.1f",ratings.average())
    val statusCounts=LibraryStatus.entries.map{it to items.count{s->s.status==it}}
    val typeCounts=MediaType.entries.map{it to items.count{s->s.type==it}}

    Column(Modifier.fillMaxSize().background(VistoraPalette.Ink).padding(horizontal=20.dp).padding(top=18.dp).padding(bottom=20.dp),verticalArrangement=Arrangement.spacedBy(20.dp)){
        Text("Your Stats",color=VistoraPalette.Text,style=androidx.compose.material3.MaterialTheme.typography.headlineLarge)
        Text("A quiet look at your entertainment history.",color=VistoraPalette.Muted,fontSize=14.sp)
        if(items.isEmpty()){
            Box(Modifier.fillMaxWidth().weight(1f),contentAlignment=Alignment.Center){
                Column(horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(8.dp)){
                    Text("Your story starts with your first title.",color=VistoraPalette.Text,style=androidx.compose.material3.MaterialTheme.typography.titleLarge)
                    Text("As you add and complete titles, your personal statistics will appear here.",color=VistoraPalette.Muted,fontSize=14.sp,lineHeight=21.sp)
                }
            }
        }else{
            Row(horizontalArrangement=Arrangement.spacedBy(10.dp)){
                StatTile("Completed",completed.toString(),Modifier.weight(1f))
                StatTile("Currently watching",watching.toString(),Modifier.weight(1f))
            }
            Row(horizontalArrangement=Arrangement.spacedBy(10.dp)){
                StatTile("Episodes logged",episodes.toString(),Modifier.weight(1f))
                StatTile("Films watched",filmsWatched.toString(),Modifier.weight(1f))
            }
            Row(horizontalArrangement=Arrangement.spacedBy(10.dp)){
                StatTile("Titles in library",items.size.toString(),Modifier.weight(1f))
                StatTile("Average rating",average,Modifier.weight(1f))
            }
            SectionHeading("Your library by status")
            Column(verticalArrangement=Arrangement.spacedBy(12.dp)){
                statusCounts.forEach{(status,count)->
                    if(count>0) DistributionRow(status.label,count,items.size,statusColor(status))
                }
            }
            SectionHeading("By category")
            Column(verticalArrangement=Arrangement.spacedBy(12.dp)){
                typeCounts.forEach{(type,count)->
                    if(count>0) DistributionRow(type.category,count,items.size,VistoraPalette.Rose)
                }
            }
            if(ratings.isNotEmpty()){
                SectionHeading("Your rating distribution")
                Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
                    (5 downTo 1).forEach{score->
                        DistributionRow("$score stars",ratings.count{it==score},ratings.size,VistoraPalette.WatchingText)
                    }
                }
            }
        }
    }
}

@Composable
private fun StatTile(label:String,value:String,modifier:Modifier=Modifier){
    Column(modifier.clip(RoundedCornerShape(17.dp)).background(VistoraPalette.Surface).padding(16.dp),verticalArrangement=Arrangement.spacedBy(7.dp)){
        Text(value,color=VistoraPalette.Text,style=androidx.compose.ui.text.TextStyle(fontFamily=FontFamily.Serif,fontSize=34.sp,fontWeight=FontWeight.Medium,lineHeight=38.sp))
        Text(label,color=VistoraPalette.Muted,fontSize=12.sp,lineHeight=16.sp)
    }
}

@Composable
private fun DistributionRow(label:String,value:Int,total:Int,color:androidx.compose.ui.graphics.Color){
    Column(verticalArrangement=Arrangement.spacedBy(5.dp)){
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){
            Text(label,color=VistoraPalette.Secondary,fontSize=13.sp)
            Text(value.toString(),color=VistoraPalette.Text,fontSize=13.sp,fontWeight=FontWeight.SemiBold)
        }
        Box(Modifier.fillMaxWidth().height(7.dp).clip(RoundedCornerShape(7.dp)).background(VistoraPalette.Track)){
            Box(Modifier.fillMaxWidth(if(total==0)0f else value.toFloat()/total).fillMaxHeight().clip(RoundedCornerShape(7.dp)).background(color))
        }
    }
}

private fun statusColor(status:LibraryStatus)=when(status){
    LibraryStatus.WATCHING->VistoraPalette.WatchingText
    LibraryStatus.COMPLETED->VistoraPalette.CompletedText
    LibraryStatus.PLAN_TO_WATCH->VistoraPalette.PlanText
    LibraryStatus.ON_HOLD->VistoraPalette.HoldText
    LibraryStatus.DROPPED->VistoraPalette.DroppedText
}
