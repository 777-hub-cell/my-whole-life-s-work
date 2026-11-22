package com.vistora.android.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.vistora.android.data.repository.LibraryRepository
import com.vistora.android.data.catalog.CatalogRepository
import com.vistora.android.domain.CatalogResult
import com.vistora.android.domain.CatalogSearchState
import com.vistora.android.domain.EpisodeNote
import com.vistora.android.domain.LibraryStatus
import com.vistora.android.domain.MediaItem
import com.vistora.android.domain.MediaType
import com.vistora.android.domain.SeriesState
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class VistoraUiState(
    val items: List<MediaItem> = emptyList(),
    val episodeNotes: List<EpisodeNote> = emptyList(),
    val allEpisodeNotes: List<EpisodeNote> = emptyList(),
    val notesForMediaId: Long? = null,
    val isLoading: Boolean = true,
    val message: String? = null,
    val catalog: CatalogSearchState = CatalogSearchState()
)

class VistoraViewModel(
    private val repository: LibraryRepository,
    private val catalogRepository: CatalogRepository = CatalogRepository()
) : ViewModel() {
    private val _uiState = MutableStateFlow(VistoraUiState())
    val uiState: StateFlow<VistoraUiState> = _uiState.asStateFlow()
    private var notesJob: Job? = null

    init {
        viewModelScope.launch {
            repository.observeItems().collect { items ->
                _uiState.update { it.copy(items = items, isLoading = false) }
            }
        }
        viewModelScope.launch {
            repository.observeAllEpisodeNotes().collect { notes ->
                _uiState.update { it.copy(allEpisodeNotes = notes) }
            }
        }
    }

    fun observeNotes(mediaId: Long) {
        if (_uiState.value.notesForMediaId == mediaId && notesJob?.isActive == true) return
        notesJob?.cancel()
        notesJob = viewModelScope.launch {
            repository.observeEpisodeNotes(mediaId).collect { notes ->
                _uiState.update {
                    it.copy(episodeNotes = notes, notesForMediaId = mediaId)
                }
            }
        }
    }

    fun saveItem(draft: MediaItem, onSaved: ((Long) -> Unit)? = null) {
        val cleanTitle = draft.title.trim()
        if (cleanTitle.isEmpty()) {
            showMessage("Enter a title first")
            return
        }
        viewModelScope.launch {
            runCatching {
                val total = draft.totalEpisodes.coerceAtLeast(0)
                val watched = draft.watchedEpisodes.coerceIn(0, total)
                val status = if (total > 0 && watched == total && watched > 0) {
                    LibraryStatus.COMPLETED
                } else {
                    draft.status
                }
                val now = System.currentTimeMillis()
                repository.saveItem(
                    draft.copy(
                        title = cleanTitle,
                        totalEpisodes = total,
                        watchedEpisodes = watched,
                        rating = draft.rating.coerceIn(0, 5),
                        updatedAt = now,
                        status = status
                    )
                )
            }.onSuccess { id ->
                showMessage(if (draft.id == 0L) "Added to your library" else "Changes saved")
                onSaved?.invoke(id)
            }.onFailure {
                showMessage("Couldn't save this title. Please try again.")
            }
        }
    }

    fun deleteItem(mediaId: Long) {
        viewModelScope.launch {
            runCatching { repository.deleteItem(mediaId) }
                .onSuccess { showMessage("Title removed") }
                .onFailure { showMessage("Couldn't remove this title") }
        }
    }

    fun setStatus(mediaId: Long, status: LibraryStatus) {
        val item = _uiState.value.items.firstOrNull { it.id == mediaId } ?: return
        val now = System.currentTimeMillis()
        val isCompleted = status == LibraryStatus.COMPLETED
        val next = item.copy(
            status = status,
            watchedEpisodes = if (isCompleted && item.isEpisodic) item.totalEpisodes else item.watchedEpisodes,
            startedAt = if (status == LibraryStatus.WATCHING && item.startedAt == null) now else item.startedAt,
            finishedAt = if (isCompleted) now else if (item.status == LibraryStatus.COMPLETED) null else item.finishedAt,
            watchedOn = if (!item.isEpisodic && isCompleted) now else item.watchedOn,
            updatedAt = now
        )
        saveItem(next)
    }

    fun changeProgress(mediaId: Long, amount: Int) {
        val item = _uiState.value.items.firstOrNull { it.id == mediaId } ?: return
        if (!item.isEpisodic) return
        val nextWatched = (item.watchedEpisodes + amount).coerceIn(0, item.totalEpisodes)
        val nextStatus = when {
            nextWatched == item.totalEpisodes && nextWatched > 0 -> LibraryStatus.COMPLETED
            item.status == LibraryStatus.COMPLETED -> LibraryStatus.WATCHING
            nextWatched > 0 && item.status != LibraryStatus.WATCHING -> LibraryStatus.WATCHING
            else -> item.status
        }
        val now = System.currentTimeMillis()
        saveItem(
            item.copy(
                watchedEpisodes = nextWatched,
                status = nextStatus,
                startedAt = if (nextWatched > 0 && item.startedAt == null) now else item.startedAt,
                finishedAt = if (nextStatus == LibraryStatus.COMPLETED) now else null,
                updatedAt = now
            )
        )
    }

    fun setTrackedDate(mediaId: Long, kind: com.vistora.android.domain.TrackedDate, timestamp: Long?) {
        val item = _uiState.value.items.firstOrNull { it.id == mediaId } ?: return
        val updated = when (kind) {
            com.vistora.android.domain.TrackedDate.STARTED -> item.copy(startedAt = timestamp)
            com.vistora.android.domain.TrackedDate.FINISHED -> item.copy(finishedAt = timestamp)
            com.vistora.android.domain.TrackedDate.WATCHED_ON -> item.copy(watchedOn = timestamp)
        }
        saveItem(updated.copy(updatedAt = System.currentTimeMillis()))
    }

    fun setRating(mediaId: Long, rating: Int) {
        val item = _uiState.value.items.firstOrNull { it.id == mediaId } ?: return
        val next = if (item.rating == rating) 0 else rating.coerceIn(1, 5)
        saveItem(item.copy(rating = next, updatedAt = System.currentTimeMillis()))
    }

    fun toggleWatchlist(mediaId: Long) {
        val item = _uiState.value.items.firstOrNull { it.id == mediaId } ?: return
        saveItem(item.copy(isWatchlisted = !item.isWatchlisted, updatedAt = System.currentTimeMillis()))
    }

    fun saveEpisodeNote(mediaId: Long, episodeNumber: Int, body: String) {
        val item = _uiState.value.items.firstOrNull { it.id == mediaId } ?: return
        if (!item.isEpisodic || episodeNumber !in 1..item.totalEpisodes) return
        val existing = _uiState.value.episodeNotes.firstOrNull { it.episodeNumber == episodeNumber }
        val now = System.currentTimeMillis()
        viewModelScope.launch {
            runCatching {
                repository.saveEpisodeNote(
                    EpisodeNote(
                        mediaId = mediaId,
                        episodeNumber = episodeNumber,
                        body = body.trim(),
                        createdAt = existing?.createdAt ?: now,
                        updatedAt = now
                    )
                )
            }.onSuccess {
                showMessage(if (body.isBlank()) "Note removed" else "Episode note saved")
            }.onFailure {
                showMessage("Couldn't save this episode note")
            }
        }
    }

    fun deleteEpisodeNote(mediaId: Long, episodeNumber: Int) {
        viewModelScope.launch {
            runCatching { repository.deleteEpisodeNote(mediaId, episodeNumber) }
                .onSuccess { showMessage("Episode note deleted") }
                .onFailure { showMessage("Couldn't delete this note") }
        }
    }

    fun saveOverallThoughts(mediaId: Long, thoughts: String) {
        val item = _uiState.value.items.firstOrNull { it.id == mediaId } ?: return
        val clean = thoughts.trim()
        val now = System.currentTimeMillis()
        saveItem(
            item.copy(
                overallThoughts = clean,
                overallThoughtsUpdatedAt = if (clean.isBlank()) null else now,
                updatedAt = now
            )
        )
    }

    fun searchCatalog(query: String, type: MediaType?, tmdbCredential: String?) {
        val clean = query.trim()
        if (clean.isBlank()) {
            _uiState.update { it.copy(catalog = CatalogSearchState(query = query, error = "Enter a title to search.")) }
            return
        }
        _uiState.update { it.copy(catalog = CatalogSearchState(query = clean, isLoading = true)) }
        viewModelScope.launch {
            runCatching { catalogRepository.search(clean, type, tmdbCredential) }
                .onSuccess { results ->
                    _uiState.update {
                        it.copy(catalog = CatalogSearchState(
                            query = clean,
                            results = results,
                            sourceLabel = when (type) {
                                MediaType.ANIME -> "AniList"
                                MediaType.MOVIE, MediaType.K_DRAMA, MediaType.TV_SERIES, null -> "TMDB"
                            }
                        ))
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(catalog = CatalogSearchState(query = clean, error = error.message ?: "Search failed. Try again."))
                    }
                }
        }
    }

    fun clearCatalogSearch() {
        _uiState.update { it.copy(catalog = CatalogSearchState()) }
    }

    fun testTmdbCredential(credential: String) {
        viewModelScope.launch {
            runCatching { catalogRepository.testTmdbCredential(credential) }
                .onSuccess { showMessage("TMDB credential works") }
                .onFailure { showMessage(it.message ?: "TMDB credential check failed") }
        }
    }

    fun clearMessage() {
        _uiState.update { it.copy(message = null) }
    }

    fun showMessage(message: String) {
        _uiState.update { it.copy(message = message) }
    }

    class Factory(
        private val repository: LibraryRepository
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            if (modelClass.isAssignableFrom(VistoraViewModel::class.java)) {
                return VistoraViewModel(repository) as T
            }
            error("Unknown ViewModel class: ${modelClass.name}")
        }
    }
}
