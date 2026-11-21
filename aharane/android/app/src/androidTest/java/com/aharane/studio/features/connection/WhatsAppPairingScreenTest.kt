package com.aharane.studio.features.connection

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import com.aharane.studio.core.design.AharaneTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class WhatsAppPairingScreenTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun userCanChooseQrOrPairingCodeBeforeRequestingIt() {
        val method = mutableStateOf("pin")
        var pinRequests = 0
        var qrRequests = 0
        compose.setContent {
            AharaneTheme(themeMode = "light") {
                WhatsAppPairingScreen(
                    accountLabel = "Private",
                    method = method.value,
                    pairingCode = "",
                    qrValue = "",
                    loading = false,
                    connected = false,
                    errorMessage = "",
                    previewMode = false,
                    onBack = {},
                    onSelectMethod = { method.value = it },
                    onRequestPairingCode = { pinRequests += 1 },
                    onRequestQrCode = { qrRequests += 1 },
                    onCopyCode = {}
                )
            }
        }

        compose.onNodeWithTag("pair-method-pin").assertIsDisplayed()
        compose.onNodeWithTag("pair-method-qr").performClick()
        compose.onNodeWithText("Get QR code").assertIsDisplayed()
        compose.onNodeWithTag("pairing-request-qr").performClick()
        assertEquals(1, qrRequests)

        compose.onNodeWithTag("pair-method-pin").performClick()
        compose.onNodeWithText("Get pairing code").assertIsDisplayed()
        compose.onNodeWithTag("pairing-request-pin").performClick()
        assertEquals(1, pinRequests)
    }
}
