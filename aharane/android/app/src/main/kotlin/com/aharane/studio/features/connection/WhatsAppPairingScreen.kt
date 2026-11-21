package com.aharane.studio.features.connection

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.R
import com.aharane.studio.core.design.StudioActionButton
import com.aharane.studio.core.design.StudioPalette
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

@Composable
fun WhatsAppPairingScreen(
    modifier: Modifier = Modifier,
    accountLabel: String,
    method: String,
    pairingCode: String,
    qrValue: String,
    loading: Boolean,
    connected: Boolean,
    errorMessage: String,
    previewMode: Boolean,
    onBack: () -> Unit,
    onSelectMethod: (String) -> Unit,
    onRequestPairingCode: () -> Unit,
    onRequestQrCode: () -> Unit,
    onCopyCode: () -> Unit
) {
    val qrImage = remember(qrValue) {
        if (qrValue.isBlank()) null else runCatching { createQrImage(qrValue) }.getOrNull()
    }
    Column(
        modifier.fillMaxSize()
            .background(StudioPalette.Background)
            .statusBarsPadding()
            .navigationBarsPadding()
    ) {
        Column(
            Modifier.fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 18.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(13.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "‹  Back",
                    color = StudioPalette.Accent,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clip(RoundedCornerShape(8.dp))
                        .clickable(onClick = onBack)
                        .padding(horizontal = 9.dp, vertical = 9.dp)
                        .testTag("pairing-back")
                )
                Spacer(Modifier.weight(1f))
                Text("WHATSAPP LINK", color = StudioPalette.Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.1.sp)
            }

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                Image(
                    painter = painterResource(R.drawable.ic_aharane_brand),
                    contentDescription = "Aharane",
                    modifier = Modifier.size(44.dp)
                )
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("Link " + accountLabel + " account", color = StudioPalette.Ink, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    Text(
                        if (connected) "WhatsApp is connected" else "Choose how you want to link this WhatsApp account",
                        color = if (connected) StudioPalette.Accent else StudioPalette.Muted,
                        fontSize = 12.5.sp
                    )
                }
            }

            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                    .background(StudioPalette.Surface)
                    .border(1.dp, StudioPalette.Line, RoundedCornerShape(12.dp))
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(5.dp)
            ) {
                PairingMethodButton(
                    label = "Pairing code",
                    selected = method == "pin",
                    modifier = Modifier.weight(1f).testTag("pair-method-pin")
                ) { onSelectMethod("pin") }
                PairingMethodButton(
                    label = "QR code",
                    selected = method == "qr",
                    modifier = Modifier.weight(1f).testTag("pair-method-qr")
                ) { onSelectMethod("qr") }
            }

            if (previewMode) {
                PairingInfoPanel {
                    Text(
                        "This is a preview. Connect to your Aharane server to request a real WhatsApp pairing code or QR. No account has been paired.",
                        color = StudioPalette.Muted,
                        fontSize = 13.sp,
                        lineHeight = 19.sp
                    )
                }
            } else {
                if (connected) {
                    PairingInfoPanel {
                        Text(
                            "Your current WhatsApp session stays available until the replacement link is confirmed.",
                            color = StudioPalette.Accent,
                            fontSize = 13.sp,
                            lineHeight = 19.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
                if (method == "qr") {
                PairingInfoPanel {
                    Text("On your phone, open WhatsApp → Linked devices → Link a device. Scan the QR code below.", color = StudioPalette.Muted, fontSize = 13.sp, lineHeight = 19.sp)
                    Box(
                        Modifier.fillMaxWidth().heightIn(min = 236.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color.White)
                            .border(1.dp, StudioPalette.Line, RoundedCornerShape(12.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        when {
                            qrImage != null -> Image(
                                bitmap = qrImage,
                                contentDescription = "WhatsApp pairing QR code",
                                modifier = Modifier.size(224.dp).padding(5.dp).testTag("pairing-qr-image")
                            )
                            loading -> CircularProgressIndicator(color = StudioPalette.Accent)
                            else -> Text(
                                "Your QR code will appear here after you request it.",
                                color = StudioPalette.Muted,
                                fontSize = 12.sp,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.padding(24.dp)
                            )
                        }
                    }
                    StudioActionButton(
                        if (qrValue.isBlank()) "Get QR code" else "Request fresh QR code",
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("pairing-request-qr"),
                        primary = true,
                        enabled = !loading,
                        onClick = onRequestQrCode
                    )
                }
            } else {
                PairingInfoPanel {
                    Text("On the phone you want to link, open WhatsApp → Linked devices → Link with phone number.", color = StudioPalette.Muted, fontSize = 13.sp, lineHeight = 19.sp)
                    if (pairingCode.isBlank()) {
                        Text("A code is only requested when you tap the button below.", color = StudioPalette.Ink, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                    } else {
                        Box(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                                .background(StudioPalette.Background)
                                .border(1.dp, StudioPalette.Line, RoundedCornerShape(12.dp))
                                .padding(vertical = 22.dp, horizontal = 10.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                pairingCode,
                                color = StudioPalette.Accent,
                                fontSize = 29.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 2.sp,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.testTag("pairing-code")
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            StudioActionButton("Copy code", modifier = Modifier.weight(1f).heightIn(min = 46.dp), onClick = onCopyCode)
                            StudioActionButton("Request new", modifier = Modifier.weight(1f).heightIn(min = 46.dp), onClick = onRequestPairingCode, enabled = !loading)
                        }
                    }
                    if (pairingCode.isBlank()) {
                        StudioActionButton(
                            "Get pairing code",
                            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("pairing-request-pin"),
                            primary = true,
                            enabled = !loading,
                            onClick = onRequestPairingCode
                        )
                    }
                }
            }
            }

            if (loading) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    CircularProgressIndicator(Modifier.size(17.dp), color = StudioPalette.Accent, strokeWidth = 2.dp)
                    Text(" Contacting WhatsApp…", color = StudioPalette.Muted, fontSize = 12.sp)
                }
            }
            if (errorMessage.isNotBlank()) {
                Text(
                    errorMessage,
                    color = if (errorMessage.contains("is connected", ignoreCase = true)) StudioPalette.Accent else StudioPalette.Bad,
                    fontSize = 12.sp,
                    lineHeight = 17.sp,
                    modifier = Modifier.fillMaxWidth()
                        .clip(RoundedCornerShape(9.dp))
                        .background(StudioPalette.Surface)
                        .padding(11.dp)
                        .testTag("pairing-error")
                )
            }
            StudioActionButton("Back to accounts", modifier = Modifier.fillMaxWidth().heightIn(min = 46.dp), onClick = onBack)
        }
    }
}

@Composable
private fun PairingMethodButton(
    label: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Box(
        modifier.clip(RoundedCornerShape(9.dp))
            .background(if (selected) Color(0xFF174638) else Color(0xFF17211E))
            .border(1.dp, if (selected) Color(0xFF3ABF94) else Color(0xFF34413B), RoundedCornerShape(9.dp))
            .clickable(onClick = onClick)
            .heightIn(min = 48.dp)
            .padding(horizontal = 10.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            label,
            color = if (selected) Color(0xFF9AEACB) else Color(0xFFE3EBE6),
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
private fun PairingInfoPanel(content: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
            .background(StudioPalette.Surface)
            .border(1.dp, StudioPalette.Line, RoundedCornerShape(14.dp))
            .padding(15.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        content()
    }
}

private fun createQrImage(value: String): androidx.compose.ui.graphics.ImageBitmap {
    val hints = mapOf(
        EncodeHintType.MARGIN to 2,
        EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M
    )
    val matrix = QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 512, 512, hints)
    val bitmap = Bitmap.createBitmap(matrix.width, matrix.height, Bitmap.Config.ARGB_8888)
    for (y in 0 until matrix.height) {
        for (x in 0 until matrix.width) {
            bitmap.setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
        }
    }
    return bitmap.asImageBitmap()
}
