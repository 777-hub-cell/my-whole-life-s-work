package com.aharane.studio.features.connection

import android.graphics.Bitmap
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.core.tween
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
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
import androidx.compose.material3.Icon
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
import com.aharane.studio.core.design.LocalStudioMotionEnabled
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
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        "WHATSAPP CONNECTION",
                        color = StudioPalette.Muted,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.1.sp
                    )
                    Text(
                        "Link a device",
                        color = StudioPalette.Ink,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                Box(
                    Modifier.size(40.dp).clip(RoundedCornerShape(14.dp))
                        .background(StudioPalette.Surface)
                        .border(1.dp, StudioPalette.Line, RoundedCornerShape(14.dp))
                        .clickable(onClick = onBack)
                        .testTag("pairing-close"),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Outlined.Close,
                        contentDescription = "Close WhatsApp pairing",
                        tint = StudioPalette.Muted,
                        modifier = Modifier.size(19.dp)
                    )
                }
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

            PairingSteps(method = method)

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
                Crossfade(
                    targetState = method == "qr",
                    animationSpec = tween(if (LocalStudioMotionEnabled.current) 200 else 0),
                    label = "pairing-method-transition"
                ) { showQr ->
                    if (showQr) {
                        PairingInfoPanel {
                    Text("Your QR code appears below. Use the steps above to scan it from your phone.", color = StudioPalette.Muted, fontSize = 13.sp, lineHeight = 19.sp)
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
                    Text("Enter the pairing code on the phone you want to link, following the steps above.", color = StudioPalette.Muted, fontSize = 13.sp, lineHeight = 19.sp)
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

            AnimatedVisibility(
                visible = loading,
                enter = fadeIn(tween(if (LocalStudioMotionEnabled.current) 140 else 0)) +
                    expandVertically(tween(if (LocalStudioMotionEnabled.current) 180 else 0)),
                exit = fadeOut(tween(if (LocalStudioMotionEnabled.current) 100 else 0)) +
                    shrinkVertically(tween(if (LocalStudioMotionEnabled.current) 140 else 0))
            ) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    CircularProgressIndicator(Modifier.size(17.dp), color = StudioPalette.Accent, strokeWidth = 2.dp)
                    Text(" Contacting WhatsApp…", color = StudioPalette.Muted, fontSize = 12.sp)
                }
            }
            AnimatedVisibility(
                visible = errorMessage.isNotBlank(),
                enter = fadeIn(tween(if (LocalStudioMotionEnabled.current) 160 else 0)) +
                    expandVertically(tween(if (LocalStudioMotionEnabled.current) 180 else 0)),
                exit = fadeOut(tween(if (LocalStudioMotionEnabled.current) 100 else 0)) +
                    shrinkVertically(tween(if (LocalStudioMotionEnabled.current) 140 else 0))
            ) {
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
            StudioActionButton("Close", modifier = Modifier.fillMaxWidth().heightIn(min = 46.dp), onClick = onBack)
            }
        }
    }
}

@Composable
private fun PairingSteps(method: String) {
    val qrMode = method == "qr"
    PairingInfoPanel {
        Text(
            "How to connect",
            color = StudioPalette.Ink,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold
        )
        val steps = if (qrMode) listOf(
            "Open WhatsApp on your phone",
            "Go to Linked devices in WhatsApp settings",
            "Choose Link a device and scan the QR code"
        ) else listOf(
            "Open WhatsApp on the phone you want to link",
            "Go to Linked devices in WhatsApp settings",
            "Choose Link with phone number and enter the code"
        )
        steps.forEachIndexed { index, label ->
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(
                    Modifier.size(27.dp).clip(RoundedCornerShape(50))
                        .background(StudioPalette.Soft),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        (index + 1).toString(),
                        color = StudioPalette.Accent,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                Text(
                    label,
                    color = StudioPalette.Muted,
                    fontSize = 12.5.sp,
                    lineHeight = 18.sp
                )
            }
        }
        Text(
            "Only approve the link on your own phone. Keep pairing codes and QR codes private.",
            color = StudioPalette.Muted,
            fontSize = 11.sp,
            lineHeight = 16.sp
        )
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
