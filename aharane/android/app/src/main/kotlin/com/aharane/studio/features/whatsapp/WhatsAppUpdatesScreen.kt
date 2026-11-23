package com.aharane.studio.features.whatsapp

import android.content.Intent
import android.graphics.BitmapFactory
import androidx.core.content.FileProvider
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.window.Dialog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.StudioPalette
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.network.AharaneRepository
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date

/** Only real content returned by each WhatsApp account is ever displayed. */
@Composable
fun WhatsAppUpdatesScreen(
    repository: AharaneRepository,
    selectedAccount: ChatAccount,
    onAccountSelected: (ChatAccount) -> Unit,
    onBack: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var mediaImage by remember { mutableStateOf<ImageBitmap?>(null) }
    var mediaError by remember { mutableStateOf("") }
    var mediaLoading by remember { mutableStateOf(false) }
    fun openStatusMedia(row: JSONObject) {
        val kind = row.optString("mediaKind")
        if (kind == "text") return
        scope.launch {
            mediaLoading = true
            mediaError = ""
            try {
                val bytes = repository.whatsappStatusMedia(
                    selectedAccount, row.optString("senderJid"), row.optString("id")
                )
                if (kind == "image" || kind == "sticker") {
                    mediaImage = withContext(Dispatchers.Default) {
                        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
                    } ?: throw IllegalStateException("The WhatsApp picture is damaged.")
                } else {
                    val extension = when (kind) { "video" -> "mp4"; else -> "ogg" }
                    val file = withContext(Dispatchers.IO) {
                        java.io.File(context.cacheDir, "shared-media").apply { mkdirs() }
                            .resolve("status-preview.$extension").also { it.writeBytes(bytes) }
                    }
                    val uri = FileProvider.getUriForFile(context,
                        context.packageName + ".files", file)
                    val intent = Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(uri, if (kind == "video") "video/mp4" else "audio/ogg")
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    context.startActivity(intent)
                }
            } catch (e: Exception) {
                mediaError = e.message ?: "This WhatsApp Status media is unavailable."
            } finally { mediaLoading = false }
        }
    }
    var page by remember { mutableStateOf("Status") }
    var statusRows by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var channelRows by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var updateRows by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var chosenChannel by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var explanation by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    fun rows(payload: JSONObject, key: String): List<JSONObject> {
        val array = payload.optJSONArray(key) ?: return emptyList()
        return (0 until array.length()).mapNotNull { array.optJSONObject(it) }
    }
    suspend fun refresh() {
        loading = true
        error = ""
        try {
            if (page == "Status") {
                val response = repository.whatsappStatuses(selectedAccount)
                statusRows = rows(response, "entries")
                explanation = response.optString("limitation")
            } else {
                val response = repository.whatsappChannels(selectedAccount)
                channelRows = rows(response, "channels")
                explanation = if (!response.optBoolean("supported", false))
                    response.optString("reason") else "Only Channels followed by this WhatsApp account are shown."
            }
        } catch (e: Exception) {
            error = e.message ?: "WhatsApp updates could not be loaded."
        } finally {
            loading = false
        }
    }
    LaunchedEffect(page, selectedAccount) {
        statusRows = emptyList()
        channelRows = emptyList()
        chosenChannel = ""
        updateRows = emptyList()
        refresh()
    }
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onBack) { Text("Back") }
            Text("WhatsApp updates", fontWeight = FontWeight.Bold, fontSize = 18.sp,
                color = StudioPalette.Ink, modifier = Modifier.padding(top = 12.dp))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ChatAccount.entries.forEach { account ->
                OutlinedButton(onClick = { onAccountSelected(account) }) {
                    Text(if (selectedAccount == account) "✓ " + account.label else account.label)
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Status", "Channels").forEach { option ->
                OutlinedButton(onClick = { page = option }) {
                    Text(if (page == option) "✓ $option" else option)
                }
            }
            Button(onClick = { scope.launch { refresh() } }, enabled = !loading) {
                Text(if (loading) "Loading…" else "Refresh")
            }
        }
        if (error.isNotBlank()) Text(error, color = StudioPalette.Bad)
        if (mediaError.isNotBlank()) Text(mediaError, color = StudioPalette.Bad)
        if (mediaLoading) Text("Loading received WhatsApp media…", color = StudioPalette.Muted)
        if (explanation.isNotBlank()) Text(explanation, color = StudioPalette.Muted, fontSize = 12.sp)
        if (page == "Status") {
            if (statusRows.isEmpty() && !loading) {
                Text("No currently received statuses for this account.", color = StudioPalette.Muted)
            }
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(statusRows, key = { it.optString("senderJid") + ":" + it.optString("id") }) { row ->
                    Column(
                        Modifier.fillMaxWidth()
                            .clickable(enabled = row.optString("mediaKind") != "text") {
                                openStatusMedia(row)
                            },
                        verticalArrangement = Arrangement.spacedBy(5.dp)
                    ) {
                        Text(row.optString("senderJid").substringBefore('@'), fontWeight = FontWeight.SemiBold, color = StudioPalette.Ink)
                        Text(row.optString("text").ifBlank {
                            row.optString("mediaKind").replaceFirstChar { it.uppercase() } + " status · Tap to view"
                        }, color = StudioPalette.Muted)
                        Text(DateFormat.getDateTimeInstance().format(Date(row.optLong("timestampMillis"))),
                            color = StudioPalette.Muted, fontSize = 11.sp)
                    }
                }
            }
        } else {
            if (chosenChannel.isNotBlank()) {
                OutlinedButton(onClick = { chosenChannel = ""; updateRows = emptyList() }) { Text("All subscribed Channels") }
                if (updateRows.isEmpty() && !loading) Text("No accessible updates.", color = StudioPalette.Muted)
                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(updateRows) { update ->
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(update.optString("text").ifBlank {
                                update.optString("mediaKind").replaceFirstChar { it.uppercase() } +
                                    " update — media preview is not available."
                            }, color = StudioPalette.Ink)
                            Text(DateFormat.getDateTimeInstance().format(Date(update.optLong("timestampMillis"))),
                                color = StudioPalette.Muted, fontSize = 11.sp)
                        }
                    }
                }
            } else {
                if (channelRows.isEmpty() && !loading) Text("No subscribed Channels are available for this account.", color = StudioPalette.Muted)
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(channelRows, key = { it.optString("jid") }) { row ->
                        Column(
                            Modifier.fillMaxWidth().clickable {
                                val jid = row.optString("jid")
                                scope.launch {
                                    loading = true
                                    error = ""
                                    try {
                                        val response = repository.whatsappChannelUpdates(selectedAccount, jid)
                                        chosenChannel = jid
                                        updateRows = rows(response, "updates")
                                        explanation = response.optString("reason").ifBlank {
                                            "Updates received from the selected authenticated WhatsApp account."
                                        }
                                    } catch (e: Exception) {
                                        error = e.message ?: "Channel updates could not be loaded."
                                    } finally { loading = false }
                                }
                            }.padding(vertical = 9.dp),
                            verticalArrangement = Arrangement.spacedBy(3.dp)
                        ) {
                            Text(row.optString("name"), fontWeight = FontWeight.SemiBold, color = StudioPalette.Ink)
                            Text(row.optString("description"), color = StudioPalette.Muted, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
    if (mediaImage != null) {
        Dialog(onDismissRequest = { mediaImage = null }) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Image(
                    bitmap = mediaImage!!, contentDescription = "Received WhatsApp Status picture",
                    modifier = Modifier.fillMaxWidth().heightIn(max = 440.dp), contentScale = ContentScale.Fit
                )
                OutlinedButton(onClick = { mediaImage = null }) { Text("Close") }
            }
        }
    }

}
