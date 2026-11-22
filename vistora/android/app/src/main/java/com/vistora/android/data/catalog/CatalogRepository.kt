package com.vistora.android.data.catalog

import com.vistora.android.domain.CatalogResult
import com.vistora.android.domain.MediaType
import com.vistora.android.domain.SeriesState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class CatalogRepository {
    suspend fun search(
        query: String,
        type: MediaType?,
        tmdbCredential: String?
    ): List<CatalogResult> = withContext(Dispatchers.IO) {
        val cleanQuery = query.trim()
        require(cleanQuery.isNotEmpty()) { "Enter a title to search." }
        require(cleanQuery.length <= 120) { "Search text is too long." }

        when (type) {
            MediaType.ANIME -> searchAniList(cleanQuery)
            MediaType.MOVIE -> searchTmdb(cleanQuery, MediaType.MOVIE, requireCredential(tmdbCredential))
            MediaType.K_DRAMA -> searchTmdb(cleanQuery, MediaType.K_DRAMA, requireCredential(tmdbCredential))
            MediaType.TV_SERIES -> searchTmdb(cleanQuery, MediaType.TV_SERIES, requireCredential(tmdbCredential))
            null -> {
                val anime = searchAniList(cleanQuery)
                val credential = tmdbCredential?.trim().orEmpty()
                if (credential.isBlank()) {
                    anime
                } else {
                    val movies = searchTmdb(cleanQuery, MediaType.MOVIE, credential)
                    val series = searchTmdb(cleanQuery, MediaType.TV_SERIES, credential)
                    (movies + series + anime).sortedByDescending { it.releaseYear ?: 0 }
                }
            }
        }
    }

    suspend fun testTmdbCredential(credential: String) = withContext(Dispatchers.IO) {
        val clean = requireCredential(credential)
        val endpoint = "https://api.themoviedb.org/3/configuration"
        val url = if (isBearerToken(clean)) endpoint else endpoint + "?api_key=" + encode(clean)
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            configureTmdb(connection, clean)
            val code = connection.responseCode
            if (code == 401) throw IOException("TMDB rejected this credential. Check that it is copied correctly.")
            if (code !in 200..299) throw IOException("TMDB test failed (HTTP $code).")
        } finally {
            connection.disconnect()
        }
    }

    private fun requireCredential(value: String?): String {
        val clean = value?.trim().orEmpty()
        if (clean.isBlank()) {
            throw IllegalStateException("Add your TMDB API key or Read Access Token in Settings to search films and TV.")
        }
        return clean
    }

    private fun searchTmdb(query: String, type: MediaType, credential: String): List<CatalogResult> {
        val endpoint = if (type == MediaType.MOVIE) "movie" else "tv"
        val encoded = URLEncoder.encode(query, Charsets.UTF_8.name())
        val url = buildString {
            append("https://api.themoviedb.org/3/search/$endpoint")
            append("?query=").append(encoded)
            append("&include_adult=false&language=en-US&page=1")
            if (!isBearerToken(credential)) append("&api_key=").append(encode(credential))
        }
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            configureTmdb(connection, credential)
            val root = readJson(connection)
            val rows = root.optJSONArray("results") ?: return emptyList()
            return (0 until rows.length()).mapNotNull { index ->
                val item = rows.optJSONObject(index) ?: return@mapNotNull null
                val originalLanguage = item.optString("original_language")
                if (type == MediaType.K_DRAMA && originalLanguage != "ko") return@mapNotNull null
                val title = item.optString(if (endpoint == "movie") "title" else "name").trim()
                if (title.isBlank()) return@mapNotNull null
                val date = item.optString(if (endpoint == "movie") "release_date" else "first_air_date")
                val year = date.take(4).toIntOrNull()
                val posterPath = item.optString("poster_path").takeIf { it.startsWith("/") }
                CatalogResult(
                    providerId = "tmdb:${item.optLong("id")}",
                    title = title,
                    type = type,
                    releaseYear = year,
                    totalEpisodes = 0,
                    seriesState = SeriesState.UNKNOWN,
                    synopsis = item.optString("overview").take(600),
                    genres = emptyList(),
                    posterUrl = posterPath?.let { "https://image.tmdb.org/t/p/w500$it" },
                    source = "TMDB"
                )
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun searchAniList(query: String): List<CatalogResult> {
        val variable = '$' + "search"
        val graphQl = """
            query ($variable: String!) {
              Page(page: 1, perPage: 20) {
                media(search: $variable, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
                  id
                  title { english romaji native }
                  episodes
                  status
                  startDate { year }
                  description(asHtml: false)
                  genres
                  coverImage { large }
                }
              }
            }
        """.trimIndent()
        val payload = JSONObject()
            .put("query", graphQl)
            .put("variables", JSONObject().put("search", query))
        val connection = URL("https://graphql.anilist.co").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 12_000
            connection.readTimeout = 15_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Accept", "application/json")
            connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            val root = readJson(connection)
            val errors = root.optJSONArray("errors")
            if (errors != null && errors.length() > 0) {
                throw IOException(errors.optJSONObject(0)?.optString("message") ?: "AniList search failed.")
            }
            val rows = root.optJSONObject("data")
                ?.optJSONObject("Page")
                ?.optJSONArray("media") ?: return emptyList()
            return (0 until rows.length()).mapNotNull { index ->
                val item = rows.optJSONObject(index) ?: return@mapNotNull null
                val titleObject = item.optJSONObject("title") ?: JSONObject()
                val title = sequenceOf("english", "romaji", "native")
                    .map { titleObject.optString(it).trim() }
                    .firstOrNull { it.isNotBlank() } ?: return@mapNotNull null
                val state = when (item.optString("status")) {
                    "RELEASING" -> SeriesState.ONGOING
                    "FINISHED", "CANCELLED", "HIATUS" -> SeriesState.COMPLETED
                    "NOT_YET_RELEASED" -> SeriesState.UPCOMING
                    else -> SeriesState.UNKNOWN
                }
                val genresArray = item.optJSONArray("genres")
                val genres = if (genresArray == null) emptyList() else
                    (0 until minOf(genresArray.length(), 8)).mapNotNull { genresArray.optString(it).takeIf(String::isNotBlank) }
                val poster = item.optJSONObject("coverImage")?.optString("large")?.takeIf { it.startsWith("https://") }
                CatalogResult(
                    providerId = "anilist:${item.optInt("id")}",
                    title = title,
                    type = MediaType.ANIME,
                    releaseYear = item.optJSONObject("startDate")?.optInt("year")?.takeIf { it > 0 },
                    totalEpisodes = item.optInt("episodes", 0).coerceAtLeast(0),
                    seriesState = state,
                    synopsis = item.optString("description").replace(Regex("<[^>]*>"), "").take(600),
                    genres = genres,
                    posterUrl = poster,
                    source = "AniList"
                )
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun isBearerToken(value: String): Boolean = value.count { it == '.' } == 2

    private fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8.name())

    private fun configureTmdb(connection: HttpURLConnection, credential: String) {
        connection.connectTimeout = 12_000
        connection.readTimeout = 15_000
        // TMDB recommends the Read Access Token as a Bearer credential.
        // Legacy v3 API keys remain supported by TMDB for applicable endpoints.
        if (isBearerToken(credential)) {
            connection.setRequestProperty("Authorization", "Bearer $credential")
        }
        connection.setRequestProperty("Accept", "application/json")
    }

    private fun readJson(connection: HttpURLConnection): JSONObject {
        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
        if (code == 401 || code == 403) throw IOException("The provider rejected the credential. Check Settings.")
        if (code == 429) throw IOException("Too many searches in a short time. Please wait and try again.")
        if (code !in 200..299) throw IOException("Provider search failed (HTTP $code).")
        return runCatching { JSONObject(body) }.getOrElse { throw IOException("The provider returned an unreadable response.") }
    }
}
}search: String!) {
              Page(page: 1, perPage: 20) {
                media(search: ${', type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
                  id
                  title { english romaji native }
                  episodes
                  status
                  startDate { year }
                  description(asHtml: false)
                  genres
                  coverImage { large }
                }
              }
            }
        """.trimIndent()
        val payload = JSONObject()
            .put("query", graphQl)
            .put("variables", JSONObject().put("search", query))
        val connection = URL("https://graphql.anilist.co").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 12_000
            connection.readTimeout = 15_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Accept", "application/json")
            connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            val root = readJson(connection)
            val errors = root.optJSONArray("errors")
            if (errors != null && errors.length() > 0) {
                throw IOException(errors.optJSONObject(0)?.optString("message") ?: "AniList search failed.")
            }
            val rows = root.optJSONObject("data")
                ?.optJSONObject("Page")
                ?.optJSONArray("media") ?: return emptyList()
            return (0 until rows.length()).mapNotNull { index ->
                val item = rows.optJSONObject(index) ?: return@mapNotNull null
                val titleObject = item.optJSONObject("title") ?: JSONObject()
                val title = sequenceOf("english", "romaji", "native")
                    .map { titleObject.optString(it).trim() }
                    .firstOrNull { it.isNotBlank() } ?: return@mapNotNull null
                val state = when (item.optString("status")) {
                    "RELEASING" -> SeriesState.ONGOING
                    "FINISHED", "CANCELLED", "HIATUS" -> SeriesState.COMPLETED
                    "NOT_YET_RELEASED" -> SeriesState.UPCOMING
                    else -> SeriesState.UNKNOWN
                }
                val genresArray = item.optJSONArray("genres")
                val genres = if (genresArray == null) emptyList() else
                    (0 until minOf(genresArray.length(), 8)).mapNotNull { genresArray.optString(it).takeIf(String::isNotBlank) }
                val poster = item.optJSONObject("coverImage")?.optString("large")?.takeIf { it.startsWith("https://") }
                CatalogResult(
                    providerId = "anilist:${item.optInt("id")}",
                    title = title,
                    type = MediaType.ANIME,
                    releaseYear = item.optJSONObject("startDate")?.optInt("year")?.takeIf { it > 0 },
                    totalEpisodes = item.optInt("episodes", 0).coerceAtLeast(0),
                    seriesState = state,
                    synopsis = item.optString("description").replace(Regex("<[^>]*>"), "").take(600),
                    genres = genres,
                    posterUrl = poster,
                    source = "AniList"
                )
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun isBearerToken(value: String): Boolean = value.count { it == '.' } == 2

    private fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8.name())

    private fun configureTmdb(connection: HttpURLConnection, credential: String) {
        connection.connectTimeout = 12_000
        connection.readTimeout = 15_000
        // TMDB recommends the Read Access Token as a Bearer credential.
        // Legacy v3 API keys remain supported by TMDB for applicable endpoints.
        if (isBearerToken(credential)) {
            connection.setRequestProperty("Authorization", "Bearer $credential")
        }
        connection.setRequestProperty("Accept", "application/json")
    }

    private fun readJson(connection: HttpURLConnection): JSONObject {
        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
        if (code == 401 || code == 403) throw IOException("The provider rejected the credential. Check Settings.")
        if (code == 429) throw IOException("Too many searches in a short time. Please wait and try again.")
        if (code !in 200..299) throw IOException("Provider search failed (HTTP $code).")
        return runCatching { JSONObject(body) }.getOrElse { throw IOException("The provider returned an unreadable response.") }
    }
}
}search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
                  id
                  title { english romaji native }
                  episodes
                  status
                  startDate { year }
                  description(asHtml: false)
                  genres
                  coverImage { large }
                }
              }
            }
        """.trimIndent()
        val payload = JSONObject()
            .put("query", graphQl)
            .put("variables", JSONObject().put("search", query))
        val connection = URL("https://graphql.anilist.co").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 12_000
            connection.readTimeout = 15_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Accept", "application/json")
            connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            val root = readJson(connection)
            val errors = root.optJSONArray("errors")
            if (errors != null && errors.length() > 0) {
                throw IOException(errors.optJSONObject(0)?.optString("message") ?: "AniList search failed.")
            }
            val rows = root.optJSONObject("data")
                ?.optJSONObject("Page")
                ?.optJSONArray("media") ?: return emptyList()
            return (0 until rows.length()).mapNotNull { index ->
                val item = rows.optJSONObject(index) ?: return@mapNotNull null
                val titleObject = item.optJSONObject("title") ?: JSONObject()
                val title = sequenceOf("english", "romaji", "native")
                    .map { titleObject.optString(it).trim() }
                    .firstOrNull { it.isNotBlank() } ?: return@mapNotNull null
                val state = when (item.optString("status")) {
                    "RELEASING" -> SeriesState.ONGOING
                    "FINISHED", "CANCELLED", "HIATUS" -> SeriesState.COMPLETED
                    "NOT_YET_RELEASED" -> SeriesState.UPCOMING
                    else -> SeriesState.UNKNOWN
                }
                val genresArray = item.optJSONArray("genres")
                val genres = if (genresArray == null) emptyList() else
                    (0 until minOf(genresArray.length(), 8)).mapNotNull { genresArray.optString(it).takeIf(String::isNotBlank) }
                val poster = item.optJSONObject("coverImage")?.optString("large")?.takeIf { it.startsWith("https://") }
                CatalogResult(
                    providerId = "anilist:${item.optInt("id")}",
                    title = title,
                    type = MediaType.ANIME,
                    releaseYear = item.optJSONObject("startDate")?.optInt("year")?.takeIf { it > 0 },
                    totalEpisodes = item.optInt("episodes", 0).coerceAtLeast(0),
                    seriesState = state,
                    synopsis = item.optString("description").replace(Regex("<[^>]*>"), "").take(600),
                    genres = genres,
                    posterUrl = poster,
                    source = "AniList"
                )
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun isBearerToken(value: String): Boolean = value.count { it == '.' } == 2

    private fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8.name())

    private fun configureTmdb(connection: HttpURLConnection, credential: String) {
        connection.connectTimeout = 12_000
        connection.readTimeout = 15_000
        // TMDB recommends the Read Access Token as a Bearer credential.
        // Legacy v3 API keys remain supported by TMDB for applicable endpoints.
        if (isBearerToken(credential)) {
            connection.setRequestProperty("Authorization", "Bearer $credential")
        }
        connection.setRequestProperty("Accept", "application/json")
    }

    private fun readJson(connection: HttpURLConnection): JSONObject {
        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
        if (code == 401 || code == 403) throw IOException("The provider rejected the credential. Check Settings.")
        if (code == 429) throw IOException("Too many searches in a short time. Please wait and try again.")
        if (code !in 200..299) throw IOException("Provider search failed (HTTP $code).")
        return runCatching { JSONObject(body) }.getOrElse { throw IOException("The provider returned an unreadable response.") }
    }
}
