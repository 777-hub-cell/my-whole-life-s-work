package com.aharane.studio.features.chats

import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.result.PickVisualMediaRequest
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.AharaneInstrumentSans
import com.aharane.studio.core.design.StudioPalette
import com.aharane.studio.core.design.StudioTag
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.model.ChatSummary
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

data class ChatAppearance(
    val theme: String = "system",
    val wallpaper: String = "default",
    val wallpaperColor: String = "#E9EFEB",
    val gradientStart: String = "#E4EEE8",
    val gradientEnd: String = "#F2ECE4",
    val photoUri: String = "",
    val photoFit: String = "crop",
    val wallpaperBlur: Float = 0f,
    val wallpaperDim: Float = 0.06f,
    val wallpaperBrightness: Float = 1f,
    val incomingBubble: String = "#FFFFFF",
    val outgoingBubble: String = "#DCEFE5",
    val bubbleRadius: Int = 16,
    val bubbleSpacing: Int = 5,
    val bubbleBorder: Boolean = false,
    val messageSize: Int = 14,
    val fontFamily: String = "Instrument",
    val fontWeight: String = "normal",
    val lineSpacing: Float = 4f,
    val density: String = "comfortable",
    val showAvatars: Boolean = true,
    val showSenderLabels: Boolean = true,
    val groupMessages: Boolean = true,
    val showTimestamps: Boolean = true,
    val showDateSeparators: Boolean = true,
    val mediaRadius: Int = 12,
    val attachmentStyle: String = "compact",
    val audioStyle: String = "waveform",
    val autoDownloadImages: Boolean = true,
    val autoDownloadVideoPreviews: Boolean = true,
    val showPreviews: Boolean = true
) {
    fun toJson(): JSONObject = JSONObject()
        .put("theme", theme).put("wallpaper", wallpaper)
        .put("wallpaperColor", wallpaperColor).put("gradientStart", gradientStart)
        .put("gradientEnd", gradientEnd).put("photoUri", photoUri).put("photoFit", photoFit)
        .put("wallpaperBlur", wallpaperBlur.toDouble()).put("wallpaperDim", wallpaperDim.toDouble())
        .put("wallpaperBrightness", wallpaperBrightness.toDouble())
        .put("incomingBubble", incomingBubble).put("outgoingBubble", outgoingBubble)
        .put("bubbleRadius", bubbleRadius).put("bubbleSpacing", bubbleSpacing)
        .put("bubbleBorder", bubbleBorder).put("messageSize", messageSize)
        .put("fontFamily", fontFamily).put("fontWeight", fontWeight)
        .put("lineSpacing", lineSpacing.toDouble()).put("density", density)
        .put("showAvatars", showAvatars).put("showSenderLabels", showSenderLabels)
        .put("groupMessages", groupMessages).put("showTimestamps", showTimestamps)
        .put("showDateSeparators", showDateSeparators).put("mediaRadius", mediaRadius)
        .put("attachmentStyle", attachmentStyle).put("audioStyle", audioStyle)
        .put("autoDownloadImages", autoDownloadImages)
        .put("autoDownloadVideoPreviews", autoDownloadVideoPreviews)
        .put("showPreviews", showPreviews)

    companion object {
        fun fromJson(json: JSONObject): ChatAppearance = ChatAppearance(
            theme = json.optString("theme", "system"),
            wallpaper = json.optString("wallpaper", "default"),
            wallpaperColor = json.optString("wallpaperColor", "#E9EFEB"),
            gradientStart = json.optString("gradientStart", "#E4EEE8"),
            gradientEnd = json.optString("gradientEnd", "#F2ECE4"),
            photoUri = json.optString("photoUri", ""),
            photoFit = json.optString("photoFit", "crop"),
            wallpaperBlur = json.optDouble("wallpaperBlur", 0.0).toFloat().coerceIn(0f, 24f),
            wallpaperDim = json.optDouble("wallpaperDim", 0.06).toFloat().coerceIn(0f, 0.8f),
            wallpaperBrightness = json.optDouble("wallpaperBrightness", 1.0).toFloat().coerceIn(0f, 1.5f),
            incomingBubble = json.optString("incomingBubble", "#FFFFFF"),
            outgoingBubble = json.optString("outgoingBubble", "#DCEFE5"),
            bubbleRadius = json.optInt("bubbleRadius", 16).coerceIn(8, 28),
            bubbleSpacing = json.optInt("bubbleSpacing", 5).coerceIn(2, 14),
            bubbleBorder = json.optBoolean("bubbleBorder", false),
            messageSize = json.optInt("messageSize", 14).coerceIn(12, 22),
            fontFamily = json.optString("fontFamily", "Instrument"),
            fontWeight = json.optString("fontWeight", "normal"),
            lineSpacing = json.optDouble("lineSpacing", 4.0).toFloat().coerceIn(0f, 12f),
            density = json.optString("density", "comfortable"),
            showAvatars = json.optBoolean("showAvatars", true),
            showSenderLabels = json.optBoolean("showSenderLabels", true),
            groupMessages = json.optBoolean("groupMessages", true),
            showTimestamps = json.optBoolean("showTimestamps", true),
            showDateSeparators = json.optBoolean("showDateSeparators", true),
            mediaRadius = json.optInt("mediaRadius", 12).coerceIn(0, 24),
            attachmentStyle = json.optString("attachmentStyle", "compact"),
            audioStyle = json.optString("audioStyle", "waveform"),
            autoDownloadImages = json.optBoolean("autoDownloadImages", true),
            autoDownloadVideoPreviews = json.optBoolean("autoDownloadVideoPreviews", true),
            showPreviews = json.optBoolean("showPreviews", true)
        )
    }
}

data class AppearanceProfile(val id: String, val name: String, val appearance: ChatAppearance, val builtIn: Boolean = false)

class ChatAppearanceStore(context: Context, previewMode: Boolean = false) {
    private val preferences = context.applicationContext.getSharedPreferences(
        if (previewMode) "aharane-chat-appearance-preview" else "aharane-chat-appearance",
        Context.MODE_PRIVATE
    )
    private val builtIns = listOf(
        AppearanceProfile("preset-classic", "Aharane Classic", ChatAppearance(), true),
        AppearanceProfile("preset-sage", "Soft Sage", ChatAppearance(
            wallpaper = "gradient", gradientStart = "#E1ECE5", gradientEnd = "#F1E9DE",
            incomingBubble = "#FFFFFF", outgoingBubble = "#D7E9DF", bubbleRadius = 17
        ), true),
        AppearanceProfile("preset-night", "Quiet Night", ChatAppearance(
            theme = "dark", wallpaper = "solid", wallpaperColor = "#18211F",
            incomingBubble = "#27332F", outgoingBubble = "#244A3C",
            wallpaperDim = 0f, bubbleBorder = true
        ), true)
    )

    private fun readRoot(): JSONObject = runCatching {
        JSONObject(preferences.getString("settings", "{}") ?: "{}")
    }.getOrDefault(JSONObject())

    private fun saveRoot(root: JSONObject) {
        check(preferences.edit().putString("settings", root.toString()).commit()) {
            "Chat appearance preferences could not be saved."
        }
    }

    fun resolve(account: ChatAccount?, jid: String? = null): ChatAppearance {
        val root = readRoot()
        val merged = ChatAppearance().toJson()
        merge(merged, root.optJSONObject("global"))
        if (account != null) {
            merge(merged, root.optJSONObject("accounts")?.optJSONObject(account.apiValue))
            if (!jid.isNullOrBlank()) {
                merge(merged, root.optJSONObject("conversations")?.optJSONObject(conversationKey(account, jid)))
            }
        }
        return ChatAppearance.fromJson(merged)
    }

    fun setField(account: ChatAccount?, jid: String?, field: String, rawValue: String) {
        require(field in editableFields) { "Unsupported chat appearance setting." }
        val root = readRoot()
        val layer = layerFor(root, account, jid)
        val value: Any = when (field) {
            "wallpaperBlur", "wallpaperDim", "wallpaperBrightness", "lineSpacing" ->
                rawValue.toFloatOrNull() ?: error("Enter a valid numeric value.")
            "bubbleRadius", "bubbleSpacing", "messageSize", "mediaRadius" ->
                rawValue.toIntOrNull() ?: error("Enter a valid whole number.")
            "bubbleBorder", "showAvatars", "showSenderLabels", "groupMessages",
            "showTimestamps", "showDateSeparators", "showPreviews", "autoDownloadImages", "autoDownloadVideoPreviews" -> rawValue.toBooleanStrict()
            else -> rawValue
        }
        layer.put(field, value)
        saveRoot(root)
    }

    fun reset(account: ChatAccount?, jid: String? = null) {
        val root = readRoot()
        when {
            account == null -> root.put("global", JSONObject())
            !jid.isNullOrBlank() -> root.optJSONObject("conversations")?.remove(conversationKey(account, jid))
            else -> root.optJSONObject("accounts")?.remove(account.apiValue)
        }
        saveRoot(root)
    }

    fun profiles(): List<AppearanceProfile> {
        val rows = readRoot().optJSONArray("profiles") ?: JSONArray()
        val custom = buildList {
            for (i in 0 until rows.length()) {
                val row = rows.optJSONObject(i) ?: continue
                val id = row.optString("id")
                val name = row.optString("name").trim()
                val data = row.optJSONObject("appearance")
                if (id.isNotBlank() && name.isNotBlank() && data != null) {
                    add(AppearanceProfile(id, name, ChatAppearance.fromJson(data)))
                }
            }
        }
        return builtIns + custom
    }

    fun saveProfile(name: String, appearance: ChatAppearance): String {
        val clean = name.trim().take(48)
        require(clean.isNotBlank()) { "Enter a profile name." }
        val root = readRoot()
        val rows = root.optJSONArray("profiles") ?: JSONArray()
        val id = "profile-" + java.util.UUID.randomUUID().toString()
        rows.put(JSONObject().put("id", id).put("name", clean).put("appearance", appearance.toJson()))
        root.put("profiles", rows)
        saveRoot(root)
        return id
    }

    fun duplicateProfile(id: String): String {
        val profile = profiles().firstOrNull { it.id == id } ?: error("Appearance profile was not found.")
        return saveProfile(profile.name + " copy", profile.appearance)
    }

    fun renameProfile(id: String, name: String) {
        require(id !in builtIns.map { it.id }) { "Built-in presets cannot be renamed." }
        val clean = name.trim().take(48)
        require(clean.isNotBlank()) { "Enter a profile name." }
        val root = readRoot()
        val rows = root.optJSONArray("profiles") ?: JSONArray()
        for (i in 0 until rows.length()) {
            val row = rows.optJSONObject(i) ?: continue
            if (row.optString("id") == id) row.put("name", clean)
        }
        root.put("profiles", rows)
        saveRoot(root)
    }

    fun deleteProfile(id: String) {
        require(id !in builtIns.map { it.id }) { "Built-in presets cannot be removed." }
        val root = readRoot()
        val old = root.optJSONArray("profiles") ?: JSONArray()
        val next = JSONArray()
        for (i in 0 until old.length()) {
            val row = old.optJSONObject(i) ?: continue
            if (row.optString("id") != id) next.put(row)
        }
        root.put("profiles", next)
        saveRoot(root)
    }

    fun applyProfile(account: ChatAccount?, jid: String?, id: String) {
        val profile = profiles().firstOrNull { it.id == id } ?: error("Appearance profile was not found.")
        val root = readRoot()
        val layer = layerFor(root, account, jid)
        val values = profile.appearance.toJson()
        val names = values.keys()
        while (names.hasNext()) {
            val key = names.next()
            layer.put(key, values.get(key))
        }
        saveRoot(root)
    }

    fun exportProfiles(): String {
        val rows = JSONArray()
        profiles().filterNot { it.builtIn }.forEach {
            rows.put(JSONObject().put("id", it.id).put("name", it.name).put("appearance", it.appearance.toJson()))
        }
        return JSONObject().put("format", "aharane-chat-appearance-v1").put("profiles", rows).toString(2)
    }

    fun importProfiles(json: String) {
        require(json.toByteArray(Charsets.UTF_8).size <= 512 * 1024) { "Appearance profile file is too large." }
        val parsed = JSONObject(json)
        require(parsed.optString("format") == "aharane-chat-appearance-v1") { "This is not an Aharane appearance profile file." }
        val incoming = parsed.optJSONArray("profiles") ?: JSONArray()
        val root = readRoot()
        val existing = root.optJSONArray("profiles") ?: JSONArray()
        val merged = JSONArray()
        for (i in 0 until existing.length()) existing.optJSONObject(i)?.let(merged::put)
        for (i in 0 until incoming.length()) {
            val row = incoming.optJSONObject(i) ?: continue
            val name = row.optString("name").trim()
            val appearance = row.optJSONObject("appearance") ?: continue
            if (name.isNotBlank()) {
                ChatAppearance.fromJson(appearance)
                merged.put(JSONObject().put("id", "import-" + java.util.UUID.randomUUID()).put("name", name.take(48)).put("appearance", appearance))
            }
        }
        root.put("profiles", merged)
        saveRoot(root)
    }

    private fun layerFor(root: JSONObject, account: ChatAccount?, jid: String?): JSONObject {
        if (account == null) return root.optJSONObject("global") ?: JSONObject().also { root.put("global", it) }
        if (!jid.isNullOrBlank()) {
            val conversations = root.optJSONObject("conversations") ?: JSONObject().also { root.put("conversations", it) }
            val key = conversationKey(account, jid)
            return conversations.optJSONObject(key) ?: JSONObject().also { conversations.put(key, it) }
        }
        val accounts = root.optJSONObject("accounts") ?: JSONObject().also { root.put("accounts", it) }
        return accounts.optJSONObject(account.apiValue) ?: JSONObject().also { accounts.put(account.apiValue, it) }
    }

    private fun conversationKey(account: ChatAccount, jid: String): String =
        account.apiValue + ":" + MessageDigest.getInstance("SHA-256")
            .digest(jid.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

    private fun merge(target: JSONObject, source: JSONObject?) {
        if (source == null) return
        val keys = source.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            target.put(key, source.get(key))
        }
    }

    companion object {
        private val editableFields = setOf(
            "theme", "wallpaper", "wallpaperColor", "gradientStart", "gradientEnd",
            "photoUri", "photoFit", "wallpaperBlur", "wallpaperDim", "wallpaperBrightness",
            "incomingBubble", "outgoingBubble", "bubbleRadius", "bubbleSpacing", "bubbleBorder",
            "messageSize", "fontFamily", "fontWeight", "lineSpacing", "density",
            "showAvatars", "showSenderLabels", "groupMessages", "showTimestamps",
            "showDateSeparators", "mediaRadius", "attachmentStyle", "audioStyle", "showPreviews"
        )
    }
}

@Composable
fun ChatAppearanceStudioScreen(
    account: ChatAccount,
    conversations: List<ChatSummary>,
    store: ChatAppearanceStore,
    revision: Int,
    onChanged: () -> Unit,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    var scope by rememberSaveable { mutableStateOf("account") }
    var selectedJid by rememberSaveable(account.apiValue) { mutableStateOf("") }
    var profileMenuOpen by remember { mutableStateOf(false) }
    var selectedProfile by rememberSaveable { mutableStateOf("preset-classic") }
    var dialog by rememberSaveable { mutableStateOf("") }
    var profileName by rememberSaveable { mutableStateOf("") }
    val targets = conversations.filter { it.key.account == account }
    val currentJid = selectedJid.takeIf { scope == "conversation" && targets.any { chat -> chat.key.jid == it } }
    val layerAccount = if (scope == "global") null else account
    val layerJid = if (scope == "conversation") currentJid else null
    val appearance = remember(revision, scope, account, currentJid) { store.resolve(layerAccount, layerJid) }
    val profiles = remember(revision) { store.profiles() }

    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        if (uri != null) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            store.setField(layerAccount, layerJid, "photoUri", uri.toString())
            store.setField(layerAccount, layerJid, "wallpaper", "photo")
            onChanged()
        }
    }
    val exportPicker = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null) runCatching {
            context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use { it.write(store.exportProfiles()) }
                ?: error("Could not open the selected export destination.")
        }.onFailure { android.widget.Toast.makeText(context, it.message, android.widget.Toast.LENGTH_LONG).show() }
    }
    val importPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) runCatching {
            val content = context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
                ?: error("Could not read the selected profile file.")
            store.importProfiles(content)
            onChanged()
        }.onFailure { android.widget.Toast.makeText(context, it.message, android.widget.Toast.LENGTH_LONG).show() }
    }

    var previewBitmap by remember(appearance.photoUri) { mutableStateOf<ImageBitmap?>(null) }
    LaunchedEffect(appearance.photoUri) {
        previewBitmap = if (appearance.photoUri.isBlank()) null else withContext(Dispatchers.IO) {
            runCatching {
                context.contentResolver.openInputStream(Uri.parse(appearance.photoUri))?.use {
                    BitmapFactory.decodeStream(it)?.asImageBitmap()
                }
            }.getOrNull()
        }
    }

    fun change(field: String, value: String) {
        if (scope == "conversation" && layerJid == null) {
            android.widget.Toast.makeText(context, "Choose a conversation first.", android.widget.Toast.LENGTH_SHORT).show()
            return
        }
        store.setField(layerAccount, layerJid, field, value)
        onChanged()
    }

    Column(
        Modifier.fillMaxSize().background(StudioPalette.Background)
    ) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            Text("Chat Appearance Studio", color = StudioPalette.Ink, fontSize = 21.sp, fontWeight = FontWeight.Bold)
            Text(
                "Adjust the conversation below and see each change as it happens.",
                color = StudioPalette.Muted,
                fontSize = 12.sp,
                lineHeight = 16.sp
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Apply to", color = StudioPalette.Ink, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.weight(1f))
                StudioTag(account.label, accent = true)
            }
            SegmentRow(listOf("Global", "Account", "Conversation"), when (scope) {
                "global" -> "Global"; "conversation" -> "Conversation"; else -> "Account"
            }) { label ->
                scope = when(label) { "Global" -> "global"; "Conversation" -> "conversation"; else -> "account" }
                if (label == "Conversation" && selectedJid.isBlank() && targets.isNotEmpty()) {
                    selectedJid = targets.first().key.jid
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Chat theme", color = StudioPalette.Ink, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.weight(1f))
                Text(
                    when (scope) {
                        "global" -> "Shared default"
                        "conversation" -> "Conversation override"
                        else -> account.label + " override"
                    },
                    color = StudioPalette.Muted,
                    fontSize = 10.5.sp
                )
            }
            SegmentRow(listOf("System", "Light", "Dark"), appearance.theme.replaceFirstChar { it.uppercase() }) {
                change("theme", it.lowercase())
            }
            if (scope == "conversation") {
                var expanded by remember { mutableStateOf(false) }
                Box {
                    androidx.compose.material3.OutlinedButton(
                        onClick = { expanded = true },
                        enabled = targets.isNotEmpty(),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(targets.firstOrNull { it.key.jid == currentJid }?.title ?: "Choose conversation")
                    }
                    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                        targets.take(200).forEach { chat ->
                            DropdownMenuItem(text = { Text(chat.title, maxLines = 1) }, onClick = {
                                selectedJid = chat.key.jid
                                expanded = false
                            })
                        }
                    }
                }
                if (targets.isEmpty()) {
                    Text("No cached conversations are available for this account yet.", color = StudioPalette.Muted, fontSize = 11.5.sp)
                }
            }
            val brightness = appearance.wallpaperBrightness.coerceIn(0f, 1.5f)
            fun brighten(color: Color): Color = Color(
                red = (color.red * brightness).coerceIn(0f, 1f),
                green = (color.green * brightness).coerceIn(0f, 1f),
                blue = (color.blue * brightness).coerceIn(0f, 1f),
                alpha = color.alpha
            )
            val surface = when (appearance.wallpaper) {
                "solid" -> brighten(parseColor(appearance.wallpaperColor))
                "gradient" -> brighten(parseColor(appearance.gradientStart))
                "photo" -> Color(0xFFE5EAE6)
                else -> brighten(if (appearance.theme == "dark") Color(0xFF18211F) else Color(0xFFE9EFEB))
            }
            Box(
                Modifier.fillMaxWidth().height(158.dp).clip(RoundedCornerShape(16.dp))
                    .background(
                        if (appearance.wallpaper == "gradient") Brush.linearGradient(
                            listOf(brighten(parseColor(appearance.gradientStart)), brighten(parseColor(appearance.gradientEnd)))
                        ) else Brush.linearGradient(listOf(surface, surface))
                    )
                    .border(1.dp, StudioPalette.Line, RoundedCornerShape(16.dp))
            ) {
                if (appearance.wallpaper == "photo" && previewBitmap != null) {
                    val matrix = ColorMatrix().apply {
                        setToScale(brightness, brightness, brightness, 1f)
                    }
                    Image(
                        previewBitmap!!,
                        null,
                        Modifier.fillMaxSize().blur(appearance.wallpaperBlur.dp),
                        contentScale = if (appearance.photoFit == "fit") ContentScale.Fit else ContentScale.Crop,
                        colorFilter = ColorFilter.colorMatrix(matrix)
                    )
                }
                Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = appearance.wallpaperDim)))
                Column(Modifier.fillMaxSize().padding(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(Modifier.size(27.dp).clip(CircleShape).background(StudioPalette.Accent), contentAlignment = Alignment.Center) {
                            Text("M", color = MaterialTheme.colorScheme.onPrimary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                            Text("Mira", color = readableForeground(surface), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Text("online · sample conversation", color = readableForeground(surface).copy(alpha = .7f), fontSize = 9.5.sp)
                        }
                        Spacer(Modifier.weight(1f))
                        Text("LIVE PREVIEW", color = readableForeground(surface).copy(alpha = .8f), fontSize = 8.5.sp, fontWeight = FontWeight.Bold)
                    }
                    Column(
                        Modifier.weight(1f).fillMaxWidth().padding(top = 6.dp, bottom = 6.dp),
                        verticalArrangement = Arrangement.spacedBy(appearance.bubbleSpacing.dp, Alignment.CenterVertically)
                    ) {
                        PreviewBubble("Got the notes. Thanks!", false, appearance)
                        PreviewBubble("Perfect — I’ll review them now.", true, appearance)
                    }
                    Box(
                        Modifier.fillMaxWidth().height(28.dp).clip(RoundedCornerShape(20.dp))
                            .background(Color.White.copy(alpha = .82f)).padding(horizontal = 12.dp),
                        contentAlignment = Alignment.CenterStart
                    ) {
                        Text("Message", color = Color(0xFF68736E), fontSize = 10.5.sp)
                    }
                }
            }
        }

        LazyColumn(
            modifier = Modifier.fillMaxWidth().weight(1f),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
        item {
            SettingSection("Wallpaper")
            SegmentRow(listOf("Default", "Solid", "Gradient", "Photo"), when (appearance.wallpaper) {
                "solid" -> "Solid"; "gradient" -> "Gradient"; "photo" -> "Photo"; else -> "Default"
            }) { change("wallpaper", when(it) { "Solid" -> "solid"; "Gradient" -> "gradient"; "Photo" -> "photo"; else -> "default" }) }
            if (appearance.wallpaper == "solid" || appearance.wallpaper == "default") {
                Text("Built-in backgrounds", color = StudioPalette.Muted, fontSize = 11.sp)
                SegmentRow(listOf("Paper", "Mist", "Sand", "Sage"), when (appearance.wallpaperColor) {
                    "#E7EAF5" -> "Mist"; "#F3E6D9" -> "Sand"; "#DCEFE5" -> "Sage"; else -> "Paper"
                }) { preset ->
                    change("wallpaper", "solid")
                    change("wallpaperColor", when (preset) {
                        "Mist" -> "#E7EAF5"; "Sand" -> "#F3E6D9"; "Sage" -> "#DCEFE5"; else -> "#E9EFEB"
                    })
                }
                ColorPalette(appearance.wallpaperColor) { change("wallpaperColor", it) }
            }
            if (appearance.wallpaper == "gradient") {
                Text("Gradient start", color = StudioPalette.Muted, fontSize = 11.sp)
                ColorPalette(appearance.gradientStart) { change("gradientStart", it) }
                Text("Gradient end", color = StudioPalette.Muted, fontSize = 11.sp)
                ColorPalette(appearance.gradientEnd) { change("gradientEnd", it) }
            }
            if (appearance.wallpaper == "photo") {
                OutlinedButton(onClick = { photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) { Text("Choose photo") }
                SegmentRow(listOf("Crop", "Fit"), if (appearance.photoFit == "fit") "Fit" else "Crop") {
                    change("photoFit", it.lowercase())
                }
            }
            ValueSlider("Blur", appearance.wallpaperBlur, 0f..24f, "dp") { change("wallpaperBlur", it.toInt().toString()) }
            ValueSlider("Dimming", appearance.wallpaperDim, 0f..0.8f, "%", 100f) { change("wallpaperDim", it.toString()) }
            ValueSlider("Wallpaper brightness", appearance.wallpaperBrightness, 0f..1.5f, "×") { change("wallpaperBrightness", it.toString()) }
        }
        item {
            SettingSection("Message bubbles")
            Text("Incoming", color = StudioPalette.Muted, fontSize = 11.sp)
            ColorPalette(appearance.incomingBubble) { change("incomingBubble", it) }
            Text("Outgoing", color = StudioPalette.Muted, fontSize = 11.sp)
            ColorPalette(appearance.outgoingBubble) { change("outgoingBubble", it) }
            ValueSlider("Corner radius", appearance.bubbleRadius.toFloat(), 8f..28f, "dp") { change("bubbleRadius", it.toInt().toString()) }
            ValueSlider("Message spacing", appearance.bubbleSpacing.toFloat(), 2f..14f, "dp") { change("bubbleSpacing", it.toInt().toString()) }
            ToggleSetting("Subtle bubble borders", appearance.bubbleBorder) { change("bubbleBorder", it.toString()) }
        }
        item {
            SettingSection("Typography")
            ValueSlider("Message size", appearance.messageSize.toFloat(), 12f..22f, "sp") { change("messageSize", it.toInt().toString()) }
            SegmentRow(listOf("Instrument", "System", "Mono"), appearance.fontFamily) { change("fontFamily", it) }
            SegmentRow(listOf("Normal", "Medium", "Bold"), appearance.fontWeight.replaceFirstChar { it.uppercase() }) {
                change("fontWeight", it.lowercase())
            }
            ValueSlider("Line spacing", appearance.lineSpacing, 0f..12f, "sp") { change("lineSpacing", it.toString()) }
        }
        item {
            SettingSection("Conversation layout")
            SegmentRow(listOf("Compact", "Comfortable", "Spacious"), appearance.density.replaceFirstChar { it.uppercase() }) {
                change("density", it.lowercase())
            }
            ToggleSetting("Show avatars", appearance.showAvatars) { change("showAvatars", it.toString()) }
            ToggleSetting("Show sender labels", appearance.showSenderLabels) { change("showSenderLabels", it.toString()) }
            ToggleSetting("Group consecutive messages", appearance.groupMessages) { change("groupMessages", it.toString()) }
            ToggleSetting("Show timestamps", appearance.showTimestamps) { change("showTimestamps", it.toString()) }
            ToggleSetting("Show date separators", appearance.showDateSeparators) { change("showDateSeparators", it.toString()) }
            ToggleSetting("Show inbox message previews", appearance.showPreviews) { change("showPreviews", it.toString()) }
        }
        item {
            SettingSection("Media")
            ValueSlider("Image and video corner radius", appearance.mediaRadius.toFloat(), 0f..24f, "dp") { change("mediaRadius", it.toInt().toString()) }
            SegmentRow(listOf("Compact", "Expanded"), appearance.attachmentStyle.replaceFirstChar { it.uppercase() }) {
                change("attachmentStyle", it.lowercase())
            }
            SegmentRow(listOf("Waveform", "Minimal"), appearance.audioStyle.replaceFirstChar { it.uppercase() }) {
                change("audioStyle", it.lowercase())
            }
            ToggleSetting("Automatically load image previews", appearance.autoDownloadImages) {
                change("autoDownloadImages", it.toString())
            }
            ToggleSetting("Automatically load video previews", appearance.autoDownloadVideoPreviews) {
                change("autoDownloadVideoPreviews", it.toString())
            }
        }
        item {
            SettingSection("Theme profiles")
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
                    .background(StudioPalette.Surface)
                    .border(1.dp, StudioPalette.Line, RoundedCornerShape(16.dp))
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text("Reusable conversation styles", color = StudioPalette.Ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    Text("Apply a preset, or save the appearance you have just built.", color = StudioPalette.Muted, fontSize = 12.sp, lineHeight = 17.sp)
                }
                Box {
                    OutlinedButton(onClick = { profileMenuOpen = true }, modifier = Modifier.fillMaxWidth()) {
                        Text(profiles.firstOrNull { it.id == selectedProfile }?.name ?: "Choose a profile")
                    }
                    DropdownMenu(expanded = profileMenuOpen, onDismissRequest = { profileMenuOpen = false }) {
                        profiles.forEach { profile ->
                            DropdownMenuItem(text = { Text(profile.name) }, onClick = {
                                selectedProfile = profile.id
                                profileMenuOpen = false
                            })
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    Button(
                        modifier = Modifier.weight(1f),
                        enabled = scope != "conversation" || layerJid != null,
                        onClick = {
                            store.applyProfile(layerAccount, layerJid, selectedProfile)
                            onChanged()
                        }
                    ) { Text("Use profile") }
                    OutlinedButton(
                        modifier = Modifier.weight(1f),
                        onClick = { dialog = "create"; profileName = "" }
                    ) { Text("Save current") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedButton(modifier = Modifier.weight(1f), onClick = {
                        runCatching { store.duplicateProfile(selectedProfile); onChanged() }
                            .onFailure { android.widget.Toast.makeText(context, it.message, android.widget.Toast.LENGTH_SHORT).show() }
                    }) { Text("Duplicate") }
                    OutlinedButton(modifier = Modifier.weight(1f), onClick = {
                        dialog = "rename"
                        profileName = profiles.firstOrNull { it.id == selectedProfile }?.name.orEmpty()
                    }) { Text("Rename") }
                    OutlinedButton(modifier = Modifier.weight(1f), onClick = {
                        runCatching { store.deleteProfile(selectedProfile); selectedProfile = "preset-classic"; onChanged() }
                            .onFailure { android.widget.Toast.makeText(context, it.message, android.widget.Toast.LENGTH_SHORT).show() }
                    }) { Text("Delete") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.fillMaxWidth()) {
                    TextButton(modifier = Modifier.weight(1f), onClick = { exportPicker.launch("aharane-chat-appearance.json") }) { Text("Export") }
                    TextButton(modifier = Modifier.weight(1f), onClick = { importPicker.launch(arrayOf("application/json", "text/json")) }) { Text("Import") }
                    TextButton(
                        modifier = Modifier.weight(1f),
                        enabled = scope != "conversation" || layerJid != null,
                        onClick = { store.reset(layerAccount, layerJid); onChanged() }
                    ) { Text("Reset layer") }
                }
            }
        }
        item { Spacer(Modifier.height(22.dp)) }
        }

    }

    if (dialog.isNotBlank()) {
        AlertDialog(
            onDismissRequest = { dialog = "" },
            title = { Text(if (dialog == "create") "Save appearance profile" else "Rename profile") },
            text = {
                TextField(value = profileName, onValueChange = { profileName = it }, singleLine = true, label = { Text("Profile name") })
            },
            confirmButton = {
                TextButton(onClick = {
                    runCatching {
                        if (dialog == "create") selectedProfile = store.saveProfile(profileName, appearance)
                        else store.renameProfile(selectedProfile, profileName)
                        onChanged()
                    }.onFailure { android.widget.Toast.makeText(context, it.message, android.widget.Toast.LENGTH_LONG).show() }
                    dialog = ""
                }) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { dialog = "" }) { Text("Cancel") } }
        )
    }
}

@Composable
private fun SettingSection(title: String) {
    Text(title, color = StudioPalette.Ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(top = 5.dp, bottom = 2.dp))
}

@Composable
private fun SegmentRow(options: List<String>, selected: String, onSelected: (String) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        options.forEach { option ->
            val active = option.equals(selected, ignoreCase = true)
            Box(
                Modifier.weight(1f).defaultMinSize(minHeight = 42.dp).clip(RoundedCornerShape(10.dp))
                    .background(if (active) StudioPalette.Soft else StudioPalette.Surface)
                    .border(1.dp, if (active) StudioPalette.Accent else StudioPalette.Line, RoundedCornerShape(10.dp))
                    .clickable { onSelected(option) }.padding(horizontal = 8.dp, vertical = 9.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(option, color = if (active) StudioPalette.Accent else StudioPalette.Ink, fontSize = 12.sp, fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1)
            }
        }
    }
}

@Composable
private fun ColorPalette(selected: String, onSelected: (String) -> Unit) {
    val colors = listOf("#FFFFFF", "#DCEFE5", "#E7EAF5", "#F3E6D9", "#E9E1F1", "#26332F", "#304B43", "#202A34")
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        colors.forEach { color ->
            val chosen = selected.equals(color, true)
            Box(
                Modifier.size(if (chosen) 34.dp else 30.dp).clip(RoundedCornerShape(50))
                    .background(parseColor(color))
                    .border(if (chosen) 2.dp else 1.dp, if (chosen) StudioPalette.Accent else StudioPalette.Line, RoundedCornerShape(50))
                    .clickable { onSelected(color) }
            )
        }
    }
}

@Composable
private fun ValueSlider(
    label: String, value: Float, range: ClosedFloatingPointRange<Float>,
    suffix: String, multiplier: Float = 1f, onChange: (Float) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label, color = StudioPalette.Ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            Text(
                String.format(java.util.Locale.ROOT, "%.1f %s", value * multiplier, suffix),
                color = StudioPalette.Accent,
                fontSize = 11.5.sp,
                fontWeight = FontWeight.SemiBold
            )
        }
        Slider(
            value = value.coerceIn(range),
            onValueChange = onChange,
            valueRange = range,
            modifier = Modifier.fillMaxWidth().height(48.dp),
            colors = androidx.compose.material3.SliderDefaults.colors(
                thumbColor = StudioPalette.Accent,
                activeTrackColor = StudioPalette.Accent,
                inactiveTrackColor = StudioPalette.Line
            )
        )
    }
}

@Composable
private fun ToggleSetting(title: String, checked: Boolean, onChecked: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = StudioPalette.Ink, fontSize = 12.5.sp, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChecked)
    }
}

@Composable
private fun PreviewBubble(text: String, outgoing: Boolean, appearance: ChatAppearance) {
    val background = parseColor(if (outgoing) appearance.outgoingBubble else appearance.incomingBubble)
    val foreground = readableForeground(background)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (outgoing) Arrangement.End else Arrangement.Start) {
        Text(
            text,
            color = foreground,
            fontSize = appearance.messageSize.sp,
            lineHeight = (appearance.messageSize + appearance.lineSpacing).sp,
            fontWeight = when (appearance.fontWeight) {
                "bold" -> FontWeight.Bold
                "medium" -> FontWeight.Medium
                else -> FontWeight.Normal
            },
            fontFamily = when (appearance.fontFamily) {
                "Mono" -> androidx.compose.ui.text.font.FontFamily.Monospace
                "System" -> androidx.compose.ui.text.font.FontFamily.SansSerif
                else -> AharaneInstrumentSans
            },
            modifier = Modifier.widthIn(max = 265.dp).clip(RoundedCornerShape(appearance.bubbleRadius.dp))
                .background(background)
                .then(if (appearance.bubbleBorder) Modifier.border(1.dp, StudioPalette.Line, RoundedCornerShape(appearance.bubbleRadius.dp)) else Modifier)
                .padding(horizontal = 12.dp, vertical = 8.dp)
        )
    }
}

private fun parseColor(value: String): Color =
    runCatching { Color(android.graphics.Color.parseColor(value)) }.getOrDefault(Color(0xFFE9EFEB))

private fun readableForeground(background: Color): Color {
    fun linear(channel: Float): Float = if (channel <= .04045f) channel / 12.92f else Math.pow(((channel + .055f) / 1.055f).toDouble(), 2.4).toFloat()
    val luminance = .2126f * linear(background.red) + .7152f * linear(background.green) + .0722f * linear(background.blue)
    val whiteContrast = 1.05f / (luminance + .05f)
    val blackContrast = (luminance + .05f) / .05f
    return if (blackContrast >= whiteContrast) Color(0xFF101713) else Color.White
}
