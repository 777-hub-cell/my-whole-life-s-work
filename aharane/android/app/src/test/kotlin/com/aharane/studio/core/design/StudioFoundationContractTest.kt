package com.aharane.studio.core.design

import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.navigation.MainDestination
import org.junit.Assert.assertEquals
import org.junit.Test

class StudioFoundationContractTest {
    @Test
    fun contractVersionTracksThePublishedSharedApi() {
        assertEquals(2, StudioFoundationContract.VERSION)
    }

    @Test
    fun primaryNavigationMatchesTheWebStudioOrderAndLabels() {
        assertEquals(
            listOf(
                MainDestination.HOME,
                MainDestination.FILES,
                MainDestination.ENVIRONMENT,
                MainDestination.CHATS,
                MainDestination.MORE
            ),
            MainDestination.entries
        )
        assertEquals(
            listOf("Home", "Files", "ENV", "Chats", "More"),
            MainDestination.entries.map { it.label }
        )
    }

    @Test
    fun sharedLayoutAndTypographyTokensMatchTheApprovedBaseline() {
        assertEquals(640.dp, StudioFoundationContract.Layout.ContentMaxWidth)
        assertEquals(16.dp, StudioFoundationContract.Layout.HorizontalGutter)
        assertEquals(58.dp, StudioFoundationContract.Layout.BottomNavigationHeight)
        assertEquals(26.dp, StudioFoundationContract.Layout.BrandMarkSize)
        assertEquals(20.dp, StudioFoundationContract.Layout.NavigationIconSize)
        assertEquals(18.dp, StudioFoundationContract.Layout.CardRadius)
        assertEquals(12.dp, StudioFoundationContract.Layout.ControlRadius)
        assertEquals(40.dp, StudioFoundationContract.Layout.AvatarSize)
        assertEquals(38.dp, StudioFoundationContract.Layout.IconTileSize)
        assertEquals(46.dp, StudioFoundationContract.Layout.SearchFieldHeight)
        assertEquals(44.dp, StudioFoundationContract.Layout.StandardButtonHeight)
        assertEquals(36.dp, StudioFoundationContract.Layout.CompactButtonHeight)
        assertEquals(30.sp, StudioFoundationContract.TypeScale.DisplayTitle)
        assertEquals(17.sp, StudioFoundationContract.TypeScale.SectionTitle)
        assertEquals(15.sp, StudioFoundationContract.TypeScale.Body)
        assertEquals(12.5.sp, StudioFoundationContract.TypeScale.Supporting)
        assertEquals(11.5.sp, StudioFoundationContract.TypeScale.BottomNavigationLabel)
    }

    @Test
    fun sharedMotionSpecsUseCentralDurationsAndRespectReducedMotion() {
        val stateChange = StudioFoundationContract.Motion.stateChangeSpec<Float>(enabled = true)
        val reducedStateChange = StudioFoundationContract.Motion.stateChangeSpec<Float>(enabled = false)
        val enter = StudioFoundationContract.Motion.enterSpec<Float>(enabled = true)
        val exit = StudioFoundationContract.Motion.exitSpec<Float>(enabled = true)
        val reducedEnter = StudioFoundationContract.Motion.enterSpec<Float>(enabled = false)
        val reducedExit = StudioFoundationContract.Motion.exitSpec<Float>(enabled = false)

        assertEquals(StudioFoundationContract.Motion.StateChangeMillis, stateChange.durationMillis)
        assertEquals(0, reducedStateChange.durationMillis)
        assertEquals(StudioFoundationContract.Motion.ScreenTransitionMillis, enter.durationMillis)
        assertEquals(StudioFoundationContract.Motion.ScreenTransitionMillis, exit.durationMillis)
        assertEquals(0, reducedEnter.durationMillis)
        assertEquals(0, reducedExit.durationMillis)
    }

    @Test
    fun sharedMotionTokensRespectDisabledAnimationPreference() {
        assertEquals(120, StudioFoundationContract.Motion.durationMillis(true, 120))
        assertEquals(0, StudioFoundationContract.Motion.durationMillis(false, 120))
        assertEquals(0, StudioFoundationContract.Motion.durationMillis(true, -1))
        assertEquals(
            StudioFoundationContract.Motion.ThemeTransitionMillis,
            StudioFoundationContract.Motion.durationMillis(
                true,
                StudioFoundationContract.Motion.ThemeTransitionMillis
            )
        )
    }
}
