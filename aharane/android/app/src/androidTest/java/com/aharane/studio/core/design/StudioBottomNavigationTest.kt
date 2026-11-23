package com.aharane.studio.core.design

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.onAllNodes
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

        compose.onNodeWithTag("studio-bottom-navigation-env").performClick()
        compose.runOnIdle {
            assertEquals(MainDestination.ENVIRONMENT, selected.value)
        }
        compose.onNodeWithTag("studio-bottom-navigation-env").assertIsSelected()
    }

    @Test
    fun bottomNavigationUsesTheApprovedFiveItemSequence() {
        assertEquals(
            listOf("Home", "Files", "ENV", "Chats", "More"),
            MainDestination.entries.map { it.label }
        )
    }
}
