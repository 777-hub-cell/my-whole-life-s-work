package com.aharane.studio
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import com.aharane.studio.core.model.ChatAccount
import com.aharane.studio.core.model.ChatFilter
import com.aharane.studio.core.navigation.MainDestination
import com.aharane.studio.features.chats.ChatsScreen
import com.aharane.studio.features.environment.EnvironmentScreen
import com.aharane.studio.features.files.FilesScreen
import com.aharane.studio.features.home.HomeScreen
import com.aharane.studio.features.more.MoreScreen

@Composable
fun AharaneApp() {
    var destinationName by rememberSaveable { mutableStateOf(MainDestination.HOME.name) }
    var accountName by rememberSaveable { mutableStateOf(ChatAccount.PRIVATE.name) }
    var filterName by rememberSaveable { mutableStateOf(ChatFilter.ALL.name) }
    val destination = MainDestination.valueOf(destinationName)
    val account = ChatAccount.valueOf(accountName)
    val filter = ChatFilter.valueOf(filterName)

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Aharane", style = MaterialTheme.typography.titleLarge) },
                actions = {
                    IconButton(onClick = { destinationName = MainDestination.MORE.name }) {
                        Icon(Icons.Outlined.Settings, contentDescription = "Open settings")
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                MainDestination.entries.forEach { item ->
                    NavigationBarItem(
                        selected = destination == item,
                        onClick = { destinationName = item.name },
                        icon = { Icon(destinationIcon(item), contentDescription = null) },
                        label = { Text(item.label) }
                    )
                }
            }
        }
    ) {
        Box(Modifier.fillMaxSize()) {
            when (destination) {
                MainDestination.HOME -> HomeScreen(
                    { destinationName = MainDestination.CHATS.name },
                    { destinationName = MainDestination.MORE.name }
                )
                MainDestination.CHATS -> ChatsScreen(
                    account, { accountName = it.name }, filter, { filterName = it.name }
                )
                MainDestination.FILES -> FilesScreen()
                MainDestination.ENVIRONMENT -> EnvironmentScreen()
                MainDestination.MORE -> MoreScreen()
            }
        }
    }
}
private fun destinationIcon(destination: MainDestination): ImageVector = when (destination) {
    MainDestination.HOME -> Icons.Outlined.Home
    MainDestination.CHATS -> Icons.Outlined.ChatBubbleOutline
    MainDestination.FILES -> Icons.Outlined.FolderOpen
    MainDestination.ENVIRONMENT -> Icons.Outlined.Terminal
    MainDestination.MORE -> Icons.Outlined.MoreHoriz
}
