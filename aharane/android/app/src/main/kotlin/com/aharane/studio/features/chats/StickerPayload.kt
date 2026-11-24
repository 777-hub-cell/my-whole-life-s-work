package com.aharane.studio.features.chats

import java.nio.charset.StandardCharsets

internal const val MAX_WEBP_STICKER_BYTES: Int = 2 * 1024 * 1024

/**
 * Returns a user-facing validation error for a WebP sticker payload, or null when
 * its RIFF/WebP container and first image chunk are structurally plausible and
 * within the client limit. The server remains authoritative for WhatsApp acceptance.
 */
internal fun validateWebpStickerPayload(bytes: ByteArray): String? {
    if (bytes.size < 20) return "The selected file is not a valid WebP sticker."
    if (bytes.size > MAX_WEBP_STICKER_BYTES) {
        return "WebP stickers must be 2 MB or smaller."
    }

    val riff = String(bytes, 0, 4, StandardCharsets.US_ASCII)
    val webp = String(bytes, 8, 4, StandardCharsets.US_ASCII)
    if (riff != "RIFF" || webp != "WEBP") {
        return "Choose a WebP sticker file."
    }

    val riffPayloadLength = readUInt32LittleEndian(bytes, 4)
    if (riffPayloadLength < 12L || riffPayloadLength + 8L > bytes.size.toLong()) {
        return "The selected WebP sticker is incomplete or corrupted."
    }

    val firstChunkType = String(bytes, 12, 4, StandardCharsets.US_ASCII)
    if (firstChunkType !in setOf("VP8 ", "VP8L", "VP8X")) {
        return "The selected WebP sticker is incomplete or corrupted."
    }

    val firstChunkLength = readUInt32LittleEndian(bytes, 16)
    if (firstChunkLength <= 0L ||
        firstChunkLength + 12L > riffPayloadLength ||
        firstChunkLength + 20L > bytes.size.toLong()
    ) {
        return "The selected WebP sticker is incomplete or corrupted."
    }

    return null
}

private fun readUInt32LittleEndian(bytes: ByteArray, offset: Int): Long =
    (bytes[offset].toLong() and 0xffL) or
        ((bytes[offset + 1].toLong() and 0xffL) shl 8) or
        ((bytes[offset + 2].toLong() and 0xffL) shl 16) or
        ((bytes[offset + 3].toLong() and 0xffL) shl 24)
