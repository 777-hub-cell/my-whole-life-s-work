package com.vistora.android.ui

import android.graphics.Bitmap
import com.vistora.android.MainActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.io.FileOutputStream
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class VistoraVisualCaptureTest {
    @get:Rule
    val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun captureCoreScreensAtPhoneResolution() {
        compose.waitForIdle()
        capture("01-home")

        compose.onNodeWithText("Library", useUnmergedTree = true).performClick()
        compose.waitForIdle()
        capture("02-library-empty")

        compose.onNodeWithText("Add your first title").performClick()
        compose.waitForIdle()
        capture("03-add-title")

        compose.onNodeWithTag("title-input").performTextInput("VISTORA QA Sample")
        compose.onNodeWithText("Add to library").performScrollTo().performClick()
        compose.waitForIdle()
        capture("04-title-details")

        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()
        capture("05-library-with-title")

        compose.onNodeWithText("Discover", useUnmergedTree = true).performClick()
        compose.waitForIdle()
        capture("06-discover")

        compose.onNodeWithText("Stats", useUnmergedTree = true).performClick()
        compose.waitForIdle()
        capture("07-stats")

        compose.onNodeWithText("Settings", useUnmergedTree = true).performClick()
        compose.waitForIdle()
        capture("08-settings")

        compose.onNodeWithText("My Notes", substring = true).performScrollTo().performClick()
        compose.waitForIdle()
        capture("09-my-notes")
    }

    private fun capture(name: String) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val bitmap = instrumentation.uiAutomation.takeScreenshot()
        val directory = File(
            instrumentation.targetContext.filesDir,
            "vistora-visual-qa"
        ).apply { mkdirs() }
        FileOutputStream(File(directory, "$name.png")).use { output ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)
        }
        bitmap.recycle()
    }
}
