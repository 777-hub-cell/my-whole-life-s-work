package com.aharane.studio.core.design

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.aharane.studio.R

private val InstrumentSans = FontFamily(
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
    titleMedium = TextStyle(fontFamily = InstrumentSans, fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp, lineHeight = 19.sp),
    bodyLarge = TextStyle(fontFamily = InstrumentSans, fontWeight = FontWeight.Normal,
        fontSize = 15.sp, lineHeight = 21.sp),
    bodyMedium = TextStyle(fontFamily = InstrumentSans, fontWeight = FontWeight.Normal,
        fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontFamily = InstrumentSans, fontWeight = FontWeight.Normal,
        fontSize = 12.5.sp, lineHeight = 17.sp),
    labelLarge = TextStyle(fontFamily = InstrumentSans, fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp, lineHeight = 18.sp),
    labelMedium = TextStyle(fontFamily = InstrumentSans, fontWeight = FontWeight.SemiBold,
        fontSize = 12.5.sp, lineHeight = 16.sp),
    labelSmall = TextStyle(fontFamily = InstrumentSans, fontWeight = FontWeight.SemiBold,
        fontSize = 11.5.sp, lineHeight = 14.sp)
)

@Composable
fun AharaneTheme(themeMode: String = "system", content: @Composable () -> Unit) {
    val dark = when (themeMode) {
        "light" -> false
        "dark" -> true
        else -> isSystemInDarkTheme()
    }
    MaterialTheme(
        colorScheme = if (dark) Dark else Light,
        typography = StudioTypography,
        content = content
    )
}
