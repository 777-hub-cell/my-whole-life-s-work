package com.aharane.studio.features.chats

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class StickerPayloadTest {
    @Test
    fun acceptsAWebpWithAnExtendedHeaderAndImagePayload() {
        assertNull(validateWebpStickerPayload(webpPayload()))
    }

    @Test
    fun rejectsNonWebpFilesEvenWhenThePickerReportsAnImage() {
        val bytes = webpPayload()
        "NOPE".toByteArray(Charsets.US_ASCII).copyInto(bytes, 0)
        assertEquals("Choose a WebP sticker file.", validateWebpStickerPayload(bytes))
    }

    @Test
    fun rejectsTruncatedRiffContainers() {
        val bytes = webpPayload()
        bytes[4] = 0x40
        assertEquals(
            "The selected WebP sticker is incomplete or corrupted.",
            validateWebpStickerPayload(bytes)
        )
    }

    @Test
    fun rejectsFilesAboveTheStickerSizeLimit() {
        assertEquals(
            "WebP stickers must be 500 KB or smaller.",
            validateWebpStickerPayload(ByteArray(MAX_WEBP_STICKER_BYTES + 1))
        )
    }

    @Test
    fun rejectsUnexpectedFirstChunks() {
        val bytes = webpPayload()
        "ANIM".toByteArray(Charsets.US_ASCII).copyInto(bytes, 12)
        assertEquals(
            "The selected WebP sticker is incomplete or corrupted.",
            validateWebpStickerPayload(bytes)
        )
    }

    @Test
    fun rejectsExtendedHeadersWithoutAnImageFrame() {
        assertEquals(
            "The selected WebP sticker is incomplete or corrupted.",
            validateWebpStickerPayload(webpPayload(imageChunk = false))
        )
    }

    private fun webpPayload(imageChunk: Boolean = true): ByteArray {
        val size = if (imageChunk) 44 else 30
        val bytes = ByteArray(size)
        "RIFF".toByteArray(Charsets.US_ASCII).copyInto(bytes, 0)
        writeUInt32LittleEndian(bytes, 4, size - 8)
        "WEBP".toByteArray(Charsets.US_ASCII).copyInto(bytes, 8)
        "VP8X".toByteArray(Charsets.US_ASCII).copyInto(bytes, 12)
        writeUInt32LittleEndian(bytes, 16, 10)
        if (imageChunk) {
            "VP8L".toByteArray(Charsets.US_ASCII).copyInto(bytes, 30)
            writeUInt32LittleEndian(bytes, 34, 5)
            bytes[38] = 0x2f
        }
        return bytes
    }

    private fun writeUInt32LittleEndian(bytes: ByteArray, offset: Int, value: Int) {
        bytes[offset] = (value and 0xff).toByte()
        bytes[offset + 1] = ((value ushr 8) and 0xff).toByte()
        bytes[offset + 2] = ((value ushr 16) and 0xff).toByte()
        bytes[offset + 3] = ((value ushr 24) and 0xff).toByte()
    }
}
