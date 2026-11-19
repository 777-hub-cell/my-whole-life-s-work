package com.aharane.studio.features.environment

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.*

data class EnvironmentValue(
    val key: String,
    val value: String,
    val readOnly: Boolean = false
)

/**
 * Native ENV presentation. Values will be provided by the authenticated API
 * adapter; the disconnected state intentionally shows the same empty layout as
 * the web Studio without creating pretend variables.
 */
@Composable
fun EnvironmentScreen(
    values: List<EnvironmentValue> = emptyList(),
    connected: Boolean = false,
    onSave: (List<EnvironmentValue>) -> Boolean = { false },
    previewMode: Boolean = false
) {
    val context = LocalContext.current
    val drafts = remember(values) { mutableStateListOf<EnvironmentValue>().apply { addAll(values) } }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        item {
            StudioPageTitle(
                "ENV",
                "Managed environment values for the Private and Public accounts. Command prefixes are fixed by Aharane."
            )
            Spacer(Modifier.height(18.dp))
        }

        if (drafts.isNotEmpty()) {
            item {
                StudioCard {
                    drafts.forEachIndexed { index, item ->
                        if (index > 0) StudioDivider()
                        Column(
                            Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 11.dp),
                            verticalArrangement = Arrangement.spacedBy(7.dp)
                        ) {
                            Text(
                                item.key + if (item.readOnly) " · Fixed" else "",
                                color = StudioPalette.Ink,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                fontFamily = FontFamily.Monospace
                            )
                            BasicTextField(
                                value = item.value,
                                onValueChange = { value ->
                                    if (!item.readOnly) drafts[index] = item.copy(value = value)
                                },
                                readOnly = item.readOnly,
                                singleLine = true,
                                textStyle = TextStyle(
                                    color = if (item.readOnly) StudioPalette.Muted else StudioPalette.Ink,
                                    fontSize = 14.sp,
                                    lineHeight = 20.sp,
                                    fontFamily = FontFamily.Monospace
                                ),
                                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                                    .background(StudioPalette.Surface)
                                    .border(1.dp, StudioPalette.Line, RoundedCornerShape(10.dp))
                                    .padding(horizontal = 12.dp, vertical = 11.dp)
                            )
                        }
                    }
                }
            }
        } else {
            item {
                Box(
                    Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 15.dp)
                        .height(1.dp).background(StudioPalette.Line)
                )
            }
        }

        item {
            Row(
                Modifier.fillMaxWidth().padding(top = 2.dp, bottom = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                StudioActionButton(
                    "Save changes",
                    primary = true,
                    onClick = {
                        if (!connected) {
                            Toast.makeText(
                                context,
                                "Connect to your Aharane server to save ENV values.",
                                Toast.LENGTH_SHORT
                            ).show()
                        } else if (onSave(drafts.toList())) {
                            Toast.makeText(context, "ENV values saved.", Toast.LENGTH_SHORT).show()
                        } else {
                            Toast.makeText(context, "ENV values could not be saved.", Toast.LENGTH_SHORT).show()
                        }
                    }
                )
            }
        }
    }
}
