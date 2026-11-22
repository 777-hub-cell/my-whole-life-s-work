package com.vistora.android.ui

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import android.util.Log
import androidx.test.uiautomator.UiDevice
import com.vistora.android.MainActivity
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Real emulator visual smoke test.
 *
 * The screenshots are taken from the device display (including system bars),
 * not reconstructed from a web preview. The CI workflow pulls this directory
 * into a GitHub Actions artifact so each screen can be visually inspected.
 */
@RunWith(AndroidJUnit4::class)
class VistoraVisualSmokeTest {
    @get:Rule
    val rule = createAndroidComposeRule<MainActivity>()

    private val device: UiDevice
        get() = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

    private fun capture(name: String) {
        rule.waitForIdle()
        device.waitForIdle()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val directory = File(context.filesDir, "vistora-qa").apply { mkdirs() }
        Log.i("VistoraVisualQA", "SCREENSHOT_DIR=${directory.absolutePath}")
        Log.i("VistoraVisualQA", "SCREENSHOT_PARENT=${context.filesDir.absolutePath}")
        check(device.takeScreenshot(File(directory, "$name.png"))) {
            "Could not capture screenshot: $name"
        }
    }

    @Test
    fun captureMainScreensAndTitleFlow() {
        capture("01-home")

        // The Home editorial action must open Discover, not Library search.
        rule.onNodeWithText("Open Discover").performClick()
        rule.onNodeWithText("Picked for tonight").assertIsDisplayed()
        rule.onNodeWithContentDescription("Home tab").performClick()

        // Library should begin empty; the preview catalogue must never populate it.
        rule.onNodeWithContentDescription("Library tab").performClick()
        rule.onNodeWithText("Your library is empty").assertIsDisplayed()
        capture("02-library")

        rule.onNodeWithText("Add a title").performClick()
        capture("03-add-title")
        rule.onNodeWithText("Title name").performClick()
        rule.onNodeWithText("Title name").performTextInput("VISTORA QA sample")
        rule.onNodeWithText("Add to library").performScrollTo().performClick()
        rule.onNodeWithContentDescription("Open VISTORA QA sample details").assertIsDisplayed()
        capture("04-library-with-title")

        rule.onNodeWithContentDescription("Open VISTORA QA sample details").performClick()
        rule.onNodeWithText("Title Details").assertIsDisplayed()
        capture("05-title-details")
        device.pressBack()
        rule.waitForIdle()

        rule.onNodeWithContentDescription("Discover tab").performClick()
        rule.onNodeWithText("Picked for tonight").assertIsDisplayed()
        capture("06-discover")

        rule.onNodeWithContentDescription("Stats tab").performClick()
        rule.onNodeWithText("By status").assertIsDisplayed()
        capture("07-stats")

        rule.onNodeWithContentDescription("Settings tab").performClick()
        rule.onNodeWithText("My Notes").assertIsDisplayed()
        capture("08-more")
    }
}
