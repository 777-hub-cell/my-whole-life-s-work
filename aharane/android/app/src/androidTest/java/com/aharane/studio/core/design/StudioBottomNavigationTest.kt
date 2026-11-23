package com.aharane.studio.core.design

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.junit4.createComposeRule
import com.aharane.studio.core.navigation.MainDestination
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class StudioBottomNavigationTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun allFivePrimaryDestinationsAreClickableAndSelectionUpdates() {
        val selected = mutableStateOf(MainDestination.HOME)

        compose.setContent {
            AharaneTheme(themeMode = "light") {
                StudioBottomNavigation(
                    selected = selected.value,
                    onNavigate = { selected.value = it }
                )
            }
        }

        compose.onAllNodes(hasClickAction()).assertCountEquals(5)
        compose.onNodeWithText("Home").assertIsDisplayed()
        compose.onNodeWithText("Files").assertIsDisplayed()
        compose.onNodeWithText("ENV").assertIsDisplayed()
        compose.onNodeWithText("Chats").assertIsDisplayed()
        compose.onNodeWithText("More").assertIsDisplayed()
        compose.onNodeWithTag("studio-bottom-navigation-home").assertIsSelected()

        compose.onNodeWithTag("studio-bottom-navigation-environmentironment").performClick()
        compose.runOnIdle {
            assertEquals(MainDestination.ENVIRONMENT, selected.value)
        }
        compose.onNodeWithTag("studio-bottom-navigation-environment").assertIsSelected()
    }

    @Test
    fun sharedHeaderCanHideTheWordmarkOutsideHome() {
        val showBrand = mutableStateOf(false)
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                StudioHeader(connected = true, showBrand = showBrand.value)
            }
        }

        compose.onNodeWithText("Aharane").assertDoesNotExist()
        compose.onNodeWithText("Online").assertIsDisplayed()

        compose.runOnIdle { showBrand.value = true }
        compose.onNodeWithText("Aharane").assertIsDisplayed()
    }

    @Test
    fun sharedErrorStateRunsOnlyItsProvidedRetryAction() {
        val retryCount = mutableStateOf(0)
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                StudioErrorState(
                    title = "Could not load Channels",
                    description = "Check the connection and try again.",
                    onRetry = { retryCount.value += 1 }
                )
            }
        }

        compose.onNodeWithText("Could not load Channels").assertIsDisplayed()
        compose.onNodeWithText("Retry").performClick()
        compose.runOnIdle { assertEquals(1, retryCount.value) }
    }

    @Test
    fun bottomNavigationUsesTheApprovedFiveItemSequence() {
        assertEquals(
            listOf("Home", "Files", "ENV", "Chats", "More"),
            MainDestination.entries.map { it.label }
        )
    }
}
