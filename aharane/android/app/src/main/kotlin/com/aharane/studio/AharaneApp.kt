package com.aharane.studio

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.Manifest
import android.content.pm.PackageManager
import android.provider.OpenableColumns
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.aharane.studio.core.design.*
import com.aharane.studio.core.media.VoiceNoteRecorder
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.model.ChatSummary
import com.aharane.studio.core.model.ChatMessage
import com.aharane.studio.core.model.ChatFilter
import com.aharane.studio.core.model.DesignPreviewFixtures
import com.aharane.studio.core.model.MessageDirection
import com.aharane.studio.core.model.MessageKind
import com.aharane.studio.core.model.MessageStatus
import com.aharane.studio.core.network.AharaneConnectionManager
import com.aharane.studio.core.notifications.AharaneNotificationScheduler
import com.aharane.studio.core.network.AharaneRepository
import com.aharane.studio.core.network.ServerAccountState
import com.aharane.studio.core.network.ServerActivityEntry
import com.aharane.studio.core.network.ServerEnvironmentValue
import com.aharane.studio.core.network.ServerFileEntry
import com.aharane.studio.core.network.ServerFileTree
import com.aharane.studio.core.network.ServerOwnerSettings
import com.aharane.studio.core.network.ServerRuntimeSnapshot
import com.aharane.studio.core.network.ServerStorageSnapshot
import com.aharane.studio.core.navigation.MainDestination
import com.aharane.studio.features.chats.ChatsScreen
import com.aharane.studio.features.chats.ConversationScreen
import com.aharane.studio.features.configuration.ConfigurationScreen
import com.aharane.studio.features.connection.ConnectionScreen
import com.aharane.studio.features.environment.EnvironmentScreen
import com.aharane.studio.features.environment.EnvironmentValue
import com.aharane.studio.features.files.CodeEditorScreen
import com.aharane.studio.features.files.FilesScreen
import com.aharane.studio.features.files.StudioEditorDocument
import com.aharane.studio.features.files.StudioFileEntry
import com.aharane.studio.features.home.HomeScreen
import com.aharane.studio.features.more.MoreScreen
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Locale

@Composable
fun AharaneApp(
    connectionManager: AharaneConnectionManager,
    previewMode: Boolean = false,
    notificationAccount: String? = null,
    notificationJid: String? = null,
    notificationRequestId: Long = 0L,
    onNotificationHandled: () -> Unit = {},
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
    val context = LocalContext.current
    val connectionScope = rememberCoroutineScope()
    val repository = remember(connectionManager) { AharaneRepository(connectionManager) }

    var authenticated by remember(previewMode) { mutableStateOf(previewMode) }
    var connectionUrl by rememberSaveable { mutableStateOf(connectionManager.savedStudioUrl) }
    var connectionPassword by remember { mutableStateOf("") }
    var serverVerified by remember { mutableStateOf(false) }
    var connectionBusy by remember { mutableStateOf(false) }
    var setupRequired by remember { mutableStateOf(false) }
    var connectionError by remember { mutableStateOf("") }

    if (!authenticated) {
        LaunchedEffect(connectionManager, connectionUrl) {
            if (connectionUrl.isNotBlank() && connectionManager.api == null) {
                connectionBusy = true
                try {
                    val result = connectionManager.connect(connectionUrl)
                    val auth = result.optJSONObject("auth") ?: JSONObject()
                    serverVerified = true
                    setupRequired = auth.optBoolean("setupRequired")
                    connectionUrl = connectionManager.savedStudioUrl
                    if (connectionManager.api?.hasSavedSession() == true) {
                        runCatching {
                            connectionManager.api?.get("status")
                            authenticated = true
                        }
                    }
                } catch (error: Exception) {
                    connectionError = error.message ?: "Could not reach your Aharane server."
                    serverVerified = false
                } finally {
                    connectionBusy = false
                }
            }
        }

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
                        if (connectionManager.api?.hasSavedSession() == true) {
                            runCatching {
                                connectionManager.api?.get("status")
                                authenticated = true
                            }
                        }
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
    var fileDirectory by rememberSaveable { mutableStateOf("") }

    var runtime by remember { mutableStateOf<ServerRuntimeSnapshot?>(null) }
    var owners by remember { mutableStateOf(ServerOwnerSettings()) }
    var environmentRows by remember { mutableStateOf<List<ServerEnvironmentValue>>(emptyList()) }
    var activityRows by remember { mutableStateOf<List<ServerActivityEntry>>(emptyList()) }
    var storageSnapshot by remember { mutableStateOf<ServerStorageSnapshot?>(null) }
    var serverFiles by remember { mutableStateOf<List<ServerFileEntry>>(emptyList()) }
    var fileDraft by remember { mutableStateOf<ServerFileTree?>(null) }
    val chatsByAccount = remember { mutableStateMapOf<ChatAccount, List<ChatSummary>>() }
    var showIndividualChats by remember { mutableStateOf(true) }
    var showGroupChats by remember { mutableStateOf(true) }
    var starredPreviews by remember { mutableStateOf<List<String>>(emptyList()) }
    var chatAppearance by remember { mutableStateOf(JSONObject()) }
    var activeMessages by remember { mutableStateOf<List<ChatMessage>>(emptyList()) }
    var serverError by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }

    val previewMessages = remember { mutableStateListOf<ChatMessage>().apply {
        if (previewMode) addAll(DesignPreviewFixtures.messages)
    } }
    val editorDocuments = remember { mutableStateListOf<StudioEditorDocument>() }

    var pairingAccount by remember { mutableStateOf<ChatAccount?>(null) }
    var pairingCode by remember { mutableStateOf("") }
    var fileDialogMode by remember { mutableStateOf("") }
    var fileDialogName by remember { mutableStateOf("") }
    var fileDialogError by remember { mutableStateOf("") }
    var selectedFile by remember { mutableStateOf<ServerFileEntry?>(null) }
    var pendingDeletePaths by remember { mutableStateOf<List<String>>(emptyList()) }
    var pendingExportBytes by remember { mutableStateOf<ByteArray?>(null) }
    var mediaImage by remember { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
    var mediaTitle by remember { mutableStateOf("") }
    var sharedMediaFile by remember { mutableStateOf<File?>(null) }
    var mediaMessageError by remember { mutableStateOf("") }
    val openedViewOnceIds = remember { mutableStateListOf<String>() }
    var voiceRecorder by remember { mutableStateOf<VoiceNoteRecorder?>(null) }
    var voiceRecording by remember { mutableStateOf(false) }
    var pendingVoiceStart by remember { mutableStateOf(false) }

    fun startVoiceRecording() {
        if (activeConversation == null) return
        try {
            val recorder = VoiceNoteRecorder(context)
            recorder.start()
            voiceRecorder = recorder
            voiceRecording = true
            Toast.makeText(context, "Recording voice note. Tap the microphone again to send.", Toast.LENGTH_SHORT).show()
        } catch (error: Exception) {
            voiceRecorder = null
            voiceRecording = false
            Toast.makeText(context, error.message ?: "Could not start voice recording.", Toast.LENGTH_LONG).show()
        }
    }

    fun stopAndSendVoiceNote() {
        val active = voiceRecorder ?: return
        val conversation = activeConversation ?: return
        val recorded = try {
            active.stop()
        } catch (error: Exception) {
            voiceRecorder = null
            voiceRecording = false
            Toast.makeText(context, error.message ?: "Voice recording was too short.", Toast.LENGTH_LONG).show()
            return
        }
        voiceRecorder = null
        voiceRecording = false
        connectionScope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) { recorded.file.readBytes() }
                repository.sendMedia(
                    conversation,
                    bytes,
                    "audio/ogg",
                    "voice-note.ogg",
                    "",
                    isVoiceNote = true,
                    durationSeconds = recorded.durationSeconds
                )
                activeMessages = repository.messages(conversation)
                chatsByAccount[conversation.key.account] = repository.chats(conversation.key.account)
                Toast.makeText(context, "Voice note sent.", Toast.LENGTH_SHORT).show()
            } catch (error: Exception) {
                Toast.makeText(context, error.message ?: "Voice note could not be sent.", Toast.LENGTH_LONG).show()
            } finally {
                recorded.file.delete()
            }
        }
    }

    val microphonePermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        pendingVoiceStart = false
        if (granted) startVoiceRecording()
        else Toast.makeText(context, "Microphone permission is required to record a voice note.", Toast.LENGTH_LONG).show()
    }

    DisposableEffect(activeConversation) {
        onDispose {
            voiceRecorder?.cancel()
            voiceRecorder = null
            voiceRecording = false
        }
    }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { }

    val zipExportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/zip")
    ) { uri ->
        val bytes = pendingExportBytes
        pendingExportBytes = null
        if (uri != null && bytes != null) {
            runCatching {
                context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                    ?: error("Could not open the selected destination.")
            }.onSuccess {
                Toast.makeText(context, "ZIP saved.", Toast.LENGTH_SHORT).show()
            }.onFailure {
                Toast.makeText(context, it.message ?: "Could not save ZIP.", Toast.LENGTH_LONG).show()
            }
        }
    }

    val uploadLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            connectionScope.launch {
                try {
                    val name = queryDisplayName(context, uri)
                    val bytes = withContext(Dispatchers.IO) {
                        context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                            ?: error("Could not read the selected file.")
                    }
                    if (bytes.size > 512 * 1024) error("Source files must be 512 KB or smaller.")
                    repository.createFile(fileDirectory, name, bytes.toString(Charsets.UTF_8))
                    serverFiles = repository.allFiles()
                    Toast.makeText(context, "File uploaded.", Toast.LENGTH_SHORT).show()
                } catch (error: Exception) {
                    Toast.makeText(context, error.message ?: "Upload failed.", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    val chatAttachmentLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        val conversation = activeConversation
        if (uri != null && conversation != null) {
            connectionScope.launch {
                try {
                    val name = queryDisplayName(context, uri)
                    val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
                    val bytes = withContext(Dispatchers.IO) {
                        context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                            ?: error("Could not read the selected attachment.")
                    }
                    if (bytes.size > 24 * 1024 * 1024) error("WhatsApp attachments are limited to 24 MB in Aharane.")
                    repository.sendMedia(conversation, bytes, mime, name, "")
                    activeMessages = repository.messages(conversation)
                    chatsByAccount[conversation.key.account] = repository.chats(conversation.key.account)
                } catch (error: Exception) {
                    Toast.makeText(context, error.message ?: "Attachment could not be sent.", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    suspend fun reloadServerData() {
        runtime = repository.runtimeSnapshot()
        owners = repository.ownerSettings()
        environmentRows = repository.environment()
        activityRows = repository.activity(30)
        storageSnapshot = repository.storage()
        fileDraft = repository.fileTree()
        serverFiles = repository.allFiles()
        chatsByAccount[ChatAccount.PRIVATE] = repository.chats(ChatAccount.PRIVATE)
        chatsByAccount[ChatAccount.PUBLIC] = repository.chats(ChatAccount.PUBLIC)
    }

    LaunchedEffect(authenticated, previewMode) {
        if (authenticated && !previewMode) {
            AharaneNotificationScheduler.schedule(context)
            if (android.os.Build.VERSION.SDK_INT >= 33 &&
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
            busy = true
            serverError = ""
            try {
                reloadServerData()
            } catch (error: Exception) {
                serverError = error.message ?: "Could not load Aharane data."
            } finally {
                busy = false
            }
        }
    }

    LaunchedEffect(activeConversation, authenticated, previewMode) {
        val conversation = activeConversation ?: return@LaunchedEffect
        if (!previewMode && authenticated) {
            try {
                activeMessages = repository.messages(conversation)
            } catch (error: Exception) {
                serverError = error.message ?: "Could not load this conversation."
                activeMessages = emptyList()
            }
        }
    }

    LaunchedEffect(notificationAccount, notificationJid, notificationRequestId, authenticated) {
        if (!authenticated || previewMode || notificationAccount.isNullOrBlank() || notificationJid.isNullOrBlank() || notificationRequestId == 0L) {
            return@LaunchedEffect
        }
        val target = ChatAccount.fromApiValue(notificationAccount) ?: run {
            onNotificationHandled()
            return@LaunchedEffect
        }
        try {
            accountName = target.name
            destinationName = MainDestination.CHATS.name
            val conversations = repository.chats(target)
            chatsByAccount[target] = conversations
            activeConversation = conversations.firstOrNull { it.key.jid == notificationJid }
            if (activeConversation == null) {
                Toast.makeText(context, "That conversation is no longer available.", Toast.LENGTH_SHORT).show()
            }
        } catch (error: Exception) {
            Toast.makeText(context, error.message ?: "Could not open this conversation.", Toast.LENGTH_LONG).show()
        } finally {
            onNotificationHandled()
        }
    }

    fun openPreviewDocument(path: String) {
        val existing = editorDocuments.firstOrNull { it.path == path }
        if (existing == null) {
            val source = DesignPreviewFixtures.sourceFiles[path] ?: return
            editorDocuments.add(StudioEditorDocument(path = path, content = source))
        }
        activeEditorPath = path
        editorOpen = true
        activeConversation = null
    }

    fun openSourceDocument(path: String) {
        if (previewMode) {
            openPreviewDocument(path)
            return
        }
        connectionScope.launch {
            try {
                val source = repository.previewFile(path)
                val existingIndex = editorDocuments.indexOfFirst { it.path == path }
                val document = StudioEditorDocument(
                    path = source.path,
                    content = source.content,
                    languageLabel = source.language.replaceFirstChar { it.uppercase(Locale.ROOT) },
                    sha256 = source.sha256
                )
                if (existingIndex >= 0) editorDocuments[existingIndex] = document
                else editorDocuments.add(document)
                activeEditorPath = path
                editorOpen = true
                activeConversation = null
            } catch (error: Exception) {
                Toast.makeText(context, error.message ?: "Could not open source file.", Toast.LENGTH_LONG).show()
            }
        }
    }

    fun refreshFiles() {
        if (previewMode) return
        connectionScope.launch {
            runCatching {
                fileDraft = repository.fileTree()
                repository.allFiles()
            }
                .onSuccess { serverFiles = it }
                .onFailure { Toast.makeText(context, it.message ?: "Could not refresh files.", Toast.LENGTH_LONG).show() }
        }
    }

    fun openExternalAttachment(bytes: ByteArray, fileName: String, mimeType: String) {
        runCatching {
            val directory = File(context.cacheDir, "shared-media").apply { mkdirs() }
            sharedMediaFile?.delete()
            val safeName = fileName.substringAfterLast('/').replace(Regex("[^A-Za-z0-9._-]"), "_").ifBlank { "attachment" }
            val file = File(directory, safeName)
            file.writeBytes(bytes)
            val uri = FileProvider.getUriForFile(context, context.packageName + ".files", file)
            val view = Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, mimeType.ifBlank { "application/octet-stream" })
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            view.clipData = ClipData.newUri(context.contentResolver, safeName, uri)
            context.startActivity(Intent.createChooser(view, "Open attachment"))
            sharedMediaFile = file
        }.onFailure {
            Toast.makeText(context, it.message ?: "No app could open this attachment.", Toast.LENGTH_LONG).show()
        }
    }

    DisposableEffect(Unit) {
        onDispose { sharedMediaFile?.delete() }
    }

    fun exportSource() {
        if (previewMode) return
        connectionScope.launch {
            try {
                pendingExportBytes = repository.exportSourceZip()
                zipExportLauncher.launch("aharane-source.zip")
            } catch (error: Exception) {
                Toast.makeText(context, error.message ?: "Source export failed.", Toast.LENGTH_LONG).show()
            }
        }
    }

    fun exportSelection(paths: List<String>) {
        if (previewMode || paths.isEmpty()) return
        connectionScope.launch {
            try {
                pendingExportBytes = repository.exportFiles(paths)
                zipExportLauncher.launch("aharane-selection.zip")
            } catch (error: Exception) {
                Toast.makeText(context, error.message ?: "ZIP export failed.", Toast.LENGTH_LONG).show()
            }
        }
    }

    fun runFileDialogAction() {
        val mode = fileDialogMode
        val name = fileDialogName.trim()
        val entry = selectedFile
        connectionScope.launch {
            busy = true
            fileDialogError = ""
            try {
                when (mode) {
                    "create-file" -> repository.createFile(fileDirectory, name, "")
                    "create-folder" -> repository.createFolder(fileDirectory, name)
                    "rename" -> repository.renameFile(entry?.path ?: error("Select a file first."), name)
                    "duplicate" -> repository.duplicateSourceEntry(
                        entry ?: error("Select a file first."),
                        name
                    )
                    "move" -> repository.moveFile(entry?.path ?: error("Select a file first."), name)
                    "delete" -> repository.deleteFiles(pendingDeletePaths)
                }
                fileDialogMode = ""
                selectedFile = null
                pendingDeletePaths = emptyList()
                serverFiles = repository.allFiles()
                Toast.makeText(context, "File changes saved.", Toast.LENGTH_SHORT).show()
            } catch (error: Exception) {
                fileDialogError = error.message ?: "File operation failed."
                Toast.makeText(context, fileDialogError, Toast.LENGTH_LONG).show()
            } finally {
                busy = false
            }
        }
    }

    fun onFileEntryAction(entry: StudioFileEntry, action: String) {
        if (previewMode) {
            if (action == "open" && !entry.isDirectory) openPreviewDocument(entry.path)
            return
        }
        val serverEntry = serverFiles.firstOrNull { it.path == entry.path }
            ?: ServerFileEntry(entry.name, entry.path, entry.isDirectory, null, null, false)
        when (action) {
            "open" -> if (!entry.isDirectory) openSourceDocument(entry.path)
            "rename", "duplicate", "move" -> {
                selectedFile = serverEntry
                fileDialogMode = action
                fileDialogName = when (action) {
                    "move" -> fileDirectory
                    else -> entry.name
                }
                fileDialogError = ""
            }
            "delete" -> {
                if (entry.isDirectory) {
                    Toast.makeText(context, "Delete files inside this folder individually. Folder deletion is not supported by the server.", Toast.LENGTH_LONG).show()
                } else {
                    selectedFile = serverEntry
                    pendingDeletePaths = listOf(entry.path)
                    fileDialogMode = "delete"
                    fileDialogError = ""
                }
            }
            "download-zip" -> exportSelection(listOf(entry.path))
            else -> Toast.makeText(context, "This file action is not available.", Toast.LENGTH_SHORT).show()
        }
    }

    val currentDestination = MainDestination.valueOf(destinationName)
    val selectedAccount = ChatAccount.valueOf(accountName)
    val selectedFilter = ChatFilter.valueOf(filterName)
    val connected = authenticated && !previewMode

    LaunchedEffect(selectedAccount, connected, previewMode) {
        if (connected) {
            try {
                val visibility = repository.visibility(selectedAccount)
                showIndividualChats = visibility.optJSONObject("individuals")?.optString("mode") != "selected"
                showGroupChats = visibility.optJSONObject("groups")?.optString("mode") != "selected"
                starredPreviews = repository.starredPreviews(selectedAccount)
                chatAppearance = repository.chatAppearance()
            } catch (error: Exception) {
                serverError = error.message ?: "Could not load chat preferences."
            }
        } else if (previewMode) {
            showIndividualChats = true
            showGroupChats = true
        }
    }
    val currentAccountState = when (selectedAccount) {
        ChatAccount.PRIVATE -> runtime?.privateAccount
        ChatAccount.PUBLIC -> runtime?.publicAccount
    }
    val currentChats = if (previewMode) DesignPreviewFixtures.conversations else chatsByAccount[selectedAccount].orEmpty()
    val studioFileEntries = if (previewMode) {
        DesignPreviewFixtures.files.map { StudioFileEntry(it.name, it.path, it.isDirectory, it.sizeLabel) }
    } else {
        serverFiles.map { entry ->
            StudioFileEntry(
                name = entry.name,
                path = entry.path,
                isDirectory = entry.isDirectory,
                sizeLabel = entry.sizeBytes?.let(::formatBytes),
                modifiedLabel = entry.modifiedAt
            )
        }
    }
    val environmentValues = if (previewMode) emptyList() else environmentRows.map {
        EnvironmentValue(it.key, it.value, it.readOnly, it.type, it.secret)
    }

    Column(
        Modifier.fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.statusBars)
    ) {
        if (!editorOpen && activeConversation == null) {
            StudioHeader(onStatusClick = { destinationName = MainDestination.HOME.name })
        }

        if (serverError.isNotBlank() && connected) {
            Text(
                serverError,
                color = StudioPalette.Bad,
                fontSize = 11.5.sp,
                modifier = Modifier.fillMaxWidth().background(StudioPalette.Surface).padding(horizontal = 14.dp, vertical = 5.dp)
            )
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
                    availableFiles = if (previewMode) DesignPreviewFixtures.sourceFiles.keys.toList() else serverFiles.filterNot { it.isDirectory }.map { it.path },
                    editable = true,
                    lineNumbers = editorLineNumbers,
                    fontSizeSp = editorFontSize,
                    editorTheme = editorTheme,
                    onOpenFile = ::openSourceDocument,
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
                        if (previewMode) {
                            val index = editorDocuments.indexOfFirst { it.path == path }
                            if (index >= 0) {
                                editorDocuments[index] = editorDocuments[index].copy(content = content)
                                true
                            } else false
                        } else {
                            try {
                                val index = editorDocuments.indexOfFirst { it.path == path }
                                if (index < 0) return@CodeEditorScreen false
                                val latestSha = repository.saveFile(path, content, editorDocuments[index].sha256)
                                editorDocuments[index] = editorDocuments[index].copy(content = content, sha256 = latestSha)
                                fileDraft = repository.fileTree()
                                true
                            } catch (error: Exception) {
                                serverError = error.message ?: "Could not save this file."
                                false
                            }
                        }
                    }
                )
                activeConversation != null -> ConversationScreen(
                    conversation = activeConversation!!,
                    messages = if (previewMode) previewMessages.filter { it.key == activeConversation!!.key } else activeMessages,
                    connected = if (previewMode) true else currentAccountState?.connected == true,
                    onBack = { activeConversation = null },
                    onSend = { text, _ ->
                        if (previewMode) {
                            previewMessages.add(
                                ChatMessage(
                                    key = activeConversation!!.key,
                                    messageId = "preview-out-${System.nanoTime()}",
                                    direction = MessageDirection.OUTGOING,
                                    kind = MessageKind.TEXT,
                                    text = text,
                                    timestampMillis = System.currentTimeMillis(),
                                    status = MessageStatus.SENT
                                )
                            )
                        } else {
                            connectionScope.launch {
                                try {
                                    repository.sendText(activeConversation!!, text)
                                    activeMessages = repository.messages(activeConversation!!)
                                    chatsByAccount[activeConversation!!.key.account] = repository.chats(activeConversation!!.key.account)
                                } catch (error: Exception) {
                                    serverError = error.message ?: "Message could not be sent."
                                }
                            }
                        }
                    },
                    onAttach = {
                        if (connected && currentAccountState?.connected == true) {
                            chatAttachmentLauncher.launch(arrayOf("image/*", "video/*", "audio/*", "application/*"))
                        }
                    },
                    onRecordVoice = {
                        if (!connected || currentAccountState?.connected != true) {
                            Toast.makeText(context, "Connect the selected WhatsApp account to send a voice note.", Toast.LENGTH_SHORT).show()
                        } else if (voiceRecording) {
                            stopAndSendVoiceNote()
                        } else if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                            startVoiceRecording()
                        } else {
                            pendingVoiceStart = true
                            microphonePermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    },
                    onOpenMedia = { message ->
                        connectionScope.launch {
                            try {
                                val bytes = repository.mediaBytes(message.key.account, message)
                                val mime = message.mediaMimeType.orEmpty()
                                if (mime.startsWith("image/")) {
                                    showImageBytes(
                                        bytes,
                                        message.mediaFileName.orEmpty(),
                                        onBitmap = { mediaTitle = message.mediaFileName.orEmpty(); mediaImage = it; mediaMessageError = "" },
                                        onError = { mediaTitle = message.mediaFileName.orEmpty(); mediaMessageError = it }
                                    )
                                } else {
                                    openExternalAttachment(bytes, message.mediaFileName ?: "attachment", mime)
                                }
                            } catch (error: Exception) {
                                serverError = error.message ?: "Media could not be opened."
                            }
                        }
                    },
                    onViewOnce = { message ->
                        if (message.messageId !in openedViewOnceIds) {
                            connectionScope.launch {
                                try {
                                    val bytes = repository.viewOnceMedia(message.key.account, message)
                                    openedViewOnceIds.add(message.messageId)
                                    showImageBytes(
                                        bytes,
                                        "View-once media",
                                        onBitmap = { mediaTitle = "View-once media"; mediaImage = it; mediaMessageError = "" },
                                        onError = { mediaTitle = "View-once media"; mediaMessageError = it }
                                    )
                                } catch (error: Exception) {
                                    serverError = error.message ?: "View-once media is no longer available."
                                }
                            }
                        } else {
                            Toast.makeText(context, "This view-once media was already opened.", Toast.LENGTH_SHORT).show()
                        }
                    }
                )
                configurationOpen -> ConfigurationScreen(
                    previewMode = previewMode,
                    connected = connected,
                    serverValues = environmentRows.associate { it.key to it.value } + mapOf(
                        "PRIVATE_OWNER_NUMBER" to owners.privateOwnerNumber,
                        "PUBLIC_BOT_NUMBER" to owners.publicBotNumber
                    ),
                    ownerNumberValue = if (accountName == ChatAccount.PRIVATE.name) owners.privateOwnerNumber else owners.publicBotNumber,
                    onBack = { configurationOpen = false },
                    onEditConfig = {
                        editorFromConfiguration = true
                        configurationOpen = false
                        if (previewMode) openPreviewDocument("config.js")
                        else openSourceDocument("src/index.js")
                    },
                    onSave = { profile, values ->
                        val updatedOwners = if (profile == "Private") {
                            owners.copy(privateOwnerNumber = values["PRIVATE_OWNER_NUMBER"] ?: owners.privateOwnerNumber)
                        } else {
                            owners.copy(publicBotNumber = values["PUBLIC_BOT_NUMBER"] ?: owners.publicBotNumber)
                        }
                        repository.saveOwnerSettings(updatedOwners)
                        val nextEnvironment = environmentRows.map { row ->
                            val nextValue = values[row.key]
                            if (row.readOnly || nextValue == null) row else row.copy(value = nextValue)
                        }
                        repository.saveEnvironment(nextEnvironment)
                        owners = repository.ownerSettings()
                        environmentRows = repository.environment()
                        true
                    }
                )
                else -> when (currentDestination) {
                    MainDestination.HOME -> HomeScreen(
                        onOpenChats = { destinationName = MainDestination.CHATS.name },
                        onOpenMore = { destinationName = MainDestination.MORE.name; morePage = "more" },
                        onOpenConfiguration = { configurationOpen = true },
                        onOpenActivity = { destinationName = MainDestination.MORE.name; morePage = "activity" },
                        serviceConnected = previewMode || runtime != null,
                        serviceSubtitle = if (previewMode) "Preview only" else if (runtime != null) "Connected to Aharane server" else "Not connected to Aharane service",
                        privateAccountStatus = if (previewMode) "Preview session" else runtime?.privateAccount?.let(::accountStateLabel) ?: "Status not loaded",
                        publicAccountStatus = if (previewMode) "Preview session" else runtime?.publicAccount?.let(::accountStateLabel) ?: "Status not loaded",
                        privateActionLabel = runtime?.privateAccount?.let(::accountActionLabel) ?: "Link account",
                        publicActionLabel = runtime?.publicAccount?.let(::accountActionLabel) ?: "Link account",
                        onAccountAction = { target ->
                            connectionScope.launch {
                                try {
                                    val state = when (target) {
                                        ChatAccount.PRIVATE -> runtime?.privateAccount
                                        ChatAccount.PUBLIC -> runtime?.publicAccount
                                    }
                                    if (state?.connected == true) {
                                        Toast.makeText(context, "${target.label} WhatsApp is already connected.", Toast.LENGTH_SHORT).show()
                                    } else if (state?.registered == true) {
                                        repository.reconnect(target)
                                        runtime = repository.runtimeSnapshot()
                                    } else {
                                        pairingAccount = target
                                        pairingCode = repository.pairCode(target)
                                    }
                                } catch (error: Exception) {
                                    pairingAccount = null
                                    Toast.makeText(context, error.message ?: "Account action failed.", Toast.LENGTH_LONG).show()
                                }
                            }
                        },
                        recentActivity = if (previewMode) emptyList() else activityRows.take(3).map { it.message }
                    )
                    MainDestination.CHATS -> ChatsScreen(
                        account = selectedAccount,
                        onAccountSelected = { accountName = it.name },
                        filter = selectedFilter,
                        onFilterSelected = { filterName = it.name },
                        conversations = currentChats,
                        accountConnected = if (previewMode) true else runtime?.let { if (selectedAccount == ChatAccount.PRIVATE) it.privateAccount.connected else it.publicAccount.connected } == true,
                        onConversationSelected = { activeConversation = it },
                        onChatAction = { chat, action ->
                            if (previewMode) return@ChatsScreen
                            connectionScope.launch {
                                try {
                                    when (action) {
                                        "pin" -> repository.setChatPreferences(chat.key.account, chat.key.jid, pinned = !chat.isPinned)
                                        "mute" -> repository.setChatPreferences(chat.key.account, chat.key.jid, muted = !chat.isMuted)
                                        "archive" -> repository.archive(chat, !chat.isArchived)
                                        "unread" -> repository.markUnread(chat)
                                    }
                                    chatsByAccount[chat.key.account] = repository.chats(chat.key.account)
                                } catch (error: Exception) {
                                    Toast.makeText(context, error.message ?: "Chat action failed.", Toast.LENGTH_LONG).show()
                                }
                            }
                        },
                        showIndividuals = showIndividualChats,
                        showGroups = showGroupChats,
                        starredItems = if (previewMode) emptyList() else starredPreviews,
                        savedChatTheme = chatAppearance.optString("theme", "system"),
                        savedShowAvatars = chatAppearance.optBoolean("showAvatars", true),
                        savedShowPreviews = chatAppearance.optBoolean("showPreviews", true),
                        savedShowTimestamps = chatAppearance.optBoolean("showTimestamps", true),
                        onVisibilityModeChange = { kind, show ->
                            if (connected) {
                                connectionScope.launch {
                                    try {
                                        repository.setVisibilityModes(
                                            selectedAccount,
                                            showIndividuals = if (kind == "individuals") show else showIndividualChats,
                                            showGroups = if (kind == "groups") show else showGroupChats
                                        )
                                        if (kind == "individuals") showIndividualChats = show else showGroupChats = show
                                        chatsByAccount[selectedAccount] = repository.chats(selectedAccount)
                                    } catch (error: Exception) {
                                        Toast.makeText(context, error.message ?: "Visibility could not be saved.", Toast.LENGTH_LONG).show()
                                    }
                                }
                            }
                        },
                        onChatAppearanceChange = { theme, avatars, previews, timestamps ->
                            if (connected) {
                                connectionScope.launch {
                                    try {
                                        val updated = repository.chatAppearance()
                                            .put("theme", theme)
                                            .put("showAvatars", avatars)
                                            .put("showPreviews", previews)
                                            .put("showTimestamps", timestamps)
                                        repository.saveChatAppearance(updated)
                                        chatAppearance = updated
                                    } catch (error: Exception) {
                                        Toast.makeText(context, error.message ?: "Chat appearance could not be saved.", Toast.LENGTH_LONG).show()
                                    }
                                }
                            }
                        }
                    )
                    MainDestination.FILES -> FilesScreen(
                        entries = studioFileEntries,
                        connected = connected,
                        initialPath = fileDirectory,
                        onDirectoryChanged = { fileDirectory = it },
                        previewOnly = previewMode,
                        pendingEdits = fileDraft?.pendingEdits == true,
                        changedCount = fileDraft?.changedCount ?: 0,
                        onApplyEdits = {
                            connectionScope.launch {
                                try {
                                    repository.applyFileEdits()
                                    Toast.makeText(context, "Source changes are being applied. Aharane is restarting.", Toast.LENGTH_LONG).show()
                                } catch (error: Exception) {
                                    Toast.makeText(context, error.message ?: "Could not apply source changes.", Toast.LENGTH_LONG).show()
                                }
                            }
                        },
                        onDiscardEdits = {
                            connectionScope.launch {
                                try {
                                    repository.discardFileEdits()
                                    fileDraft = repository.fileTree()
                                    Toast.makeText(context, "Saved source draft discarded.", Toast.LENGTH_SHORT).show()
                                } catch (error: Exception) {
                                    Toast.makeText(context, error.message ?: "Could not discard source changes.", Toast.LENGTH_LONG).show()
                                }
                            }
                        },
                        onEditorVisibility = {
                            editorFromConfiguration = false
                            editorOpen = it
                        },
                        onCreateFile = {
                            fileDialogMode = "create-file"
                            fileDialogName = ""
                            fileDialogError = ""
                        },
                        onCreateFolder = {
                            fileDialogMode = "create-folder"
                            fileDialogName = ""
                            fileDialogError = ""
                        },
                        onUpload = { uploadLauncher.launch(arrayOf("text/*", "application/json")) },
                        onExportSource = ::exportSource,
                        onEntryAction = ::onFileEntryAction,
                        onBulkAction = { entries, action ->
                            when (action) {
                                "delete" -> {
                                    pendingDeletePaths = entries.filterNot { it.isDirectory }.map { it.path }
                                    selectedFile = null
                                    fileDialogMode = "delete"
                                }
                                "move" -> {
                                    Toast.makeText(context, "Select a destination folder from the file menu.", Toast.LENGTH_SHORT).show()
                                }
                                "zip" -> exportSelection(entries.map { it.path })
                            }
                        }
                    )
                    MainDestination.ENVIRONMENT -> EnvironmentScreen(
                        values = environmentValues,
                        connected = connected,
                        onSave = { values ->
                            repository.saveEnvironment(values.map {
                                ServerEnvironmentValue(it.key, it.value, it.readOnly, it.secret, it.valueType)
                            })
                            environmentRows = repository.environment()
                            true
                        },
                        previewMode = previewMode
                    )
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
                        onOpenEnvironment = { destinationName = MainDestination.ENVIRONMENT.name; morePage = "more" },
                        connected = connected,
                        privateAccountStatus = runtime?.privateAccount?.let(::accountStateLabel) ?: "Status not loaded",
                        publicAccountStatus = runtime?.publicAccount?.let(::accountStateLabel) ?: "Status not loaded",
                        privateOwnerNumber = owners.privateOwnerNumber,
                        publicOwnerNumber = owners.publicOwnerNumber,
                        publicBotNumber = owners.publicBotNumber,
                        allowedPublicSenders = owners.allowedPublicSenders.joinToString(", "),
                        activityEntries = activityRows.map { "${it.timestamp} · ${it.level.uppercase(Locale.ROOT)} · ${it.source} · ${it.message}" },
                        storageSummary = storageSnapshot?.let { formatBytes(it.usedBytes) } ?: "—",
                        onAccountAction = { accountId ->
                            connectionScope.launch {
                                val target = ChatAccount.fromApiValue(accountId) ?: return@launch
                                try {
                                    val state = if (target == ChatAccount.PRIVATE) runtime?.privateAccount else runtime?.publicAccount
                                    if (state?.registered == true) {
                                        repository.reconnect(target)
                                        runtime = repository.runtimeSnapshot()
                                    } else {
                                        pairingAccount = target
                                        pairingCode = repository.pairCode(target)
                                    }
                                } catch (error: Exception) {
                                    pairingAccount = null
                                    Toast.makeText(context, error.message ?: "Account action failed.", Toast.LENGTH_LONG).show()
                                }
                            }
                        },
                        onSaveOwnerSettings = { privateOwner, publicOwner, publicBot, allowed ->
                            connectionScope.launch {
                                try {
                                    val updated = ServerOwnerSettings(
                                        privateOwnerNumber = privateOwner,
                                        publicOwnerNumber = publicOwner,
                                        publicBotNumber = publicBot,
                                        allowedPublicSenders = allowed.split(',').map(String::trim).filter(String::isNotBlank)
                                    )
                                    repository.saveOwnerSettings(updated)
                                    owners = repository.ownerSettings()
                                    Toast.makeText(context, "Owner settings saved.", Toast.LENGTH_SHORT).show()
                                } catch (error: Exception) {
                                    Toast.makeText(context, error.message ?: "Owner settings could not be saved.", Toast.LENGTH_LONG).show()
                                }
                            }
                        },
                        onClearActivity = {
                            connectionScope.launch {
                                runCatching { repository.clearActivity(); activityRows = repository.activity(30) }
                                    .onFailure { Toast.makeText(context, it.message ?: "Could not clear activity.", Toast.LENGTH_LONG).show() }
                            }
                        },
                        onSignOut = {
                            connectionScope.launch {
                                runCatching { connectionManager.logout() }
                                    .onFailure { Toast.makeText(context, it.message ?: "Could not sign out.", Toast.LENGTH_LONG).show() }
                                AharaneNotificationScheduler.cancel(context)
                                authenticated = false
                                connectionPassword = ""
                                serverVerified = true
                            }
                        },
                        onChangePassword = { current, new ->
                            connectionScope.launch {
                                runCatching { repository.changePassword(current, new) }
                                    .onSuccess { Toast.makeText(context, "Studio password changed.", Toast.LENGTH_SHORT).show() }
                                    .onFailure { Toast.makeText(context, it.message ?: "Password could not be changed.", Toast.LENGTH_LONG).show() }
                            }
                        }
                    )
                }
            }
        }

        if (!editorOpen && activeConversation == null) {
            StudioBottomNavigation(
                selected = currentDestination,
                onNavigate = {
                    configurationOpen = false
                    if (it != MainDestination.MORE) morePage = "more"
                    destinationName = it.name
                }
            )
        }
    }

    if (pairingAccount != null && pairingCode.isNotBlank()) {
        Dialog(onDismissRequest = { pairingAccount = null; pairingCode = "" }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(StudioPalette.Surface).padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text("Link ${pairingAccount!!.label} account", color = StudioPalette.Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                Text("Pair this account in WhatsApp → Linked devices → Link a device, then enter this code:", color = StudioPalette.Muted, fontSize = 13.sp, lineHeight = 19.sp)
                Text(pairingCode, color = StudioPalette.Accent, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StudioActionButton("Copy code", compact = true, onClick = {
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        clipboard.setPrimaryClip(ClipData.newPlainText("Aharane pairing code", pairingCode))
                        Toast.makeText(context, "Pairing code copied.", Toast.LENGTH_SHORT).show()
                    })
                    StudioActionButton("Close", compact = true, primary = true, onClick = {
                        pairingAccount = null
                        pairingCode = ""
                    })
                }
            }
        }
    }

    if (fileDialogMode.isNotBlank()) {
        Dialog(onDismissRequest = { fileDialogMode = ""; selectedFile = null; pendingDeletePaths = emptyList() }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(StudioPalette.Surface).padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(11.dp)
            ) {
                val title = when (fileDialogMode) {
                    "create-file" -> "New file"
                    "create-folder" -> "New folder"
                    "rename" -> "Rename"
                    "duplicate" -> "Duplicate"
                    "move" -> "Move"
                    else -> "Delete selected files?"
                }
                Text(title, color = StudioPalette.Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                if (fileDialogMode != "delete") {
                    Text(
                        when (fileDialogMode) {
                            "move" -> "Enter the destination folder path. Leave empty to move to the source root."
                            else -> "Enter the new name."
                        },
                        color = StudioPalette.Muted,
                        fontSize = 12.5.sp,
                        lineHeight = 18.sp
                    )
                    BasicTextField(
                        value = fileDialogName,
                        onValueChange = { fileDialogName = it },
                        singleLine = true,
                        textStyle = TextStyle(color = StudioPalette.Ink, fontSize = 14.sp),
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp))
                            .background(StudioPalette.Background)
                            .border(1.dp, StudioPalette.Line, RoundedCornerShape(9.dp))
                            .padding(horizontal = 11.dp, vertical = 12.dp)
                    )
                } else {
                    Text("This permanently deletes the selected source files from the Aharane workspace.", color = StudioPalette.Muted, fontSize = 13.sp, lineHeight = 19.sp)
                }
                if (fileDialogError.isNotBlank()) Text(fileDialogError, color = StudioPalette.Bad, fontSize = 12.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.align(Alignment.End)) {
                    StudioActionButton("Cancel", compact = true, onClick = {
                        fileDialogMode = ""
                        selectedFile = null
                        pendingDeletePaths = emptyList()
                    })
                    StudioActionButton(
                        if (busy) "Working…" else if (fileDialogMode == "delete") "Delete" else "Save",
                        compact = true,
                        primary = true,
                        destructive = fileDialogMode == "delete",
                        enabled = !busy && (fileDialogMode == "delete" || fileDialogName.isNotBlank() || fileDialogMode == "move"),
                        onClick = ::runFileDialogAction
                    )
                }
            }
        }
    }

    if (mediaImage != null || mediaMessageError.isNotBlank()) {
        Dialog(onDismissRequest = { mediaImage = null; mediaTitle = ""; mediaMessageError = "" }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(StudioPalette.Surface).padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(9.dp)
            ) {
                Text(mediaTitle, color = StudioPalette.Ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                if (mediaImage != null) {
                    Image(
                        bitmap = mediaImage!!,
                        contentDescription = mediaTitle,
                        modifier = Modifier.fillMaxWidth().heightIn(max = 460.dp)
                    )
                }
                if (mediaMessageError.isNotBlank()) Text(mediaMessageError, color = StudioPalette.Bad, fontSize = 12.5.sp)
                StudioActionButton("Close", compact = true, primary = true, onClick = {
                    mediaImage = null
                    mediaTitle = ""
                    mediaMessageError = ""
                })
            }
        }
    }
}

private suspend fun showImageBytes(
    bytes: ByteArray,
    title: String,
    onBitmap: (androidx.compose.ui.graphics.ImageBitmap?) -> Unit,
    onError: (String) -> Unit
) {
    val image = withContext(Dispatchers.IO) {
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
    }
    if (image == null) onError("This attachment is not an image. It has been downloaded, but this viewer does not display this media type yet.")
    else onBitmap(image)
}

private fun queryDisplayName(context: Context, uri: Uri): String {
    val cursor = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
    cursor?.use {
        if (it.moveToFirst()) {
            val index = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0) return it.getString(index)
        }
    }
    return uri.lastPathSegment?.substringAfterLast('/') ?: "upload.txt"
}

private fun formatBytes(bytes: Long): String = when {
    bytes >= 1024L * 1024L -> String.format(Locale.ROOT, "%.1f MB", bytes / (1024f * 1024f))
    bytes >= 1024L -> String.format(Locale.ROOT, "%.1f KB", bytes / 1024f)
    else -> "$bytes B"
}

private fun accountStateLabel(state: ServerAccountState): String = when {
    state.connected -> "Connected"
    state.registered && state.state == "reconnecting" -> "Reconnecting"
    state.registered -> "Paired · ${state.state.replace('-', ' ')}"
    state.state == "not-paired" -> "Not paired"
    else -> state.state.replace('-', ' ').replaceFirstChar { it.uppercase(Locale.ROOT) }
}

private fun accountActionLabel(state: ServerAccountState): String = when {
    state.connected -> "Manage"
    state.registered -> "Reconnect"
    else -> "Link account"
}
