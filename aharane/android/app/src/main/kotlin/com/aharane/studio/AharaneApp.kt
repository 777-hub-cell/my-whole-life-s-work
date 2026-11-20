package com.aharane.studio

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import kotlinx.coroutines.launch
import org.json.JSONObject
import androidx.compose.ui.platform.LocalContext
import com.aharane.studio.core.network.AharaneConnectionManager
import com.aharane.studio.core.network.AharaneApiException
import com.aharane.studio.features.connection.ConnectionScreen
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import com.aharane.studio.core.design.*
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.model.ChatSummary
import com.aharane.studio.core.model.ChatMessage
import com.aharane.studio.core.model.ChatFilter
import com.aharane.studio.core.model.DesignPreviewFixtures
import com.aharane.studio.core.model.MessageDirection
import com.aharane.studio.core.model.MessageKind
import com.aharane.studio.core.model.MessageStatus
import com.aharane.studio.core.navigation.MainDestination
import com.aharane.studio.features.chats.ChatsScreen
import com.aharane.studio.features.chats.ConversationScreen
import com.aharane.studio.features.configuration.ConfigurationScreen
import com.aharane.studio.features.environment.EnvironmentScreen
import com.aharane.studio.features.files.CodeEditorScreen
import com.aharane.studio.features.files.FilesScreen
import com.aharane.studio.features.files.StudioEditorDocument
import com.aharane.studio.features.files.StudioFileEntry
import com.aharane.studio.features.home.HomeScreen
import com.aharane.studio.features.more.MoreScreen

@Composable
fun AharaneApp(
    connectionManager: AharaneConnectionManager,
    previewMode: Boolean = false,
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
    val connectionScope = rememberCoroutineScope()
    var authenticated by remember(previewMode) { mutableStateOf(previewMode) }
    var connectionUrl by rememberSaveable { mutableStateOf(connectionManager.savedStudioUrl) }
    var connectionPassword by remember { mutableStateOf("") }
    var serverVerified by remember { mutableStateOf(false) }
    var connectionBusy by remember { mutableStateOf(false) }
    var setupRequired by remember { mutableStateOf(false) }
    var connectionError by remember { mutableStateOf("") }

    LaunchedEffect(connectionManager, previewMode) {
        if (!previewMode && connectionUrl.isNotBlank()) {
            connectionBusy = true
            try {
                authenticated = connectionManager.restoreSession()
                if (!authenticated) {
                    val auth = connectionManager.api?.authStatus()
                    serverVerified = auth != null
                    setupRequired = auth?.optBoolean("setupRequired") == true
                }
            } catch (error: Exception) {
                connectionError = error.message ?: "Could not reach your Aharane server."
                serverVerified = false
            } finally {
                connectionBusy = false
            }
        }
    }

    if (!authenticated) {
        ConnectionScreen(
            studioUrl = connectionUrl,
            password = connectionPassword,
            serverVerified = serverVerified,
            busy = connectionBusy,
            errorMessage = connectionError,
            setupRequired = setupRequired,
            onStudioUrlChange = {
                connectionUrl = it
                serverVerified = false
                setupRequired = false
                connectionError = ""
            },
            onPasswordChange = { connectionPassword = it },
            onConnect = {
                connectionScope.launch {
                    connectionBusy = true
                    connectionError = ""
                    try {
                        val result = connectionManager.connect(connectionUrl)
                        val auth = result.optJSONObject("auth") ?: JSONObject()
                        serverVerified = true
                        setupRequired = auth.optBoolean("setupRequired")
                        connectionUrl = connectionManager.savedStudioUrl
                    } catch (error: Exception) {
                        connectionError = error.message ?: "Could not connect to this Aharane server."
                        serverVerified = false
                    } finally {
                        connectionBusy = false
                    }
                }
            },
            onSignIn = {
                connectionScope.launch {
                    connectionBusy = true
                    connectionError = ""
                    try {
                        connectionManager.login(connectionPassword)
                        connectionPassword = ""
                        authenticated = true
                        setupRequired = false
                    } catch (error: Exception) {
                        connectionError = error.message ?: "Sign-in failed."
                    } finally {
                        connectionBusy = false
                    }
                }
            },
            onUseDifferentServer = {
                connectionManager.forgetServer()
                connectionUrl = ""
                connectionPassword = ""
                serverVerified = false
                setupRequired = false
                connectionError = ""
            }
        )
        return
    }

    var destinationName by rememberSaveable { mutableStateOf(MainDestination.HOME.name) }
    var accountName by rememberSaveable { mutableStateOf(ChatAccount.PRIVATE.name) }
    var filterName by rememberSaveable { mutableStateOf(ChatFilter.ALL.name) }
    var editorOpen by rememberSaveable { mutableStateOf(false) }
    var editorFromConfiguration by rememberSaveable { mutableStateOf(false) }
    var configurationOpen by rememberSaveable { mutableStateOf(false) }
    var morePage by rememberSaveable { mutableStateOf("more") }
    var activeConversation by remember { mutableStateOf<ChatSummary?>(null) }
    var activeEditorPath by rememberSaveable { mutableStateOf<String?>(null) }
    val previewMessages = remember { mutableStateListOf<ChatMessage>().apply {
        if (previewMode) addAll(DesignPreviewFixtures.messages)
    } }
    val editorDocuments = remember { mutableStateListOf<StudioEditorDocument>() }

    fun openPreviewDocument(path: String) {
        if (!previewMode) return
        val existing = editorDocuments.firstOrNull { it.path == path }
        if (existing == null) {
            val source = DesignPreviewFixtures.sourceFiles[path] ?: return
            editorDocuments.add(StudioEditorDocument(path = path, content = source))
        }
        activeEditorPath = path
        editorOpen = true
        activeConversation = null
    }

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
                        activeEditorPath = null
                        if (editorFromConfiguration) configurationOpen = true
                    },
                    openDocuments = editorDocuments.toList(),
                    activeDocumentPath = activeEditorPath,
                    availableFiles = if (previewMode) DesignPreviewFixtures.sourceFiles.keys.toList() else emptyList(),
                    editable = previewMode,
                    lineNumbers = editorLineNumbers,
                    fontSizeSp = editorFontSize,
                    editorTheme = editorTheme,
                    onOpenFile = ::openPreviewDocument,
                    onSelectDocument = { activeEditorPath = it },
                    onCloseDocument = { path ->
                        editorDocuments.removeAll { it.path == path }
                        if (activeEditorPath == path) activeEditorPath = editorDocuments.lastOrNull()?.path
                    },
                    onContentChange = { path, content ->
                        val index = editorDocuments.indexOfFirst { it.path == path }
                        if (index >= 0) editorDocuments[index] = editorDocuments[index].copy(content = content)
                    },
                    onSave = { path, content ->
                        if (!previewMode) false else {
                            val index = editorDocuments.indexOfFirst { it.path == path }
                            if (index >= 0) {
                                editorDocuments[index] = editorDocuments[index].copy(content = content)
                                true
                            } else false
                        }
                    }
                )
                activeConversation != null -> ConversationScreen(
                    conversation = activeConversation!!,
                    messages = previewMessages.filter { it.key == activeConversation!!.key },
                    connected = previewMode,
                    onBack = { activeConversation = null },
                    onSend = { text, reply ->
                        if (previewMode) {
                            previewMessages.add(
                                ChatMessage(
                                    key = activeConversation!!.key,
                                    messageId = "preview-out-${System.nanoTime()}",
                                    direction = MessageDirection.OUTGOING,
                                    kind = MessageKind.TEXT,
                                    text = text,
                                    timestampMillis = System.currentTimeMillis(),
                                    status = MessageStatus.SENT,
                                    replyToMessageId = reply?.messageId
                                )
                            )
                        }
                    },
                    onAttach = {},
                    onRecordVoice = {}
                )
                configurationOpen -> ConfigurationScreen(
                    onBack = { configurationOpen = false },
                    onEditConfig = {
                        editorFromConfiguration = true
                        configurationOpen = false
                        if (previewMode) openPreviewDocument("config.js") else editorOpen = true
                    }
                )
                else -> when (destination) {
                    MainDestination.HOME -> HomeScreen(
                        onOpenChats = { destinationName = MainDestination.CHATS.name },
                        onOpenMore = { destinationName = MainDestination.MORE.name; morePage = "more" },
                        onOpenConfiguration = { configurationOpen = true },
                        onOpenActivity = { destinationName = MainDestination.MORE.name; morePage = "activity" }
                    )
                    MainDestination.CHATS -> ChatsScreen(
                        account = account,
                        onAccountSelected = { accountName = it.name },
                        filter = filter,
                        onFilterSelected = { filterName = it.name },
                        conversations = if (previewMode) DesignPreviewFixtures.conversations else emptyList(),
                        accountConnected = previewMode,
                        onConversationSelected = { activeConversation = it }
                    )
                    MainDestination.FILES -> FilesScreen(
                        entries = if (previewMode) DesignPreviewFixtures.files.map { StudioFileEntry(it.name, it.path, it.isDirectory, it.sizeLabel) } else emptyList(),
                        connected = false,
                        previewOnly = previewMode,
                        onEditorVisibility = {
                            editorFromConfiguration = false
                            editorOpen = it
                        },
                        onEntryAction = { entry, action ->
                            if (previewMode && action == "open" && !entry.isDirectory) {
                                openPreviewDocument(entry.path)
                            }
                        }
                    )
                    MainDestination.ENVIRONMENT -> EnvironmentScreen(previewMode = previewMode)
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
                        onEditorLineNumbersChanged = onEditorLineNumbersChanged,
                        page = morePage,
                        onPageChange = { morePage = it },
                        onOpenEnvironment = { destinationName = MainDestination.ENVIRONMENT.name; morePage = "more" }
                    )
                }
            }
        }

        if (!editorOpen && activeConversation == null) {
            StudioBottomNavigation(
                selected = destination,
                onNavigate = {
                    configurationOpen = false
                    if (it != MainDestination.MORE) morePage = "more"
                    destinationName = it.name
                }
            )
        }
    }
}
