import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  STICKER_CANVAS,
  STICKER_CORNER_RADIUS,
  STICKER_FIT_FILTER,
  classifyMessageMedia,
  mediaIsAnimated,
  socketMediaDownloadOptions,
  downloadMediaWithSocketHost,
  downloadCommandMedia,
  resolveCommandViewOnceMedia,
  runFfmpeg,
  runFfmpegWithFrameSyncFallback,
  waveformFromPcm,
  mediaToSoundSticker,
} from './utils/media-conversion.js'
import { readStickerMetadata } from './utils/sticker-metadata.js'

assert.equal(STICKER_CANVAS, 512)

const silencePcm = Buffer.alloc(64 * 2 * 2)
assert.deepEqual(waveformFromPcm(silencePcm), Buffer.alloc(64),
  'silence must produce a fixed-length zero waveform')
const waveformFixture = Buffer.alloc(64 * 2 * 2)
for (let index = 0; index < waveformFixture.length / 2; index += 1) {
  waveformFixture.writeInt16LE(index % 16 === 0 ? 12000 : 2000, index * 2)
}
const fixtureWaveform = waveformFromPcm(waveformFixture)
assert.equal(fixtureWaveform.length, 64)
assert.ok([...fixtureWaveform].every(value => value >= 0 && value <= 100))
assert.ok(fixtureWaveform.some(value => value > 0))
assert.equal(STICKER_CORNER_RADIUS, 20, 'Nexia stickerUtils.js rounded-square radius is 20px, not 48/56px')
assert.match(STICKER_FIT_FILTER, /scale=512:512:force_original_aspect_ratio=increase/)
assert.match(STICKER_FIT_FILTER, /crop=512:512,format=rgba/)
assert.match(STICKER_FIT_FILTER, /geq=r='r\(X,Y\)':g='g\(X,Y\)':b='b\(X,Y\)'/)
assert.ok(STICKER_FIT_FILTER.includes("pow(max(20-X,max(X-492,0)),2)+pow(max(20-Y,max(Y-492,0)),2),400),alpha(X,Y),0)"),
  'Mask must match the exact Nexia stickerUtils.js 20px alpha expression')
assert.doesNotMatch(STICKER_FIT_FILTER, /pad=/)
assert.doesNotMatch(STICKER_FIT_FILTER, /color=0x00000000/)

assert.equal(classifyMessageMedia({ key:'imageMessage', media:{ mimetype:'image/jpeg' } }), 'image')
assert.equal(classifyMessageMedia({ key:'videoMessage', media:{ mimetype:'video/mp4' } }), 'video')
assert.equal(classifyMessageMedia({ key:'stickerMessage', media:{ mimetype:'image/webp' } }), 'sticker')
assert.equal(classifyMessageMedia({ key:'documentMessage', media:{ mimetype:'image/gif' } }), 'video')
assert.equal(classifyMessageMedia({ key:'documentMessage', media:{ mimetype:'image/png' } }), 'image')
assert.equal(classifyMessageMedia({ key:'documentMessage', media:{ mimetype:'text/plain' } }), 'document')
assert.equal(classifyMessageMedia({ key:'audioMessage', media:{ mimetype:'audio/ogg' } }), 'audio')

assert.equal(mediaIsAnimated({ key:'videoMessage', media:{ mimetype:'video/mp4' } }), true)
assert.equal(mediaIsAnimated({ key:'stickerMessage', media:{ mimetype:'image/webp', isAnimated:true } }), true)
assert.equal(mediaIsAnimated({ key:'stickerMessage', media:{ mimetype:'image/webp', isAnimated:false } }), false)

// View Once content is detected from the original quoted message wrapper.
// The conversion path must reject it before invoking Baileys' media downloader.
const viewOnceQuotedContext = {
  key: {
    remoteJid: '120363000000000000@g.us',
    id: 'sticker-command-id',
  },
  message: {
    extendedTextMessage: {
      text: '.s',
      contextInfo: {
        stanzaId: 'view-once-image-id',
        participant: '2348000000000@s.whatsapp.net',
        quotedMessage: {
          viewOnceMessageV2: {
            message: {
              imageMessage: {
                mimetype: 'image/jpeg',
                mediaKey: Buffer.alloc(32, 7),
                fileEncSha256: Buffer.alloc(32, 8),
                fileSha256: Buffer.alloc(32, 9),
                directPath: '/view-once/image',
              },
            },
          },
        },
      },
    },
  },
}
const quotedViewOnce = resolveCommandViewOnceMedia(
  { message: viewOnceQuotedContext },
  ['image', 'video'],
)
assert.equal(quotedViewOnce?.kind, 'image')
assert.equal(quotedViewOnce?.found.key, 'imageMessage')

const directViewOnceContext = {
  key: { remoteJid: '120363000000000000@g.us', id: 'view-once-video-id' },
  message: {
    ephemeralMessage: {
      message: {
        viewOnceMessageV2Extension: {
          message: {
            videoMessage: {
              mimetype: 'video/mp4',
              viewOnce: true,
              mediaKey: Buffer.alloc(32, 3),
            },
          },
        },
      },
    },
  },
}
const directViewOnce = resolveCommandViewOnceMedia(
  { message: directViewOnceContext },
  ['image', 'video'],
)
assert.equal(directViewOnce?.kind, 'video')

const ordinaryQuotedImage = {
  key: { remoteJid: '120363000000000000@g.us', id: 'ordinary-command-id' },
  message: {
    extendedTextMessage: {
      text: '.s',
      contextInfo: {
        stanzaId: 'ordinary-image-id',
        participant: '2348000000000@s.whatsapp.net',
        quotedMessage: {
          imageMessage: {
            mimetype: 'image/jpeg',
            mediaKey: Buffer.alloc(32, 1),
            directPath: '/ordinary/image',
          },
        },
      },
    },
  },
}
assert.equal(
  resolveCommandViewOnceMedia({ message: ordinaryQuotedImage }, ['image', 'video']),
  null,
  'ordinary group images must keep using the normal conversion path',
)

let viewOnceDownloadCalled = false
await assert.rejects(
  downloadCommandMedia({
    message: viewOnceQuotedContext,
    account: {
      sock: {
        async refreshMediaConn() {},
        getMediaHost() { return 'media.whatsapp.net' },
      },
    },
  }, ['image', 'video']),
  /cannot convert or copy View Once media/i,
)
assert.equal(viewOnceDownloadCalled, false,
  'the View Once guard must stop before the media downloader is invoked')

// Media downloads must use the socket's current media_conn host, not
// Baileys' hard-coded default CDN host. A transient fetch failure gets one
// forced media_conn refresh and one retry.
let activeMediaHost = 'media-old.whatsapp.net'
const refreshCalls = []
const mediaSock = {
  async refreshMediaConn(force = false) {
    refreshCalls.push(force)
    if (force) activeMediaHost = 'media-new.whatsapp.net'
  },
  getMediaHost() {
    return activeMediaHost
  },
}
const downloadCalls = []
const fixtureBuffer = Buffer.from('media fixture')
const downloaded = await downloadMediaWithSocketHost(
  { key: { id: 'media-fixture' } },
  mediaSock,
  {},
  async (_message, type, options) => {
    downloadCalls.push({ type, options })
    if (downloadCalls.length === 1) throw new TypeError('fetch failed')
    return fixtureBuffer
  },
)
assert.equal(downloaded, fixtureBuffer)
assert.deepEqual(refreshCalls, [false, true])
assert.deepEqual(downloadCalls, [
  { type:'buffer', options:{ host:'media-old.whatsapp.net' } },
  { type:'buffer', options:{ host:'media-new.whatsapp.net' } },
])
assert.deepEqual(await socketMediaDownloadOptions({}), {})

const nonRetryRefreshes = []
const nonRetrySock = {
  async refreshMediaConn(force = false) { nonRetryRefreshes.push(force) },
  getMediaHost() { return 'media.whatsapp.net' },
}
await assert.rejects(
  downloadMediaWithSocketHost(
    { key: { id:'invalid-key-fixture' } },
    nonRetrySock,
    {},
    async () => { throw new Error('Cannot derive from empty media key') },
  ),
  /empty media key/,
)
assert.deepEqual(nonRetryRefreshes, [false], 'non-network media errors must not trigger forced CDN refresh')


  // New FFmpeg uses -fps_mode; older Azure FFmpeg 4.4 only supports -vsync.
  // Simulate that exact unsupported-option response and verify the wrapper
  // retries with the equivalent legacy mode instead of hiding real errors.
  const compatDir = await mkdtemp(join(tmpdir(), 'mscc-ffmpeg-compat-'))
  const fakeFfmpeg = join(compatDir, 'ffmpeg')
  const callLog = join(compatDir, 'calls.txt')
  const previousFfmpegPath = process.env.FFMPEG_PATH
  const previousCallLog = process.env.MSCC_FFMPEG_TEST_LOG
  try {
    await writeFile(fakeFfmpeg, `#!/bin/sh
printf '%s\\n' '__CALL__' >> "$MSCC_FFMPEG_TEST_LOG"
printf '%s\\n' "$@" >> "$MSCC_FFMPEG_TEST_LOG"
for arg in "$@"; do
  if [ "$arg" = "-fps_mode" ]; then
    echo "Unrecognized option 'fps_mode'." >&2
    exit 8
  fi
done
exit 0
`)
    await chmod(fakeFfmpeg, 0o755)
    process.env.FFMPEG_PATH = fakeFfmpeg
    process.env.MSCC_FFMPEG_TEST_LOG = callLog
    await runFfmpegWithFrameSyncFallback(['-i', 'input.gif', '-fps_mode', 'passthrough', 'output.webp'])
    const calls = (await readFile(callLog, 'utf8')).split('__CALL__').map(value => value.trim()).filter(Boolean)
    assert.equal(calls.length, 2, 'unsupported modern option must cause exactly one legacy retry')
    assert.ok(calls[0].includes('-fps_mode') && calls[0].includes('passthrough'),
      'first attempt must use modern passthrough mode')
    assert.ok(calls[1].includes('-vsync') && calls[1].includes('0'),
      'fallback must map passthrough to legacy -vsync 0')
    assert.ok(!calls[1].includes('-fps_mode') && !calls[1].includes('passthrough'),
      'legacy fallback must not retain modern frame-sync arguments')
  } finally {
    if (previousFfmpegPath === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = previousFfmpegPath
    if (previousCallLog === undefined) delete process.env.MSCC_FFMPEG_TEST_LOG
    else process.env.MSCC_FFMPEG_TEST_LOG = previousCallLog
    await rm(compatDir, { recursive:true, force:true })
  }

// Sound-bearing videos must produce a WebP plus a separate Opus payload.
// A source with no audio stream returns null so .sticker uses its silent path.
const soundFixtureDir = await mkdtemp(join(tmpdir(), 'night-sound-sticker-test-'))
try {
  const soundVideoPath = join(soundFixtureDir, 'with-audio.mp4')
  await runFfmpeg([
    '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=12:duration=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2',
    '-shortest',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-movflags', '+faststart',
    soundVideoPath,
  ])
  const soundAssets = await mediaToSoundSticker(await readFile(soundVideoPath), {
    packName: 'NIGHT sound test',
    publisher: 'NIGHT',
    maxDurationSeconds: 2,
  })
  assert.ok(soundAssets, 'a video with an audio stream must be recognized as a sound sticker')
  assert.ok(Buffer.isBuffer(soundAssets.stickerBuffer) && soundAssets.stickerBuffer.length > 1000)
  assert.ok(Buffer.isBuffer(soundAssets.audioBuffer) && soundAssets.audioBuffer.length > 100)
  assert.equal(soundAssets.audioBuffer.toString('ascii', 0, 4), 'OggS')
  assert.equal(soundAssets.isAnimated, true)
  assert.ok(soundAssets.audioSeconds > 0 && soundAssets.audioSeconds <= 2.1)
  assert.ok(Buffer.isBuffer(soundAssets.audioWaveform))
  assert.equal(soundAssets.audioWaveform.length, 64)
  assert.ok([...soundAssets.audioWaveform].every(value => value <= 100))
  assert.ok([...soundAssets.audioWaveform].some(value => value > 0))

  const soundMeta = await readStickerMetadata(soundAssets.stickerBuffer)
  assert.equal(soundMeta?.['sticker-pack-name'], 'NIGHT sound test')
  assert.equal(soundMeta?.['sticker-pack-publisher'], 'NIGHT')
  assert.equal(soundMeta?.['sound-sha256'], undefined,
    'sound metadata must not add an undocumented EXIF property')

  const silentVideoPath = join(soundFixtureDir, 'without-audio.mp4')
  await runFfmpeg([
    '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=12:duration=2',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    silentVideoPath,
  ])
  const silentResult = await mediaToSoundSticker(await readFile(silentVideoPath), {
    packName: 'NIGHT silent test',
    maxDurationSeconds: 2,
  })
  assert.equal(silentResult, null, 'a video without an audio stream must not be mislabeled as a sound sticker')
} finally {
  await rm(soundFixtureDir, { recursive:true, force:true })
}

console.log('media conversion self-test passed')
