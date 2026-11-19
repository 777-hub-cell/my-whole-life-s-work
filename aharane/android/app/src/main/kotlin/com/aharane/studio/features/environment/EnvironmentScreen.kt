package com.aharane.studio.features.environment

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.*

@Composable
fun EnvironmentScreen() {
    val context = LocalContext.current
    val unavailable = {
        Toast.makeText(context, "Connect Aharane to manage environment values.", Toast.LENGTH_SHORT).show()
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        item {
            StudioPageTitle("ENV", "Edit any variable. Configuration reads and writes these too.")
            Spacer(Modifier.height(14.dp))
        }
        item {
            Row(
                Modifier.fillMaxWidth().background(StudioPalette.Soft, RoundedCornerShape(14.dp))
                    .padding(horizontal = 14.dp, vertical = 12.dp)
            ) {
                Text(
                    "Secret values stay hidden until you choose to show them.",
                    color = StudioPalette.Accent,
                    fontSize = 13.sp,
                    lineHeight = 19.sp
                )
            }
            Spacer(Modifier.height(12.dp))
        }
        item {
            StudioCard {
                StudioEmpty(
                    title = "No variables yet.",
                    description = "Environment values will appear here after this app is securely linked to your Aharane server."
                )
            }
            Spacer(Modifier.height(12.dp))
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StudioActionButton("Add variable", modifier = Modifier.weight(1f), onClick = unavailable)
                StudioActionButton(
                    "Save changes",
                    modifier = Modifier.weight(1f),
                    primary = true,
                    enabled = false,
                    onClick = {}
                )
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}
