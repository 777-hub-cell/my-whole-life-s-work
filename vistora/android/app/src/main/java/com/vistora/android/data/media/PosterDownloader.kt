package com.vistora.android.data.media

import android.content.Context
import android.graphics.BitmapFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Downloads provider artwork into app-private storage. A successful cache entry is
 * checked as an actual decodable image, not merely a non-empty file.
 */
object PosterDownloader {
    private const val MAX_IMAGE_BYTES = 12L * 1024L * 1024L
    private const val ATTEMPTS = 3

    suspend fun cache(context: Context, url: String): String? = withContext(Dispatchers.IO) {
        if (!url.startsWith("https://", ignoreCase = true)) return@withContext null

        val digest = MessageDigest.getInstance("SHA-256")
            .digest(url.toByteArray(Charsets.UTF_8))
            .take(16)
            .joinToString("") { "%02x".format(it) }
        val directory = File(context.applicationContext.filesDir, "posters").apply { mkdirs() }
        val target = File(directory, "provider-$digest.img")

        if (isDecodableImage(target)) return@withContext target.absolutePath
        // Remove damaged/partial cache entries so the next request can repair them.
        target.delete()

        for (attempt in 0 until ATTEMPTS) {
            val temp = File(directory, "$digest-${System.nanoTime()}.part")
            val downloaded = runCatching {
                val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 15_000
                    readTimeout = 20_000
                    instanceFollowRedirects = true
                    useCaches = false
                    setRequestProperty("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
                    setRequestProperty("User-Agent", "VISTORA-Android/0.1")
                }
                try {
                    val code = connection.responseCode
                    if (code !in 200..299) return@runCatching null
                    val contentType = connection.contentType.orEmpty().lowercase()
                    if (contentType.isNotBlank() && !contentType.startsWith("image/")) return@runCatching null
                    val expected = connection.contentLengthLong
                    if (expected > MAX_IMAGE_BYTES) return@runCatching null

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
                                    return@runCatching null
                                }
                                output.write(buffer, 0, count)
                            }
                            output.fd.sync()
                        }
                    }
                    if (total == 0L || !isDecodableImage(temp)) {
                        temp.delete()
                        return@runCatching null
                    }

                    // Another simultaneous poster request may have filled the same cache entry.
                    if (isDecodableImage(target)) {
                        temp.delete()
                        target.absolutePath
                    } else {
                        if (!temp.renameTo(target)) {
                            temp.copyTo(target, overwrite = true)
                            temp.delete()
                        }
                        if (isDecodableImage(target)) target.absolutePath else {
                            target.delete()
                            null
                        }
                    }
                } finally {
                    connection.disconnect()
                }
            }.getOrNull()

            if (downloaded != null) return@withContext downloaded
            temp.delete()
            if (attempt < ATTEMPTS - 1) delay(350L * (attempt + 1))
        }
        null
    }

    private fun isDecodableImage(file: File): Boolean {
        if (!file.isFile || file.length() !in 1..MAX_IMAGE_BYTES) return false
        return runCatching {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(file.absolutePath, bounds)
            bounds.outWidth > 0 && bounds.outHeight > 0
        }.getOrDefault(false)
    }
}
