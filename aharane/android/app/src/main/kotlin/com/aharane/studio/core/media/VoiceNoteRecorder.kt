package com.aharane.studio.core.media

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import android.os.SystemClock
import java.io.File
import java.util.UUID

data class RecordedVoiceNote(
    val file: File,
    val durationSeconds: Int
)

/**
 * Records WhatsApp-compatible OGG/Opus voice notes in the app cache.
 * Files are deleted by the caller immediately after the server confirms upload.
 */
class VoiceNoteRecorder(context: Context) {
    private val cacheDirectory = context.applicationContext.cacheDir
    private var recorder: MediaRecorder? = null
    private var outputFile: File? = null
    private var startedAt: Long = 0L

    val isRecording: Boolean
        get() = recorder != null

    fun start() {
        check(recorder == null) { "A voice recording is already running." }
        check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            "OGG/Opus voice-note recording requires Android 10 or newer."
        }
        val file = File(cacheDirectory, "aharane-voice-${UUID.randomUUID()}.ogg")
        val active = MediaRecorder().apply {
            setAudioSource(MediaRecorder.AudioSource.MIC)
            setOutputFormat(MediaRecorder.OutputFormat.OGG)
            setAudioEncoder(MediaRecorder.AudioEncoder.OPUS)
            setAudioChannels(1)
            setAudioSamplingRate(48_000)
            setAudioEncodingBitRate(32_000)
            setOutputFile(file.absolutePath)
            prepare()
            start()
        }
        recorder = active
        outputFile = file
        startedAt = SystemClock.elapsedRealtime()
    }

    fun stop(): RecordedVoiceNote {
        val active = recorder ?: error("No voice recording is active.")
        val file = outputFile ?: error("The voice recording file is missing.")
        try {
            active.stop()
        } finally {
            active.reset()
            active.release()
            recorder = null
            outputFile = null
        }
        require(file.isFile && file.length() > 0L) { "The voice recording is empty." }
        val duration = ((SystemClock.elapsedRealtime() - startedAt) / 1000L).toInt().coerceAtLeast(1)
        startedAt = 0L
        return RecordedVoiceNote(file, duration)
    }

    fun cancel() {
        val active = recorder
        recorder = null
        try {
            active?.stop()
        } catch (_: Exception) {
            // A recorder stopped before its first valid frame may reject stop().
        } finally {
            active?.reset()
            active?.release()
        }
        outputFile?.delete()
        outputFile = null
        startedAt = 0L
    }
}
