package com.aharane.studio.features.more

import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.aharane.studio.core.design.*

@Composable
fun MoreScreen() {
    val context = LocalContext.current
    val unavailable = { label: String ->
        Toast.makeText(context, "$label will be available after connecting to Aharane.", Toast.LENGTH_SHORT).show()
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        item {
            StudioPageTitle("More", "Additional tools and information")
        }

        item { StudioSectionHeading("Tools") }
        item {
            StudioCard {
                StudioRow(
                    "Activity and logs",
                    "Review bot activity and diagnostic records",
                    trailing = "›",
                    onClick = { unavailable("Activity and logs") }
                )
                StudioDivider()
                StudioRow(
                    "Storage information",
                    "View disk and storage usage",
                    trailing = "›",
                    onClick = { unavailable("Storage information") }
                )
            }
        }

        item { StudioSectionHeading("Preferences") }
        item {
            StudioCard {
                StudioRow(
                    "Appearance",
                    "Theme, accent color, text size and editor",
                    trailing = "›",
                    onClick = { unavailable("Appearance settings") }
                )
            }
        }

        item { StudioSectionHeading("Support") }
        item {
            StudioCard {
                StudioRow(
                    "Help",
                    "Guidance for using Aharane Studio",
                    trailing = "›",
                    onClick = { unavailable("Help") }
                )
                StudioDivider()
                StudioRow(
                    "About Aharane",
                    "Version and application information",
                    trailing = "›",
                    onClick = { unavailable("About Aharane") }
                )
            }
        }
        item { Spacer(Modifier.height(10.dp)) }
    }
}
