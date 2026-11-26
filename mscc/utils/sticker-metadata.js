import { randomBytes } from 'node:crypto'
import webpMux from 'node-webpmux'

export const DEFAULT_STICKER_PACK_NAME = 'MSCC'
export const DEFAULT_STICKER_PUBLISHER = '『N I G H T』'
export const DEFAULT_STICKER_EMOJIS = ['✨']

function cleanText(value, fallback) {
  const text = String(value ?? '').trim()
  return text || fallback
}

export function stickerPackNameForCommand(ctx, fallback = DEFAULT_STICKER_PACK_NAME) {
  const candidates = [
    ctx?.senderName,
    ctx?.message?.pushName,
    ctx?.userName,
    ctx?.userKey,
  ]
  for (const value of candidates) {
    const text = String(value ?? '').trim()
    if (text) return text.slice(0, 128)
  }
  return fallback
}

function cleanEmojis(value) {
  const list = Array.isArray(value)
    ? value.map(item => String(item ?? '').trim()).filter(Boolean)
    : []
  return list.length ? list : [...DEFAULT_STICKER_EMOJIS]
}

export function stickerMetadata({
  packName = DEFAULT_STICKER_PACK_NAME,
  publisher = DEFAULT_STICKER_PUBLISHER,
  emojis = DEFAULT_STICKER_EMOJIS,
  packId,
  soundSha256,
} = {}) {
  const metadata = {
    'sticker-pack-id': cleanText(packId, randomBytes(32).toString('hex')),
    'sticker-pack-name': cleanText(packName, DEFAULT_STICKER_PACK_NAME),
    'sticker-pack-publisher': cleanText(publisher, DEFAULT_STICKER_PUBLISHER),
    emojis: cleanEmojis(emojis),
  }
  if (typeof soundSha256 === 'string' && soundSha256.trim()) {
    metadata['sound-sha256'] = soundSha256.trim()
  }
  return metadata
}

export function buildStickerExif(options = {}) {
  const metadata = stickerMetadata(options)
  const json = Buffer.from(JSON.stringify(metadata), 'utf8')
  // WhatsApp sound stickers use the big-endian TIFF "WA" field marker.
  // Preserve the existing little-endian sticker metadata for ordinary stickers.
  const soundSticker = Boolean(metadata['sound-sha256'])
  const header = soundSticker
    ? Buffer.from([
        0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
        0x00, 0x01, 0x57, 0x41, 0x00, 0x07, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x1a, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00,
      ])
    : Buffer.from([
        0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
      ])
  const exif = Buffer.concat([header, json])
  if (soundSticker) exif.writeUInt32BE(json.length, 14)
  else exif.writeUIntLE(json.length, 14, 4)
  return exif
}

// Read the *saved WebP*, not the options passed to the encoder. This checks
// that the name WhatsApp receives is actually inside the transmitted file.
export async function readStickerMetadata(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null
  const image = new webpMux.Image()
  await image.load(buffer)
  const exif = image.exif
  if (!exif || exif.length < 22) return null
  const bytes = Buffer.from(exif)
  const bigEndian = bytes[0] === 0x4d && bytes[1] === 0x4d
  const length = bigEndian ? bytes.readUInt32BE(14) : bytes.readUInt32LE(14)
  const headerLength = 26
  if (!length || length > bytes.length - headerLength) return null
  try {
    const decoded = JSON.parse(bytes.subarray(headerLength, headerLength + length).toString('utf8'))
    return decoded && typeof decoded === 'object' ? decoded : null
  } catch {
    return null
  }
}

export async function applyStickerMetadata(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error('Sticker data is empty.')
  }

  const image = new webpMux.Image()
  await image.load(buffer)
  image.exif = buildStickerExif(options)
  return image.save(null)
}
