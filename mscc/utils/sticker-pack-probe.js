import { createCanvas } from '@napi-rs/canvas'

export const STICKER_PACK_PROBE_LIMIT = 200
export const STICKER_PACK_PROBE_MIN = 3

export function parseStickerPackProbeCount(value) {
  const raw = String(value ?? '').trim()
  if (!/^\d+$/.test(raw)) return null
  const count = Number(raw)
  if (!Number.isSafeInteger(count) || count < STICKER_PACK_PROBE_MIN || count > STICKER_PACK_PROBE_LIMIT) return null
  return count
}

function numberedStickerPng(index, total) {
  const canvas = createCanvas(512, 512)
  const context = canvas.getContext('2d')
  const red = (index + 31) % 256
  const green = (index * 73 + 50) % 256
  const blue = (index * 151 + 90) % 256

  context.fillStyle = 'rgb(' + red + ' ' + green + ' ' + blue + ')'
  context.fillRect(0, 0, 512, 512)
  context.fillStyle = '#f2f2f2'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = 'bold 112px sans-serif'
  context.fillText(String(index + 1).padStart(3, '0'), 256, 232)
  context.font = 'bold 30px sans-serif'
  context.fillText('OF ' + total, 256, 318)
  context.font = '24px sans-serif'
  context.fillText('NIGHT PACK TEST', 256, 430)

  return canvas.toBuffer('image/png')
}

export function buildStickerPackProbePayload(count, {
  stickers:providedStickers = null,
  packName = '',
  description = '',
} = {}) {
  if (!Number.isSafeInteger(count) || count < STICKER_PACK_PROBE_MIN || count > STICKER_PACK_PROBE_LIMIT) {
    throw new RangeError('Probe count must be between ' + STICKER_PACK_PROBE_MIN + ' and ' + STICKER_PACK_PROBE_LIMIT + '.')
  }

  let stickers
  if (providedStickers != null) {
    if (!Array.isArray(providedStickers) || providedStickers.length !== count) {
      throw new RangeError('The one-pack probe must contain exactly ' + count + ' converted stickers.')
    }
    stickers = providedStickers.map(data => {
      const buffer = Buffer.isBuffer(data) ? data : data?.data
      if (!Buffer.isBuffer(buffer) || !buffer.length) throw new TypeError('Every probe sticker must be a non-empty Buffer.')
      return { data:buffer }
    })
  } else {
    stickers = Array.from({ length:count }, (_, index) => ({
      data:numberedStickerPng(index, count),
    }))
  }

  const name = String(packName || ('NIGHT Pack Test ' + count)).trim().slice(0, 80)
  return {
    cover:stickers[0].data,
    stickers,
    name,
    publisher:'NIGHT Diagnostics',
    description:String(description || ('One-pack capacity probe with ' + count + ' stickers.')).slice(0, 300),
  }
}

export async function sendStickerPackProbe({
  sock,
  chat,
  count,
  stickers = null,
  packName = '',
  description = '',
  quoted,
} = {}) {
  if (!sock || typeof sock.sendMessage !== 'function' || !chat) {
    throw new Error('WhatsApp connection is unavailable.')
  }

  const payload = buildStickerPackProbePayload(count, {
    stickers,
    packName,
    description,
  })
  // Exactly one native WhatsApp sticker-pack send. Never invoke the normal splitter here.
  await sock.sendMessage(chat, payload, quoted ? { quoted } : undefined)
  return { count, name:payload.name }
}
