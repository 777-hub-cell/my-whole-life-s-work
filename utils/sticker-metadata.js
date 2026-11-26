import { randomBytes } from 'node:crypto'
import webpMux from 'node-webpmux'

export const DEFAULT_STICKER_PACK_NAME = 'MSCC'
export const DEFAULT_STICKER_PUBLISHER = '『N I G H T』'
export const DEFAULT_STICKER_EMOJIS = ['✨']

function cleanText(value, fallback) {
  const text = String(value ?? '').trim()
  return text || fallback
}

function normalizeStickerPackName(value) {
  let result = ''
  let pendingSpace = false
  for (const character of String(value ?? '')) {
    const code = character.codePointAt(0)
    const whitespace = character.trim() === '' ||
      code <= 0x1f || (code >= 0x7f && code <= 0x9f)
    if (whitespace) {
      if (result) pendingSpace = true
      continue
    }
    if (pendingSpace) result += ' '
    result += character
    pendingSpace = false
  }
  return Array.from(result).slice(0, 128).join('')
}
export function stickerPackNameForCommand(ctx, fallback = DEFAULT_STICKER_PACK_NAME) {
  // Preserve the original behaviour for unrelated commands that reuse this
  // helper: their own command arguments do not become sticker-pack titles.
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

export function stickerPackNameFromCommandArgs(ctx, fallback = DEFAULT_STICKER_PACK_NAME) {
  // The router has already resolved exactly .sticker or .s. Only trailing
  // raw text/args for these aliases are a custom pack title; publisher stays
  // unchanged and an empty argument falls back to the sender's profile name.
  const rawName = normalizeStickerPackName(ctx?.rawArgs)
  if (rawName) return rawName

  const argsText = Array.isArray(ctx?.args)
    ? ctx.args.join(' ')
    : typeof ctx?.args === 'string'
      ? ctx.args
      : ''
  const argsName = normalizeStickerPackName(argsText)
  if (argsName) return argsName

  return normalizeStickerPackName(stickerPackNameForCommand(ctx, fallback)) ||
    normalizeStickerPackName(fallback) ||
    DEFAULT_STICKER_PACK_NAME
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
} = {}) {
  const metadata = {
    'sticker-pack-id': cleanText(packId, randomBytes(32).toString('hex')),
    'sticker-pack-name': cleanText(packName, DEFAULT_STICKER_PACK_NAME),
    'sticker-pack-publisher': cleanText(publisher, DEFAULT_STICKER_PUBLISHER),
    emojis: cleanEmojis(emojis),
  }
  return metadata
}

export function buildStickerExif(options = {}) {
  const metadata = stickerMetadata(options)
  const json = Buffer.from(JSON.stringify(metadata), 'utf8')
  // Sound and ordinary stickers use the same supported WhatsApp sticker
  // pack EXIF format. The sound track is carried in the message protobuf.
  const header = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ])
  const exif = Buffer.concat([header, json])
  exif.writeUIntLE(json.length, 14, 4)
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
  const headerLength = bigEndian ? 26 : 22
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
