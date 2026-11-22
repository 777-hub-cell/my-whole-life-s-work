package com.vistora.android.data.backup

import android.content.Context
import android.net.Uri
import com.vistora.android.domain.EpisodeNote
import com.vistora.android.domain.LibrarySnapshot
import com.vistora.android.domain.LibraryStatus
import com.vistora.android.domain.MediaItem
import com.vistora.android.domain.MediaType
import com.vistora.android.domain.SeriesState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

object VistoraBackup {
    private const val MAX_ARCHIVE_BYTES = 250L * 1024L * 1024L
    private const val MAX_DATA_BYTES = 32L * 1024L * 1024L
    private const val MAX_POSTER_BYTES = 12L * 1024L * 1024L
    private const val MAX_ENTRIES = 25_000

    suspend fun export(context: Context, uri: Uri, snapshot: LibrarySnapshot) = withContext(Dispatchers.IO) {
        val resolver = context.contentResolver
        val output = resolver.openOutputStream(uri, "w") ?: error("The selected backup destination couldn't be opened.")
        val json = JSONObject()
        val mediaArray = JSONArray()
        val noteArray = JSONArray()
        val posterEntries = linkedMapOf<String, File>()

        snapshot.items.forEach { item ->
            val posterFile = item.posterPath?.let(::File)?.takeIf { it.isFile && it.length() <= MAX_POSTER_BYTES }
            val entryName = posterFile?.let { "posters/${item.id}-${UUID.randomUUID()}.jpg" }
            if (entryName != null && posterFile != null) posterEntries[entryName] = posterFile
            mediaArray.put(JSONObject().apply {
                put("id", item.id)
                put("title", item.title)
                put("type", item.type.name)
                put("releaseYear", item.releaseYear ?: JSONObject.NULL)
                put("totalEpisodes", item.totalEpisodes)
                put("watchedEpisodes", item.watchedEpisodes)
                put("seriesState", item.seriesState.name)
                put("status", item.status.name)
                put("rating", item.rating)
                put("isWatchlisted", item.isWatchlisted)
                put("genres", JSONArray(item.genres))
                put("synopsis", item.synopsis)
                put("posterEntry", entryName ?: JSONObject.NULL)
                put("addedAt", item.addedAt)
                put("updatedAt", item.updatedAt)
                put("startedAt", item.startedAt ?: JSONObject.NULL)
                put("finishedAt", item.finishedAt ?: JSONObject.NULL)
                put("watchedOn", item.watchedOn ?: JSONObject.NULL)
                put("overallThoughts", item.overallThoughts)
                put("overallThoughtsUpdatedAt", item.overallThoughtsUpdatedAt ?: JSONObject.NULL)
            })
        }
        snapshot.episodeNotes.forEach { note ->
            noteArray.put(JSONObject().apply {
                put("mediaId", note.mediaId)
                put("episodeNumber", note.episodeNumber)
                put("body", note.body)
                put("createdAt", note.createdAt)
                put("updatedAt", note.updatedAt)
            })
        }
        json.put("app", "vistora")
        json.put("schemaVersion", 1)
        json.put("exportedAt", System.currentTimeMillis())
        json.put("items", mediaArray)
        json.put("episodeNotes", noteArray)
        val data = json.toString().toByteArray(Charsets.UTF_8)
        require(data.size <= MAX_DATA_BYTES) { "The library backup is too large to export." }

        ZipOutputStream(output.buffered()).use { zip ->
            zip.putNextEntry(ZipEntry("backup.json"))
            zip.write(data)
            zip.closeEntry()
            posterEntries.forEach { (name, file) ->
                zip.putNextEntry(ZipEntry(name))
                file.inputStream().use { it.copyTo(zip) }
                zip.closeEntry()
            }
        }
    }

    suspend fun import(context: Context, uri: Uri): LibrarySnapshot = withContext(Dispatchers.IO) {
        val input = context.contentResolver.openInputStream(uri) ?: error("The selected backup file couldn't be opened.")
        val entries = linkedMapOf<String, ByteArray>()
        var totalBytes = 0L
        var count = 0

        ZipInputStream(input.buffered()).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                count++
                require(count <= MAX_ENTRIES) { "The backup contains too many files." }
                val name = entry.name
                require(!entry.isDirectory && !name.startsWith("/") && !name.contains("..")) { "The backup contains an unsafe file path." }
                require(name == "backup.json" || name.matches(Regex("posters/[A-Za-z0-9._-]+\\.jpg"))) {
                    "The backup contains an unsupported file."
                }
                val perEntryLimit = if (name == "backup.json") MAX_DATA_BYTES else MAX_POSTER_BYTES
                val bytes = readLimited(zip, perEntryLimit)
                totalBytes += bytes.size
                require(totalBytes <= MAX_ARCHIVE_BYTES) { "The backup is larger than the supported limit." }
                if (name == "backup.json" || name !in entries) entries[name] = bytes
                zip.closeEntry()
            }
        }

        val jsonBytes = entries["backup.json"] ?: error("This is not a valid VISTORA backup.")
        val root = JSONObject(jsonBytes.toString(Charsets.UTF_8))
        require(root.optString("app") == "vistora") { "This backup was not created by VISTORA." }
        require(root.optInt("schemaVersion", -1) == 1) { "This VISTORA backup version isn't supported by this app." }
        val itemsJson = root.optJSONArray("items") ?: JSONArray()
        val notesJson = root.optJSONArray("episodeNotes") ?: JSONArray()
        require(itemsJson.length() <= 20_000) { "The backup has too many titles." }
        require(notesJson.length() <= 200_000) { "The backup has too many notes." }

        val posterDirectory = File(context.filesDir, "posters").apply { mkdirs() }
        val items = ArrayList<MediaItem>(itemsJson.length())
        val knownIds = mutableSetOf<Long>()

        for (index in 0 until itemsJson.length()) {
            val obj = itemsJson.optJSONObject(index) ?: continue
            val id = obj.optLong("id", 0L)
            val title = obj.optString("title").trim()
            if (id <= 0L || title.isBlank()) continue
            val type = runCatching { MediaType.valueOf(obj.optString("type")) }.getOrDefault(MediaType.MOVIE)
            val total = obj.optInt("totalEpisodes", 0).coerceIn(0, 5000)
            val watched = obj.optInt("watchedEpisodes", 0).coerceIn(0, total)
            val status = runCatching { LibraryStatus.valueOf(obj.optString("status")) }.getOrDefault(LibraryStatus.PLAN_TO_WATCH)
            val seriesState = runCatching { SeriesState.valueOf(obj.optString("seriesState")) }.getOrDefault(SeriesState.UNKNOWN)
            val genres = obj.optJSONArray("genres")?.let { array ->
                (0 until minOf(array.length(), 8)).mapNotNull { i -> array.optString(i).takeIf(String::isNotBlank) }
            } ?: emptyList()
            val posterEntry = obj.optString("posterEntry").takeIf { it.startsWith("posters/") }
            val posterPath = posterEntry?.let(entries::get)?.let { bytes ->
                val file = File(posterDirectory, "restored-${UUID.randomUUID()}.jpg")
                file.writeBytes(bytes)
                file.absolutePath
            }
            knownIds.add(id)
            items.add(
                MediaItem(
                    id = id,
                    title = title.take(120),
                    type = type,
                    releaseYear = obj.takeNullableInt("releaseYear")?.coerceIn(1900, 2100),
                    totalEpisodes = if (type == MediaType.MOVIE) 0 else total,
                    watchedEpisodes = if (type == MediaType.MOVIE) 0 else watched,
                    seriesState = if (type == MediaType.MOVIE) SeriesState.UNKNOWN else seriesState,
                    status = if (type != MediaType.MOVIE && total > 0 && watched == total && watched > 0) LibraryStatus.COMPLETED else status,
                    rating = obj.optInt("rating", 0).coerceIn(0, 5),
                    isWatchlisted = obj.optBoolean("isWatchlisted", false),
                    genres = genres,
                    synopsis = obj.optString("synopsis").take(600),
                    posterPath = posterPath,
                    addedAt = obj.optLong("addedAt", System.currentTimeMillis()),
                    updatedAt = obj.optLong("updatedAt", System.currentTimeMillis()),
                    startedAt = obj.takeNullableLong("startedAt"),
                    finishedAt = obj.takeNullableLong("finishedAt"),
                    watchedOn = obj.takeNullableLong("watchedOn"),
                    overallThoughts = obj.optString("overallThoughts").take(50_000),
                    overallThoughtsUpdatedAt = obj.takeNullableLong("overallThoughtsUpdatedAt")
                )
            )
        }

        val notes = ArrayList<EpisodeNote>()
        for (index in 0 until notesJson.length()) {
            val obj = notesJson.optJSONObject(index) ?: continue
            val mediaId = obj.optLong("mediaId", -1L)
            val episode = obj.optInt("episodeNumber", 0)
            val owner = items.firstOrNull { it.id == mediaId } ?: continue
            if (!owner.isEpisodic || episode !in 1..owner.totalEpisodes) continue
            val body = obj.optString("body").take(50_000)
            if (body.isBlank()) continue
            notes.add(EpisodeNote(
                mediaId=mediaId,
                episodeNumber=episode,
                body=body,
                createdAt=obj.optLong("createdAt", System.currentTimeMillis()),
                updatedAt=obj.optLong("updatedAt", System.currentTimeMillis())
            ))
        }
        require(items.map { it.id }.distinct().size == items.size) { "The backup contains duplicate title IDs." }
        require(notes.distinctBy { it.mediaId to it.episodeNumber }.size == notes.size) { "The backup contains duplicate episode notes." }
        LibrarySnapshot(items, notes)
    }

    private fun readLimited(input: ZipInputStream, limit: Long): ByteArray {
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        var total = 0L
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            total += count
            require(total <= limit) { "A file in the backup exceeds the supported size." }
            out.write(buffer, 0, count)
        }
        return out.toByteArray()
    }

    private fun JSONObject.takeNullableInt(name: String): Int? =
        if (isNull(name)) null else optInt(name)

    private fun JSONObject.takeNullableLong(name: String): Long? =
        if (isNull(name)) null else optLong(name)
}
