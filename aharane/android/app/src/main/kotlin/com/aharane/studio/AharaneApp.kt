package com.aharane.studio

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.graphics.Color
import androidx.compose.material3.MaterialTheme
import com.aharane.studio.core.design.*
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.model.ChatFilter
import com.aharane.studio.core.navigation.MainDestination
import com.aharane.studio.features.chats.ChatsScreen
import com.aharane.studio.features.environment.EnvironmentScreen
import com.aharane.studio.features.files.FilesScreen
import com.aharane.studio.features.home.HomeScreen
import com.aharane.studio.features.more.MoreScreen

@Composable
fun AharaneApp(
    themeMode: String,
    onThemeModeChanged: (String) -> Unit
) {
    var destinationName by rememberSaveable { mutableStateOf(MainDestination.HOME.name) }
    var accountName by rememberSaveable { mutableStateOf(ChatAccount.PRIVATE.name) }
    var filterName by rememberSaveable { mutableStateOf(ChatFilter.ALL.name) }
    var editorOpen by rememberSaveable { mutableStateOf(false) }
    var configurationOpen by rememberSaveable { mutableStateOf(false) }

    val destination = MainDestination.valueOf(destinationName)
    val account = ChatAccount.valueOf(accountName)
    val filter = ChatFilter.valueOf(filterName)

    Column(
        Modifier.fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.statusBars)
    ) {
        if (!editorOpen) {
            StudioHeader(onStatusClick = { destinationName = MainDestination.HOME.name })
        }

        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (editorOpen) {
                com.aharane.studio.features.files.CodeEditorScreen(
                    modifier = Modifier.fillMaxSize(),
                    onClose = { editorOpen = false }
                )
            } else when (destination) {
                MainDestination.HOME -> HomeScreen(
                    onOpenChats = { destinationName = MainDestination.CHATS.name },
                    onOpenMore = { destinationName = MainDestination.MORE.name },
                    onOpenConfiguration = { configurationOpen = true }
                )
                MainDestination.CHATS -> ChatsScreen(
                    account = account,
                    onAccountSelected = { accountName = it.name },
                    filter = filter,
                    onFilterSelected = { filterName = it.name }
                )
                MainDestination.FILES -> FilesScreen(onEditorVisibility = { editorOpen = it })
                MainDestination.ENVIRONMENT -> EnvironmentScreen()
                MainDestination.MORE -> MoreScreen(
                    themeMode = themeMode,
                    onThemeModeChanged = onThemeModeChanged
                )
            }
        }

        if (!editorOpen) {
            StudioBottomNavigation(
                selected = destination,
                onNavigate = {
                    configurationOpen = false
                    destinationName = it.name
                }
            )
        }
    }

    if (configurationOpen) {
        Dialog(onDismissRequest = { configurationOpen = false }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
                    .background(MaterialTheme.colorScheme.surface).padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    "Configuration",
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    "Prefix, access and bot behaviour",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp
                )
                Box(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.background).padding(14.dp)
                ) {
                    Text(
                        "Connect your Aharane server to load and edit the live Private and Public configuration. No server values are available in this app yet.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 13.sp,
                        lineHeight = 19.sp
                    )
                }
                StudioActionButton(
                    "Close",
                    primary = true,
                    modifier = Modifier.align(Alignment.End),
                    onClick = { configurationOpen = false }
                )
            }
        }
    }
}
