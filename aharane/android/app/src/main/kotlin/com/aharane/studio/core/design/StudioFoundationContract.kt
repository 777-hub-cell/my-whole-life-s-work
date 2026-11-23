package com.aharane.studio.core.design

import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Stable shared UI values for Android feature workstreams.
 *
 * Feature screens should consume these foundations instead of introducing
 * competing app-wide typography, spacing, component or motion constants.
 */
object StudioFoundationContract {
    const val VERSION = 1

    object Layout {
        val ContentMaxWidth = 640.dp
        val HorizontalGutter = 16.dp
        val BottomNavigationHeight = 58.dp
        val NavigationIconSize = 20.dp
        val CardRadius = 18.dp
        val ControlRadius = 12.dp
        val AvatarSize = 40.dp
        val IconTileSize = 38.dp
        val SearchFieldHeight = 46.dp
        val StandardButtonHeight = 44.dp
        val CompactButtonHeight = 36.dp
    }

    object TypeScale {
        val DisplayTitle = 30.sp
        val SectionTitle = 17.sp
        val Body = 15.sp
        val Supporting = 12.5.sp
        val BottomNavigationLabel = 11.5.sp
    }

    object Motion {
        const val PressFeedbackMillis = 120
        const val StateChangeMillis = 180
        const val MenuMillis = 180
        const val BottomSheetMillis = 240
        const val ScreenTransitionMillis = 220
        const val ChartTransitionMillis = 280
        const val MediaViewerMillis = 220

        /**
         * Centralizes system/reduced-motion handling for shared Compose motion.
         * Callers pass the resolved system/app motion preference.
         */
        fun durationMillis(enabled: Boolean, targetMillis: Int): Int =
            if (enabled) targetMillis.coerceAtLeast(0) else 0
    }
}
