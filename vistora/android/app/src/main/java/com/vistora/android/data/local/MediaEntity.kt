package com.vistora.android.data.local

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import com.vistora.android.domain.EpisodeNote
import com.vistora.android.domain.LibraryStatus
import com.vistora.android.domain.MediaItem
import com.vistora.android.domain.MediaType
import com.vistora.android.domain.SeriesState

@Entity(
    tableName = "media_items",
    indices = [
        Index(value = ["status"]),
        Index(value = ["type"]),
        Index(value = ["updatedAt"])
    ]
)
data class MediaEntity(
    @androidx.room.PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val type: String,
    val releaseYear: Int?,
    val totalEpisodes: Int,
    val watchedEpisodes: Int,
    val seriesState: String,
    val status: String,
    val rating: Int,
    val isWatchlisted: Boolean,
    val genres: String,
    val synopsis: String,
    val posterPath: String?,
    val addedAt: Long,
    val updatedAt: Long,
    val startedAt: Long?,
    val finishedAt: Long?,
    val watchedOn: Long?,
    val overallThoughts: String,
    val overallThoughtsUpdatedAt: Long? = null
)

@Entity(
    tableName = "episode_notes",
    primaryKeys = ["mediaId", "episodeNumber"],
    indices = [Index(value = ["mediaId"])],
    foreignKeys = [
        ForeignKey(
            entity = MediaEntity::class,
            parentColumns = ["id"],
            childColumns = ["mediaId"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class EpisodeNoteEntity(
    val mediaId: Long,
    val episodeNumber: Int,
    val body: String,
    val createdAt: Long,
    val updatedAt: Long
)

fun MediaEntity.toDomain(): MediaItem = MediaItem(
    id = id,
    title = title,
    type = MediaType.valueOf(type),
    releaseYear = releaseYear,
    totalEpisodes = totalEpisodes,
    watchedEpisodes = watchedEpisodes,
    seriesState = SeriesState.valueOf(seriesState),
    status = LibraryStatus.valueOf(status),
    rating = rating,
    isWatchlisted = isWatchlisted,
    genres = genres.split('\u001f').filter(String::isNotBlank),
    synopsis = synopsis,
    posterPath = posterPath,
    addedAt = addedAt,
    updatedAt = updatedAt,
    startedAt = startedAt,
    finishedAt = finishedAt,
    watchedOn = watchedOn,
    overallThoughts = overallThoughts
)

fun MediaItem.toEntity(): MediaEntity = MediaEntity(
    id = id,
    title = title,
    type = type.name,
    releaseYear = releaseYear,
    totalEpisodes = totalEpisodes,
    watchedEpisodes = watchedEpisodes,
    seriesState = seriesState.name,
    status = status.name,
    rating = rating,
    isWatchlisted = isWatchlisted,
    genres = genres.joinToString("\u001f"),
    synopsis = synopsis,
    posterPath = posterPath,
    addedAt = addedAt,
    updatedAt = updatedAt,
    startedAt = startedAt,
    finishedAt = finishedAt,
    watchedOn = watchedOn,
    overallThoughts = overallThoughts
)

fun EpisodeNoteEntity.toDomain(): EpisodeNote = EpisodeNote(
    mediaId = mediaId,
    episodeNumber = episodeNumber,
    body = body,
    createdAt = createdAt,
    updatedAt = updatedAt
)

fun EpisodeNote.toEntity(): EpisodeNoteEntity = EpisodeNoteEntity(
    mediaId = mediaId,
    episodeNumber = episodeNumber,
    body = body,
    createdAt = createdAt,
    updatedAt = updatedAt
)
