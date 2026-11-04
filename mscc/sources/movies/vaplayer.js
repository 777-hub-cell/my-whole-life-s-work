import { inspectVaPlayer, materializeVaPlayer } from '../../providers/vaplayer.js'
import { browseMetadata, mediaDetails, searchMetadata } from '../../providers/screen-source-metadata.js'

function cleanName(value) {
  return String(value || 'movie').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0,120) || 'movie'
}

async function identity(context, item) {
  const details = await mediaDetails(context, item, 'movie')
  const imdbId = String(details?.imdbId || '').trim()
  if (!imdbId) throw new Error('VaPlayer could not resolve an IMDb ID for this movie.')
  return { imdbId }
}

async function deliver(item, quality, delivery, context, onProgress) {
  try { await onProgress?.({ phase:'resolving' }) } catch {}
  const ids = await identity(context, item)
  const media = await materializeVaPlayer({ type:'movie', ...ids }, quality, delivery, { onProgress })
  try {
    try { await onProgress?.({ phase:'upload' }) } catch {}
    if (delivery === 'video') {
      await context.send({ video:{ url:media.path }, mimetype:'video/mp4', caption:item?.title || undefined })
    } else {
      await context.send({
        document:{ url:media.path },
        mimetype:'video/x-matroska',
        fileName:cleanName(item?.title) + '.mkv',
        caption:item?.title || undefined,
      })
    }
    return { delivered:true }
  } finally {
    await media.cleanup()
  }
}

export default {
  id:'vaplayer',
  name:'VaPlayer',
  description:'Movies resolved by IMDb identity and delivered copy-only from VaPlayer.',
  fallbackOrder:30,
  brandAliases:['VA Player'],

  async run({ action, query, item, quality = 'source', delivery = 'document', context, onProgress }) {
    if (action === 'search') return { items:await searchMetadata(context, query, 'movie') }
    if (action === 'browse') return { items:await browseMetadata(context, 'movie') }
    if (action === 'options') {
      const ids = await identity(context, item)
      const resolved = await inspectVaPlayer({ type:'movie', ...ids })
      return { qualities:resolved.qualities, deliveries:['document','video'] }
    }
    if (action === 'download') return deliver(item, quality, delivery, context, onProgress)
    throw new Error('Unsupported VaPlayer movie action: ' + action)
  },
}
