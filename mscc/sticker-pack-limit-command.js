import { createHash } from 'node:crypto'
import { mediaToSticker } from './utils/media-conversion.js'
import { downloadImageUrl } from './utils/remote-image.js'
import { parsePinterestSearchArgs, pinterestPackName, searchPinterestImages } from './utils/pinterest-search.js'
import {
  parseStickerPackProbeCount,
  sendStickerPackProbe,
  STICKER_PACK_PROBE_LIMIT,
  STICKER_PACK_PROBE_MIN,
} from './utils/sticker-pack-probe.js'

function isPrivateChat(jid) {
  const value = String(jid || '')
  return value.endsWith('@s.whatsapp.net') || value.endsWith('@lid') || value.endsWith('@hosted.lid')
}

function isAuthorized(ctx) {
  return ctx?.privateControl === true ||
    ctx?.isSupremeOwner === true ||
    ctx?.isPublicOwner === true ||
    ctx?.isSessionOwner === true
}

function shortError(error) {
  return String(error?.message || error || 'Unknown error').replace(/\s+/g, ' ').trim().slice(0, 220)
}

function hash(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function reply(ctx, message) {
  if (typeof ctx?.reply !== 'function') throw new Error('Reply channel is unavailable.')
  return ctx.reply(String(message))
}

export async function runStickerPackLimitCommand(ctx, dependencies = {}) {
  const prefix = String(ctx?.publicPrefix || '.')
  const chat = String(ctx?.message?.key?.remoteJid || '')

  if (!isPrivateChat(chat)) {
    await reply(ctx, 'For safety, .pslimit only runs in a private one-to-one chat, never in a group or channel.')
    return { ok:false, reason:'private-chat-required' }
  }

  if (!isAuthorized(ctx)) {
    await reply(ctx, 'I received .pslimit, but could not verify this sender as an authorized NIGHT owner. No stickers were sent. Check the configured OWNER_NUMBER / CONTROL_NUMBERS.')
    return { ok:false, reason:'owner-verification-failed' }
  }

  const sock = ctx?.account?.sock
  if (!sock || typeof sock.sendMessage !== 'function') {
    await reply(ctx, 'WhatsApp connection is unavailable.')
    return { ok:false, reason:'socket-unavailable' }
  }

  const args = Array.isArray(ctx.args) ? ctx.args.map(value => String(value || '').trim()).filter(Boolean) : []
  const directCount = args.length === 1 ? parseStickerPackProbeCount(args[0]) : null
  let count = directCount
  let stickers = null
  let packName = ''
  let description = ''

  if (directCount !== null) {
    packName = 'NIGHT Pack Test ' + directCount
    description = 'Numbered diagnostic pack with ' + directCount + ' stickers.'
    await reply(ctx, 'Building one numbered diagnostic pack with ' + directCount + ' stickers…')
  } else {
    const parsed = parsePinterestSearchArgs(args, {
      defaultCount:30,
      minCount:STICKER_PACK_PROBE_MIN,
      maxCount:150,
    })
    if (!parsed.query) {
      await reply(
        ctx,
        'Use ' + prefix + 'pslimit <3-' + STICKER_PACK_PROBE_LIMIT + '> for a numbered test, or ' +
        prefix + 'pslimit <search terms> <3-150> for real Pinterest stickers. Example: ' +
        prefix + 'pslimit cat 80.'
      )
      return { ok:false, reason:'invalid-arguments' }
    }

    count = parsed.count
    const cleanName = pinterestPackName(parsed.query)
    packName = 'NIGHT ' + cleanName + ' limit test'
    description = 'One-pack size test using Pinterest search: ' + parsed.query
    await reply(ctx, 'Finding ' + count + ' real stickers for *' + parsed.query + '* to test as ONE pack…')

    const search = dependencies.searchPinterestImages || searchPinterestImages
    const download = dependencies.downloadImageUrl || downloadImageUrl
    const convert = dependencies.mediaToSticker || mediaToSticker
    const candidates = await search(parsed.query, { limit:count, candidateMultiplier:4 })
    stickers = []
    const seen = new Set()

    for (const candidate of candidates || []) {
      if (stickers.length >= count) break
      try {
        const image = await download(candidate.imageUrl)
        if (!image?.buffer || !Buffer.isBuffer(image.buffer)) continue
        const digest = hash(image.buffer)
        if (seen.has(digest)) continue
        seen.add(digest)
        const sticker = await convert(image.buffer, {
          animated:image.contentType === 'image/gif',
          packName,
        })
        if (Buffer.isBuffer(sticker) && sticker.length) stickers.push(sticker)
      } catch (error) {
        // A failed source image is skipped; only the final converted count is probed.
        console.warn('NIGHT pack-limit candidate skipped:', shortError(error))
      }
    }

    if (stickers.length < count) {
      await reply(
        ctx,
        'I could convert only ' + stickers.length + '/' + count + ' usable stickers. No pack was sent, so this does not test the WhatsApp limit. Try a smaller count.'
      )
      return { ok:false, reason:'insufficient-usable-stickers', converted:stickers.length, requested:count }
    }
  }

  try {
    const send = dependencies.sendStickerPackProbe || sendStickerPackProbe
    const result = await send({
      sock,
      chat,
      count,
      stickers,
      packName,
      description,
      quoted:ctx.message,
    })
    const next = count + 20
    await reply(
      ctx,
      'Accepted: ' + result.count + ' stickers were sent together in ONE pack. This confirms WhatsApp accepts at least ' +
      result.count + '; it does not claim this is the maximum. ' +
      (next <= STICKER_PACK_PROBE_LIMIT
        ? 'Next test: ' + prefix + (stickers ? 'pslimit ' + (args.slice(0, -1).join(' ') || 'cat') + ' ' + next : 'pslimit ' + next) + '.'
        : 'The current diagnostic ceiling is ' + STICKER_PACK_PROBE_LIMIT + '; increase it if this size also succeeds.')
    )
    return { ok:true, count:result.count, name:result.name }
  } catch (error) {
    const detail = shortError(error)
    await reply(
      ctx,
      'The ' + count + '-sticker probe did not complete. This is not automatically proof of a sticker-count limit; it could also be a conversion, upload, or connection failure. Details: ' + detail
    )
    return { ok:false, reason:'send-failed', error:detail }
  }
}
