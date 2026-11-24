package com.aharane.studio.features.chats

import java.nio.charset.StandardCharsets

internal const val MAX_WEBP_STICKER_BYTES: Int = 500 * 1024

/**
 * Performs bounded RIFF/WebP container validation before the existing server
 * converts the uploaded image/webp payload into a WhatsApp sticker message.
 * It does not decode pixels or replace WhatsApp's own sticker validation.
 */
internal fun validateWebpStickerPayload(bytes: ByteArray): String? {
    if (bytes.size < 30) return "The selected file is not a valid WebP sticker."
    if (bytes.size > MAX_WEBP_STICKER_BYTES) {
        return "WebP stickers must be 500 KB or smaller."
    }

    if (String(bytes, 0, 4, StandardCharsets.US_ASCII) != "RIFF" ||
        String(bytes, 8, 4, StandardCharsets.US_ASCII) != "WEBP"
    ) {
        return "Choose a WebP sticker file."
    }

    val riffPayloadLength = readUInt32LittleEndian(bytes, 4)
    if (riffPayloadLength + 8L != bytes.size.toLong() || riffPayloadLength < 22L) {
        return "The selected WebP sticker is incomplete or corrupted."
    }

    val containerEnd = bytes.size
    var offset = 12
    var firstChunk = true
    var hasImagePayload = false

    while (offset < containerEnd) {
        if (offset + 8 > containerEnd) {
            return "The selected WebP sticker is incomplete or corrupted."
        }

        val chunkType = String(bytes, offset, 4, StandardCharsets.US_ASCII)
        val chunkLength = readUInt32LittleEndian(bytes, offset + 4)
        val payloadStart = offset + 8L
        val payloadEnd = payloadStart + chunkLength
        if (payloadEnd > containerEnd.toLong()) {
            return "The selected WebP sticker is incomplete or corrupted."
        }

        if (firstChunk && chunkType !in setOf("VP8 ", "VP8L", "VP8X")) {
            return "The selected WebP sticker is incomplete or corrupted."
        }

        when (chunkType) {
            "VP8X" -> if (chunkLength != 10L) {
                return "The selected WebP sticker is incomplete or corrupted."
            }
            "VP8 " -> {
                if (chunkLength < 10L) return "The selected WebP sticker is incomplete or corrupted."
                hasImagePayload = true
            }
            "VP8L" -> {
                if (chunkLength < 5L || (bytes[payloadStart.toInt()].toInt() and 0xff) != 0x2f) {
                    return "The selected WebP sticker is incomplete or corrupted."
                }
                hasImagePayload = true
            }
            "ANIM" -> if (chunkLength != 6L) {
                return "The selected WebP sticker is incomplete or corrupted."
            }
            "ANMF" -> {
                if (chunkLength < 16L) return "The selected WebP sticker is incomplete or corrupted."
                hasImagePayload = true
            }
        }

        val paddedEnd = payloadEnd + (chunkLength and 1L)
        if (paddedEnd > containerEnd.toLong()) {
            return "The selected WebP sticker is incomplete or corrupted."
        }
        offset = paddedEnd.toInt()
        firstChunk = false
    }

    if (offset != containerEnd || !hasImagePayload) {
        return "The selected WebP sticker is incomplete or corrupted."
    }

    return null
}

private fun readUInt32LittleEndian(bytes: ByteArray, offset: Int): Long =
    (bytes[offset].toLong() and 0xffL) or
        ((bytes[offset + 1].toLong() and 0xffL) shl 8) or
        ((bytes[offset + 2].toLong() and 0xffL) shl 16) or
        ((bytes[offset + 3].toLong() and 0xffL) shl 24)
