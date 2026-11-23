package com.aharane.studio.core.design

import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.navigation.MainDestination
import org.junit.Assert.assertEquals
import org.junit.Test

class StudioFoundationContractTest {
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
        assertEquals(20.dp, StudioFoundationContract.Layout.NavigationIconSize)
        assertEquals(18.dp, StudioFoundationContract.Layout.CardRadius)
        assertEquals(30.sp, StudioFoundationContract.TypeScale.DisplayTitle)
        assertEquals(17.sp, StudioFoundationContract.TypeScale.SectionTitle)
        assertEquals(15.sp, StudioFoundationContract.TypeScale.Body)
        assertEquals(11.5.sp, StudioFoundationContract.TypeScale.BottomNavigationLabel)
    }

    @Test
    fun sharedMotionTokensRespectDisabledAnimationPreference() {
        assertEquals(120, StudioFoundationContract.Motion.durationMillis(true, 120))
        assertEquals(0, StudioFoundationContract.Motion.durationMillis(false, 120))
        assertEquals(0, StudioFoundationContract.Motion.durationMillis(true, -1))
    }
}
