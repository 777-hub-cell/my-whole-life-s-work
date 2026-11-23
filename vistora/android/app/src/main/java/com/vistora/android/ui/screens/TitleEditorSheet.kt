package com.vistora.android.ui.screens

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vistora.android.domain.LibraryStatus
import com.vistora.android.domain.MediaItem
import com.vistora.android.domain.MediaType
import com.vistora.android.domain.SeriesState
import com.vistora.android.ui.components.PosterArt
import com.vistora.android.ui.components.VistoraAction
import com.vistora.android.ui.components.VistoraTextField
import com.vistora.android.ui.theme.VistoraPalette
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

@Composable
fun TitleEditorSheet(
    initial: MediaItem?,
    onDismiss: () -> Unit,
    onSave: (MediaItem) -> Unit
) {
    val context= LocalContext.current
    val scope= rememberCoroutineScope()
    val base=initial ?: MediaItem(title="",type=MediaType.MOVIE)
    var title by remember(initial?.id){mutableStateOf(base.title)}
    var type by remember(initial?.id){mutableStateOf(base.type)}
    var status by remember(initial?.id){mutableStateOf(base.status)}
    var year by remember(initial?.id){mutableStateOf(base.releaseYear?.toString().orEmpty())}
    var episodes by remember(initial?.id){mutableStateOf(base.totalEpisodes.toString().takeIf{it!="0"}.orEmpty())}
    var seriesState by remember(initial?.id){mutableStateOf(base.seriesState)}
    var rating by remember(initial?.id){mutableIntStateOf(base.rating)}
    var genres by remember(initial?.id){mutableStateOf(base.genres.joinToString(", "))}
    var synopsis by remember(initial?.id){mutableStateOf(base.synopsis)}
    var watchlist by remember(initial?.id){mutableStateOf(base.isWatchlisted)}
    var posterPath by remember(initial?.id){mutableStateOf(base.posterPath)}
    var error by remember { mutableStateOf<String?>(null) }

    val photoPicker= rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()){uri->
        if(uri!=null){
            scope.launch {
                val saved=withContext(Dispatchers.IO){
                    runCatching {
                        val options=BitmapFactory.Options().apply{inJustDecodeBounds=true}
                        context.contentResolver.openInputStream(uri)?.use{BitmapFactory.decodeStream(it,null,options)}
                        var sample=1
                        while(options.outWidth/sample>1200 || options.outHeight/sample>1800) sample*=2
                        val bitmap=context.contentResolver.openInputStream(uri)?.use{
                            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply{inSampleSize=sample})
                        } ?: error("Image couldn't be opened")
                        val dir=File(context.filesDir,"posters").apply{mkdirs()}
                        val target=File(dir,"vistora-${UUID.randomUUID()}.jpg")
                        FileOutputStream(target).use{bitmap.compress(Bitmap.CompressFormat.JPEG,88,it)}
                        bitmap.recycle()
                        target.absolutePath
                    }.getOrNull()
                }
                if(saved==null) error="Couldn't save that poster image" else posterPath=saved
            }
        }
    }

    Column(
        Modifier.fillMaxWidth().heightIn(max=760.dp).verticalScroll(rememberScrollState())
            .padding(horizontal=20.dp).padding(bottom=24.dp)
    ) {
        Text(if(initial==null)"Add a title" else "Edit title",color=VistoraPalette.Text,style=androidx.compose.material3.MaterialTheme.typography.headlineMedium)
        Text("A few details make it easier to find and remember later.",color=VistoraPalette.Muted,fontSize=13.sp,modifier=Modifier.padding(top=4.dp,bottom=17.dp))
        Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(15.dp)){
            PosterArt(title.ifBlank{"Your poster"},type.category,posterPath,Modifier.width(86.dp))
            Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(8.dp)){
                Text("Poster image",color=VistoraPalette.Secondary,fontSize=13.sp,fontWeight=FontWeight.SemiBold)
                VistoraAction("Choose poster",onClick={photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))},quiet=true)
                Text("Stored privately on this device.",color=VistoraPalette.Muted,fontSize=11.sp)
            }
        }
        VistoraTextField(title,{title=it;error=null},"Title name",label="Title",modifier=Modifier.padding(top=18.dp),testTag="title-input")
        Text("Content type",color=VistoraPalette.Secondary,fontSize=13.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.padding(top=17.dp,bottom=8.dp))
        FlowChoiceRow { 
            MediaType.entries.forEach{ t-> SelectChip(t.category,type==t){type=t;if(t==MediaType.MOVIE)episodes=""} }
        }
        Text("Your status",color=VistoraPalette.Secondary,fontSize=13.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.padding(top=15.dp,bottom=8.dp))
        FlowChoiceRow { LibraryStatus.entries.forEach{s->SelectChip(s.label,status==s){status=s}} }
        Row(Modifier.fillMaxWidth().padding(top=15.dp),horizontalArrangement=Arrangement.spacedBy(10.dp)){
            VistoraTextField(year,{year=it.filter(Char::isDigit).take(4)},"e.g. 2024",label="Release year",keyboardType=KeyboardType.Number,modifier=Modifier.weight(1f))
            if(type!=MediaType.MOVIE){
                VistoraTextField(episodes,{episodes=it.filter(Char::isDigit).take(4)},"e.g. 12",label="Total episodes",keyboardType=KeyboardType.Number,modifier=Modifier.weight(1f))
            }
        }
        if(type!=MediaType.MOVIE){
            Text("Series release state",color=VistoraPalette.Secondary,fontSize=13.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.padding(top=15.dp,bottom=8.dp))
            FlowChoiceRow { SeriesState.entries.forEach { s-> if(s!=SeriesState.UNKNOWN)SelectChip(s.label,seriesState==s){seriesState=s} } }
        }
        Text("Your rating",color=VistoraPalette.Secondary,fontSize=13.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.padding(top=15.dp,bottom=7.dp))
        Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(4.dp)){
            (1..5).forEach{ n->
                Text("★",modifier=Modifier.size(36.dp).clip(RoundedCornerShape(8.dp)).clickable{rating=if(rating==n)0 else n}.wrapContentSize(Alignment.Center),
                    color=if(n<=rating)VistoraPalette.WatchingText else VistoraPalette.Muted,fontSize=26.sp)
            }
            Text(if(rating==0)"Not rated" else "$rating / 5",color=VistoraPalette.Muted,fontSize=12.sp)
        }
        VistoraTextField(genres,{genres=it},"Action, Drama, Fantasy",label="Genres (comma separated)",modifier=Modifier.padding(top=14.dp))
        VistoraTextField(synopsis,{synopsis=it},"Add a short synopsis…",label="Synopsis",singleLine=false,minLines=3,maxLines=6,modifier=Modifier.padding(top=14.dp))
        Row(Modifier.fillMaxWidth().padding(top=15.dp).clip(RoundedCornerShape(13.dp)).background(VistoraPalette.Surface).clickable{watchlist=!watchlist}.padding(14.dp),
            verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.SpaceBetween){
            Column(Modifier.weight(1f)){
                Text("Add to My Watchlist",color=VistoraPalette.Text,fontWeight=FontWeight.SemiBold,fontSize=14.sp)
                Text("Keep this title in your saved list.",color=VistoraPalette.Muted,fontSize=12.sp)
            }
            Text(if(watchlist)"Added" else "Add",color=VistoraPalette.Rose,fontWeight=FontWeight.SemiBold)
        }
        if(error!=null) Text(error!!,color=VistoraPalette.DroppedText,fontSize=12.sp,modifier=Modifier.padding(top=10.dp))
        Row(Modifier.fillMaxWidth().padding(top=18.dp),horizontalArrangement=Arrangement.spacedBy(10.dp)){
            VistoraAction("Cancel",onDismiss,Modifier.weight(1f),quiet=true)
            VistoraAction(if(initial==null)"Add to library" else "Save changes",onClick={
                val cleanTitle=title.trim()
                if(cleanTitle.isBlank()){error="Enter a title first";return@VistoraAction}
                val epCount=if(type==MediaType.MOVIE)0 else (episodes.toIntOrNull()?:0).coerceIn(0,5000)
                if(type!=MediaType.MOVIE && epCount<0){error="Enter a valid episode total";return@VistoraAction}
                onSave(base.copy(
                    title=cleanTitle,type=type,status=status,
                    releaseYear=year.toIntOrNull(),
                    totalEpisodes=epCount,
                    watchedEpisodes=if(status==LibraryStatus.COMPLETED&&epCount>0)epCount else base.watchedEpisodes.coerceAtMost(epCount),
                    seriesState=if(type==MediaType.MOVIE)SeriesState.UNKNOWN else seriesState,
                    rating=rating,genres=genres.split(",").map{it.trim()}.filter{it.isNotEmpty()}.take(8),
                    synopsis=synopsis.trim(),isWatchlisted=watchlist,posterPath=posterPath
                ))
            },Modifier.weight(1.4f))
        }
    }
}

@Composable
private fun FlowChoiceRow(content:@Composable RowScope.()->Unit){
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(7.dp),verticalAlignment=Alignment.CenterVertically,content=content)
}

@Composable
private fun SelectChip(label:String,selected:Boolean,onClick:()->Unit){
    Text(label,modifier=Modifier.clip(RoundedCornerShape(9.dp))
        .background(if(selected)VistoraPalette.Burgundy else VistoraPalette.Surface)
        .clickable(onClick=onClick).padding(horizontal=10.dp,vertical=9.dp),
        color=if(selected)VistoraPalette.OnAccent else VistoraPalette.Secondary,fontSize=12.sp,fontWeight=if(selected)FontWeight.SemiBold else FontWeight.Medium)
}
