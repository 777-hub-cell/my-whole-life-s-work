package com.aharane.studio.features.chats

import java.nio.charset.StandardCharsets

internal const val MAX_WEBP_STICKER_BYTES: Int = 2 * 1024 * 1024

/**
 * Returns a user-facing validation error for a WebP sticker payload, or null when
 * its RIFF/WebP container is structurally plausible and within the client limit.
 *
 * This deliberately checks the container rather than trusting the document
 * provider's MIME label. The server performs the actual WhatsApp send and
 * remains authoritative for session and protocol acceptance.
 */
internal fun validateWebpStickerPayload(bytes: ByteArray): String? {
    if (bytes.size < 12) return "The selected file is not a valid WebP sticker."
    if (bytes.size > MAX_WEBP_STICKER_BYTES) {
        return "WebP stickers must be 2 MB or smaller."
    }

    val riff = String(bytes, 0, 4, StandardCharsets.US_ASCII)
    val webp = String(bytes, 8, 4, StandardCharsets.US_ASCII)
    if (riff != "RIFF" || webp != "WEBP") {
        return "Choose a WebP sticker file."
    }

    val riffPayloadLength =
        (bytes[4].toLong() and 0xffL) or
            ((bytes[5].toLong() and 0xffL) shl 8) or
            ((bytes[6].toLong() and 0xffL) shl 16) or
            ((bytes[7].toLong() and 0xffL) shl 24)
    if (riffPayloadLength < 4L || riffPayloadLength + 8L > bytes.size.toLong()) {
        return "The selected WebP sticker is incomplete or corrupted."
    }

    return null
}
