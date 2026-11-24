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
        val bytes = webpPayload(24)
        "NOPE".toByteArray(Charsets.US_ASCII).copyInto(bytes, 0)
        assertEquals(
            "Choose a WebP sticker file.",
            validateWebpStickerPayload(bytes)
        )
    }

    @Test
    fun rejectsTruncatedRiffContainers() {
        val bytes = webpPayload(24)
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

    @Test
    fun rejectsUnexpectedFirstImageChunks() {
        val bytes = webpPayload(24)
        "ANIM".toByteArray(Charsets.US_ASCII).copyInto(bytes, 12)
        assertEquals(
            "The selected WebP sticker is incomplete or corrupted.",
            validateWebpStickerPayload(bytes)
        )
    }

    private fun webpPayload(size: Int): ByteArray {
        val bytes = ByteArray(size)
        "RIFF".toByteArray(Charsets.US_ASCII).copyInto(bytes, 0)
        writeUInt32LittleEndian(bytes, 4, size - 8)
        "WEBP".toByteArray(Charsets.US_ASCII).copyInto(bytes, 8)
        "VP8X".toByteArray(Charsets.US_ASCII).copyInto(bytes, 12)
        writeUInt32LittleEndian(bytes, 16, size - 20)
        return bytes
    }

    private fun writeUInt32LittleEndian(bytes: ByteArray, offset: Int, value: Int) {
        bytes[offset] = (value and 0xff).toByte()
        bytes[offset + 1] = ((value ushr 8) and 0xff).toByte()
        bytes[offset + 2] = ((value ushr 16) and 0xff).toByte()
        bytes[offset + 3] = ((value ushr 24) and 0xff).toByte()
    }
