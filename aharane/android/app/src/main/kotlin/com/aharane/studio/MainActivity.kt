package com.aharane.studio

import android.os.Bundle
import android.app.KeyguardManager
import android.content.Intent
import android.widget.Toast
import android.content.ComponentName
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import com.aharane.studio.core.design.AharaneTheme
import com.aharane.studio.core.network.AharaneConnectionManager

class MainActivity : ComponentActivity() {
    private val notificationTarget = mutableStateOf<Triple<String, String, Long>?>(null)
    private val appLockPreferences by lazy { getSharedPreferences("aharane-app-lock", MODE_PRIVATE) }
    private lateinit var credentialPromptLauncher: ActivityResultLauncher<Intent>
    private var appLockPromptInFlight = false
    private val appLockEnabledState = mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        appLockEnabledState.value = appLockPreferences.getBoolean("enabled", false)
        credentialPromptLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            appLockPromptInFlight = false
            if (result.resultCode == RESULT_OK) {
                appLockPreferences.edit().putBoolean("locked", false).apply()
                appLockEnabledState.value = appLockPreferences.getBoolean("enabled", false)
            } else {
                appLockPreferences.edit().putBoolean("enabled", false).putBoolean("locked", false).apply()
                appLockEnabledState.value = false
                Toast.makeText(this, "Device unlock wasn't enabled. You can turn it on again in Settings.", Toast.LENGTH_LONG).show()
            }
        }
        enableEdgeToEdge()
        val isDebuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        val previewMode = isDebuggable && intent?.getBooleanExtra("aharane_preview_mode", false) == true
        val preferences = getSharedPreferences("aharane-studio-ui", MODE_PRIVATE)
        applyLauncherIcon(this, preferences.getString("launcherIcon", "classic") ?: "classic")
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
            var launcherIcon by rememberSaveable {
                mutableStateOf(preferences.getString("launcherIcon", "classic") ?: "classic")
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
                    appLockEnabled = appLockEnabledState.value,
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
                    launcherIcon = launcherIcon,
                    onLauncherIconChanged = {
                        launcherIcon = it
                        preferences.edit().putString("launcherIcon", it).apply()
                        applyLauncherIcon(this@MainActivity, it)
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

    fun setAppLockEnabled(enabled: Boolean): Boolean {
        if (enabled) {
            val keyguard = getSystemService(KeyguardManager::class.java)
            if (keyguard?.isDeviceSecure != true) return false
        }
        appLockPreferences.edit()
            .putBoolean("enabled", enabled)
            .putBoolean("locked", enabled)
            .apply()
        appLockEnabledState.value = enabled
        if (enabled) promptForDeviceCredential()
        return true
    }

    override fun onStart() {
        super.onStart()
        promptForDeviceCredential()
    }

    override fun onStop() {
        if (appLockPreferences.getBoolean("enabled", false) && !isChangingConfigurations) {
            appLockPreferences.edit().putBoolean("locked", true).apply()
        }
        super.onStop()
    }

    private fun promptForDeviceCredential() {
        if (!appLockPreferences.getBoolean("enabled", false) ||
            !appLockPreferences.getBoolean("locked", false) ||
            appLockPromptInFlight || isFinishing
        ) return
        val keyguard = getSystemService(KeyguardManager::class.java)
        if (keyguard?.isDeviceSecure != true) {
            appLockPreferences.edit().putBoolean("enabled", false).putBoolean("locked", false).apply()
            appLockEnabledState.value = false
            Toast.makeText(this, "Aharane app lock was disabled because this device no longer has a secure screen lock.", Toast.LENGTH_LONG).show()
            return
        }
        val intent = keyguard.createConfirmDeviceCredentialIntent(
            "Unlock Aharane",
            "Confirm your device screen lock to continue."
        )
        if (intent == null) {
            appLockPreferences.edit().putBoolean("enabled", false).putBoolean("locked", false).apply()
            appLockEnabledState.value = false
            Toast.makeText(this, "Android could not open the device credential screen. Device unlock remains off.", Toast.LENGTH_LONG).show()
            return
        }
        appLockPromptInFlight = true
        credentialPromptLauncher.launch(intent)
    }

    companion object {
        private val launcherComponents = listOf("LauncherClassic", "LauncherMono", "LauncherNight")

        fun applyLauncherIcon(context: Context, style: String) {
            val selected = when (style.lowercase()) {
                "mono" -> "LauncherMono"
                "night" -> "LauncherNight"
                else -> "LauncherClassic"
            }
            val packageManager = context.packageManager
            launcherComponents.forEach { alias ->
                packageManager.setComponentEnabledSetting(
                    ComponentName(context.packageName, "${context.packageName}.$alias"),
                    if (alias == selected) PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                    else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP
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
