package com.vistora.android.ui.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

object VistoraPalette {
    val Ink = Color(0xFF101114)
    val Surface = Color(0xFF202126)
    val Raised = Color(0xFF222329)
    val Field = Color(0xFF17181C)
    val Track = Color(0xFF34353B)
    val Line = Color(0x1AFFFFFF)
    val LineStrong = Color(0x2EFFFFFF)
    val Text = Color(0xFFF0EBEC)
    val Secondary = Color(0xFFC3BEC5)
    val Muted = Color(0xFF9B979F)
    val Burgundy = Color(0xFF63333A)
    val BurgundyHigh = Color(0xFF7A3F47)
    val Rose = Color(0xFFC17B83)
    val OnAccent = Color(0xFFF6E9EA)

    val WatchingSurface = Color(0xFF3B3222)
    val WatchingText = Color(0xFFD9B875)
    val CompletedSurface = Color(0xFF26372E)
    val CompletedText = Color(0xFFA5C4AA)
    val PlanSurface = Color(0xFF293442)
    val PlanText = Color(0xFFA9BED8)
    val HoldSurface = Color(0xFF3A2D3B)
    val HoldText = Color(0xFFC5A8C9)
    val DroppedSurface = Color(0xFF3B2929)
    val DroppedText = Color(0xFFD5A3A0)
}

val LocalVistoraAccent = compositionLocalOf { VistoraPalette.Rose }

private fun accentFor(name: String): Color = when (name) {
    "burgundy" -> VistoraPalette.BurgundyHigh
    else -> VistoraPalette.Rose
}

private fun colorsFor(accent: Color) = darkColorScheme(
    primary = accent,
    onPrimary = VistoraPalette.Ink,
    primaryContainer = VistoraPalette.Burgundy,
    onPrimaryContainer = VistoraPalette.OnAccent,
    secondary = VistoraPalette.Secondary,
    onSecondary = VistoraPalette.Ink,
    background = VistoraPalette.Ink,
    onBackground = VistoraPalette.Text,
    surface = VistoraPalette.Surface,
    onSurface = VistoraPalette.Text,
    surfaceVariant = VistoraPalette.Raised,
    onSurfaceVariant = VistoraPalette.Secondary,
    outline = VistoraPalette.LineStrong,
    error = VistoraPalette.DroppedText
)

private val VistoraTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Normal,
        fontSize = 40.sp,
        lineHeight = 44.sp,
        letterSpacing = (-0.8).sp
    ),
    headlineLarge = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Medium,
        fontSize = 34.sp,
        lineHeight = 38.sp,
        letterSpacing = (-0.6).sp
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Medium,
        fontSize = 28.sp,
        lineHeight = 32.sp
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Medium,
        fontSize = 24.sp,
        lineHeight = 29.sp
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 22.sp
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 15.sp,
        lineHeight = 23.sp
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 14.sp,
        lineHeight = 21.sp
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 18.sp
    )
)

private val VistoraShapes = Shapes(
    extraSmall = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
    small = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
    medium = androidx.compose.foundation.shape.RoundedCornerShape(16.dp),
    large = androidx.compose.foundation.shape.RoundedCornerShape(20.dp),
    extraLarge = androidx.compose.foundation.shape.RoundedCornerShape(26.dp)
)

@Composable
fun VistoraTheme(
    accent: String = "rose",
    content: @Composable () -> Unit
) {
    val accentColor = accentFor(accent)
    MaterialTheme(
        colorScheme = colorsFor(accentColor),
        typography = VistoraTypography,
        shapes = VistoraShapes
    ) {
        CompositionLocalProvider(LocalVistoraAccent provides accentColor) {
            content()
        }
    }
}

@Composable
fun VistoraBackdrop(content: @Composable BoxScope.() -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colorStops = arrayOf(
                        0f to Color(0xFF1A1418),
                        0.34f to VistoraPalette.Ink,
                        1f to VistoraPalette.Ink
                    )
                )
            )
    ) {
        content()
    }
}
