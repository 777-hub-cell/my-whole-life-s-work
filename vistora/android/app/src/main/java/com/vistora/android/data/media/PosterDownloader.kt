package com.vistora.android.data.media

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

object PosterDownloader {
    private const val MAX_IMAGE_BYTES = 12L * 1024L * 1024L

    suspend fun cache(context: Context, url: String): String? = withContext(Dispatchers.IO) {
        if (!url.startsWith("https://")) return@withContext null
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(url.toByteArray(Charsets.UTF_8))
            .take(16)
            .joinToString("") { "%02x".format(it) }
        val directory = File(context.applicationContext.filesDir, "posters").apply { mkdirs() }
        val target = File(directory, "provider-$digest.jpg")
        if (target.isFile && target.length() in 1..MAX_IMAGE_BYTES) return@withContext target.absolutePath

        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 12_000
            connection.readTimeout = 15_000
            connection.instanceFollowRedirects = false
            val code = connection.responseCode
            if (code !in 200..299) return@withContext null
            val contentType = connection.contentType.orEmpty()
            if (!contentType.startsWith("image/")) return@withContext null

            val temp = File(directory, "$digest.part")
            var total = 0L
            connection.inputStream.use { input ->
                FileOutputStream(temp).use { output ->
                    val buffer = ByteArray(16 * 1024)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        total += count
                        if (total > MAX_IMAGE_BYTES) {
                            temp.delete()
                            return@withContext null
                        }
                        output.write(buffer, 0, count)
                    }
                }
            }
            if (total == 0L) {
                temp.delete()
                return@withContext null
            }
            if (!temp.renameTo(target)) {
                temp.copyTo(target, overwrite = true)
                temp.delete()
            }
            target.absolutePath
        } catch (_: Exception) {
            null
        } finally {
            connection.disconnect()
        }
    }
}
