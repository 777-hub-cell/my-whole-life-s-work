import {
  browseTitles,
  materializeStream,
  qualityList,
  resolveStream,
  searchTitles,
} from '../../providers/streamingunity.js'

function cleanName(value) {
  return String(value || 'movie')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0,120) || 'movie'
}

async function sendMeasured(context, payload, media, resolveMs) {
  const bytes = Number(media?.probe?.format?.size || 0) || 0
  const startedAt = Date.now()
  let sent = false
  try {
    await context.send(payload)
    sent = true
  } finally {
    const durationMs = Date.now() - startedAt
    const throughputMbps = durationMs > 0 && bytes > 0
      ? Number((bytes * 8 / durationMs / 1000).toFixed(2))
      : 0
    console.info('[MSCC_MEDIA_TRANSFER] ' + JSON.stringify({
      source:'StreamingUnity', phase:'whatsapp-upload', durationMs, bytes,
      throughputMbps, resolveMs, success:sent,
    }))
  }
}

async function deliver(item, quality, delivery, context) {
  const resolveStartedAt = Date.now()
  const stream = await resolveStream(item)
  const resolveMs = Date.now() - resolveStartedAt
  const media = await materializeStream(stream, quality, delivery)
  try {
    const title = cleanName(item?.title)
    if (delivery === 'video') {
      await sendMeasured(context, {
        video:{ url:media.path },
        mimetype:'video/mp4',
        caption:item?.title || undefined,
      }, media, resolveMs)
    } else {
      await sendMeasured(context, {
        document:{ url:media.path },
        mimetype:'video/x-matroska',
        fileName:title + '.mkv',
        caption:item?.title || undefined,
      }, media, resolveMs)
    }
    return { delivered:true }
  } finally {
    await media.cleanup()
  }
}

export default {
  id:'streamingunity',
  name:'StreamingUnity',
  description:'Movies resolved to live HLS and delivered without video re-encoding.',
  fallbackOrder:10,
  brandAliases:['StreamingCommunity'],

  async run({ action, query, item, quality = 'source', delivery = 'document', context }) {
    if (action === 'search') {
      return { items:await searchTitles(query, 'movie') }
    }
    if (action === 'browse') {
      return { items:await browseTitles('movie') }
    }
    if (action === 'options') {
      const stream = await resolveStream(item)
      return {
        qualities:qualityList(stream),
        deliveries:['document','video'],
      }
    }
    if (action === 'download') {
      return deliver(item, quality, delivery, context)
    }
    throw new Error('Unsupported StreamingUnity movie action: ' + action)
  },
}
