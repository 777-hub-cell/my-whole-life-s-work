package com.aharane.studio.features.whatsapp

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.StudioActionButton
import com.aharane.studio.core.design.StudioEmpty
import com.aharane.studio.core.design.StudioErrorState
import com.aharane.studio.core.design.StudioLoadingState
import com.aharane.studio.core.design.StudioPalette
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.network.AharaneRepository
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date

/** Shows only real Channels followed by the selected WhatsApp account. */
@Composable
fun WhatsAppUpdatesScreen(
    repository: AharaneRepository,
    selectedAccount: ChatAccount,
    onAccountSelected: (ChatAccount) -> Unit,
    onBack: () -> Unit,
    connected: Boolean = false
) {
    val scope = rememberCoroutineScope()
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
        if (!connected) {
            channelRows = emptyList()
            chosenChannel = ""
            updateRows = emptyList()
            explanation = "Connect to your Aharane server and pair a WhatsApp account to browse Channels."
            error = ""
            loading = false
            return
        }
        loading = true
        error = ""
        try {
            val response = repository.whatsappChannels(selectedAccount)
            channelRows = rows(response, "channels")
            explanation = if (!response.optBoolean("supported", false)) {
                response.optString("reason")
            } else {
                "Only Channels followed by this WhatsApp account are shown."
            }
        } catch (failure: Exception) {
            error = failure.message ?: "Channels could not be loaded."
        } finally {
            loading = false
        }
    }

    LaunchedEffect(selectedAccount, connected) {
        channelRows = emptyList()
        chosenChannel = ""
        updateRows = emptyList()
        refresh()
    }

    Column(
        Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onBack) { Text("Back") }
            Text(
                "Channels",
                fontWeight = FontWeight.Bold,
                fontSize = 18.sp,
                color = StudioPalette.Ink,
                modifier = Modifier.padding(top = 12.dp)
            )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ChatAccount.entries.forEach { account ->
                OutlinedButton(onClick = { onAccountSelected(account) }) {
                    Text(if (selectedAccount == account) "✓ " + account.label else account.label)
                }
            }
            Spacer(Modifier.weight(1f))
            StudioActionButton(
                label = if (loading) "Loading…" else "Refresh",
                compact = true,
                enabled = !loading,
                onClick = { scope.launch { refresh() } }
            )
        }

        if (explanation.isNotBlank()) {
            Text(explanation, color = StudioPalette.Muted, fontSize = 12.sp)
        }

        when {
            !connected -> StudioEmpty(
                title = "Connect a paired WhatsApp account to browse Channels.",
                description = explanation
            )
            error.isNotBlank() -> StudioErrorState(
                title = "Channels could not be loaded",
                description = error,
                onRetry = { scope.launch { refresh() } }
            )
            loading -> StudioLoadingState("Loading Channels…")
            chosenChannel.isNotBlank() -> {
                OutlinedButton(
                    onClick = { chosenChannel = ""; updateRows = emptyList() }
                ) { Text("All subscribed Channels") }
                if (updateRows.isEmpty()) {
                    StudioEmpty("No accessible updates.")
                } else {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(updateRows) { update ->
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    update.optString("text").ifBlank {
                                        update.optString("mediaKind").replaceFirstChar { it.uppercase() } +
                                            " update — media preview is not available."
                                    },
                                    color = StudioPalette.Ink
                                )
                                Text(
                                    DateFormat.getDateTimeInstance().format(Date(update.optLong("timestampMillis"))),
                                    color = StudioPalette.Muted,
                                    fontSize = 11.sp
                                )
                            }
                        }
                    }
                }
            }
            channelRows.isEmpty() -> StudioEmpty(
                title = "No subscribed Channels are available for this account.",
                description = explanation
            )
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
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
                                } catch (failure: Exception) {
                                    error = failure.message ?: "Channel updates could not be loaded."
                                } finally {
                                    loading = false
                                }
                            }
                        }.padding(vertical = 9.dp),
                        verticalArrangement = Arrangement.spacedBy(3.dp)
                    ) {
                        Text(
                            row.optString("name"),
                            fontWeight = FontWeight.SemiBold,
                            color = StudioPalette.Ink
                        )
                        Text(row.optString("description"), color = StudioPalette.Muted, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}
