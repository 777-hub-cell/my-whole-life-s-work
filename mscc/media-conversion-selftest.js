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
  runFfmpegWithFrameSyncFallback,
} from './utils/media-conversion.js'

assert.equal(STICKER_CANVAS, 512)
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
    const calls = (await readFile(callLog, 'utf8')).split('\\n')
    assert.ok(calls.includes('-fps_mode'), 'first attempt must use the modern option')
    assert.ok(calls.includes('-vsync'), 'fallback must use the legacy option')
    assert.ok(calls.includes('passthrough') === false, 'legacy fallback must not retain modern mode')
    assert.ok(calls.includes('0'), 'passthrough must map to legacy -vsync 0')
  } finally {
    if (previousFfmpegPath === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = previousFfmpegPath
    if (previousCallLog === undefined) delete process.env.MSCC_FFMPEG_TEST_LOG
    else process.env.MSCC_FFMPEG_TEST_LOG = previousCallLog
    await rm(compatDir, { recursive:true, force:true })
  }

console.log('media conversion self-test passed')
