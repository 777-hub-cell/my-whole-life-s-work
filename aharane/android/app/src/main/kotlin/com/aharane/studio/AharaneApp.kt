package com.aharane.studio

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import com.aharane.studio.core.design.*
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.model.ChatSummary
import com.aharane.studio.core.model.ChatFilter
import com.aharane.studio.core.navigation.MainDestination
import com.aharane.studio.features.chats.ChatsScreen
import com.aharane.studio.features.chats.ConversationScreen
import com.aharane.studio.features.configuration.ConfigurationScreen
import com.aharane.studio.features.environment.EnvironmentScreen
import com.aharane.studio.features.files.CodeEditorScreen
import com.aharane.studio.features.files.FilesScreen
import com.aharane.studio.features.home.HomeScreen
import com.aharane.studio.features.more.MoreScreen

@Composable
fun AharaneApp(
    themeMode: String,
    onThemeModeChanged: (String) -> Unit,
    accentColor: String,
    onAccentColorChanged: (String) -> Unit,
    interfaceSize: String,
    onInterfaceSizeChanged: (String) -> Unit,
    cornerStyle: String,
    onCornerStyleChanged: (String) -> Unit,
    rowSpacing: String,
    onRowSpacingChanged: (String) -> Unit,
    editorTheme: String,
    onEditorThemeChanged: (String) -> Unit,
    editorFontSize: Int,
    onEditorFontSizeChanged: (Int) -> Unit,
    editorLineNumbers: Boolean,
    onEditorLineNumbersChanged: (Boolean) -> Unit
) {
    var destinationName by rememberSaveable { mutableStateOf(MainDestination.HOME.name) }
    var accountName by rememberSaveable { mutableStateOf(ChatAccount.PRIVATE.name) }
    var filterName by rememberSaveable { mutableStateOf(ChatFilter.ALL.name) }
    var editorOpen by rememberSaveable { mutableStateOf(false) }
    var editorFromConfiguration by rememberSaveable { mutableStateOf(false) }
    var configurationOpen by rememberSaveable { mutableStateOf(false) }
    var activeConversation by remember { mutableStateOf<ChatSummary?>(null) }

    val destination = MainDestination.valueOf(destinationName)
    val account = ChatAccount.valueOf(accountName)
    val filter = ChatFilter.valueOf(filterName)

    Column(
        Modifier.fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.statusBars)
    ) {
        if (!editorOpen && activeConversation == null) {
            StudioHeader(onStatusClick = { destinationName = MainDestination.HOME.name })
        }

        Box(Modifier.weight(1f).fillMaxWidth()) {
            when {
                editorOpen -> CodeEditorScreen(
                    modifier = Modifier.fillMaxSize(),
                    onClose = {
                        editorOpen = false
                        if (editorFromConfiguration) configurationOpen = true
                    },
                    lineNumbers = editorLineNumbers,
                    fontSizeSp = editorFontSize,
                    editorTheme = editorTheme
                )
                activeConversation != null -> ConversationScreen(
                    conversation = activeConversation!!,
                    messages = emptyList(),
                    connected = false,
                    onBack = { activeConversation = null },
                    onSend = { _, _ -> },
                    onAttach = {},
                    onRecordVoice = {}
                )
                configurationOpen -> ConfigurationScreen(
                    onBack = { configurationOpen = false },
                    onEditConfig = {
                        editorFromConfiguration = true
                        configurationOpen = false
                        editorOpen = true
                    }
                )
                else -> when (destination) {
                    MainDestination.HOME -> HomeScreen(
                        onOpenChats = { destinationName = MainDestination.CHATS.name },
                        onOpenMore = { destinationName = MainDestination.MORE.name },
                        onOpenConfiguration = { configurationOpen = true }
                    )
                    MainDestination.CHATS -> ChatsScreen(
                        account = account,
                        onAccountSelected = { accountName = it.name },
                        filter = filter,
                        onFilterSelected = { filterName = it.name },
                        conversations = emptyList(),
                        accountConnected = false,
                        onConversationSelected = { activeConversation = it }
                    )
                    MainDestination.FILES -> FilesScreen(
                        onEditorVisibility = {
                            editorFromConfiguration = false
                            editorOpen = it
                        }
                    )
                    MainDestination.ENVIRONMENT -> EnvironmentScreen()
                    MainDestination.MORE -> MoreScreen(
                        themeMode = themeMode,
                        onThemeModeChanged = onThemeModeChanged,
                        accentColor = accentColor,
                        onAccentColorChanged = onAccentColorChanged,
                        interfaceSize = interfaceSize,
                        onInterfaceSizeChanged = onInterfaceSizeChanged,
                        cornerStyle = cornerStyle,
                        onCornerStyleChanged = onCornerStyleChanged,
                        rowSpacing = rowSpacing,
                        onRowSpacingChanged = onRowSpacingChanged,
                        editorTheme = editorTheme,
                        onEditorThemeChanged = onEditorThemeChanged,
                        editorFontSize = editorFontSize,
                        onEditorFontSizeChanged = onEditorFontSizeChanged,
                        editorLineNumbers = editorLineNumbers,
                        onEditorLineNumbersChanged = onEditorLineNumbersChanged
                    )
                }
            }
        }

        if (!editorOpen && activeConversation == null) {
            StudioBottomNavigation(
                selected = destination,
                onNavigate = {
                    configurationOpen = false
                    destinationName = it.name
                }
            )
        }
    }
}
