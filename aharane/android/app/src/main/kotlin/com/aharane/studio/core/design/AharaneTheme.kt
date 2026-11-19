package com.aharane.studio.core.design
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Light = lightColorScheme(
    primary = Color(0xFF0E7A5C), onPrimary = Color.White,
    primaryContainer = Color(0xFFDDF1EA), onPrimaryContainer = Color(0xFF103D30),
    background = Color(0xFFF2F4F3), onBackground = Color(0xFF12181B),
    surface = Color.White, onSurface = Color(0xFF12181B),
    surfaceVariant = Color(0xFFE9EFEC), onSurfaceVariant = Color(0xFF66726F),
    outline = Color(0xFFE1E6E4), error = Color(0xFFC2372D)
)
private val Dark = darkColorScheme(
    primary = Color(0xFF3CC79A), onPrimary = Color(0xFF04140E),
    primaryContainer = Color(0xFF133A2E), onPrimaryContainer = Color(0xFFDDF1EA),
    background = Color(0xFF0C1110), onBackground = Color(0xFFEAF0EE),
    surface = Color(0xFF151C1B), onSurface = Color(0xFFEAF0EE),
    surfaceVariant = Color(0xFF1D2825), onSurfaceVariant = Color(0xFF8B9895),
    outline = Color(0xFF25302E), error = Color(0xFFFF7A6E)
)
@Composable
fun AharaneTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Dark else Light, content = content)
}
