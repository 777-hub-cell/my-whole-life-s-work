package com.vistora.android.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vistora.android.data.backup.VistoraBackup
import com.vistora.android.data.security.TmdbCredentialVault
import com.vistora.android.data.media.PosterDownloader
import com.vistora.android.data.preferences.VistoraPreferences
import com.vistora.android.data.preferences.VistoraPreferencesStore
import com.vistora.android.domain.LibraryStatus
import com.vistora.android.domain.MediaItem
import com.vistora.android.domain.MediaType
import com.vistora.android.domain.LibrarySnapshot
import com.vistora.android.domain.TrackedDate
import com.vistora.android.domain.CatalogResult
import com.vistora.android.VistoraApplication
import com.vistora.android.ui.components.StatusLabel
import com.vistora.android.ui.components.VistoraAction
import com.vistora.android.ui.components.VistoraBottomBar
import com.vistora.android.ui.components.VistoraIcon
import com.vistora.android.ui.components.VistoraSheet
import com.vistora.android.ui.screens.AllNotesScreen
import com.vistora.android.ui.screens.DiscoverScreen
import com.vistora.android.ui.screens.HomeScreen
import com.vistora.android.ui.screens.LibraryFilters
import com.vistora.android.ui.screens.LibraryScreen
import com.vistora.android.ui.screens.SettingsScreen
import com.vistora.android.ui.screens.StatsScreen
import com.vistora.android.ui.screens.TitleDetailsScreen
import com.vistora.android.ui.screens.TitleEditorSheet
import com.vistora.android.ui.theme.VistoraBackdrop
import com.vistora.android.ui.theme.VistoraPalette
import com.vistora.android.ui.theme.VistoraTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun VistoraApp(viewModel: VistoraViewModel) {
    val context = LocalContext.current
    val store = remember { VistoraPreferencesStore(context.applicationContext) }
    val preferences by store.preferences.collectAsStateWithLifecycle(initialValue = VistoraPreferences())
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val application = context.applicationContext as VistoraApplication
    val repository = remember { application.libraryRepository }
    var tmdbCredential by remember { mutableStateOf<String?>(null) }
    var tmdbConfigured by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val stored = TmdbCredentialVault.read(context)
        tmdbCredential = stored
        tmdbConfigured = !stored.isNullOrBlank()
    }

    var route by rememberSaveable { mutableStateOf("Home") }
    var selectedId by rememberSaveable { mutableStateOf<Long?>(null) }
    var detailReturnRoute by rememberSaveable { mutableStateOf("Library") }
    var episodeToOpen by rememberSaveable { mutableStateOf<Int?>(null) }
    var editorVisible by rememberSaveable { mutableStateOf(false) }
    var editorInitial by remember { mutableStateOf<MediaItem?>(null) }
    var filtersVisible by rememberSaveable { mutableStateOf(false) }
    var gridVisible by rememberSaveable { mutableStateOf(false) }
    var sortVisible by rememberSaveable { mutableStateOf(false) }
    var notificationsVisible by rememberSaveable { mutableStateOf(false) }
    var resetVisible by rememberSaveable { mutableStateOf(false) }
    var restoreCandidate by remember { mutableStateOf<LibrarySnapshot?>(null) }
    var filters by remember { mutableStateOf(LibraryFilters()) }
    var sort by rememberSaveable { mutableStateOf("Recently updated") }

    val selectedItem = uiState.items.firstOrNull { it.id == selectedId }

    val backupLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/zip")
    ) { uri ->
        if (uri != null) {
            scope.launch {
                runCatching {
                    val snapshot = repository.exportSnapshot()
                    VistoraBackup.export(context, uri, snapshot)
                }.onSuccess { viewModel.showMessage("Backup exported successfully") }
                    .onFailure { viewModel.showMessage(it.message ?: "Backup export failed") }
            }
        }
    }
    val restoreLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            scope.launch {
                runCatching { VistoraBackup.import(context, uri) }
                    .onSuccess { candidate ->
                        restoreCandidate = candidate
                    }
                    .onFailure { viewModel.showMessage(it.message ?: "This backup couldn't be restored") }
            }
        }
    }
    LaunchedEffect(selectedId) {
        selectedId?.let(viewModel::observeNotes)
    }
    LaunchedEffect(uiState.message) {
        if (uiState.message != null) {
            delay(2600)
            viewModel.clearMessage()
        }
    }

    BackHandler(enabled = route == "Title Details" || route == "My Notes" || editorVisible || filtersVisible || gridVisible || sortVisible || notificationsVisible || resetVisible) {
        when {
            editorVisible -> editorVisible = false
            filtersVisible -> filtersVisible = false
            gridVisible -> gridVisible = false
            sortVisible -> sortVisible = false
            notificationsVisible -> notificationsVisible = false
            resetVisible -> resetVisible = false
            else -> route = if (route == "My Notes") "Settings" else detailReturnRoute
        }
    }

    VistoraTheme(accent = preferences.accent) {
    VistoraBackdrop {
        Column(
            Modifier.align(Alignment.Center).widthIn(max=520.dp).fillMaxWidth()
                .fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)
        ) {
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when (route) {
                    "Home" -> HomeScreen(
                        items = uiState.items,
                        onSearch = { route = "Library" },
                        onDiscover = { route = "Discover" },
                        onNotifications = { notificationsVisible = true },
                        onOpenTitle = { detailReturnRoute = "Home"; episodeToOpen = null; selectedId = it; route = "Title Details" },
                        onOpenCategory = { type ->
                            filters = LibraryFilters(types = setOf(type))
                            route = "Library"
                        },
                        onOpenStatus = { status ->
                            filters = LibraryFilters(statuses = setOf(status))
                            route = "Library"
                        }
                    )
                    "Library" -> LibraryScreen(
                        items = uiState.items,
                        filters = filters,
                        gridColumns = preferences.gridColumns,
                        sort = sort,
                        onSortChange = { sortVisible = true },
                        onOpenTitle = { detailReturnRoute = "Library"; episodeToOpen = null; selectedId = it; route = "Title Details" },
                        onAdd = { detailReturnRoute = "Library"; editorInitial = null; editorVisible = true },
                        onFilters = { filtersVisible = true },
                        onGridColumns = { gridVisible = true },
                        onQuickStatusChange = { status ->
                            filters = filters.copy(statuses = if (status == null) emptySet() else setOf(status))
                        },
                        onFiltersChange = { filters = it }
                    )
                    "Discover" -> DiscoverScreen(
                        library = uiState.items,
                        searchState = uiState.catalog,
                        tmdbConfigured = tmdbConfigured,
                        onSearch = { query, type -> viewModel.searchCatalog(query, type, tmdbCredential) },
                        onClearSearch = viewModel::clearCatalogSearch,
                        onAdd = { result: CatalogResult ->
                            detailReturnRoute = "Discover"
                            episodeToOpen = null
                            scope.launch {
                                val localPoster = result.posterUrl?.let { PosterDownloader.cache(context, it) }
                                editorInitial = result.toDraft().copy(posterPath = localPoster ?: result.posterUrl)
                                editorVisible = true
                            }
                        }
                    )
                    "Stats" -> StatsScreen(items = uiState.items)
                    "My Notes" -> AllNotesScreen(
                        items = uiState.items,
                        episodeNotes = uiState.allEpisodeNotes,
                        onBack = { route = "Settings" },
                        onOpenNote = { mediaId, episode ->
                            selectedId = mediaId
                            episodeToOpen = episode.takeIf { it > 0 }
                            detailReturnRoute = "My Notes"
                            route = "Title Details"
                        }
                    )
                    "Settings" -> SettingsScreen(
                        preferences = preferences,
                        titleCount = uiState.items.size,
                        tmdbConfigured = tmdbConfigured,
                        notesCount = uiState.allEpisodeNotes.size + uiState.items.count { it.overallThoughts.isNotBlank() },
                        onOpenNotes = { route = "My Notes" },
                        onGrid = { value -> scope.launch { store.setGridColumns(value) } },
                        onAccent = { value -> scope.launch { store.setAccent(value) } },
                        onSaveTmdb = { value ->
                            scope.launch {
                                runCatching { TmdbCredentialVault.save(context, value) }
                                    .onSuccess {
                                        tmdbCredential = value.trim()
                                        tmdbConfigured = true
                                        viewModel.showMessage("TMDB credential saved securely")
                                    }
                                    .onFailure { viewModel.showMessage(it.message ?: "Couldn't save the credential") }
                            }
                        },
                        onRemoveTmdb = {
                            scope.launch {
                                TmdbCredentialVault.clear(context)
                                tmdbCredential = null
                                tmdbConfigured = false
                                viewModel.showMessage("TMDB credential removed")
                            }
                        },
                        onTestTmdb = { value -> viewModel.testTmdbCredential(value) },
                        onBackup = { backupLauncher.launch("VISTORA-backup.zip") },
                        onRestore = { restoreLauncher.launch(arrayOf("application/zip")) },
                        onReset = { resetVisible = true }
                    )
                    "Title Details" -> {
                        if (selectedItem == null) {
                            Column(Modifier.fillMaxSize().padding(24.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center) {
                                Text("This title is no longer in your library.",color=VistoraPalette.Secondary)
                                VistoraAction("Back to Library",{route="Library"},Modifier.padding(top=12.dp))
                            }
                        } else {
                            TitleDetailsScreen(
                                item = selectedItem,
                                episodeNotes = if (uiState.notesForMediaId == selectedItem.id) uiState.episodeNotes else emptyList(),
                                initialEpisode = episodeToOpen,
                                onBack = { route = detailReturnRoute; episodeToOpen = null },
                                onStatusChange = { viewModel.setStatus(selectedItem.id,it) },
                                onProgressChange = { viewModel.changeProgress(selectedItem.id,it) },
                                onRatingChange = { viewModel.setRating(selectedItem.id,it) },
                                onDateChange = { kind, timestamp -> viewModel.setTrackedDate(selectedItem.id,kind,timestamp) },
                                onSaveEpisodeNote = { episode,body -> viewModel.saveEpisodeNote(selectedItem.id,episode,body) },
                                onDeleteEpisodeNote = { episode -> viewModel.deleteEpisodeNote(selectedItem.id,episode) },
                                onSaveOverallThoughts = { viewModel.saveOverallThoughts(selectedItem.id,it) },
                                onEdit = { editorInitial = selectedItem; editorVisible = true },
                                onDelete = { viewModel.deleteItem(selectedItem.id); selectedId = null; route = "Library" }
                            )
                        }
                    }
                }
            }
            if (route != "Title Details" && route != "My Notes") {
                VistoraBottomBar(selected = route, onSelect = { route = it })
            }
        }

        if (uiState.message != null) {
            Row(
                Modifier.align(Alignment.BottomCenter).padding(bottom=if(route=="Title Details")26.dp else 82.dp)
                    .clip(RoundedCornerShape(14.dp)).background(Color(0xFFF0EBEC)).padding(horizontal=17.dp,vertical=12.dp),
                verticalAlignment=Alignment.CenterVertically
            ) {
                Text(uiState.message.orEmpty(),color=Color(0xFF19191D),fontSize=13.sp,fontWeight=FontWeight.Medium)
            }
        }
    }

    if (editorVisible) {
        VistoraSheet(onDismiss = { editorVisible = false }) {
            TitleEditorSheet(
                initial = editorInitial,
                onDismiss = { editorVisible = false },
                onSave = { draft ->
                    viewModel.saveItem(draft) { id ->
                        editorVisible = false
                        selectedId = id
                        route = "Title Details"
                    }
                }
            )
        }
    }

    if (filtersVisible) {
        VistoraSheet(onDismiss = { filtersVisible = false }) {
            FilterSheet(
                filters = filters,
                onChange = { filters = it },
                onClear = { filters = LibraryFilters() },
                onDone = { filtersVisible = false }
            )
        }
    }
    if (gridVisible) {
        VistoraSheet(onDismiss = { gridVisible = false }) {
            Column(Modifier.fillMaxWidth().padding(horizontal=20.dp).padding(bottom=22.dp)) {
                Text("Poster layout",color=VistoraPalette.Text,style=androidx.compose.material3.MaterialTheme.typography.headlineMedium)
                Text("Choose how many posters fit across the Library.",color=VistoraPalette.Muted,fontSize=13.sp,modifier=Modifier.padding(top=5.dp,bottom=16.dp))
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                    (2..5).forEach { count ->
                        val selected = preferences.gridColumns == count
                        Box(Modifier.weight(1f).height(48.dp).clip(RoundedCornerShape(11.dp))
                            .background(if(selected)VistoraPalette.Burgundy else VistoraPalette.Surface)
                            .clickable { scope.launch { store.setGridColumns(count) }; gridVisible=false },
                            contentAlignment=Alignment.Center) {
                            Text("$count",color=if(selected)VistoraPalette.OnAccent else VistoraPalette.Secondary,fontSize=15.sp,fontWeight=FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }
    if (sortVisible) {
        VistoraSheet(onDismiss = { sortVisible = false }) {
            Column(Modifier.fillMaxWidth().padding(horizontal=20.dp).padding(bottom=22.dp)) {
                Text("Sort library",color=VistoraPalette.Text,style=androidx.compose.material3.MaterialTheme.typography.headlineMedium)
                listOf("Recently updated","Recently added","Title A–Z","Title Z–A","Highest rated","Newest release").forEach { option ->
                    Row(Modifier.fillMaxWidth().heightIn(min=50.dp).clickable { sort=option;sortVisible=false }.padding(horizontal=4.dp),
                        verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.SpaceBetween) {
                        Text(option,color=if(sort==option)VistoraPalette.Rose else VistoraPalette.Secondary,fontSize=14.sp)
                        if(sort==option)VistoraIcon("check",Modifier.size(18.dp),VistoraPalette.Rose)
                    }
                }
            }
        }
    }
    if (notificationsVisible) {
        VistoraSheet(onDismiss = { notificationsVisible = false }) {
            Column(Modifier.fillMaxWidth().padding(horizontal=20.dp).padding(bottom=22.dp)) {
                Text("Reminders",color=VistoraPalette.Text,style=androidx.compose.material3.MaterialTheme.typography.headlineMedium)
                Text("VISTORA doesn't send promotional alerts. Your Plan to Watch list is here whenever you're ready to choose something.",color=VistoraPalette.Muted,fontSize=13.sp,lineHeight=19.sp,modifier=Modifier.padding(top=7.dp,bottom=15.dp))
                val planned=uiState.items.count{it.status==LibraryStatus.PLAN_TO_WATCH}
                Text("$planned titles in Plan to Watch",color=VistoraPalette.Secondary,fontSize=14.sp)
                VistoraAction("Open Plan to Watch",{filters=LibraryFilters(statuses=setOf(LibraryStatus.PLAN_TO_WATCH));route="Library";notificationsVisible=false},Modifier.fillMaxWidth().padding(top=14.dp),leading="bookmark")
            }
        }
    }
    if (restoreCandidate != null) {
        val candidate = restoreCandidate!!
        VistoraSheet(onDismiss = { restoreCandidate = null }) {
            Column(Modifier.fillMaxWidth().padding(horizontal=20.dp).padding(bottom=22.dp)) {
                Text("Restore this backup?",color=VistoraPalette.Text,style=androidx.compose.material3.MaterialTheme.typography.headlineMedium)
                Text(
                    "This will replace the current library with ${candidate.items.size} titles and ${candidate.episodeNotes.size} episode notes. Poster images will be copied into this app's private storage.",
                    color=VistoraPalette.Muted,fontSize=13.sp,lineHeight=20.sp,modifier=Modifier.padding(top=7.dp,bottom=17.dp)
                )
                Row(horizontalArrangement=Arrangement.spacedBy(10.dp)){
                    VistoraAction("Cancel",{restoreCandidate=null},Modifier.weight(1f),quiet=true)
                    VistoraAction("Replace library",{
                        scope.launch {
                            runCatching { repository.replaceSnapshot(candidate) }
                                .onSuccess { viewModel.showMessage("Backup restored successfully") }
                                .onFailure { viewModel.showMessage(it.message ?: "Restore failed") }
                            restoreCandidate=null
                            selectedId=null
                            route="Library"
                        }
                    },Modifier.weight(1f))
                }
            }
        }
    }
    if (resetVisible) {
        VistoraSheet(onDismiss = { resetVisible = false }) {
            Column(Modifier.fillMaxWidth().padding(horizontal=20.dp).padding(bottom=22.dp)) {
                Text("Clear your library?",color=VistoraPalette.Text,style=androidx.compose.material3.MaterialTheme.typography.headlineMedium)
                Text("This removes your titles, progress, ratings and episode notes from this device. This cannot be undone.",color=VistoraPalette.Muted,fontSize=13.sp,lineHeight=20.sp,modifier=Modifier.padding(top=6.dp,bottom=17.dp))
                Row(horizontalArrangement=Arrangement.spacedBy(10.dp)){
                    VistoraAction("Cancel",{resetVisible=false},Modifier.weight(1f),quiet=true)
                    VistoraAction("Clear library",{
                        scope.launch {
                            runCatching { repository.replaceSnapshot(LibrarySnapshot(emptyList(), emptyList())) }
                                .onSuccess { viewModel.showMessage("Library cleared") }
                                .onFailure { viewModel.showMessage("Couldn't clear the library") }
                            selectedId=null
                            resetVisible=false
                        }
                    },Modifier.weight(1f))
                }
            }
        }
    }
    }
}

@Composable
private fun FilterSheet(
    filters: LibraryFilters,
    onChange: (LibraryFilters) -> Unit,
    onClear: () -> Unit,
    onDone: () -> Unit
) {
    Column(Modifier.fillMaxWidth().heightIn(max=720.dp).verticalScroll(rememberScrollState()).padding(horizontal=20.dp).padding(bottom=22.dp)){
        Text("Filters",color=VistoraPalette.Text,style=androidx.compose.material3.MaterialTheme.typography.headlineMedium)
        Text("Combine filters to find exactly what you're looking for.",color=VistoraPalette.Muted,fontSize=13.sp,modifier=Modifier.padding(top=5.dp,bottom=16.dp))
        Text("Content type",color=VistoraPalette.Secondary,fontWeight=FontWeight.SemiBold,fontSize=13.sp)
        FlowChips {
            MediaType.entries.forEach{type->FilterChip(type.category,type in filters.types){
                onChange(filters.copy(types=if(type in filters.types)filters.types-type else filters.types+type))
            }}
        }
        Text("Library status",color=VistoraPalette.Secondary,fontWeight=FontWeight.SemiBold,fontSize=13.sp,modifier=Modifier.padding(top=17.dp))
        FlowChips {
            LibraryStatus.entries.forEach{status->FilterChip(status.label,status in filters.statuses){
                onChange(filters.copy(statuses=if(status in filters.statuses)filters.statuses-status else filters.statuses+status))
            }}
        }
        Text("Minimum rating",color=VistoraPalette.Secondary,fontWeight=FontWeight.SemiBold,fontSize=13.sp,modifier=Modifier.padding(top=17.dp))
        Row(horizontalArrangement=Arrangement.spacedBy(7.dp),modifier=Modifier.padding(top=8.dp)){
            (0..5).forEach{score->FilterChip(if(score==0)"Any" else "$score+",filters.minimumRating==score){onChange(filters.copy(minimumRating=score))}}
        }
        Row(Modifier.fillMaxWidth().padding(top=18.dp).clip(RoundedCornerShape(13.dp)).background(VistoraPalette.Surface).clickable{onChange(filters.copy(watchlistOnly=!filters.watchlistOnly))}.padding(14.dp),
            verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.SpaceBetween){
            Text("Watchlist only",color=VistoraPalette.Text,fontSize=14.sp)
            Text(if(filters.watchlistOnly)"On" else "Off",color=VistoraPalette.Rose,fontWeight=FontWeight.SemiBold,fontSize=13.sp)
        }
        Row(Modifier.fillMaxWidth().padding(top=18.dp),horizontalArrangement=Arrangement.spacedBy(10.dp)){
            VistoraAction("Clear all",onClear,Modifier.weight(1f),quiet=true)
            VistoraAction("Done",onDone,Modifier.weight(1f))
        }
    }
}

@Composable
private fun FlowChips(content:@Composable RowScope.()->Unit){
    Row(Modifier.fillMaxWidth().horizontalScroll(androidx.compose.foundation.rememberScrollState()).padding(top=8.dp),horizontalArrangement=Arrangement.spacedBy(7.dp),verticalAlignment=Alignment.CenterVertically,content=content)
}

@Composable
private fun FilterChip(label:String,selected:Boolean,onClick:()->Unit){
    Text(label,modifier=Modifier.clip(RoundedCornerShape(9.dp)).background(if(selected)VistoraPalette.Burgundy else VistoraPalette.Surface)
        .clickable(onClick=onClick).padding(horizontal=10.dp,vertical=9.dp),
        color=if(selected)VistoraPalette.OnAccent else VistoraPalette.Secondary,fontSize=12.sp,fontWeight=if(selected)FontWeight.SemiBold else FontWeight.Medium)
}
