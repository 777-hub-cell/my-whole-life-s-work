package com.aharane.studio.core.media

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import java.io.File
import java.nio.ByteOrder
import kotlin.math.max
import kotlin.math.sqrt

/**
 * Decodes actual PCM output from the Android media codec and returns normalized
 * RMS amplitudes. An empty list means the attachment's codec/format did not
 * provide samples; callers must not synthesize a waveform in that case.
 */
object AudioWaveformDecoder {
    fun decode(file: File, barCount: Int = 48): List<Float> {
        if (!file.isFile || file.length() <= 0L || barCount <= 0) return emptyList()
        val extractor = MediaExtractor()
        var codec: MediaCodec? = null
        val windows = ArrayList<Float>(4096)
        try {
            extractor.setDataSource(file.absolutePath)
            val trackIndex = (0 until extractor.trackCount).firstOrNull { index ->
                extractor.getTrackFormat(index).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
            } ?: return emptyList()
            val format = extractor.getTrackFormat(trackIndex)
            val mime = format.getString(MediaFormat.KEY_MIME) ?: return emptyList()
            extractor.selectTrack(trackIndex)
            codec = MediaCodec.createDecoderByType(mime)
            codec.configure(format, null, null, 0)
            codec.start()

            val info = MediaCodec.BufferInfo()
            var inputEnded = false
            var outputEnded = false
            var outputFormat = format
            var sampleWindowEnergy = 0.0
            var sampleWindowCount = 0
            var totalSamples = 0

            while (!outputEnded && windows.size < 12000 && totalSamples < 12_000_000) {
                if (!inputEnded) {
                    val inputIndex = codec.dequeueInputBuffer(10_000)
                    if (inputIndex >= 0) {
                        val input = codec.getInputBuffer(inputIndex)
                            ?: throw IllegalStateException("The audio decoder did not expose an input buffer.")
                        input.clear()
                        val sampleSize = extractor.readSampleData(input, 0)
                        if (sampleSize < 0) {
                            codec.queueInputBuffer(
                                inputIndex, 0, 0, 0L, MediaCodec.BUFFER_FLAG_END_OF_STREAM
                            )
                            inputEnded = true
                        } else {
                            codec.queueInputBuffer(
                                inputIndex, 0, sampleSize, extractor.sampleTime, 0
                            )
                            extractor.advance()
                        }
                    }
                }

                when (val outputIndex = codec.dequeueOutputBuffer(info, 10_000)) {
                    MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> outputFormat = codec.outputFormat
                    MediaCodec.INFO_TRY_AGAIN_LATER -> Unit
                    else -> if (outputIndex >= 0) {
                        if (info.size > 0) {
                            val output = codec.getOutputBuffer(outputIndex)
                            if (output != null) {
                                val buffer = output.duplicate().order(ByteOrder.LITTLE_ENDIAN).apply {
                                    position(info.offset)
                                    limit(info.offset + info.size)
                                }
                                val encoding = runCatching {
                                    outputFormat.getInteger(MediaFormat.KEY_PCM_ENCODING)
                                }.getOrDefault(AudioFormat.ENCODING_PCM_16BIT)
                                if (encoding == AudioFormat.ENCODING_PCM_FLOAT) {
                                    while (buffer.remaining() >= 4 && totalSamples < 12_000_000) {
                                        val value = buffer.float.coerceIn(-1f, 1f).toDouble()
                                        sampleWindowEnergy += value * value
                                        sampleWindowCount += 1
                                        totalSamples += 1
                                        if (sampleWindowCount == 512) {
                                            windows.add(sqrt(sampleWindowEnergy / sampleWindowCount).toFloat())
                                            sampleWindowEnergy = 0.0
                                            sampleWindowCount = 0
                                        }
                                    }
                                } else {
                                    while (buffer.remaining() >= 2 && totalSamples < 12_000_000) {
                                        val value = buffer.short.toInt() / 32768.0
                                        sampleWindowEnergy += value * value
                                        sampleWindowCount += 1
                                        totalSamples += 1
                                        if (sampleWindowCount == 512) {
                                            windows.add(sqrt(sampleWindowEnergy / sampleWindowCount).toFloat())
                                            sampleWindowEnergy = 0.0
                                            sampleWindowCount = 0
                                        }
                                    }
                                }
                            }
                        }
                        if (sampleWindowCount > 0 && (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                            windows.add(sqrt(sampleWindowEnergy / sampleWindowCount).toFloat())
                            sampleWindowEnergy = 0.0
                            sampleWindowCount = 0
                        }
                        outputEnded = (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0
                        codec.releaseOutputBuffer(outputIndex, false)
                    }
                }
            }

            if (windows.isEmpty()) return emptyList()
            val peak = windows.maxOrNull()?.takeIf { it > 0f } ?: return emptyList()
            val result = ArrayList<Float>(barCount)
            for (index in 0 until barCount) {
                val start = index * windows.size / barCount
                val end = max(start + 1, (index + 1) * windows.size / barCount).coerceAtMost(windows.size)
                val amplitude = windows.subList(start.coerceAtMost(windows.lastIndex), end)
                    .maxOrNull() ?: 0f
                result.add((amplitude / peak).coerceIn(0.06f, 1f))
            }
            return result
        } catch (_: Exception) {
            return emptyList()
        } finally {
            runCatching { codec?.stop() }
            runCatching { codec?.release() }
            runCatching { extractor.release() }
        }
    }
}
