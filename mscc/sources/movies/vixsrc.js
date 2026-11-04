import { inspectVixSrc, materializeVixSrc } from '../../providers/vixsrc.js'
import { browseMetadata, searchMetadata, tmdbIdOf } from '../../providers/screen-source-metadata.js'

function cleanName(value) {
  return String(value || 'movie').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0,120) || 'movie'
}

async function deliver(item, quality, delivery, context, onProgress) {
  const tmdbId = tmdbIdOf(item)
  if (!tmdbId) throw new Error('VixSrc movie TMDB identity is missing.')
  try { await onProgress?.({ phase:'resolving' }) } catch {}
  const media = await materializeVixSrc({ type:'movie', tmdbId }, quality, delivery, { onProgress })
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
  id:'vixsrc',
  name:'VixSrc',
  description:'Movies resolved by TMDB identity and delivered copy-only from VixSrc.',
  fallbackOrder:20,

  async run({ action, query, item, quality = 'source', delivery = 'document', context, onProgress }) {
    if (action === 'search') return { items:await searchMetadata(context, query, 'movie') }
    if (action === 'browse') return { items:await browseMetadata(context, 'movie') }
    if (action === 'options') {
      const tmdbId = tmdbIdOf(item)
      if (!tmdbId) return { qualities:['source','1080','720','480','360'], deliveries:['document','video'] }
      const resolved = await inspectVixSrc({ type:'movie', tmdbId })
      return { qualities:resolved.qualities, deliveries:['document','video'] }
    }
    if (action === 'download') return deliver(item, quality, delivery, context, onProgress)
    throw new Error('Unsupported VixSrc movie action: ' + action)
  },
}
