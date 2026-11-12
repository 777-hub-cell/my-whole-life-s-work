import { randomUUID } from 'node:crypto'
import { DEFAULT_STICKER_PUBLISHER, applyStickerMetadata } from './sticker-metadata.js'

export const NATIVE_STICKER_PACK_MAX = 60

export function splitStickerPackBuffers(buffers, maxPerPack = NATIVE_STICKER_PACK_MAX) {
  const source = Array.isArray(buffers) ? buffers.filter(Buffer.isBuffer) : []
  const max = Math.max(3, Number(maxPerPack) || NATIVE_STICKER_PACK_MAX)
  if (source.length < 3) return []
  if (source.length <= max) return [source]

  const packCount = Math.ceil(source.length / max)
  const baseSize = Math.floor(source.length / packCount)
  const remainder = source.length % packCount
  const chunks = []
  let offset = 0

  for (let index = 0; index < packCount; index += 1) {
    const size = baseSize + (index < remainder ? 1 : 0)
    chunks.push(source.slice(offset, offset + size))
    offset += size
  }

  return chunks.filter(chunk => chunk.length >= 3)
}

export async function sendNativeStickerPacks({
  sock,
  chat,
  stickers,
  packName,
  publisher = DEFAULT_STICKER_PUBLISHER,
  quoted,
} = {}) {
  if (!sock || !chat) throw new Error('WhatsApp connection is unavailable.')
  const name = String(packName || '').trim() || 'Stickers'
  const author = String(publisher || '').trim() || DEFAULT_STICKER_PUBLISHER
  const chunks = splitStickerPackBuffers(stickers)
  if (!chunks.length) throw new Error('A native sticker pack needs at least 3 usable stickers.')

  const sentSizes = []
  for (let index = 0; index < chunks.length; index += 1) {
    const packId = randomUUID()
    const chunk = []
    for (const sticker of chunks[index]) {
      chunk.push(await applyStickerMetadata(sticker, { packName:name, publisher:author, packId }))
    }

    await sock.sendMessage(chat, {
      cover:chunk[0],
      stickers:chunk.map(data => ({ data })),
      name,
      publisher:author,
      description:`Created by ${author}`,
    }, index === 0 && quoted ? { quoted } : undefined)
    sentSizes.push(chunk.length)
  }

  return sentSizes
}
