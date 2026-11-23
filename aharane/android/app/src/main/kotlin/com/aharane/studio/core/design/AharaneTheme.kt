package com.aharane.studio.core.design

import android.animation.ValueAnimator
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.aharane.studio.R

val AharaneInstrumentSans = FontFamily(
    Font(R.font.instrument_sans, FontWeight.Normal),
    Font(R.font.instrument_sans, FontWeight.Medium),
    Font(R.font.instrument_sans, FontWeight.SemiBold),
    Font(R.font.instrument_sans, FontWeight.Bold)
)
private val BricolageGrotesque = FontFamily(
    Font(R.font.bricolage_grotesque, FontWeight.Medium),
    Font(R.font.bricolage_grotesque, FontWeight.SemiBold),
    Font(R.font.bricolage_grotesque, FontWeight.Bold)
)

val LocalStudioMotionEnabled = staticCompositionLocalOf { true }

private val Light = lightColorScheme(
    primary = Color(0xFF0E7A5C),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDDF1EA),
    onPrimaryContainer = Color(0xFF103D30),
    background = Color(0xFFF2F4F3),
    onBackground = Color(0xFF12181B),
    surface = Color.White,
    onSurface = Color(0xFF12181B),
    surfaceVariant = Color(0xFFE9EFEC),
    onSurfaceVariant = Color(0xFF66726F),
    outline = Color(0xFFE1E6E4),
    error = Color(0xFFC2372D)
)

private val Dark = darkColorScheme(
    primary = Color(0xFF3CC79A),
    onPrimary = Color(0xFF04140E),
    primaryContainer = Color(0xFF133A2E),
    onPrimaryContainer = Color(0xFFDDF1EA),
    background = Color(0xFF0C1110),
    onBackground = Color(0xFFEAF0EE),
    surface = Color(0xFF151C1B),
    onSurface = Color(0xFFEAF0EE),
    surfaceVariant = Color(0xFF1D2825),
    onSurfaceVariant = Color(0xFF8B9895),
    outline = Color(0xFF25302E),
    error = Color(0xFFFF7A6E)
)

private val StudioTypography = Typography(
    displayLarge = TextStyle(fontFamily = BricolageGrotesque, fontWeight = FontWeight.Bold,
        fontSize = 30.sp, lineHeight = 34.sp, letterSpacing = (-0.75).sp),
    displayMedium = TextStyle(fontFamily = BricolageGrotesque, fontWeight = FontWeight.Bold,
        fontSize = 26.sp, lineHeight = 30.sp, letterSpacing = (-0.55).sp),
    headlineLarge = TextStyle(fontFamily = BricolageGrotesque, fontWeight = FontWeight.Bold,
        fontSize = 30.sp, lineHeight = 34.sp, letterSpacing = (-0.75).sp),
    headlineMedium = TextStyle(fontFamily = BricolageGrotesque, fontWeight = FontWeight.Bold,
        fontSize = 26.sp, lineHeight = 30.sp, letterSpacing = (-0.55).sp),
    titleLarge = TextStyle(fontFamily = BricolageGrotesque, fontWeight = FontWeight.Bold,
        fontSize = 17.sp, lineHeight = 22.sp, letterSpacing = (-0.15).sp),
    titleMedium = TextStyle(fontFamily = AharaneInstrumentSans, fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp, lineHeight = 19.sp),
    bodyLarge = TextStyle(fontFamily = AharaneInstrumentSans, fontWeight = FontWeight.Normal,
        fontSize = 15.sp, lineHeight = 21.sp),
    bodyMedium = TextStyle(fontFamily = AharaneInstrumentSans, fontWeight = FontWeight.Normal,
        fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontFamily = AharaneInstrumentSans, fontWeight = FontWeight.Normal,
        fontSize = 12.5.sp, lineHeight = 17.sp),
    labelLarge = TextStyle(fontFamily = AharaneInstrumentSans, fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp, lineHeight = 18.sp),
    labelMedium = TextStyle(fontFamily = AharaneInstrumentSans, fontWeight = FontWeight.SemiBold,
        fontSize = 12.5.sp, lineHeight = 16.sp),
    labelSmall = TextStyle(fontFamily = AharaneInstrumentSans, fontWeight = FontWeight.SemiBold,
        fontSize = 11.5.sp, lineHeight = 14.sp)
)

private fun blend(from: Color, to: Color, amount: Float): Color = Color(
    red = from.red + (to.red - from.red) * amount,
    green = from.green + (to.green - from.green) * amount,
    blue = from.blue + (to.blue - from.blue) * amount,
    alpha = 1f
)

@Composable
fun AharaneTheme(
    themeMode: String = "system",
    accentColorHex: String = "#0E7A5C",
    interfaceScale: Float = 1f,
    cornerScale: Float = 1f,
    rowScale: Float = 1f,
    content: @Composable () -> Unit
) {
    val amoled = themeMode == "amoled"
    val dark = when (themeMode) {
        "light" -> false
        "dark", "amoled" -> true
        else -> isSystemInDarkTheme()
    }
    val accent = remember(accentColorHex) {
        runCatching { Color(android.graphics.Color.parseColor(accentColorHex)) }
            .getOrDefault(Color(0xFF0E7A5C))
    }
    val darkAccent = if (accentColorHex.equals("#0E7A5C", ignoreCase = true)) {
        Color(0xFF3CC79A)
    } else {
        blend(accent, Color.White, 0.22f)
    }
    val lightScheme = Light.copy(
        primary = accent,
        onPrimary = if (accent.luminance() > .62f) Color(0xFF12181B) else Color.White,
        primaryContainer = blend(accent, Color.White, .86f),
        onPrimaryContainer = Color(0xFF103D30)
    )
    val darkScheme = Dark.copy(
        primary = darkAccent,
        onPrimary = Color(0xFF04140E),
        primaryContainer = blend(darkAccent, Color.Black, .72f),
        onPrimaryContainer = Color(0xFFEAF0EE),
        background = if (amoled) Color.Black else Dark.background,
        surface = if (amoled) Color.Black else Dark.surface,
        surfaceVariant = if (amoled) Color(0xFF101614) else Dark.surfaceVariant,
        outline = if (amoled) Color(0xFF202725) else Dark.outline
    )
    // Respect Android's system-wide animation setting, including Battery Saver.
    val motionEnabled = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || ValueAnimator.areAnimatorsEnabled()
    val baseDensity = LocalDensity.current
    val scaledDensity = Density(
        density = baseDensity.density * interfaceScale.coerceIn(.88f, 1.12f),
        fontScale = baseDensity.fontScale
    )

    CompositionLocalProvider(
        LocalDensity provides scaledDensity,
        LocalStudioMotionEnabled provides motionEnabled,
        LocalStudioCornerScale provides cornerScale.coerceIn(.65f, 1.3f),
        LocalStudioRowScale provides rowScale.coerceIn(.85f, 1.2f)
    ) {
        MaterialTheme(
            colorScheme = if (dark) darkScheme else lightScheme,
            typography = StudioTypography,
            content = content
        )
    }
}
