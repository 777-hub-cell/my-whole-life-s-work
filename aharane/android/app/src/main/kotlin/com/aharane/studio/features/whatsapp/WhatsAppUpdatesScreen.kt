package com.aharane.studio.features.whatsapp

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aharane.studio.core.design.StudioActionButton
import com.aharane.studio.core.design.StudioDivider
import com.aharane.studio.core.design.StudioEmpty
import com.aharane.studio.core.design.StudioErrorState
import com.aharane.studio.core.design.StudioLoadingState
import com.aharane.studio.core.design.StudioPageTitle
import com.aharane.studio.core.design.StudioPalette
import com.aharane.studio.core.design.StudioRow
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

    fun openChannel(row: JSONObject) {
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
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            StudioActionButton(label = "Close", compact = true, onClick = onBack)
            Column(Modifier.weight(1f)) {
                StudioPageTitle(
                    title = "Channels",
                    subtitle = "Followed Channels for the selected account",
                    compact = true
                )
            }
        }

        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            ChatAccount.entries.forEach { account ->
                StudioActionButton(
                    label = account.label,
                    compact = true,
                    primary = selectedAccount == account,
                    onClick = { onAccountSelected(account) }
                )
            }
            Spacer(Modifier.weight(1f))
            StudioActionButton(
                label = if (loading) "Loading…" else "Refresh",
                compact = true,
                enabled = connected && !loading,
                onClick = { scope.launch { refresh() } }
            )
        }

        if (explanation.isNotBlank() && (chosenChannel.isNotBlank() || channelRows.isNotEmpty())) {
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
                StudioActionButton(
                    label = "All subscribed Channels",
                    compact = true,
                    onClick = { chosenChannel = ""; updateRows = emptyList() }
                )
                if (updateRows.isEmpty()) {
                    StudioEmpty("No accessible updates.")
                } else {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(0.dp)) {
                        items(updateRows) { update ->
                            val title = update.optString("text").ifBlank {
                                update.optString("mediaKind").replaceFirstChar { it.uppercase() } +
                                    " update — media preview is not available."
                            }
                            StudioRow(
                                title = title,
                                subtitle = DateFormat.getDateTimeInstance().format(
                                    Date(update.optLong("timestampMillis"))
                                )
                            )
                            StudioDivider()
                        }
                    }
                }
            }
            channelRows.isEmpty() -> StudioEmpty(
                title = "No subscribed Channels are available for this account.",
                description = explanation
            )
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(0.dp)) {
                items(channelRows, key = { it.optString("jid") }) { row ->
                    StudioRow(
                        title = row.optString("name").ifBlank { "Channel" },
                        subtitle = row.optString("description"),
                        trailing = "›",
                        onClick = { openChannel(row) }
                    )
                    StudioDivider()
                }
            }
        }
    }
}
