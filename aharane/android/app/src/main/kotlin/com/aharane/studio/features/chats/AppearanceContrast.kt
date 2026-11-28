package com.aharane.studio.features.chats

import androidx.compose.ui.graphics.Color
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/** WCAG relative luminance and contrast functions shared by preview and live chat. */
internal fun chatRelativeLuminance(color: Color): Double {
    fun linear(channel: Float): Double {
        val value = channel.toDouble().coerceIn(0.0, 1.0)
        return if (value <= 0.04045) value / 12.92 else ((value + 0.055) / 1.055).pow(2.4)
    }
    return 0.2126 * linear(color.red) + 0.7152 * linear(color.green) + 0.0722 * linear(color.blue)
}

internal fun chatContrastRatio(foreground: Color, background: Color): Double {
    val a = chatRelativeLuminance(foreground)
    val b = chatRelativeLuminance(background)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)
}

/** Keeps an intentional near-black instead of pure black when it meets 4.5:1. */
internal fun chatReadableForeground(background: Color): Color {
    val dark = Color(0xFF101713)
    val white = Color.White
    val darkRatio = chatContrastRatio(dark, background)
    val whiteRatio = chatContrastRatio(white, background)
    // Near-black can miss 4.5:1 for certain mid-tone wallpapers.
    // Pure black/white always provide at least 4.5:1 for opaque sRGB backgrounds.
    return when {
        darkRatio >= 4.5 && darkRatio >= whiteRatio -> dark
        whiteRatio >= 4.5 -> white
        darkRatio >= 4.5 -> dark
        chatContrastRatio(Color.Black, background) >= 4.5 -> Color.Black
        else -> Color.White
    }
}

/**
 * Choose a readable secondary shade by tinting the primary foreground towards
 * its background without allowing ordinary small text below 4.5:1.
 */
internal fun chatSecondaryForeground(background: Color): Color {
    val primary = chatReadableForeground(background)
    var candidate = primary
    for (step in 1..9) {
        val fraction = step / 20f
        val trial = Color(
            red = primary.red * (1f - fraction) + background.red * fraction,
            green = primary.green * (1f - fraction) + background.green * fraction,
            blue = primary.blue * (1f - fraction) + background.blue * fraction,
            alpha = 1f
        )
        if (chatContrastRatio(trial, background) < 4.5) break
        candidate = trial
    }
    return candidate
}
