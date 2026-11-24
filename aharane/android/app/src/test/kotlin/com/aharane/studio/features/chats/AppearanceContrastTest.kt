package com.aharane.studio.features.chats

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertTrue
import org.junit.Assert.assertEquals
import org.junit.Test

class AppearanceContrastTest {
    @Test fun wcagContrastHasKnownValues() {
        assertEquals(21.0, chatContrastRatio(Color.Black, Color.White), 0.001)
        assertEquals(1.0, chatContrastRatio(Color.White, Color.White), 0.001)
        assertEquals(0.0, chatRelativeLuminance(Color.Black), 0.001)
    }

    @Test fun readableTextAndSecondaryMeetOrdinaryTextContrast() {
        val backgrounds = listOf(
            Color.White, Color.Black,
            Color(0xFF108E7A), Color(0xFFB3DDCD), Color(0xFF9C8A5D),
            Color(0xFFF5E1D0), Color(0xFF414B54)
        )
        backgrounds.forEach { background ->
            assertTrue("Main text on $background", chatContrastRatio(chatReadableForeground(background), background) >= 4.5)
            assertTrue("Secondary text on $background", chatContrastRatio(chatSecondaryForeground(background), background) >= 4.5)
        }
    }
}
