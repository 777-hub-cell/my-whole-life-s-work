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
                    val kDramas = searchTmdb(cleanQuery, MediaType.K_DRAMA, credential)
                    val series = searchTmdb(cleanQuery, MediaType.TV_SERIES, credential)
                    (movies + kDramas + series + anime).distinctBy { it.providerId }
                        .sortedByDescending { it.releaseYear ?: 0 }
                }
            }
        }
    }

    suspend fun testTmdbCredential(credential: String) = withContext(Dispatchers.IO) {
        val clean = requireCredential(credential)
        val endpoint = "https://api.themoviedb.org/3/configuration"
        val url = if (isBearerToken(clean)) endpoint else "$endpoint?api_key=${encode(clean)}"
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
        val url = buildString {
            append("https://api.themoviedb.org/3/search/$endpoint")
            append("?query=").append(encode(query))
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
                // The HTML prototype treats Korean-language TV productions as K-Dramas.
                // Exclude them from TV Series as well, so a result is never duplicated or
                // mislabeled in the two separate categories.
                if (type == MediaType.K_DRAMA && originalLanguage != "ko") return@mapNotNull null
                if (type == MediaType.TV_SERIES && originalLanguage == "ko") return@mapNotNull null
                val titleKey = if (endpoint == "movie") "title" else "name"
                val dateKey = if (endpoint == "movie") "release_date" else "first_air_date"
                val title = item.optString(titleKey).trim()
                if (title.isBlank()) return@mapNotNull null
                val year = item.optString(dateKey).take(4).toIntOrNull()
                val posterPath = item.optString("poster_path").takeIf { it.startsWith("/") }
                val totalEpisodes = if (endpoint == "tv") item.optInt("number_of_episodes", 0).coerceAtLeast(0) else 0
                val seriesState = if (endpoint != "tv") SeriesState.UNKNOWN else when (item.optString("status")) {
                    "Returning Series", "In Production" -> SeriesState.ONGOING
                    "Ended", "Canceled" -> SeriesState.COMPLETED
                    "Planned" -> SeriesState.UPCOMING
                    else -> SeriesState.UNKNOWN
                }
                val genreNames = tmdbGenres(item.optJSONArray("genre_ids"))
                CatalogResult(
                    providerId = "tmdb:${item.optLong("id")}",
                    title = title,
                    type = type,
                    releaseYear = year,
                    totalEpisodes = totalEpisodes,
                    seriesState = seriesState,
                    synopsis = item.optString("overview").take(600),
                    genres = genreNames,
                    posterUrl = posterPath?.let { "https://image.tmdb.org/t/p/w500$it" },
                    source = "TMDB"
                )
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun tmdbGenres(ids: org.json.JSONArray?): List<String> {
        if (ids == null) return emptyList()
        val labels = mapOf(
            28 to "Action", 12 to "Adventure", 16 to "Animation", 35 to "Comedy",
            80 to "Crime", 99 to "Documentary", 18 to "Drama", 10751 to "Family",
            14 to "Fantasy", 36 to "History", 27 to "Horror", 10402 to "Music",
            9648 to "Mystery", 10749 to "Romance", 878 to "Science Fiction",
            10770 to "TV Movie", 53 to "Thriller", 10752 to "War", 37 to "Western",
            10759 to "Action & Adventure", 10765 to "Sci-Fi & Fantasy",
            10768 to "War & Politics", 10764 to "Reality", 10766 to "Soap"
        )
        return (0 until ids.length()).mapNotNull { labels[ids.optInt(it)] }.distinct().take(8)
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
                  format
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

                val isAnimeMovie = item.optString("format") == "MOVIE"
                val state = if (isAnimeMovie) SeriesState.UNKNOWN else when (item.optString("status")) {
                    "RELEASING" -> SeriesState.ONGOING
                    "FINISHED" -> SeriesState.COMPLETED
                    "NOT_YET_RELEASED" -> SeriesState.UPCOMING
                    else -> SeriesState.UNKNOWN
                }
                val genresArray = item.optJSONArray("genres")
                val genres = if (genresArray == null) emptyList() else {
                    (0 until minOf(genresArray.length(), 8))
                        .mapNotNull { genresArray.optString(it).takeIf(String::isNotBlank) }
                }
                val poster = item.optJSONObject("coverImage")
                    ?.optString("large")
                    ?.takeIf { it.startsWith("https://") }

                CatalogResult(
                    providerId = "anilist:${item.optInt("id")}",
                    title = title,
                    type = MediaType.ANIME,
                    releaseYear = item.optJSONObject("startDate")?.optInt("year")?.takeIf { it > 0 },
                    totalEpisodes = if (isAnimeMovie) 0 else item.optInt("episodes", 0).coerceAtLeast(0),
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
        return runCatching { JSONObject(body) }
            .getOrElse { throw IOException("The provider returned an unreadable response.") }
    }
}
