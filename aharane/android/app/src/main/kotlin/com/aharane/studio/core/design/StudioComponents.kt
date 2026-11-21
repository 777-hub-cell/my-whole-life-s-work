package com.aharane.studio.core.design

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.input.pointer.pointerInput
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.res.painterResource
import com.aharane.studio.R
import com.aharane.studio.core.navigation.MainDestination
import android.graphics.Color as AndroidColor

val LocalStudioCornerScale = staticCompositionLocalOf { 1f }
val LocalStudioRowScale = staticCompositionLocalOf { 1f }

@Composable
fun StudioHeader() {
    Row(
        modifier = Modifier.fillMaxWidth().background(StudioPalette.Background)
            .padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 18.dp)
            .height(30.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            Image(
                painter = painterResource(R.drawable.ic_aharane_brand),
                contentDescription = null,
                modifier = Modifier.size(26.dp)
            )
            Text(
                "Aharane",
                color = StudioPalette.Ink,
                fontFamily = MaterialTheme.typography.titleLarge.fontFamily,
                fontSize = 21.sp,
                lineHeight = 25.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.42).sp
            )
        }
        Spacer(Modifier.weight(1f))
    }
}

@Composable
fun StudioBottomNavigation(
    selected: MainDestination,
    onNavigate: (MainDestination) -> Unit
) {
    Column(Modifier.fillMaxWidth().background(StudioPalette.Surface).navigationBarsPadding()) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(StudioPalette.Line))
        Row(Modifier.fillMaxWidth().height(58.dp), verticalAlignment = Alignment.CenterVertically) {
            MainDestination.entries.forEach { destination ->
                val active = selected == destination
                val tint = if (active) StudioPalette.Accent else StudioPalette.Muted
                Column(
                    modifier = Modifier.weight(1f).fillMaxHeight()
                        .clickable { onNavigate(destination) }
                        .padding(top = 7.dp, bottom = 5.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(3.dp, Alignment.CenterVertically)
                ) {
                    val icon = when (destination) {
                        MainDestination.HOME -> Icons.Outlined.Home
                        MainDestination.CHATS -> Icons.Outlined.ChatBubbleOutline
                        MainDestination.FILES -> Icons.Outlined.FolderOpen
                        MainDestination.ENVIRONMENT -> Icons.Outlined.Terminal
                        MainDestination.MORE -> Icons.Outlined.MoreHoriz
                    }
                    Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
                    Text(
                        destination.label,
                        color = tint,
                        fontSize = 11.5.sp,
                        lineHeight = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1
                    )
                }
            }
        }
    }
}

@Composable
fun StudioPageTitle(title: String, subtitle: String? = null) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            title,
            color = StudioPalette.Ink,
            fontFamily = MaterialTheme.typography.headlineLarge.fontFamily,
            fontSize = 30.sp,
            lineHeight = 33.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = (-0.75).sp
        )
        if (subtitle != null) {
            Text(subtitle, color = StudioPalette.Muted, fontSize = 15.sp, lineHeight = 21.sp)
        }
    }
}

@Composable
fun StudioSectionHeading(title: String, action: String? = null, onAction: (() -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().padding(top = 24.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            title,
            color = StudioPalette.Ink,
            fontFamily = MaterialTheme.typography.titleLarge.fontFamily,
            fontSize = 17.sp,
            lineHeight = 22.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = (-0.15).sp
        )
        Spacer(Modifier.weight(1f))
        if (action != null && onAction != null) {
            Text(
                action, color = StudioPalette.Accent, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(onClick = onAction)
                    .padding(horizontal = 7.dp, vertical = 5.dp)
            )
        }
    }
}

@Composable
fun StudioCard(
    modifier: Modifier = Modifier,
    padding: PaddingValues = PaddingValues(0.dp),
    content: @Composable ColumnScope.() -> Unit
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = StudioPalette.Surface,
        shape = RoundedCornerShape(18.dp * LocalStudioCornerScale.current),
        border = BorderStroke(1.dp, StudioPalette.Line),
        shadowElevation = 1.dp
    ) {
        Column(Modifier.padding(padding), content = content)
    }
}

@Composable
fun StudioDivider() {
    Box(Modifier.fillMaxWidth().height(1.dp).background(StudioPalette.Line))
}

@Composable
fun StudioStatusDot(online: Boolean, modifier: Modifier = Modifier, size: Int = 8) {
    Box(
        modifier.size(size.dp).clip(CircleShape)
            .background(if (online) StudioPalette.Accent else StudioPalette.Bad)
    )
}

@Composable
fun StudioTag(text: String, accent: Boolean = false) {
    Text(
        text,
        color = if (accent) StudioPalette.Accent else StudioPalette.Muted,
        fontSize = 12.5.sp,
        lineHeight = 16.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.clip(RoundedCornerShape(99.dp))
            .background(if (accent) StudioPalette.Soft else StudioPalette.Background)
            .padding(horizontal = 10.dp, vertical = 6.dp)
    )
}

@Composable
fun StudioRow(
    title: String,
    subtitle: String? = null,
    icon: ImageVector? = null,
    trailing: String? = null,
    onClick: (() -> Unit)? = null,
    trailingContent: (@Composable RowScope.() -> Unit)? = null,
    subtitleMaxLines: Int = 2
) {
    Row(
        modifier = Modifier.fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 14.dp, vertical = 10.dp * LocalStudioRowScale.current)
            .heightIn(min = 40.dp * LocalStudioRowScale.current),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (icon != null) {
            Box(
                Modifier.size(38.dp).clip(RoundedCornerShape(11.dp * LocalStudioCornerScale.current)).background(StudioPalette.Background),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = null, tint = StudioPalette.Muted, modifier = Modifier.size(20.dp))
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, color = StudioPalette.Ink, fontSize = 14.sp, lineHeight = 18.sp,
                fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (subtitle != null) {
                Text(subtitle, color = StudioPalette.Muted, fontSize = 12.5.sp, lineHeight = 17.sp,
                    maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        if (trailingContent != null) trailingContent()
        else if (trailing != null) {
            Text(trailing, color = StudioPalette.Muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
fun StudioActionButton(
    label: String,
    modifier: Modifier = Modifier,
    primary: Boolean = false,
    compact: Boolean = false,
    destructive: Boolean = false,
    enabled: Boolean = true,
    onClick: () -> Unit
) {
    val bg = when {
        !enabled -> StudioPalette.Background
        primary -> StudioPalette.Accent
        else -> StudioPalette.Surface
    }
    val fg = when {
        !enabled -> StudioPalette.Muted
        primary -> Color.White
        destructive -> StudioPalette.Bad
        else -> StudioPalette.Ink
    }
    val shape = RoundedCornerShape(12.dp * LocalStudioCornerScale.current)
    Box(
        modifier = modifier.defaultMinSize(minHeight = if (compact) 36.dp else 44.dp)
            .clip(shape)
            .background(bg)
             .border(1.dp, if (primary && enabled) StudioPalette.Accent else StudioPalette.Line, shape)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = if (compact) 11.dp else 14.dp, vertical = if (compact) 6.dp else 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(label, color = fg.copy(alpha = if (enabled) 1f else .38f),
            fontSize = if (compact) 13.sp else 14.sp, lineHeight = 18.sp,
            fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
fun StudioSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    trailing: (@Composable () -> Unit)? = null,
    showIcon: Boolean = false
) {
    Surface(
        modifier = modifier.fillMaxWidth().heightIn(min = 46.dp),
        shape = RoundedCornerShape(12.dp * LocalStudioCornerScale.current),
        color = StudioPalette.Surface,
        border = BorderStroke(1.dp, StudioPalette.Line)
    ) {
        Row(
            Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (showIcon) {
                Icon(Icons.Outlined.Search, contentDescription = null, tint = StudioPalette.Muted, modifier = Modifier.size(19.dp))
                Spacer(Modifier.width(9.dp))
            }
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                if (value.isEmpty()) Text(placeholder, color = StudioPalette.Muted, fontSize = 14.sp)
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    singleLine = true,
                    textStyle = TextStyle(
                        color = StudioPalette.Ink, fontSize = 14.sp, lineHeight = 20.sp,
                        fontWeight = FontWeight.Normal, fontFamily = MaterialTheme.typography.bodyLarge.fontFamily
                    ),
                    modifier = Modifier.fillMaxWidth()
                )
            }
            trailing?.invoke()
        }
    }
}

@Composable
fun StudioTextInput(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    singleLine: Boolean = true,
    minLines: Int = 1,
    minHeight: androidx.compose.ui.unit.Dp = 48.dp,
    textSize: androidx.compose.ui.unit.TextUnit = 14.sp
) {
    val shape = RoundedCornerShape(12.dp * LocalStudioCornerScale.current)
    Surface(
        modifier = modifier.fillMaxWidth().heightIn(min = minHeight),
        color = StudioPalette.Surface,
        shape = shape,
        border = BorderStroke(1.dp, StudioPalette.Line)
    ) {
        Box(
            Modifier.fillMaxWidth().padding(horizontal = 13.dp, vertical = 11.dp),
            contentAlignment = Alignment.CenterStart
        ) {
            if (value.isEmpty()) {
                Text(placeholder, color = StudioPalette.Muted, fontSize = textSize, lineHeight = (textSize.value * 1.45f).sp)
            }
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = singleLine,
                minLines = minLines,
                textStyle = TextStyle(
                    color = StudioPalette.Ink,
                    fontSize = textSize,
                    lineHeight = (textSize.value * 1.45f).sp,
                    fontFamily = MaterialTheme.typography.bodyLarge.fontFamily
                ),
                cursorBrush = SolidColor(StudioPalette.Accent),
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

@Composable
fun StudioColorWheel(
    colorHex: String,
    onColorChanged: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val hsv = remember(colorHex) {
        FloatArray(3).also { values ->
            val parsed = runCatching { AndroidColor.parseColor(colorHex) }.getOrDefault(AndroidColor.GREEN)
            AndroidColor.colorToHSV(parsed, values)
        }
    }
    val latestColorChanged = rememberUpdatedState(onColorChanged)
    val latestSaturation = rememberUpdatedState(hsv[1].coerceIn(0f, 1f))
    val latestBrightness = rememberUpdatedState(hsv[2].coerceIn(0f, 1f))
    val hue = hsv[0].coerceIn(0f, 360f)
    val saturation = hsv[1].coerceIn(0f, 1f)
    val brightness = hsv[2].coerceIn(0f, 1f)
    val surfaceColor = StudioPalette.Surface
    val inkColor = StudioPalette.Ink

    fun emit(
        nextHue: Float = hue,
        nextSaturation: Float = latestSaturation.value,
        nextBrightness: Float = latestBrightness.value
    ) {
        val value = floatArrayOf(
            nextHue.coerceIn(0f, 360f),
            nextSaturation.coerceIn(0f, 1f),
            nextBrightness.coerceIn(0f, 1f)
        )
        val argb = AndroidColor.HSVToColor(value)
        latestColorChanged.value(String.format(java.util.Locale.ROOT, "#%06X", 0xFFFFFF and argb))
    }
    fun chooseHue(x: Float, y: Float, width: Float, height: Float) {
        val dx = x - width / 2f
        val dy = y - height / 2f
        val angle = Math.toDegrees(atan2(dy.toDouble(), dx.toDouble())).toFloat()
        emit((angle + 90f + 360f) % 360f)
    }

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Canvas(
            Modifier.fillMaxWidth().height(194.dp)
                .pointerInput(Unit) {
                    detectTapGestures { point ->
                        chooseHue(point.x, point.y, size.width.toFloat(), size.height.toFloat())
                    }
                }
                .pointerInput(Unit) {
                    detectDragGestures(
                        onDragStart = { point -> chooseHue(point.x, point.y, size.width.toFloat(), size.height.toFloat()) }
                    ) { change, _ ->
                        chooseHue(change.position.x, change.position.y, size.width.toFloat(), size.height.toFloat())
                        change.consume()
                    }
                }
        ) {
            val radius = size.minDimension * .46f
            val center = Offset(size.width / 2f, size.height / 2f)
            drawCircle(
                brush = Brush.sweepGradient(
                    listOf(
                        Color(0xFFFF3030), Color(0xFFFFD52A), Color(0xFF43C95A),
                        Color(0xFF28C9CF), Color(0xFF376BFF), Color(0xFFB54DDE),
                        Color(0xFFFF3030)
                    ),
                    center
                ),
                radius = radius,
                center = center
            )
            drawCircle(surfaceColor, radius = radius * .43f, center = center)
            val markerAngle = (hue - 90f) * (PI.toFloat() / 180f)
            val marker = Offset(
                center.x + cos(markerAngle) * radius * .76f,
                center.y + sin(markerAngle) * radius * .76f
            )
            val selectedColor = Color(AndroidColor.HSVToColor(floatArrayOf(hue, saturation, brightness)))
            drawCircle(Color.White, radius = 12.dp.toPx(), center = marker)
            drawCircle(inkColor, radius = 12.dp.toPx(), center = marker, style = androidx.compose.ui.graphics.drawscope.Stroke(1.2.dp.toPx()))
            drawCircle(selectedColor, radius = 8.dp.toPx(), center = marker)
            drawCircle(selectedColor, radius = radius * .25f, center = center)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Saturation", color = StudioPalette.Ink, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            Text("${(saturation * 100).toInt()}%", color = StudioPalette.Muted, fontSize = 12.sp)
        }
        Slider(
            value = saturation,
            onValueChange = { emit(nextSaturation = it) },
            colors = SliderDefaults.colors(
                thumbColor = StudioPalette.Accent,
                activeTrackColor = StudioPalette.Accent,
                inactiveTrackColor = StudioPalette.Line
            )
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Brightness", color = StudioPalette.Ink, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            Text("${(brightness * 100).toInt()}%", color = StudioPalette.Muted, fontSize = 12.sp)
        }
        Slider(
            value = brightness,
            onValueChange = { emit(nextBrightness = it) },
            colors = SliderDefaults.colors(
                thumbColor = StudioPalette.Accent,
                activeTrackColor = StudioPalette.Accent,
                inactiveTrackColor = StudioPalette.Line
            )
        )
    }
}

@Composable
fun StudioSegmented(options: List<String>, selected: String, onSelect: (String) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp * LocalStudioCornerScale.current)).background(StudioPalette.Background).padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        options.forEach { option ->
            val active = option == selected
            val shape = RoundedCornerShape(9.dp * LocalStudioCornerScale.current)
            Box(
                Modifier.weight(1f).defaultMinSize(minHeight = 38.dp).clip(shape)
                    .then(if (active) Modifier.shadow(1.dp, shape).background(StudioPalette.Surface)
                        .border(1.dp, StudioPalette.Line, shape) else Modifier.background(Color.Transparent))
                    .clickable { onSelect(option) }.padding(horizontal = 4.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(option, color = if (active) StudioPalette.Ink else StudioPalette.Muted,
                    fontSize = 13.sp, lineHeight = 17.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            }
        }
    }
}

@Composable
fun StudioEmpty(title: String, description: String? = null, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(title, color = StudioPalette.Muted, fontSize = 14.sp, lineHeight = 19.sp,
            fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
        if (description != null) {
            Text(description, color = StudioPalette.Muted, fontSize = 13.sp, lineHeight = 18.sp,
                textAlign = TextAlign.Center)
        }
    }
}

data class StudioMenuAction(val title: String, val destructive: Boolean = false, val onClick: () -> Unit)

@Composable
fun StudioFloatingMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    actions: List<StudioMenuAction>
) {
    if (!expanded) return
    Popup(
        alignment = Alignment.TopEnd,
        offset = IntOffset(-4, 6),
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true, dismissOnBackPress = true, dismissOnClickOutside = true)
    ) {
        Column(
            Modifier.width(190.dp).shadow(8.dp, RoundedCornerShape(9.dp))
                .border(1.dp, Color(0xFFE6E6E6), RoundedCornerShape(9.dp))
                .background(Color.White, RoundedCornerShape(9.dp)).padding(vertical = 5.dp)
        ) {
            actions.forEach { action ->
                Box(
                    Modifier.fillMaxWidth().heightIn(min = 42.dp)
                        .clickable { onDismiss(); action.onClick() }
                        .padding(horizontal = 13.dp, vertical = 10.dp),
                    contentAlignment = Alignment.CenterStart
                ) {
                    Text(action.title, color = if (action.destructive) Color(0xFFC43B32) else Color(0xFF171717),
                        fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}

object StudioPalette {
    val Background: Color @Composable get() = MaterialTheme.colorScheme.background
    val Surface: Color @Composable get() = MaterialTheme.colorScheme.surface
    val Ink: Color @Composable get() = MaterialTheme.colorScheme.onSurface
    val Muted: Color @Composable get() = MaterialTheme.colorScheme.onSurfaceVariant
    val Line: Color @Composable get() = MaterialTheme.colorScheme.outline
    val Accent: Color @Composable get() = MaterialTheme.colorScheme.primary
    val Soft: Color @Composable get() = MaterialTheme.colorScheme.primaryContainer
    val Bad: Color @Composable get() = MaterialTheme.colorScheme.error
}
