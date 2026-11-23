package com.aharane.studio.features.chats

import android.graphics.Color as AndroidColor
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.StudioPalette
import java.util.Locale
import kotlin.math.atan2

/** Shared, touch-friendly HSV colour selector for chat and conversation themes. */
@Composable
fun ChatColorWheel(selectedHex: String, onColorSelected: (String) -> Unit) {
    val argb = runCatching { AndroidColor.parseColor(selectedHex) }
        .getOrDefault(AndroidColor.WHITE)
    val initial = remember(selectedHex) {
        FloatArray(3).also { AndroidColor.colorToHSV(argb, it) }
    }
    var hue by remember(selectedHex) { mutableFloatStateOf(initial[0]) }
    var saturation by remember(selectedHex) { mutableFloatStateOf(initial[1]) }
    var brightness by remember(selectedHex) { mutableFloatStateOf(initial[2]) }
    val emit = { h: Float, s: Float, v: Float ->
        val color = AndroidColor.HSVToColor(floatArrayOf(h.coerceIn(0f, 360f), s.coerceIn(0f, 1f), v.coerceIn(0f, 1f)))
        onColorSelected(String.format(Locale.ROOT, "#%06X", color and 0xFFFFFF))
    }
    val spectrum = remember {
        Brush.sweepGradient(
            listOf(
                Color.Red, Color.Yellow, Color.Green, Color.Cyan,
                Color.Blue, Color.Magenta, Color.Red
            )
        )
    }
    val setHue: (Offset, Float, Float) -> Unit = { position, cx, cy ->
        val radians = atan2(position.y - cy, position.x - cx)
        val next = (((radians * 180f / Math.PI.toFloat()) + 360f) % 360f)
        hue = next
        emit(next, saturation, brightness)
    }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Canvas(
                Modifier.size(184.dp).clip(CircleShape)
                    .pointerInput(Unit) {
                        detectDragGestures { change, _ ->
                            setHue(change.position, size.width / 2f, size.height / 2f)
                            change.consume()
                        }
                    }
                    .pointerInput(Unit) {
                        detectTapGestures { position ->
                            setHue(position, size.width / 2f, size.height / 2f)
                        }
                    }
            ) {
                drawCircle(brush = spectrum, radius = size.minDimension / 2f)
                drawCircle(
                    color = Color(AndroidColor.HSVToColor(floatArrayOf(hue, saturation, brightness))),
                    radius = size.minDimension * 0.29f
                )
            }
        }
        Text("Saturation", fontSize = 12.sp, color = StudioPalette.Muted)
        Slider(
            value = saturation,
            onValueChange = { saturation = it; emit(hue, saturation, brightness) },
            valueRange = 0f..1f,
            colors = SliderDefaults.colors(thumbColor = StudioPalette.Accent, activeTrackColor = StudioPalette.Accent)
        )
        Text("Brightness", fontSize = 12.sp, color = StudioPalette.Muted)
        Slider(
            value = brightness,
            onValueChange = { brightness = it; emit(hue, saturation, brightness) },
            valueRange = 0f..1f,
            colors = SliderDefaults.colors(thumbColor = StudioPalette.Accent, activeTrackColor = StudioPalette.Accent)
        )
    }
}
