package com.aharane.studio

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.Manifest
import android.content.pm.PackageManager
import android.provider.OpenableColumns
import android.widget.MediaController
import android.widget.Toast
import android.widget.VideoView
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
import androidx.compose.ui.viewinterop.AndroidView
import com.aharane.studio.core.design.*
import com.aharane.studio.core.media.AudioWaveformDecoder
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
import com.aharane.studio.core.network.AharaneUpdatePackage
import com.aharane.studio.core.network.EditorDiagnostic
import com.aharane.studio.core.network.EditorDiagnosticsResult
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
import kotlinx.coroutines.delay
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
    chatMessageSize: Int,
    onChatMessageSizeChanged: (Int) -> Unit,
    launcherIcon: String,
    onLauncherIconChanged: (String) -> Unit,
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
    var serverReachable by remember { mutableStateOf(false) }
    var owners by remember { mutableStateOf(ServerOwnerSettings()) }
    var environmentRows by remember { mutableStateOf<List<ServerEnvironmentValue>>(emptyList()) }
    var previewEnvironmentValues by remember {
        mutableStateOf(
            listOf(
                EnvironmentValue("BOT_NAME", "Aharane Preview", valueType = "string"),
                EnvironmentValue("PRIVATE_PREFIX", ".", readOnly = true, valueType = "string"),
                EnvironmentValue("PUBLIC_PREFIX", "!", readOnly = true, valueType = "string"),
                EnvironmentValue("AUTO_READ", "false", valueType = "boolean"),
                EnvironmentValue("SHOW_TYPING", "true", valueType = "boolean"),
                EnvironmentValue("COMMAND_COOLDOWN", "3", valueType = "number"),
                EnvironmentValue("WELCOME_MESSAGE", "Welcome to Aharane Preview!", valueType = "string")
            )
        )
    }
    var activityRows by remember { mutableStateOf<List<ServerActivityEntry>>(emptyList()) }
    var storageSnapshot by remember { mutableStateOf<ServerStorageSnapshot?>(null) }
    var serverFiles by remember { mutableStateOf<List<ServerFileEntry>>(emptyList()) }
    var fileDraft by remember { mutableStateOf<ServerFileTree?>(null) }
    var packageLibraryLoaded by remember(previewMode) { mutableStateOf(false) }
    var updatePackages by remember(previewMode) {
        mutableStateOf(
            if (previewMode) listOf(
                AharaneUpdatePackage(
                    updateId = "preview-demo-package",
                    filename = "aharane-preview-update.zip",
                    sizeBytes = 1_245_000L,
                    status = "validated",
                    version = "2.4.0",
                    createdAt = "Preview sample",
                    validatedAt = "Preview sample",
                    fileCount = 148
                )
            ) else emptyList()
        )
    }
    var updateStatus by remember { mutableStateOf(JSONObject()) }
    var packageProgressLabel by remember { mutableStateOf("") }
    var packageProgress by remember { mutableFloatStateOf(0f) }
    var packageError by remember { mutableStateOf("") }
    var activePackageId by remember { mutableStateOf<String?>(null) }
    val chatsByAccount = remember { mutableStateMapOf<ChatAccount, List<ChatSummary>>() }
    var showIndividualChats by remember { mutableStateOf(true) }
    var showGroupChats by remember { mutableStateOf(true) }
    var starredPreviews by remember { mutableStateOf<List<String>>(emptyList()) }
    var chatAppearance by remember { mutableStateOf(JSONObject()) }
    var activeMessages by remember { mutableStateOf<List<ChatMessage>>(emptyList()) }
    var editorDiagnosticsByPath by remember { mutableStateOf<Map<String, EditorDiagnosticsResult>>(emptyMap()) }
    var editorDiagnosticsStateByPath by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var editorDiagnosticRequestId by remember { mutableIntStateOf(0) }
    var conversationSearchResults by remember { mutableStateOf<List<ChatMessage>?>(null) }
    var conversationSearchRequestId by remember { mutableIntStateOf(0) }
    var serverError by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }

    val previewMessages = remember { mutableStateListOf<ChatMessage>().apply {
        if (previewMode) addAll(DesignPreviewFixtures.messages)
    } }
    val editorDocuments = remember { mutableStateListOf<StudioEditorDocument>() }

    var pairingAccount by remember { mutableStateOf<ChatAccount?>(null) }
    var pairingCode by remember { mutableStateOf("") }
    var accountControlTarget by remember { mutableStateOf<ChatAccount?>(null) }
    var fileDialogMode by remember { mutableStateOf("") }
    var fileDialogName by remember { mutableStateOf("") }
    var fileDialogError by remember { mutableStateOf("") }
    var selectedFile by remember { mutableStateOf<ServerFileEntry?>(null) }
    var pendingDeletePaths by remember { mutableStateOf<List<String>>(emptyList()) }
    var pendingMovePaths by remember { mutableStateOf<List<String>>(emptyList()) }
    var pendingExportBytes by remember { mutableStateOf<ByteArray?>(null) }
    var mediaImage by remember { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
    var mediaTitle by remember { mutableStateOf("") }
    var sharedMediaFile by remember { mutableStateOf<File?>(null) }
    var mediaMessageError by remember { mutableStateOf("") }
    var viewOnceVideoFile by remember { mutableStateOf<File?>(null) }
    var inlineMediaPreviews by remember { mutableStateOf<Map<String, androidx.compose.ui.graphics.ImageBitmap>>(emptyMap()) }
    var inlineMediaPreviewErrors by remember { mutableStateOf<Set<String>>(emptySet()) }
    var audioFiles by remember { mutableStateOf<Map<String, File>>(emptyMap()) }
    var audioWaveforms by remember { mutableStateOf<Map<String, List<Float>>>(emptyMap()) }
    var audioLoading by remember { mutableStateOf<Set<String>>(emptySet()) }
    var audioErrors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var pendingMediaDownload by remember { mutableStateOf<ByteArray?>(null) }
    var pendingMediaDownloadName by remember { mutableStateOf("attachment") }
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
        if (previewMode || !authenticated || !serverReachable) {
            recorded.file.delete()
            Toast.makeText(context, "Voice notes can only be sent to a connected live WhatsApp account.", Toast.LENGTH_SHORT).show()
            return
        }
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
            audioFiles.values.forEach { it.delete() }
            audioFiles = emptyMap()
            audioWaveforms = emptyMap()
            audioLoading = emptySet()
            audioErrors = emptyMap()
            inlineMediaPreviews = emptyMap()
            inlineMediaPreviewErrors = emptySet()
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

    val downloadMediaLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/octet-stream")
    ) { uri ->
        val bytes = pendingMediaDownload
        pendingMediaDownload = null
        if (uri != null && bytes != null) {
            runCatching {
                context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                    ?: error("Could not save the selected attachment.")
            }.onSuccess {
                Toast.makeText(context, "Attachment saved.", Toast.LENGTH_SHORT).show()
            }.onFailure {
                Toast.makeText(context, it.message ?: "Could not save this attachment.", Toast.LENGTH_LONG).show()
            }
        }
    }

    val uploadLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null && previewMode) {
            Toast.makeText(context, "Preview mode does not upload files to a server.", Toast.LENGTH_SHORT).show()
        } else if (uri != null && authenticated && serverReachable && !previewMode) {
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

    val updatePackageLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null && !previewMode) {
            connectionScope.launch {
                activePackageId = "uploading"
                packageProgress = 0f
                packageProgressLabel = "Reading ZIP package"
                packageError = ""
                try {
                    val filename = queryDisplayName(context, uri)
                    require(filename.endsWith(".zip", ignoreCase = true)) { "Choose a file ending in .zip." }
                    val bytes = withContext(Dispatchers.IO) {
                        val input = context.contentResolver.openInputStream(uri)
                            ?: error("Could not read the selected ZIP file.")
                        input.use { stream ->
                            val output = ByteArrayOutputStream()
                            val buffer = ByteArray(64 * 1024)
                            var total = 0
                            while (true) {
                                val count = stream.read(buffer)
                                if (count < 0) break
                                total += count
                                require(total <= 50 * 1024 * 1024) { "The ZIP package exceeds the 50 MB limit." }
                                output.write(buffer, 0, count)
                            }
                            output.toByteArray()
                        }
                    }
                    val result = repository.uploadUpdatePackage(filename, bytes) { label, progress ->
                        packageProgressLabel = label
                        packageProgress = progress
                    }
                    updatePackages = repository.updatePackages()
                    packageLibraryLoaded = true
                    updateStatus = repository.updateStatus()
                    val manifest = result.optJSONObject("manifest") ?: JSONObject()
                    packageProgressLabel = "Validated ${filename} · version ${manifest.optString("bot_version")}"
                    Toast.makeText(context, "Aharane update ZIP validated and saved.", Toast.LENGTH_LONG).show()
                } catch (error: Exception) {
                    packageError = error.message ?: "ZIP upload or validation failed."
                    packageProgressLabel = "Package upload or validation failed"
                    Toast.makeText(context, packageError, Toast.LENGTH_LONG).show()
                } finally {
                    activePackageId = null
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
        // The authenticated status response is the connectivity signal. A
        // secondary module (storage, activity, files, or packages) may fail
        // independently without falsely marking a reachable server Offline.
        runtime = repository.runtimeSnapshot()
        serverReachable = true
        serverError = ""
        val failures = mutableListOf<String>()

        runCatching { repository.ownerSettings() }
            .onSuccess { owners = it }
            .onFailure { failures += "Owner settings: ${it.message ?: "unavailable"}" }
        runCatching { repository.environment() }
            .onSuccess { environmentRows = it }
            .onFailure { failures += "ENV: ${it.message ?: "unavailable"}" }
        runCatching { repository.activity(30) }
            .onSuccess { activityRows = it }
            .onFailure { failures += "Activity: ${it.message ?: "unavailable"}" }
        runCatching { repository.storage() }
            .onSuccess { storageSnapshot = it }
            .onFailure { failures += "Storage: ${it.message ?: "unavailable"}" }
        runCatching { repository.fileTree() }
            .onSuccess { fileDraft = it }
            .onFailure { failures += "Files draft: ${it.message ?: "unavailable"}" }
        runCatching { repository.allFiles() }
            .onSuccess { serverFiles = it }
            .onFailure { failures += "Files: ${it.message ?: "unavailable"}" }
        runCatching { repository.chats(ChatAccount.PRIVATE) }
            .onSuccess { chatsByAccount[ChatAccount.PRIVATE] = it }
            .onFailure { failures += "Private inbox: ${it.message ?: "unavailable"}" }
        runCatching { repository.chats(ChatAccount.PUBLIC) }
            .onSuccess { chatsByAccount[ChatAccount.PUBLIC] = it }
            .onFailure { failures += "Public inbox: ${it.message ?: "unavailable"}" }
        runCatching { repository.updatePackages() }
            .onSuccess {
                updatePackages = it
                packageLibraryLoaded = true
            }
            .onFailure { failures += "Update packages: ${it.message ?: "unavailable"}" }
        runCatching { repository.updateStatus() }
            .onSuccess { updateStatus = it }
            .onFailure { failures += "Update status: ${it.message ?: "unavailable"}" }

        if (failures.isNotEmpty()) serverError = failures.joinToString(" · ")
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
                serverReachable = false
                runtime = null
                serverError = error.message ?: "Could not load Aharane data."
            } finally {
                busy = false
            }
        }
    }

    LaunchedEffect(activeConversation, authenticated, previewMode) {
        conversationSearchRequestId += 1
        conversationSearchResults = null
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

    // Keep the visible native dashboard/inbox fresh while the app is open.
    // This uses the existing authenticated API and does not open a WhatsApp
    // socket or send presence/read-receipt events.
    LaunchedEffect(authenticated, previewMode, accountName, activeConversation?.key) {
        if (!authenticated || previewMode) return@LaunchedEffect
        while (true) {
            delay(20_000)
            try {
                runtime = repository.runtimeSnapshot()
                serverReachable = true
            } catch (error: Exception) {
                serverReachable = false
                runtime = null
                serverError = error.message ?: "Aharane server is unreachable."
                continue
            }

            val openConversation = activeConversation
            val account = openConversation?.key?.account ?: ChatAccount.valueOf(accountName)
            val failures = mutableListOf<String>()
            runCatching { repository.chats(account) }
                .onSuccess { chatsByAccount[account] = it }
                .onFailure { failures += "Inbox: ${it.message ?: "unavailable"}" }
            if (openConversation != null) {
                runCatching { repository.messages(openConversation) }
                    .onSuccess { activeMessages = it }
                    .onFailure { failures += "Conversation: ${it.message ?: "unavailable"}" }
            }
            runCatching { repository.updateStatus() }
                .onSuccess { updateStatus = it }
                .onFailure { failures += "Update status: ${it.message ?: "unavailable"}" }
            if (failures.isNotEmpty()) serverError = failures.joinToString(" · ")
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
        if (previewMode) {
            fileDialogMode = ""
            selectedFile = null
            pendingDeletePaths = emptyList()
            pendingMovePaths = emptyList()
            Toast.makeText(context, "Preview mode does not modify server files.", Toast.LENGTH_SHORT).show()
            return
        }
        if (!authenticated || !serverReachable) {
            Toast.makeText(context, "Connect to the Aharane server before modifying files.", Toast.LENGTH_SHORT).show()
            return
        }
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
                    "move" -> if (pendingMovePaths.isNotEmpty()) {
                        repository.moveFiles(pendingMovePaths, name)
                    } else {
                        repository.moveFile(entry?.path ?: error("Select a file first."), name)
                    }
                    "delete" -> repository.deleteFiles(pendingDeletePaths)
                }
                fileDialogMode = ""
                selectedFile = null
                pendingDeletePaths = emptyList()
                pendingMovePaths = emptyList()
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

    fun removeUpdatePackage(pkg: AharaneUpdatePackage) {
        if (previewMode) {
            updatePackages = updatePackages.filterNot { it.updateId == pkg.updateId }
            packageProgressLabel = "Preview sample package removed locally. No server change was made."
            return
        }
        if (!authenticated || !serverReachable) {
            packageError = "Connect to the Aharane server before removing a package."
            return
        }
        connectionScope.launch {
            activePackageId = pkg.updateId
            packageError = ""
            packageProgressLabel = "Removing ${pkg.filename}"
            try {
                repository.removeUpdatePackage(pkg.updateId)
                updatePackages = repository.updatePackages()
                packageLibraryLoaded = true
                updateStatus = repository.updateStatus()
                packageProgressLabel = "Package removed. The running bot was not changed."
            } catch (error: Exception) {
                packageError = error.message ?: "Could not remove the update package."
            } finally {
                activePackageId = null
            }
        }
    }

    fun deployUpdatePackage(pkg: AharaneUpdatePackage) {
        if (previewMode) {
            packageProgressLabel = "Preview only · deployment was not sent to a server."
            Toast.makeText(context, "Preview mode cannot deploy updates.", Toast.LENGTH_SHORT).show()
            return
        }
        if (!authenticated || !serverReachable) {
            packageError = "Connect to the Aharane server before deploying an update."
            return
        }
        connectionScope.launch {
            activePackageId = pkg.updateId
            packageProgress = 0f
            packageProgressLabel = "Submitting deployment request"
            packageError = ""
            try {
                val accepted = repository.deployUpdatePackage(pkg.updateId)
                packageProgressLabel = accepted.optString(
                    "message",
                    "The server accepted the update and is preparing a separate release."
                )
                var terminalStatus = false
                for (attempt in 0 until 45) {
                    delay(2_000)
                    try {
                        updateStatus = repository.updateStatus()
                        val state = updateStatus.optJSONObject("update") ?: JSONObject()
                        val status = state.optString("status", "idle")
                        when (status) {
                            "failed" -> {
                                packageError = state.optString("message").ifBlank { "The server reported that deployment failed." }
                                packageProgressLabel = "Deployment failed"
                                terminalStatus = true
                            }
                            "rolled_back" -> {
                                packageError = state.optString("message").ifBlank { "The new release failed its health check and the previous release was restored." }
                                packageProgressLabel = "Deployment rolled back · previous release restored."
                                terminalStatus = true
                            }
                            "rollback_failed" -> {
                                packageError = state.optString("message").ifBlank { "Automatic rollback failed. Manual recovery is required." }
                                packageProgressLabel = "CRITICAL · automatic rollback failed."
                                terminalStatus = true
                            }
                            "succeeded" -> {
                                packageProgressLabel = "Deployment passed the systemd startup health check."
                                terminalStatus = true
                            }
                            "awaiting-healthcheck" -> packageProgressLabel = "Release activated · waiting for systemd startup health-check confirmation."
                            "preparing" -> packageProgressLabel = "Preparing the new release · the running bot has not yet switched."
                        }
                    } catch (error: Exception) {
                        serverReachable = false
                        runtime = null
                        packageProgressLabel = "Aharane is restarting or temporarily unreachable. Waiting for its health-check status…"
                    }
                    if (terminalStatus) break
                }
                updatePackages = runCatching { repository.updatePackages() }.getOrDefault(updatePackages)
                if (!terminalStatus && packageError.isBlank()) {
                    val state = updateStatus.optJSONObject("update") ?: JSONObject()
                    packageProgressLabel = when (state.optString("status")) {
                        "awaiting-healthcheck" -> "The new release is active, but final health-check confirmation has not been received yet. Check Home and refresh status."
                        "failed" -> "Deployment failed: ${state.optString("message")}"
                        else -> "The deployment request was accepted. The server has not yet returned a final result."
                    }
                }
            } catch (error: Exception) {
                packageError = error.message ?: "Could not deploy the update package."
                packageProgressLabel = "Deployment request failed"
            } finally {
                activePackageId = null
            }
        }
    }

    fun onFileEntryAction(entry: StudioFileEntry, action: String) {
        if (previewMode) {
            if (action == "open" && !entry.isDirectory) openPreviewDocument(entry.path)
            else if (action == "update_bot") {
                Toast.makeText(context, "Preview ZIP files are examples only. Importing or deploying packages is disabled in Preview mode.", Toast.LENGTH_LONG).show()
            }
            return
        }
        if (!authenticated || !serverReachable) {
            Toast.makeText(context, "Connect to the Aharane server before managing files.", Toast.LENGTH_SHORT).show()
            return
        }
        val serverEntry = serverFiles.firstOrNull { it.path == entry.path }
            ?: ServerFileEntry(entry.name, entry.path, entry.isDirectory, null, null, false)
        when (action) {
            "open" -> if (!entry.isDirectory) openSourceDocument(entry.path)
            "update_bot" -> {
                if (!entry.name.endsWith(".zip", ignoreCase = true)) {
                    Toast.makeText(context, "Choose a ZIP update package.", Toast.LENGTH_SHORT).show()
                } else {
                    connectionScope.launch {
                        activePackageId = "workspace-import"
                        packageProgress = 0f
                        packageError = ""
                        packageProgressLabel = "Reading workspace ZIP"
                        try {
                            val bytes = repository.downloadSourceFile(entry.path)
                            val result = repository.uploadUpdatePackage(entry.name, bytes) { label, progress ->
                                packageProgressLabel = label
                                packageProgress = progress
                            }
                            updatePackages = repository.updatePackages()
                            packageLibraryLoaded = true
                            updateStatus = repository.updateStatus()
                            val manifest = result.optJSONObject("manifest") ?: JSONObject()
                            packageProgressLabel = "Validated ${entry.name} · version ${manifest.optString("bot_version")}"
                            Toast.makeText(context, "Workspace ZIP validated and added to Update packages.", Toast.LENGTH_LONG).show()
                        } catch (error: Exception) {
                            packageError = error.message ?: "Workspace ZIP validation failed."
                            packageProgressLabel = "ZIP import or validation failed"
                            Toast.makeText(context, packageError, Toast.LENGTH_LONG).show()
                        } finally {
                            activePackageId = null
                        }
                    }
                }
            }
            "rename", "duplicate", "move" -> {
                selectedFile = serverEntry
                fileDialogMode = action
                fileDialogName = if (action == "move") "" else entry.name
                fileDialogError = ""
            }
            "delete" -> {
                selectedFile = serverEntry
                pendingDeletePaths = listOf(entry.path)
                pendingMovePaths = emptyList()
                fileDialogMode = "delete"
                fileDialogError = ""
            }
            "download-zip" -> exportSelection(listOf(entry.path))
            else -> Toast.makeText(context, "This file action is not available.", Toast.LENGTH_SHORT).show()
        }
    }

    val currentDestination = MainDestination.valueOf(destinationName)
    val selectedAccount = ChatAccount.valueOf(accountName)
    val selectedFilter = ChatFilter.valueOf(filterName)
    val connected = authenticated && !previewMode && serverReachable

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
    val sourceFileEntries = if (previewMode) {
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
    val studioFileEntries = sourceFileEntries + listOf(
        StudioFileEntry("Update packages", "Update packages", true)
    ) + updatePackages.map { pkg ->
        StudioFileEntry(
            name = pkg.filename,
            path = "Update packages/${pkg.updateId}.zip",
            isDirectory = false,
            sizeLabel = "${pkg.sizeLabel} · v${pkg.version}",
            modifiedLabel = pkg.validatedAt ?: pkg.createdAt
        )
    }
    val environmentValues = if (previewMode) previewEnvironmentValues else environmentRows.map {
        EnvironmentValue(it.key, it.value, it.readOnly, it.type, it.secret)
    }

    Column(
        Modifier.fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.statusBars)
    ) {
        if (!editorOpen && activeConversation == null) {
            StudioHeader()
        }

        if (previewMode) {
            Row(
                Modifier.fillMaxWidth().background(StudioPalette.Soft)
                    .padding(horizontal = 14.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp)
            ) {
                Text("PREVIEW", color = StudioPalette.Accent, fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                Text("Sample data only · actions never reach your server", color = StudioPalette.Ink, fontSize = 11.5.sp)
            }
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
                                // The source write is already committed at this point. A secondary
                                // directory refresh must not turn a successful save into "unsaved".
                                runCatching { repository.fileTree() }
                                    .onSuccess { fileDraft = it }
                                    .onFailure {
                                        serverError = it.message ?: "File saved, but the Files list could not refresh."
                                    }
                                true
                            } catch (error: Exception) {
                                serverError = error.message ?: "Could not save this file."
                                false
                            }
                        }
                    }
                    ,connected = connected,
                    diagnostics = if (previewMode) {
                        listOf(
                            EditorDiagnostic(
                                severity = "warning",
                                message = "Preview sample: validate the owner allowlist before enabling this command.",
                                line = 3,
                                column = 1
                            )
                        )
                    } else editorDiagnosticsByPath[activeEditorPath]?.diagnostics.orEmpty(),
                    diagnosticsState = if (previewMode) "preview" else editorDiagnosticsStateByPath[activeEditorPath] ?: "not-run",
                    onRunDiagnostics = { path, content ->
                        if (previewMode) {
                            editorDiagnosticsStateByPath = editorDiagnosticsStateByPath + (path to "preview")
                        } else if (connected) {
                            editorDiagnosticRequestId += 1
                            val requestId = editorDiagnosticRequestId
                            editorDiagnosticsStateByPath = editorDiagnosticsStateByPath + (path to "checking")
                            connectionScope.launch {
                                try {
                                    val result = repository.diagnoseSource(path, content)
                                    if (requestId == editorDiagnosticRequestId && activeEditorPath == path) {
                                        editorDiagnosticsByPath = editorDiagnosticsByPath + (path to result)
                                        editorDiagnosticsStateByPath = editorDiagnosticsStateByPath + (path to if (result.supported) "ready" else "unsupported")
                                    }
                                } catch (error: Exception) {
                                    if (requestId == editorDiagnosticRequestId && activeEditorPath == path) {
                                        editorDiagnosticsStateByPath = editorDiagnosticsStateByPath + (path to "failed")
                                        serverError = error.message ?: "Source diagnostics failed."
                                    }
                                }
                            }
                        } else {
                            editorDiagnosticsStateByPath = editorDiagnosticsStateByPath + (path to "failed")
                        }
                    },
                    consoleEntries = if (previewMode) {
                        listOf(
                            ServerActivityEntry(
                                id = "preview-console-1",
                                timestamp = "Preview · 08:21:14",
                                level = "info",
                                source = "preview",
                                message = "Sample editor workspace loaded.",
                                details = "{}"
                            ),
                            ServerActivityEntry(
                                id = "preview-console-2",
                                timestamp = "Preview · 08:21:19",
                                level = "warn",
                                source = "preview",
                                message = "Sample diagnostic: owner allowlist should be configured.",
                                details = "{\"path\":\"admin/auth.js\",\"line\":3}"
                            ),
                            ServerActivityEntry(
                                id = "preview-console-3",
                                timestamp = "Preview · 08:21:25",
                                level = "info",
                                source = "preview",
                                message = "Preview mode is isolated; no server commands were executed.",
                                details = "{}"
                            )
                        )
                    } else activityRows,
                    onRefreshConsole = {
                        if (connected) {
                            connectionScope.launch {
                                runCatching { activityRows = repository.activity(100) }
                                    .onFailure { serverError = it.message ?: "Could not refresh server activity." }
                            }
                        }
                    },
                    onClearConsole = {
                        if (connected) {
                            connectionScope.launch {
                                runCatching {
                                    repository.clearActivity()
                                    activityRows = repository.activity(100)
                                }.onFailure { serverError = it.message ?: "Could not clear server activity." }
                            }
                        }
                    }
                )
                activeConversation != null -> ConversationScreen(
                    conversation = activeConversation!!,
                    messages = if (previewMode) previewMessages.filter { it.key == activeConversation!!.key } else activeMessages,
                    connected = if (previewMode) true else currentAccountState?.connected == true,
                    mediaServerAvailable = connected,
                    onBack = { activeConversation = null },
                    onSend = { text, replyTo ->
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
                                    repository.sendText(activeConversation!!, text, replyTo)
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
                        if (previewMode) {
                            Toast.makeText(context, "Preview mode does not contain the original attachment bytes.", Toast.LENGTH_SHORT).show()
                        } else if (connected) {
                            connectionScope.launch {
                                try {
                                    val bytes = repository.mediaBytes(activeConversation!!, message)
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
                        } else {
                            Toast.makeText(context, "Reconnect the selected WhatsApp account to open this media.", Toast.LENGTH_SHORT).show()
                        }
                    },
                    onStarMessage = { message ->
                        if (!previewMode) {
                            connectionScope.launch {
                                try {
                                    repository.star(activeConversation!!, message, !message.isStarred)
                                    activeMessages = repository.messages(activeConversation!!)
                                    starredPreviews = repository.starredPreviews(activeConversation!!.key.account)
                                    Toast.makeText(
                                        context,
                                        if (message.isStarred) "Message unstarred." else "Message starred.",
                                        Toast.LENGTH_SHORT
                                    ).show()
                                } catch (error: Exception) {
                                    Toast.makeText(context, error.message ?: "Could not update starred message.", Toast.LENGTH_LONG).show()
                                }
                            }
                        }
                    },
                    onReactMessage = { message, emoji ->
                        if (!previewMode) {
                            connectionScope.launch {
                                try {
                                    repository.react(activeConversation!!, message, emoji)
                                    activeMessages = repository.messages(activeConversation!!)
                                } catch (error: Exception) {
                                    Toast.makeText(context, error.message ?: "Could not react to this message.", Toast.LENGTH_LONG).show()
                                }
                            }
                        }
                    },
                    onForwardMessage = { message, target ->
                        if (!previewMode) {
                            connectionScope.launch {
                                try {
                                    repository.forwardMessage(activeConversation!!, message, target)
                                    activeMessages = repository.messages(activeConversation!!)
                                    Toast.makeText(context, "Message forwarded.", Toast.LENGTH_SHORT).show()
                                } catch (error: Exception) {
                                    Toast.makeText(context, error.message ?: "Could not forward this message.", Toast.LENGTH_LONG).show()
                                }
                            }
                        }
                    },
                    onDeleteMessage = { message ->
                        if (!previewMode) {
                            connectionScope.launch {
                                try {
                                    repository.deleteMessage(activeConversation!!, message)
                                    activeMessages = repository.messages(activeConversation!!)
                                    chatsByAccount[activeConversation!!.key.account] = repository.chats(activeConversation!!.key.account)
                                    Toast.makeText(context, "Message deleted.", Toast.LENGTH_SHORT).show()
                                } catch (error: Exception) {
                                    Toast.makeText(context, error.message ?: "Could not delete this message.", Toast.LENGTH_LONG).show()
                                }
                            }
                        }
                    },
                    onCopyMessage = { message ->
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        val value = message.text.ifBlank { message.mediaFileName ?: message.kind.name.lowercase() }
                        clipboard.setPrimaryClip(ClipData.newPlainText("Aharane message", value))
                        Toast.makeText(context, "Copied.", Toast.LENGTH_SHORT).show()
                    },
                    forwardTargets = chatsByAccount[activeConversation!!.key.account].orEmpty(),
                    mediaPreviews = inlineMediaPreviews,
                    mediaPreviewErrors = inlineMediaPreviewErrors,
                    audioFiles = audioFiles,
                    audioLoading = audioLoading,
                    audioErrors = audioErrors,
                    audioWaveforms = audioWaveforms,
                    onLoadMediaPreview = { message ->
                        val key = mediaCacheKey(message)
                        if (previewMode) {
                            inlineMediaPreviewErrors = inlineMediaPreviewErrors + message.messageId
                        } else if (connected && key !in inlineMediaPreviews && message.messageId !in inlineMediaPreviewErrors) {
                            connectionScope.launch {
                                try {
                                    val bytes = repository.mediaBytes(activeConversation!!, message)
                                    val mime = message.mediaMimeType.orEmpty()
                                    val bitmap = withContext(Dispatchers.IO) {
                                        if (mime.startsWith("video/")) {
                                            val extension = message.mediaFileName?.substringAfterLast('.', "mp4")
                                                ?.takeIf { it.matches(Regex("[A-Za-z0-9]{2,5}")) } ?: "mp4"
                                            val previewFile = File.createTempFile("aharane-video-preview-", ".$extension", context.cacheDir)
                                            try {
                                                previewFile.writeBytes(bytes)
                                                val retriever = MediaMetadataRetriever()
                                                try {
                                                    retriever.setDataSource(previewFile.absolutePath)
                                                    retriever.getFrameAtTime(750_000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)?.asImageBitmap()
                                                } finally {
                                                    retriever.release()
                                                }
                                            } finally {
                                                previewFile.delete()
                                            }
                                        } else {
                                            val options = BitmapFactory.Options().apply { inSampleSize = 2 }
                                            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)?.asImageBitmap()
                                        }
                                    }
                                    if (bitmap == null) {
                                        inlineMediaPreviewErrors = inlineMediaPreviewErrors + message.messageId
                                    } else {
                                        inlineMediaPreviews = inlineMediaPreviews + (key to bitmap)
                                    }
                                } catch (error: Exception) {
                                    inlineMediaPreviewErrors = inlineMediaPreviewErrors + message.messageId
                                    serverError = error.message ?: "Media preview is unavailable."
                                }
                            }
                        }
                    },
                    onLoadAudio = { message ->
                        val key = mediaCacheKey(message)
                        if (previewMode) {
                            audioErrors = audioErrors + (message.messageId to "Preview audio bytes are not bundled.")
                        } else if (connected && key !in audioFiles && message.messageId !in audioLoading) {
                            audioLoading = audioLoading + message.messageId
                            connectionScope.launch {
                                try {
                                    val bytes = repository.mediaBytes(activeConversation!!, message)
                                    val extension = message.mediaFileName?.substringAfterLast('.', "")
                                        ?.takeIf { it.matches(Regex("[A-Za-z0-9]{2,5}")) }
                                        ?: if (message.isVoiceNote) "ogg" else "audio"
                                    val file = File.createTempFile("aharane-audio-", ".$extension", context.cacheDir)
                                    withContext(Dispatchers.IO) { file.writeBytes(bytes) }
                                    val waveform = withContext(Dispatchers.IO) { AudioWaveformDecoder.decode(file) }
                                    audioFiles = audioFiles + (key to file)
                                    if (waveform.isNotEmpty()) audioWaveforms = audioWaveforms + (key to waveform)
                                    audioErrors = audioErrors - message.messageId
                                } catch (error: Exception) {
                                    audioErrors = audioErrors + (message.messageId to (error.message ?: "Audio could not be downloaded."))
                                } finally {
                                    audioLoading = audioLoading - message.messageId
                                }
                            }
                        }
                    },
                    onDownloadMedia = { message ->
                        if (previewMode) {
                            Toast.makeText(context, "Preview mode does not contain downloadable sample attachments.", Toast.LENGTH_SHORT).show()
                        } else if (connected) {
                            connectionScope.launch {
                                try {
                                    pendingMediaDownload = repository.mediaBytes(activeConversation!!, message)
                                    pendingMediaDownloadName = message.mediaFileName ?: "aharane-attachment"
                                    downloadMediaLauncher.launch(pendingMediaDownloadName)
                                } catch (error: Exception) {
                                    Toast.makeText(context, error.message ?: "Attachment could not be downloaded.", Toast.LENGTH_LONG).show()
                                }
                            }
                        }
                    },
                    onOpenLocation = { message ->
                        val match = Regex("""(?im)^\s*(?:coordinates\s*:\s*)?(-?\d{1,3}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)\s*$""")
                            .find(message.text)
                        val latitude = match?.groupValues?.getOrNull(1)?.toDoubleOrNull()
                        val longitude = match?.groupValues?.getOrNull(2)?.toDoubleOrNull()
                        if (latitude != null && longitude != null && latitude in -90.0..90.0 && longitude in -180.0..180.0) {
                            val uri = Uri.parse("geo:$latitude,$longitude?q=$latitude,$longitude")
                            val map = Intent(Intent.ACTION_VIEW, uri)
                            runCatching { context.startActivity(map) }
                                .onFailure { Toast.makeText(context, it.message ?: "No map app can open this location.", Toast.LENGTH_LONG).show() }
                        } else {
                            Toast.makeText(context, "This location message did not include readable coordinates.", Toast.LENGTH_LONG).show()
                        }
                    },
                    searchResults = conversationSearchResults,
                    onSearchChanged = { query ->
                        conversationSearchRequestId += 1
                        val requestId = conversationSearchRequestId
                        val target = activeConversation
                        if (query.isBlank() || previewMode || target == null) {
                            conversationSearchResults = null
                        } else {
                            conversationSearchResults = null
                            connectionScope.launch {
                                try {
                                    val matches = repository.searchMessages(target, query)
                                    if (requestId == conversationSearchRequestId && activeConversation?.key == target.key) {
                                        conversationSearchResults = matches
                                    }
                                } catch (error: Exception) {
                                    if (requestId == conversationSearchRequestId && activeConversation?.key == target.key) {
                                        conversationSearchResults = emptyList()
                                        serverError = error.message ?: "Conversation search failed."
                                    }
                                }
                            }
                        }
                    },
                    onViewOnce = { message ->
                        if (previewMode) {
                            Toast.makeText(context, "Preview mode does not contain view-once media bytes.", Toast.LENGTH_SHORT).show()
                        } else if (!connected) {
                            Toast.makeText(context, "Reconnect the selected WhatsApp account to open view-once media.", Toast.LENGTH_SHORT).show()
                        } else if (message.messageId !in openedViewOnceIds) {
                            connectionScope.launch {
                                try {
                                    val bytes = repository.viewOnceMedia(message.key.account, message)
                                    openedViewOnceIds.add(message.messageId)
                                    val mime = message.mediaMimeType.orEmpty()
                                    if (mime.startsWith("video/")) {
                                        viewOnceVideoFile?.delete()
                                        val extension = message.mediaFileName?.substringAfterLast('.', "mp4")
                                            ?.takeIf { it.matches(Regex("[A-Za-z0-9]{2,5}")) } ?: "mp4"
                                        val file = File.createTempFile("aharane-view-once-", ".$extension", context.cacheDir)
                                        withContext(Dispatchers.IO) { file.writeBytes(bytes) }
                                        viewOnceVideoFile = file
                                    } else {
                                        showImageBytes(
                                            bytes,
                                            "View-once media",
                                            onBitmap = { mediaTitle = "View-once media"; mediaImage = it; mediaMessageError = "" },
                                            onError = { mediaTitle = "View-once media"; mediaMessageError = it }
                                        )
                                    }
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
                        if (previewMode || !connected) {
                            Toast.makeText(context, "Preview mode cannot save to a server.", Toast.LENGTH_SHORT).show()
                            false
                        } else {
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
                    }
                )
                else -> when (currentDestination) {
                    MainDestination.HOME -> HomeScreen(
                        onOpenChats = { destinationName = MainDestination.CHATS.name },
                        onOpenMore = { destinationName = MainDestination.MORE.name; morePage = "more" },
                        onOpenConfiguration = { configurationOpen = true },
                        onOpenActivity = { destinationName = MainDestination.MORE.name; morePage = "activity" },
                        serviceConnected = connected,
                        serviceSubtitle = if (previewMode) "Preview only" else if (connected) "Connected to Aharane server" else "Not connected to Aharane service",
                        privateAccountStatus = if (previewMode) "Preview session" else runtime?.privateAccount?.let(::accountStateLabel) ?: "Status not loaded",
                        publicAccountStatus = if (previewMode) "Preview session" else runtime?.publicAccount?.let(::accountStateLabel) ?: "Status not loaded",
                        privateActionLabel = if (previewMode) "Preview" else runtime?.privateAccount?.let(::accountActionLabel) ?: "Link account",
                        publicActionLabel = if (previewMode) "Preview" else runtime?.publicAccount?.let(::accountActionLabel) ?: "Link account",
                        onAccountAction = { target ->
                            if (previewMode) {
                                pairingAccount = target
                                pairingCode = ""
                            } else {
                                connectionScope.launch {
                                    try {
                                        val state = when (target) {
                                            ChatAccount.PRIVATE -> runtime?.privateAccount
                                            ChatAccount.PUBLIC -> runtime?.publicAccount
                                        }
                                        if (state?.registered == true) {
                                            accountControlTarget = target
                                        } else {
                                            pairingAccount = target
                                            pairingCode = repository.pairCode(target)
                                        }
                                    } catch (error: Exception) {
                                        pairingAccount = null
                                        Toast.makeText(context, error.message ?: "Account action failed.", Toast.LENGTH_LONG).show()
                                    }
                                }
                            }
                        },
                        recentActivity = if (previewMode) DesignPreviewFixtures.activity else activityRows.take(3).map { it.message }
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
                        savedChatTheme = chatAppearance.optString("theme", "system"),
                        savedShowAvatars = chatAppearance.optBoolean("showAvatars", true),
                        savedShowPreviews = chatAppearance.optBoolean("showPreviews", true),
                        savedShowTimestamps = chatAppearance.optBoolean("showTimestamps", true)
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
                            if (previewMode || !connected) {
                                Toast.makeText(context, "Preview mode has no server-side staged edits to apply.", Toast.LENGTH_SHORT).show()
                            } else connectionScope.launch {
                                try {
                                    repository.applyFileEdits()
                                    Toast.makeText(context, "Source changes are being applied. Aharane is restarting.", Toast.LENGTH_LONG).show()
                                } catch (error: Exception) {
                                    Toast.makeText(context, error.message ?: "Could not apply source changes.", Toast.LENGTH_LONG).show()
                                }
                            }
                        },
                        onDiscardEdits = {
                            if (previewMode || !connected) {
                                Toast.makeText(context, "Preview mode has no server-side staged edits to discard.", Toast.LENGTH_SHORT).show()
                            } else connectionScope.launch {
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
                            if (previewMode || !connected) {
                                Toast.makeText(context, "Preview mode does not create server files.", Toast.LENGTH_SHORT).show()
                            } else {
                                fileDialogMode = "create-file"
                                fileDialogName = ""
                                fileDialogError = ""
                            }
                        },
                        onCreateFolder = {
                            if (previewMode || !connected) {
                                Toast.makeText(context, "Preview mode does not create server folders.", Toast.LENGTH_SHORT).show()
                            } else {
                                fileDialogMode = "create-folder"
                                fileDialogName = ""
                                fileDialogError = ""
                            }
                        },
                        onUpload = {
                            if (previewMode) Toast.makeText(context, "Preview mode does not upload files to a server.", Toast.LENGTH_SHORT).show()
                            else if (connected) uploadLauncher.launch(arrayOf("text/*", "application/json"))
                        },
                        onExportSource = ::exportSource,
                        onEntryAction = ::onFileEntryAction,
                        updatePackages = updatePackages,
                        packageLibraryLoaded = packageLibraryLoaded,
                        updateStatusLabel = updateStatus.optJSONObject("update")?.let { state ->
                            when (state.optString("status", "idle")) {
                                "idle" -> "Current bot version: ${updateStatus.optString("currentVersion").ifBlank { "not reported" }}"
                                "preparing" -> "Preparing update ${state.optString("version")}. Do not stop the server."
                                "awaiting-healthcheck" -> "Release activated · awaiting service startup health check."
                                "succeeded" -> "Update ${state.optString("version")} passed the systemd startup health check."
                                "rolled_back" -> "Update rolled back: ${state.optString("message").ifBlank { "The previous release was restored after the new release failed its health check." }}"
                                "rollback_failed" -> "CRITICAL · automatic rollback failed: ${state.optString("message").ifBlank { "Manual recovery is required." }}"
                                "failed" -> "Deployment failed: ${state.optString("message").ifBlank { "The server reported a failure." }}"
                                else -> "Update status: ${state.optString("status")}"
                            }
                        } ?: if (previewMode) "Preview package library · no deployment service is connected." else "",
                        packageProgressLabel = packageProgressLabel,
                        packageProgress = packageProgress,
                        packageError = packageError,
                        activePackageId = activePackageId,
                        onRefreshPackages = {
                            if (previewMode) {
                                packageProgressLabel = "Preview data only · no server request was made."
                            } else if (connected) {
                                connectionScope.launch {
                                    runCatching {
                                        updatePackages = repository.updatePackages()
                                        updateStatus = repository.updateStatus()
                                    }.onFailure {
                                        packageError = it.message ?: "Could not refresh update packages."
                                    }
                                }
                            }
                        },
                        onUploadPackage = {
                            if (previewMode) {
                                packageProgressLabel = "Preview only · package uploads are disabled for demo data."
                                Toast.makeText(context, "Preview mode does not upload to a server.", Toast.LENGTH_SHORT).show()
                            } else if (connected) {
                                updatePackageLauncher.launch(arrayOf("application/zip", "application/x-zip-compressed"))
                            }
                        },
                        onDeployPackage = { pkg -> deployUpdatePackage(pkg) },
                        onRemovePackage = { pkg -> removeUpdatePackage(pkg) },
                        onBulkAction = { entries, action ->
                            when (action) {
                                "delete" -> {
                                    pendingDeletePaths = entries.map { it.path }
                                    pendingMovePaths = emptyList()
                                    selectedFile = null
                                    fileDialogName = ""
                                    fileDialogError = ""
                                    fileDialogMode = "delete"
                                }
                                "move" -> {
                                    pendingMovePaths = entries.map { it.path }
                                    pendingDeletePaths = emptyList()
                                    selectedFile = null
                                    fileDialogName = ""
                                    fileDialogError = ""
                                    fileDialogMode = "move"
                                }
                                "zip" -> exportSelection(entries.map { it.path })
                            }
                        }
                    )
                    MainDestination.ENVIRONMENT -> EnvironmentScreen(
                        values = environmentValues,
                        connected = connected,
                        onSave = { values ->
                            if (previewMode) {
                                previewEnvironmentValues = values
                                Toast.makeText(context, "Preview ENV values saved on this screen only.", Toast.LENGTH_SHORT).show()
                                true
                            } else if (!connected) {
                                Toast.makeText(context, "Connect to your Aharane server before saving ENV values.", Toast.LENGTH_SHORT).show()
                                false
                            } else {
                                repository.saveEnvironment(values.map {
                                    ServerEnvironmentValue(it.key, it.value, it.readOnly, it.secret, it.valueType)
                                })
                                environmentRows = repository.environment()
                                true
                            }
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
                        storageTotalSummary = storageSnapshot?.let { formatBytes(it.totalBytes) } ?: "—",
                        storageFreeSummary = storageSnapshot?.let { formatBytes(it.freeBytes) } ?: "—",
                        storageMediaSummary = storageSnapshot?.let { formatBytes(it.mediaBytes) } ?: "—",
                        storageUsageFraction = storageSnapshot?.let {
                            if (it.totalBytes > 0L) it.usedBytes.toFloat() / it.totalBytes.toFloat() else 0f
                        } ?: 0f,
                        largestFiles = serverFiles.asSequence()
                            .filter { !it.isDirectory && it.sizeBytes != null }
                            .sortedByDescending { it.sizeBytes ?: 0L }
                            .take(5)
                            .map { "${it.name} · ${formatBytes(it.sizeBytes ?: 0L)}" }
                            .toList(),
                        folderSummaries = serverFiles.asSequence()
                            .filter { !it.isDirectory && it.sizeBytes != null }
                            .groupBy { it.path.trim('/').split('/').firstOrNull().orEmpty().ifBlank { "Root files" } }
                            .map { (folder, entries) -> "${folder} · ${formatBytes(entries.sumOf { it.sizeBytes ?: 0L })}" }
                            .sortedByDescending { it.substringAfter(" · ") },
                        onAccountAction = { accountId ->
                            val target = ChatAccount.fromApiValue(accountId)
                            if (target != null && previewMode) {
                                pairingAccount = target
                                pairingCode = ""
                            } else if (target != null && connected) {
                                connectionScope.launch {
                                    try {
                                        val state = if (target == ChatAccount.PRIVATE) runtime?.privateAccount else runtime?.publicAccount
                                        if (state?.registered == true) {
                                            accountControlTarget = target
                                        } else {
                                            pairingAccount = target
                                            pairingCode = repository.pairCode(target)
                                        }
                                    } catch (error: Exception) {
                                        pairingAccount = null
                                        Toast.makeText(context, error.message ?: "Account action failed.", Toast.LENGTH_LONG).show()
                                    }
                                }
                            }
                        },
                        onSaveOwnerSettings = { privateOwner, publicOwner, publicBot, allowed ->
                            if (previewMode || !connected) {
                                Toast.makeText(context, "Preview mode cannot save owner settings to a server.", Toast.LENGTH_SHORT).show()
                            } else connectionScope.launch {
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
                            if (!previewMode && connected) connectionScope.launch {
                                runCatching { repository.clearActivity(); activityRows = repository.activity(30) }
                                    .onFailure { Toast.makeText(context, it.message ?: "Could not clear activity.", Toast.LENGTH_LONG).show() }
                            }
                        },
                        onRefreshActivity = {
                            if (!previewMode && connected) connectionScope.launch {
                                runCatching { activityRows = repository.activity(60) }
                                    .onFailure { Toast.makeText(context, it.message ?: "Could not refresh activity.", Toast.LENGTH_LONG).show() }
                            }
                        },
                        onCopyActivity = {
                            val text = activityRows.joinToString("\n") { "${it.timestamp} · ${it.level.uppercase(Locale.ROOT)} · ${it.source} · ${it.message}" }
                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            clipboard.setPrimaryClip(ClipData.newPlainText("Aharane activity", text))
                            Toast.makeText(context, "Activity copied.", Toast.LENGTH_SHORT).show()
                        },
                        onExportActivity = {
                            val text = activityRows.joinToString("\n") { "${it.timestamp} · ${it.level.uppercase(Locale.ROOT)} · ${it.source} · ${it.message}" }
                            val share = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_SUBJECT, "Aharane activity export")
                                putExtra(Intent.EXTRA_TEXT, text)
                            }
                            runCatching { context.startActivity(Intent.createChooser(share, "Export activity")) }
                                .onFailure { Toast.makeText(context, it.message ?: "Could not export activity.", Toast.LENGTH_LONG).show() }
                        },
                        onSignOut = {
                            if (previewMode) {
                                Toast.makeText(context, "Preview mode does not sign out of a server.", Toast.LENGTH_SHORT).show()
                            } else connectionScope.launch {
                                runCatching { connectionManager.logout() }
                                    .onFailure { Toast.makeText(context, it.message ?: "Could not sign out.", Toast.LENGTH_LONG).show() }
                                AharaneNotificationScheduler.cancel(context)
                                authenticated = false
                                serverReachable = false
                                runtime = null
                                connectionPassword = ""
                                serverVerified = true
                            }
                        },
                        onChangePassword = { current, new ->
                            if (!previewMode && connected) connectionScope.launch {
                                runCatching { repository.changePassword(current, new) }
                                    .onSuccess { Toast.makeText(context, "Studio password changed.", Toast.LENGTH_SHORT).show() }
                                    .onFailure { Toast.makeText(context, it.message ?: "Password could not be changed.", Toast.LENGTH_LONG).show() }
                            }
                        },
                        selectedChatAccount = selectedAccount,
                        showIndividualChats = showIndividualChats,
                        showGroupChats = showGroupChats,
                        starredItems = if (previewMode) emptyList() else starredPreviews,
                        chatTheme = chatAppearance.optString("theme", "system"),
                        showChatAvatars = chatAppearance.optBoolean("showAvatars", true),
                        showChatPreviews = chatAppearance.optBoolean("showPreviews", true),
                        showChatTimestamps = chatAppearance.optBoolean("showTimestamps", true),
                        chatMessageSize = chatMessageSize,
                        launcherIcon = launcherIcon,
                        onLauncherIconChanged = onLauncherIconChanged,
                        onChatAccountSelected = { accountName = it.name },
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
                        },
                        onChatMessageSizeChanged = onChatMessageSizeChanged
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

    if (accountControlTarget != null) {
        val target = accountControlTarget!!
        val targetState = if (target == ChatAccount.PRIVATE) runtime?.privateAccount else runtime?.publicAccount
        Dialog(onDismissRequest = { if (!busy) accountControlTarget = null }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(StudioPalette.Surface).padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text("${target.label} WhatsApp", color = StudioPalette.Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                Text(
                    targetState?.let(::accountStateLabel) ?: "Status not loaded",
                    color = StudioPalette.Muted,
                    fontSize = 12.5.sp
                )
                StudioActionButton("Reconnect", modifier = Modifier.fillMaxWidth(), enabled = !busy && connected, onClick = {
                    if (previewMode || !connected) {
                        Toast.makeText(context, "Connect to the live Aharane server to manage WhatsApp accounts.", Toast.LENGTH_SHORT).show()
                        return@StudioActionButton
                    }
                    connectionScope.launch {
                        busy = true
                        try {
                            repository.reconnect(target)
                            runtime = repository.runtimeSnapshot()
                            Toast.makeText(context, "${target.label} account reconnect requested.", Toast.LENGTH_SHORT).show()
                        } catch (error: Exception) {
                            Toast.makeText(context, error.message ?: "Reconnect failed.", Toast.LENGTH_LONG).show()
                        } finally { busy = false }
                    }
                })
                StudioActionButton("Repair session", modifier = Modifier.fillMaxWidth(), enabled = !busy && connected, onClick = {
                    if (previewMode || !connected) {
                        Toast.makeText(context, "Connect to the live Aharane server to manage WhatsApp accounts.", Toast.LENGTH_SHORT).show()
                        return@StudioActionButton
                    }
                    connectionScope.launch {
                        busy = true
                        try {
                            repository.repair(target)
                            runtime = repository.runtimeSnapshot()
                            Toast.makeText(context, "${target.label} session repair requested.", Toast.LENGTH_SHORT).show()
                        } catch (error: Exception) {
                            Toast.makeText(context, error.message ?: "Session repair failed.", Toast.LENGTH_LONG).show()
                        } finally { busy = false }
                    }
                })
                StudioActionButton("Restart connection", modifier = Modifier.fillMaxWidth(), enabled = !busy && connected, onClick = {
                    if (previewMode || !connected) {
                        Toast.makeText(context, "Connect to the live Aharane server to manage WhatsApp accounts.", Toast.LENGTH_SHORT).show()
                        return@StudioActionButton
                    }
                    connectionScope.launch {
                        busy = true
                        try {
                            repository.restart(target)
                            runtime = repository.runtimeSnapshot()
                            Toast.makeText(context, "${target.label} account restart requested.", Toast.LENGTH_SHORT).show()
                        } catch (error: Exception) {
                            Toast.makeText(context, error.message ?: "Restart failed.", Toast.LENGTH_LONG).show()
                        } finally { busy = false }
                    }
                })
                StudioActionButton("Stop account", modifier = Modifier.fillMaxWidth(), destructive = true, enabled = !busy && connected, onClick = {
                    if (previewMode || !connected) {
                        Toast.makeText(context, "Connect to the live Aharane server to manage WhatsApp accounts.", Toast.LENGTH_SHORT).show()
                        return@StudioActionButton
                    }
                    connectionScope.launch {
                        busy = true
                        try {
                            repository.stop(target)
                            runtime = repository.runtimeSnapshot()
                            Toast.makeText(context, "${target.label} account stopped.", Toast.LENGTH_SHORT).show()
                        } catch (error: Exception) {
                            Toast.makeText(context, error.message ?: "Could not stop account.", Toast.LENGTH_LONG).show()
                        } finally { busy = false }
                    }
                })
                StudioActionButton("Close", modifier = Modifier.fillMaxWidth(), enabled = !busy, onClick = { accountControlTarget = null })
            }
        }
    }

    if (pairingAccount != null && (previewMode || pairingCode.isNotBlank())) {
        Dialog(onDismissRequest = { pairingAccount = null; pairingCode = "" }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(StudioPalette.Surface).padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text("Link ${pairingAccount!!.label} account", color = StudioPalette.Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                if (previewMode) {
                    Text(
                        "This is a design preview. Connect to your Aharane server to generate a real WhatsApp pairing code. No account has been paired.",
                        color = StudioPalette.Muted,
                        fontSize = 13.sp,
                        lineHeight = 19.sp
                    )
                    StudioActionButton("Close", compact = true, primary = true, onClick = {
                        pairingAccount = null
                        pairingCode = ""
                    })
                } else {
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
    }

    if (fileDialogMode.isNotBlank()) {
        Dialog(onDismissRequest = {
            fileDialogMode = ""
            selectedFile = null
            pendingDeletePaths = emptyList()
            pendingMovePaths = emptyList()
        }) {
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
                    Text("This permanently deletes the selected files or folders from the Aharane workspace.", color = StudioPalette.Muted, fontSize = 13.sp, lineHeight = 19.sp)
                }
                if (fileDialogError.isNotBlank()) Text(fileDialogError, color = StudioPalette.Bad, fontSize = 12.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.align(Alignment.End)) {
                    StudioActionButton("Cancel", compact = true, onClick = {
                        fileDialogMode = ""
                        selectedFile = null
                        pendingDeletePaths = emptyList()
                        pendingMovePaths = emptyList()
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

    if (viewOnceVideoFile != null) {
        val videoFile = viewOnceVideoFile!!
        DisposableEffect(videoFile) {
            onDispose { videoFile.delete() }
        }
        Dialog(onDismissRequest = {
            videoFile.delete()
            viewOnceVideoFile = null
        }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
                    .background(StudioPalette.Surface).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text("View-once video", color = StudioPalette.Ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                AndroidView(
                    factory = { viewContext ->
                        VideoView(viewContext).apply {
                            val player = this
                            setMediaController(MediaController(viewContext).also { it.setAnchorView(player) })
                            setVideoPath(videoFile.absolutePath)
                            setOnPreparedListener { it.start() }
                        }
                    },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 180.dp, max = 420.dp)
                )
                StudioActionButton("Close", compact = true, primary = true, onClick = {
                    videoFile.delete()
                    viewOnceVideoFile = null
                })
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

private fun mediaCacheKey(message: ChatMessage): String =
    "${message.key.account.apiValue}:${message.messageId}"

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
