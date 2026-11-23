package com.vistora.android.ui.components

import android.graphics.BitmapFactory
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.*
import com.vistora.android.domain.LibraryStatus
import com.vistora.android.domain.MediaItem
import com.vistora.android.ui.theme.VistoraPalette
import com.vistora.android.data.media.PosterDownloader
import com.vistora.android.ui.theme.LocalVistoraAccent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.min

@Composable
fun VistoraIcon(
    name: String,
    modifier: Modifier = Modifier.size(22.dp),
    tint: Color = VistoraPalette.Text,
    strokeWidth: Float = 1.8f
) {
    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height
        val s = min(w, h)
        val ox = (w - s) / 2f
        val oy = (h - s) / 2f
        fun p(x: Float, y: Float) = Offset(ox + x * s, oy + y * s)
        fun line(a: Pair<Float,Float>, b: Pair<Float,Float>) =
            drawLine(tint, p(a.first,a.second), p(b.first,b.second), strokeWidth = strokeWidth.dp.toPx(), cap = StrokeCap.Round)
        fun circle(x: Float, y: Float, r: Float, fill: Boolean = false) =
            drawCircle(tint, radius = r*s, center=p(x,y), style=if(fill) androidx.compose.ui.graphics.drawscope.Fill else Stroke(strokeWidth.dp.toPx()))
        val sw = strokeWidth.dp.toPx()
        when(name) {
            "search" -> { circle(.44f,.43f,.27f); line(.64f to .64f,.84f to .84f) }
            "back" -> { line(.82f to .50f,.18f to .50f); line(.18f to .50f,.47f to .21f); line(.18f to .50f,.47f to .79f) }
            "more" -> { circle(.5f,.2f,.055f,true);circle(.5f,.5f,.055f,true);circle(.5f,.8f,.055f,true) }
            "plus" -> { line(.5f to .18f,.5f to .82f);line(.18f to .5f,.82f to .5f) }
            "minus" -> line(.18f to .5f,.82f to .5f)
            "home" -> {
                val path=Path().apply { moveTo(ox+.12f*s,oy+.49f*s);lineTo(ox+.5f*s,oy+.16f*s);lineTo(ox+.88f*s,oy+.49f*s);lineTo(ox+.82f*s,oy+.49f*s);lineTo(ox+.82f*s,oy+.88f*s);lineTo(ox+.58f*s,oy+.88f*s);lineTo(ox+.58f*s,oy+.63f*s);lineTo(ox+.42f*s,oy+.63f*s);lineTo(ox+.42f*s,oy+.88f*s);lineTo(ox+.18f*s,oy+.88f*s);lineTo(ox+.18f*s,oy+.49f*s) }
                drawPath(path,tint,style=Stroke(sw,cap=StrokeCap.Round,join=StrokeJoin.Round))
            }
            "library" -> {
                drawRoundRect(tint,p(.13f,.14f),Size(.20f*s,.72f*s),cornerRadius=androidx.compose.ui.geometry.CornerRadius(.06f*s),style=Stroke(sw))
                drawRoundRect(tint,p(.40f,.14f),Size(.20f*s,.72f*s),cornerRadius=androidx.compose.ui.geometry.CornerRadius(.06f*s),style=Stroke(sw))
                drawRoundRect(tint,p(.67f,.18f),Size(.20f*s,.68f*s),cornerRadius=androidx.compose.ui.geometry.CornerRadius(.06f*s),style=Stroke(sw))
            }
            "discover" -> {
                circle(.5f,.5f,.38f)
                val path=Path().apply { moveTo(ox+.64f*s,oy+.30f*s);lineTo(ox+.55f*s,oy+.55f*s);lineTo(ox+.30f*s,oy+.64f*s);lineTo(ox+.40f*s,oy+.40f*s);close() }
                drawPath(path,tint);drawPath(path,VistoraPalette.Ink,style=Stroke(sw))
            }
            "stats" -> {
                drawRoundRect(tint,p(.14f,.53f),Size(.16f*s,.33f*s),cornerRadius=androidx.compose.ui.geometry.CornerRadius(.04f*s))
                drawRoundRect(tint,p(.42f,.29f),Size(.16f*s,.57f*s),cornerRadius=androidx.compose.ui.geometry.CornerRadius(.04f*s))
                drawRoundRect(tint,p(.70f,.12f),Size(.16f*s,.74f*s),cornerRadius=androidx.compose.ui.geometry.CornerRadius(.04f*s))
            }
            "settings" -> {
                circle(.5f,.5f,.32f)
                circle(.5f,.5f,.11f)
                for(i in 0..7){ val a=i* Math.PI/4; val x=.5f+ kotlin.math.cos(a).toFloat()*.39f; val y=.5f+kotlin.math.sin(a).toFloat()*.39f
                    drawLine(tint,p(x,y),p(.5f+kotlin.math.cos(a).toFloat()*.49f,.5f+kotlin.math.sin(a).toFloat()*.49f),sw,cap=StrokeCap.Round)
                }
            }
            "filter" -> {
                line(.13f to .25f,.87f to .25f);line(.13f to .75f,.87f to .75f)
                line(.13f to .5f,.87f to .5f);circle(.67f,.25f,.09f,true);circle(.35f,.5f,.09f,true);circle(.61f,.75f,.09f,true)
            }
            "grid" -> {
                for(x in listOf(.16f,.56f)) for(y in listOf(.16f,.56f)) drawRoundRect(tint,p(x,y),Size(.28f*s,.28f*s),cornerRadius=androidx.compose.ui.geometry.CornerRadius(.05f*s),style=Stroke(sw))
            }
            "star" -> {
                val path=Path()
                for(i in 0..9){val a=(-Math.PI/2+i*Math.PI/5).toFloat();val r=if(i%2==0).45f else .20f;val x=.5f+kotlin.math.cos(a)*r;val y=.5f+kotlin.math.sin(a)*r;if(i==0)path.moveTo(ox+x*s,oy+y*s) else path.lineTo(ox+x*s,oy+y*s)}
                path.close();drawPath(path,tint,style=if(strokeWidth<1.5f) androidx.compose.ui.graphics.drawscope.Fill else Stroke(sw,join=StrokeJoin.Round))
            }
            "calendar" -> {
                drawRoundRect(tint,p(.16f,.22f),Size(.68f*s,.64f*s),cornerRadius=androidx.compose.ui.geometry.CornerRadius(.08f*s),style=Stroke(sw))
                line(.16f to .42f,.84f to .42f);line(.34f to .12f,.34f to .30f);line(.66f to .12f,.66f to .30f)
            }
            "check" -> {line(.18f to .52f,.42f to .75f);line(.42f to .75f,.84f to .25f)}
            "close" -> {line(.24f to .24f,.76f to .76f);line(.76f to .24f,.24f to .76f)}
            "bookmark" -> {
                val path=Path().apply { moveTo(ox+.25f*s,oy+.14f*s);lineTo(ox+.75f*s,oy+.14f*s);lineTo(ox+.75f*s,oy+.88f*s);lineTo(ox+.5f*s,oy+.70f*s);lineTo(ox+.25f*s,oy+.88f*s);close() }
                drawPath(path,tint,style=Stroke(sw,join=StrokeJoin.Round))
            }
            "clap" -> {
                drawRoundRect(tint,p(.16f,.42f),Size(.68f*s,.45f*s),cornerRadius=androidx.compose.ui.geometry.CornerRadius(.06f*s),style=Stroke(sw))
                drawRoundRect(tint,p(.17f,.23f),Size(.66f*s,.16f*s),cornerRadius=androidx.compose.ui.geometry.CornerRadius(.04f*s),style=Stroke(sw))
                line(.34f to .23f,.27f to .39f);line(.54f to .23f,.47f to .39f);line(.74f to .23f,.67f to .39f)
            }
            "heart" -> {
                val path=Path().apply{moveTo(ox+.5f*s,oy+.84f*s);cubicTo(ox+.28f*s,oy+.68f*s,ox+.11f*s,oy+.51f*s,ox+.11f*s,oy+.34f*s);cubicTo(ox+.11f*s,oy+.12f*s,ox+.39f*s,oy+.08f*s,ox+.5f*s,oy+.30f*s);cubicTo(ox+.61f*s,oy+.08f*s,ox+.89f*s,oy+.12f*s,ox+.89f*s,oy+.34f*s);cubicTo(ox+.89f*s,oy+.51f*s,ox+.72f*s,oy+.68f*s,ox+.5f*s,oy+.84f*s)}
                drawPath(path,tint,style=Stroke(sw,join=StrokeJoin.Round))
            }
            "torii" -> {
                line(.12f to .25f,.88f to .25f);line(.20f to .33f,.80f to .33f)
                line(.28f to .32f,.28f to .88f);line(.72f to .32f,.72f to .88f)
                line(.08f to .18f,.92f to .18f)
            }
            "tv" -> {
                drawRoundRect(tint,p(.12f,.18f),Size(.76f*s,.58f*s),cornerRadius=androidx.compose.ui.geometry.CornerRadius(.08f*s),style=Stroke(sw))
                line(.38f to .87f,.62f to .87f);line(.50f to .77f,.50f to .87f)
            }
            "edit" -> {
                line(.20f to .80f,.30f to .52f);line(.30f to .52f,.68f to .15f);line(.68f to .15f,.84f to .31f);line(.84f to .31f,.46f to .68f);line(.46f to .68f,.20f to .80f)
            }
            "trash" -> {
                line(.22f to .27f,.78f to .27f);line(.38f to .18f,.62f to .18f)
                line(.30f to .34f,.35f to .84f);line(.70f to .34f,.65f to .84f);line(.35f to .84f,.65f to .84f)
            }
            "bell" -> {
                val path=Path().apply{moveTo(ox+.24f*s,oy+.68f*s);lineTo(ox+.30f*s,oy+.58f*s);lineTo(ox+.30f*s,oy+.42f*s);cubicTo(ox+.30f*s,oy+.18f*s,ox+.70f*s,oy+.18f*s,ox+.70f*s,oy+.42f*s);lineTo(ox+.70f*s,oy+.58f*s);lineTo(ox+.76f*s,oy+.68f*s);close()}
                drawPath(path,tint,style=Stroke(sw,join=StrokeJoin.Round))
                drawArc(tint,0f,180f,false,p(.40f,.70f),Size(.20f*s,.14f*s),style=Stroke(sw))
            }
            else -> circle(.5f,.5f,.32f)
        }
    }
}

@Composable
fun SectionHeading(
    title: String,
    action: String? = null,
    onAction: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Text(title, style = androidx.compose.material3.MaterialTheme.typography.titleLarge, color = VistoraPalette.Text)
        if (action != null && onAction != null) {
            Text(action, modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .clickable(onClick = onAction)
                .padding(horizontal = 8.dp, vertical = 8.dp),
                color = VistoraPalette.Muted,
                style = androidx.compose.material3.MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun VistoraAction(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leading: String? = null,
    quiet: Boolean = false,
    enabled: Boolean = true
) {
    val accent = LocalVistoraAccent.current
    Row(
        modifier = modifier
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (quiet) VistoraPalette.Raised else accent)
            .border(1.dp, if (quiet) VistoraPalette.LineStrong else Color.Transparent, RoundedCornerShape(14.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (leading != null) {
            VistoraIcon(leading, Modifier.size(18.dp), if (quiet) VistoraPalette.Secondary else VistoraPalette.OnAccent)
            Spacer(Modifier.width(8.dp))
        }
        Text(label, color = if (quiet) VistoraPalette.Text else VistoraPalette.OnAccent,
            style = androidx.compose.material3.MaterialTheme.typography.labelLarge)
    }
}

@Composable
fun VistoraTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    label: String? = null,
    minLines: Int = 1,
    maxLines: Int = 1,
    singleLine: Boolean = true,
    keyboardType: KeyboardType = KeyboardType.Text,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    testTag: String? = null
) {
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(7.dp)) {
        if (label != null) {
            Text(label, color = VistoraPalette.Secondary, style = androidx.compose.material3.MaterialTheme.typography.labelLarge)
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(VistoraPalette.Field)
                .border(1.dp, if (focused) LocalVistoraAccent.current else VistoraPalette.LineStrong, RoundedCornerShape(14.dp))
                .padding(horizontal = 15.dp, vertical = if (singleLine) 14.dp else 14.dp)
                .then(if (testTag == null) Modifier else Modifier.testTag(testTag)),
            textStyle = TextStyle(
                color = VistoraPalette.Text,
                fontSize = 15.sp,
                lineHeight = 23.sp,
                fontWeight = FontWeight.Normal
            ),
            cursorBrush = SolidColor(LocalVistoraAccent.current),
            interactionSource = interactionSource,
            minLines = minLines,
            maxLines = maxLines,
            singleLine = singleLine,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            visualTransformation = visualTransformation,
            decorationBox = { inner ->
                Box {
                    if (value.isEmpty()) Text(placeholder, color = VistoraPalette.Muted, fontSize = 15.sp)
                    inner()
                }
            }
        )
    }
}

@Composable
fun StatusLabel(
    status: LibraryStatus,
    modifier: Modifier = Modifier,
    compact: Boolean = false
) {
    val (bg, fg) = when (status) {
        LibraryStatus.WATCHING -> VistoraPalette.WatchingSurface to VistoraPalette.WatchingText
        LibraryStatus.COMPLETED -> VistoraPalette.CompletedSurface to VistoraPalette.CompletedText
        LibraryStatus.PLAN_TO_WATCH -> VistoraPalette.PlanSurface to VistoraPalette.PlanText
        LibraryStatus.ON_HOLD -> VistoraPalette.HoldSurface to VistoraPalette.HoldText
        LibraryStatus.DROPPED -> VistoraPalette.DroppedSurface to VistoraPalette.DroppedText
    }
    Box(
        modifier = modifier
            .heightIn(min = if (compact) 23.dp else 48.dp)
            .clip(RoundedCornerShape(7.dp))
            .background(bg)
            .border(1.dp, fg.copy(alpha = 0.24f), RoundedCornerShape(7.dp))
            .padding(horizontal = if (compact) 8.dp else 13.dp, vertical = if (compact) 3.dp else 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            status.label,
            color = fg,
            style = TextStyle(fontSize = if (compact) 10.sp else 13.sp, fontWeight = FontWeight.SemiBold),
            maxLines = 1
        )
    }
}

@Composable
fun PosterArt(
    title: String,
    type: String,
    posterPath: String?,
    modifier: Modifier = Modifier,
    status: LibraryStatus? = null
) {
    val context = LocalContext.current
    val image by produceState<ImageBitmap?>(initialValue = null, key1 = posterPath) {
        value = null
        if (!posterPath.isNullOrBlank()) {
            value = withContext(Dispatchers.IO) {
                suspend fun loadOnce(): ImageBitmap? = runCatching {
                    val localPath = if (posterPath.startsWith("https://")) {
                        PosterDownloader.cache(context, posterPath)
                    } else {
                        posterPath.removePrefix("file://")
                    }
                    if (localPath.isNullOrBlank()) null
                    else BitmapFactory.decodeFile(localPath)?.asImageBitmap()
                }.getOrNull()

                loadOnce() ?: run {
                    // A transient network/cache failure should not permanently leave a blank cover.
                    kotlinx.coroutines.delay(450)
                    loadOnce()
                }
            }
        }
    }

    val categoryIcon = when {
        type.contains("movie",ignoreCase=true) -> "clap"
        type.contains("drama",ignoreCase=true) -> "heart"
        type.contains("anime",ignoreCase=true) -> "torii"
        else -> "tv"
    }
    Box(
        modifier = modifier
            .aspectRatio(2f / 3f)
            .clip(RoundedCornerShape(12.dp))
            .background(
                Brush.linearGradient(
                    listOf(Color(0xFF3A242A), Color(0xFF24252C), Color(0xFF17191F))
                )
            )
    ) {
        if (image != null) {
            androidx.compose.foundation.Image(
                bitmap = image!!,
                contentDescription = "$title poster",
                modifier = Modifier.fillMaxSize(),
                contentScale = androidx.compose.ui.layout.ContentScale.Crop
            )
            Box(
                Modifier.fillMaxSize().background(
                    Brush.verticalGradient(listOf(Color.Transparent, Color.Transparent, Color.Black.copy(alpha = .44f)))
                )
            )
        } else {
            Canvas(Modifier.fillMaxSize()) {
                drawCircle(Color(0xFF89545E).copy(alpha = .18f), radius = size.width * .52f, center = Offset(size.width * .78f, size.height * .30f))
                drawCircle(Color(0xFF303F50).copy(alpha = .30f), radius = size.width * .55f, center = Offset(size.width * .1f, size.height * .85f))
                drawRect(Brush.verticalGradient(listOf(Color.Black.copy(alpha = .04f), Color.Transparent, Color.Black.copy(alpha = .68f))))
            }
            Text(
                title,
                modifier = Modifier.align(Alignment.TopStart).fillMaxWidth(.82f).padding(10.dp),
                color = Color.White,
                style = TextStyle(fontFamily = androidx.compose.ui.text.font.FontFamily.Serif, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 17.sp),
                maxLines = 4,
                overflow = TextOverflow.Ellipsis
            )
        }
        Box(
            Modifier.align(Alignment.TopEnd).padding(7.dp).size(24.dp)
                .clip(RoundedCornerShape(8.dp)).background(Color.Black.copy(alpha=.36f)),
            contentAlignment=Alignment.Center
        ) {
            VistoraIcon(categoryIcon,Modifier.size(14.dp),Color.White.copy(alpha=.94f))
        }
        if (status != null) {
            StatusLabel(
                status,
                Modifier.align(Alignment.BottomStart).padding(6.dp),
                compact = true
            )
        }
    }
}

@Composable
fun PosterTile(
    item: MediaItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    showStatus: Boolean = true,
    compact: Boolean = false
) {
    Column(modifier = modifier.clickable(role = Role.Button, onClick = onClick)) {
        PosterArt(item.title, item.type.category, item.posterPath, Modifier.fillMaxWidth(), if (showStatus) item.status else null)
        Text(
            item.title,
            modifier = Modifier.padding(top = if (compact) 6.dp else 8.dp),
            color = VistoraPalette.Text,
            style = TextStyle(fontSize = if (compact) 12.sp else 14.sp, fontWeight = FontWeight.Medium),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        if (!compact) {
            Text(
                listOfNotNull(item.type.label,item.releaseYear?.toString()).joinToString(" · "),
                color = VistoraPalette.Muted,
                style = TextStyle(fontSize = 12.sp),
                maxLines = 1
            )
        }
    }
}

@Composable
fun VistoraBottomBar(
    selected: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val accent = LocalVistoraAccent.current
    val destinations = listOf(
        Triple("Home","home","Home"),
        Triple("Library","library","Library"),
        Triple("Discover","discover","Discover"),
        Triple("Stats","stats","Stats"),
        Triple("More","settings","Settings")
    )
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(VistoraPalette.Ink.copy(alpha=.97f))
            .border(width=1.dp,color=VistoraPalette.Line,shape=RoundedCornerShape(topStart=18.dp,topEnd=18.dp))
            .padding(start=4.dp,end=4.dp,top=6.dp,bottom=5.dp),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {
        destinations.forEach { (label, icon, route) ->
            val active = selected == route
            Column(
                modifier = Modifier.weight(1f).heightIn(min=54.dp)
                    .clip(RoundedCornerShape(13.dp))
                    .semantics { role = Role.Tab; stateDescription = if (active) "Selected" else "Not selected" }
                    .clickable(role = Role.Tab,onClick={onSelect(route)})
                    .padding(vertical=4.dp),
                horizontalAlignment=Alignment.CenterHorizontally,
                verticalArrangement=Arrangement.spacedBy(3.dp)
            ) {
                Box(
                    Modifier.width(54.dp).height(28.dp).clip(RoundedCornerShape(14.dp))
                        .background(if(active) accent.copy(alpha=.16f) else Color.Transparent),
                    contentAlignment=Alignment.Center
                ) { VistoraIcon(icon, Modifier.size(20.dp), if(active) accent else VistoraPalette.Muted) }
                Text(label, color=if(active) VistoraPalette.Text else VistoraPalette.Muted, fontSize=11.sp, fontWeight=if(active) FontWeight.SemiBold else FontWeight.Medium)
            }
        }
    }
}
