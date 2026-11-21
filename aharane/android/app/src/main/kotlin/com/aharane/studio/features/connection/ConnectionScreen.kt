package com.aharane.studio.features.connection

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.R
import com.aharane.studio.core.design.*

@Composable
fun ConnectionScreen(
    studioUrl: String,
    password: String,
    serverVerified: Boolean,
    busy: Boolean,
    errorMessage: String,
    setupRequired: Boolean,
    onStudioUrlChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onConnect: () -> Unit,
    onSignIn: () -> Unit,
    onUseDifferentServer: () -> Unit
) {
    Column(
        Modifier.fillMaxSize().background(StudioPalette.Background)
            .windowInsetsPadding(WindowInsets.statusBars)
            .windowInsetsPadding(WindowInsets.navigationBars)
            .padding(horizontal = 22.dp, vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Image(
            painter = painterResource(R.drawable.ic_aharane_brand),
            contentDescription = "Aharane logo",
            modifier = Modifier.size(76.dp)
        )
        Spacer(Modifier.height(15.dp))
        Text(
            "Aharane",
            color = StudioPalette.Ink,
            fontSize = 27.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = (-.5).sp
        )
        Text(
            "Connect your private Studio",
            color = StudioPalette.Muted,
            fontSize = 13.sp,
            modifier = Modifier.padding(top = 3.dp, bottom = 24.dp)
        )

        StudioCard(padding = PaddingValues(17.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Public, null, tint = StudioPalette.Accent, modifier = Modifier.size(20.dp))
                Text(
                    if (serverVerified) "Studio found" else "Server address",
                    color = StudioPalette.Ink,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(start = 9.dp)
                )
                Spacer(Modifier.weight(1f))
                StudioTag(if (serverVerified) "HTTPS verified" else "HTTPS only")
            }
            Text(
                "Use the HTTPS address of your Aharane web Studio. The app connects to the same server and WhatsApp sessions.",
                color = StudioPalette.Muted,
                fontSize = 12.5.sp,
                lineHeight = 18.sp,
                modifier = Modifier.padding(top = 7.dp, bottom = 11.dp)
            )
            ConnectionField(
                label = "Aharane Studio URL",
                value = studioUrl,
                placeholder = "https://your-server/aharane/studio",
                keyboardType = KeyboardType.Uri,
                onValueChange = onStudioUrlChange
            )

            if (serverVerified) {
                Spacer(Modifier.height(18.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Lock, null, tint = StudioPalette.Accent, modifier = Modifier.size(19.dp))
                    Text(
                        "Studio password",
                        color = StudioPalette.Ink,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(start = 8.dp)
                    )
                }
                Text(
                    "Sign in with the password you created in Aharane Studio. It is used for this sign-in only and is not saved on this phone.",
                    color = StudioPalette.Muted,
                    fontSize = 12.5.sp,
                    lineHeight = 18.sp,
                    modifier = Modifier.padding(top = 6.dp, bottom = 10.dp)
                )
                ConnectionField(
                    label = "Password",
                    value = password,
                    placeholder = "Enter Studio password",
                    keyboardType = KeyboardType.Password,
                    password = true,
                    onValueChange = onPasswordChange
                )
            }

            if (setupRequired) {
                Text(
                    "A Studio password has not been created on this server yet. Open the web Studio once, complete its one-time password setup, then return here to sign in.",
                    color = StudioPalette.Muted,
                    fontSize = 12.5.sp,
                    lineHeight = 18.sp,
                    modifier = Modifier.padding(top = 12.dp)
                )
            }

            if (errorMessage.isNotBlank()) {
                Text(
                    errorMessage,
                    color = StudioPalette.Bad,
                    fontSize = 12.5.sp,
                    lineHeight = 18.sp,
                    modifier = Modifier.padding(top = 12.dp)
                )
            }

            Spacer(Modifier.height(17.dp))
            StudioActionButton(
                if (busy) "Connecting…" else if (serverVerified) "Sign in" else "Connect to server",
                modifier = Modifier.fillMaxWidth(),
                primary = true,
                enabled = !busy && studioUrl.isNotBlank() && (!serverVerified || password.isNotBlank()) && !setupRequired,
                onClick = if (serverVerified) onSignIn else onConnect
            )
            if (serverVerified) {
                Text(
                    "Use a different server",
                    color = StudioPalette.Accent,
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.align(Alignment.CenterHorizontally)
                        .padding(top = 13.dp).clickable(enabled = !busy, onClick = onUseDifferentServer)
                )
            }
        }

        Text(
            "Your messages and WhatsApp credentials stay on the Aharane server. This app stores only its encrypted sign-in session.",
            color = StudioPalette.Muted,
            fontSize = 11.5.sp,
            lineHeight = 16.sp,
            modifier = Modifier.padding(top = 16.dp, start = 9.dp, end = 9.dp)
        )
    }
}

@Composable
private fun ConnectionField(
    label: String,
    value: String,
    placeholder: String,
    keyboardType: KeyboardType,
    password: Boolean = false,
    onValueChange: (String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(label, color = StudioPalette.Ink, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
            textStyle = TextStyle(color = StudioPalette.Ink, fontSize = 13.5.sp),
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                .background(StudioPalette.Background)
                .border(1.dp, StudioPalette.Line, RoundedCornerShape(10.dp))
                .padding(horizontal = 12.dp, vertical = 12.dp),
            decorationBox = { inner ->
                Box {
                    if (value.isEmpty()) Text(
                        placeholder,
                        color = StudioPalette.Muted.copy(alpha = .7f),
                        fontSize = 13.sp
                    )
                    inner()
                }
            }
        )
    }
}
