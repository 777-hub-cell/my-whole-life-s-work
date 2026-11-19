package com.aharane.studio

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.weight
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.material3.MaterialTheme
import com.aharane.studio.core.design.StudioBottomNavigation
import com.aharane.studio.core.design.StudioHeader
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

    Column(
        Modifier.fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.statusBars)
    ) {
        StudioHeader(onStatusClick = { destinationName = MainDestination.HOME.name })

        Box(Modifier.weight(1f).fillMaxWidth()) {
            when (destination) {
                MainDestination.HOME -> HomeScreen(
                    onOpenChats = { destinationName = MainDestination.CHATS.name },
                    onOpenMore = { destinationName = MainDestination.MORE.name }
                )
                MainDestination.CHATS -> ChatsScreen(
                    account = account,
                    onAccountSelected = { accountName = it.name },
                    filter = filter,
                    onFilterSelected = { filterName = it.name }
                )
                MainDestination.FILES -> FilesScreen()
                MainDestination.ENVIRONMENT -> EnvironmentScreen()
                MainDestination.MORE -> MoreScreen()
            }
        }

        StudioBottomNavigation(
            selected = destination,
            onNavigate = { destinationName = it.name }
        )
    }
}
