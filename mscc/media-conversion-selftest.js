import assert from 'node:assert/strict'
import {
  STICKER_CANVAS,
  STICKER_CORNER_RADIUS,
  STICKER_FIT_FILTER,
  classifyMessageMedia,
  mediaIsAnimated,
  socketMediaDownloadOptions,
  downloadMediaWithSocketHost,
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

console.log('media conversion self-test passed')
