package com.aharane.studio

import android.os.Bundle
import android.content.pm.ApplicationInfo
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.aharane.studio.core.design.AharaneTheme
import com.aharane.studio.core.network.AharaneConnectionManager

class MainActivity : ComponentActivity() {
    private val notificationTarget = mutableStateOf<Triple<String, String, Long>?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val isDebuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        val previewMode = isDebuggable && intent?.getBooleanExtra("aharane_preview_mode", false) == true
        val preferences = getSharedPreferences("aharane-studio-ui", MODE_PRIVATE)
        readNotificationIntent(intent)

        setContent {
            val connectionManager = androidx.compose.runtime.remember { AharaneConnectionManager(applicationContext) }
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
            var chatMessageSize by rememberSaveable {
                mutableStateOf(preferences.getInt("chatMessageSize", 14))
            }
            var editorLineNumbers by rememberSaveable {
                mutableStateOf(preferences.getBoolean("editorLineNumbers", true))
            }

            val interfaceScale = when (interfaceSize) {
                "small" -> .90f
                "large" -> 1.15f
                "largest" -> 1.30f
                else -> 1f
            }
            val cornerScale = when (cornerStyle) {
                "sharp" -> .68f
                "rounded" -> 1.24f
                else -> 1f
            }
            val rowScale = when (rowSpacing) {
                "compact" -> .80f
                "roomy" -> 1.15f
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
                    connectionManager = connectionManager,
                    previewMode = previewMode,
                    notificationAccount = notificationTarget.value?.first,
                    notificationJid = notificationTarget.value?.second,
                    notificationRequestId = notificationTarget.value?.third ?: 0L,
                    onNotificationHandled = { notificationTarget.value = null },
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
                    chatMessageSize = chatMessageSize,
                    onChatMessageSizeChanged = {
                        chatMessageSize = it
                        preferences.edit().putInt("chatMessageSize", it).apply()
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

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        readNotificationIntent(intent)
    }

    private fun readNotificationIntent(intent: android.content.Intent?) {
        val account = intent?.getStringExtra("aharane.notification.account").orEmpty()
        val jid = intent?.getStringExtra("aharane.notification.jid").orEmpty()
        if (account.isNotBlank() && jid.isNotBlank()) {
            notificationTarget.value = Triple(account, jid, System.currentTimeMillis())
            intent?.removeExtra("aharane.notification.account")
            intent?.removeExtra("aharane.notification.jid")
        }
    }
}
