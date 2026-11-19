package com.aharane.studio

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.aharane.studio.core.design.AharaneTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val preferences = getSharedPreferences("aharane-studio-ui", MODE_PRIVATE)

        setContent {
            var themeMode by rememberSaveable {
                mutableStateOf(preferences.getString("themeMode", "system") ?: "system")
            }
            var accentColor by rememberSaveable {
                mutableStateOf(preferences.getString("accentColor", "#0E7A5C") ?: "#0E7A5C")
            }
            var interfaceSize by rememberSaveable {
                mutableStateOf(preferences.getString("interfaceSize", "default") ?: "default")
            }
            var cornerStyle by rememberSaveable {
                mutableStateOf(preferences.getString("cornerStyle", "default") ?: "default")
            }
            var rowSpacing by rememberSaveable {
                mutableStateOf(preferences.getString("rowSpacing", "comfortable") ?: "comfortable")
            }
            var editorTheme by rememberSaveable {
                mutableStateOf(preferences.getString("editorTheme", "Dark+") ?: "Dark+")
            }
            var editorFontSize by rememberSaveable {
                mutableStateOf(preferences.getInt("editorFontSize", 14))
            }
            var editorLineNumbers by rememberSaveable {
                mutableStateOf(preferences.getBoolean("editorLineNumbers", true))
            }

            val interfaceScale = when (interfaceSize) {
                "compact" -> .94f
                "large" -> 1.06f
                else -> 1f
            }
            val cornerScale = when (cornerStyle) {
                "sharp" -> .68f
                "rounded" -> 1.24f
                else -> 1f
            }
            val rowScale = when (rowSpacing) {
                "compact" -> .88f
                "relaxed" -> 1.12f
                else -> 1f
            }

            AharaneTheme(
                themeMode = themeMode,
                accentColorHex = accentColor,
                interfaceScale = interfaceScale,
                cornerScale = cornerScale,
                rowScale = rowScale
            ) {
                AharaneApp(
                    themeMode = themeMode,
                    onThemeModeChanged = {
                        themeMode = it
                        preferences.edit().putString("themeMode", it).apply()
                    },
                    accentColor = accentColor,
                    onAccentColorChanged = {
                        accentColor = it
                        preferences.edit().putString("accentColor", it).apply()
                    },
                    interfaceSize = interfaceSize,
                    onInterfaceSizeChanged = {
                        interfaceSize = it
                        preferences.edit().putString("interfaceSize", it).apply()
                    },
                    cornerStyle = cornerStyle,
                    onCornerStyleChanged = {
                        cornerStyle = it
                        preferences.edit().putString("cornerStyle", it).apply()
                    },
                    rowSpacing = rowSpacing,
                    onRowSpacingChanged = {
                        rowSpacing = it
                        preferences.edit().putString("rowSpacing", it).apply()
                    },
                    editorTheme = editorTheme,
                    onEditorThemeChanged = {
                        editorTheme = it
                        preferences.edit().putString("editorTheme", it).apply()
                    },
                    editorFontSize = editorFontSize,
                    onEditorFontSizeChanged = {
                        editorFontSize = it
                        preferences.edit().putInt("editorFontSize", it).apply()
                    },
                    editorLineNumbers = editorLineNumbers,
                    onEditorLineNumbersChanged = {
                        editorLineNumbers = it
                        preferences.edit().putBoolean("editorLineNumbers", it).apply()
                    }
                )
            }
        }
    }
}
