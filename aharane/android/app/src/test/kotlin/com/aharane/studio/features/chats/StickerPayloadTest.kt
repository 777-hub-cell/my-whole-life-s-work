package com.aharane.studio.features.chats

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class StickerPayloadTest {
    @Test
    fun acceptsAWellFormedWebpContainer() {
        assertNull(validateWebpStickerPayload(webpPayload(24)))
    }

    @Test
    fun rejectsNonWebpFilesEvenWhenThePickerReportsAnImage() {
        assertEquals(
            "Choose a WebP sticker file.",
            validateWebpStickerPayload("not a sticker".toByteArray())
        )
    }

    @Test
    fun rejectsTruncatedRiffContainers() {
        val bytes = webpPayload(12)
        bytes[4] = 0x40
        assertEquals(
            "The selected WebP sticker is incomplete or corrupted.",
            validateWebpStickerPayload(bytes)
        )
    }

    @Test
    fun rejectsFilesAboveTheStickerSizeLimit() {
        val bytes = webpPayload(MAX_WEBP_STICKER_BYTES + 1)
        assertEquals(
            "WebP stickers must be 2 MB or smaller.",
            validateWebpStickerPayload(bytes)
        )
    }

    private fun webpPayload(size: Int): ByteArray {
        val bytes = ByteArray(size)
        "RIFF".toByteArray(Charsets.US_ASCII).copyInto(bytes, 0)
        val payloadLength = size - 8
        bytes[4] = (payloadLength and 0xff).toByte()
        bytes[5] = ((payloadLength ushr 8) and 0xff).toByte()
        bytes[6] = ((payloadLength ushr 16) and 0xff).toByte()
        bytes[7] = ((payloadLength ushr 24) and 0xff).toByte()
        "WEBP".toByteArray(Charsets.US_ASCII).copyInto(bytes, 8)
        return bytes
    }
}
