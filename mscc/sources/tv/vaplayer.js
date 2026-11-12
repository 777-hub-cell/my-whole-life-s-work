import { inspectVaPlayer, materializeVaPlayer } from '../../providers/vaplayer.js'
import { browseMetadata, episodeRows, mediaDetails, searchMetadata, seasonRows } from '../../providers/screen-source-metadata.js'

function cleanName(value) {
  return String(value || 'episode').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0,120) || 'episode'
}

function safeError(error) {
  const message = String(error && error.message || error || 'Unknown error')
  return message
    .replace(/https?:\/\/[^\s"'<>]+/gi, value => {
      try {
        const url = new URL(value)
        url.search = ''
        url.hash = ''
        return url.href
      } catch {
        return '[URL redacted]'
      }
    })
    .replace(/(token|key|sig|signature|auth|api[_-]?key)=([^&\s]+)/gi, '$1=[redacted]')
    .slice(0,600)
}

function episodeCode(season, episode) {
  return 'S' + String(Number(season) || 1).padStart(2,'0') + 'E' + String(Number(episode) || 1).padStart(2,'0')
}

async function updateProgress(progress, value, method = 'update') {
  const fn = progress?.[method] || progress?.update
  if (typeof fn !== 'function') return
  try { await fn.call(progress, value) } catch {}
}

async function imdbIdentity(context, item) {
  const details = await mediaDetails(context, item, 'tv')
  const imdbId = String(details?.imdbId || '').trim()
  if (!imdbId) throw new Error('VaPlayer could not resolve an IMDb ID for this TV series.')
  return imdbId
}

function normalizeRangeEpisodes(range, selection) {
  const start = Number(range?.start?.number)
  const end = Number(range?.end?.number)
  if (!Number.isInteger(start) || start <= 0 || !Number.isInteger(end) || end <= 0) {
    throw new Error('VaPlayer TV range is invalid.')
  }

  const low = Math.min(start, end)
  const high = Math.max(start, end)
  const rows = Array.isArray(selection) && selection.length
    ? selection.map(row => ({ ...row, number:Number(row?.number) }))
    : Array.from({ length:high - low + 1 }, (_, index) => ({ number:low + index }))

  if (!rows.length || rows.some(row => !Number.isInteger(row.number) || row.number <= 0)) {
    throw new Error('VaPlayer TV range contains an invalid episode number.')
  }
  if (rows.length > 250) throw new Error('VaPlayer TV batch exceeds the 250-episode limit.')

  const numbers = rows.map(row => row.number)
  if (numbers.some((number, index) => number < low || number > high || (index > 0 && number !== numbers[index - 1] + 1))) {
    throw new Error('VaPlayer TV batch must contain the selected contiguous episode range.')
  }
  return rows
}

async function deliverEpisode(item, seasonNumber, episode, quality, delivery, context, {
  imdbId:knownImdbId = '',
  materialize = materializeVaPlayer,
} = {}) {
  const season = Number(seasonNumber)
  const number = Number(episode?.number)
  if (!Number.isInteger(season) || season <= 0 || !Number.isInteger(number) || number <= 0) {
    throw new Error('VaPlayer TV episode identity is incomplete.')
  }

  let stage = 'resolve-imdb'
  let media = null
  let materializeMs = 0
  try {
    const imdbId = knownImdbId || await imdbIdentity(context, item)
    stage = 'materialize-copy'
    const materializeStartedAt = Date.now()
    media = await materialize({ type:'tv', imdbId, season, episode:number }, quality, delivery)
    materializeMs = Date.now() - materializeStartedAt

    const s = String(season).padStart(2,'0')
    const e = String(number).padStart(2,'0')
    const caption = (item?.title || 'TV') + ' — S' + s + 'E' + e
    stage = 'whatsapp-upload'
    const uploadStartedAt = Date.now()
    if (delivery === 'video') {
      await context.send({ video:{ url:media.path }, mimetype:'video/mp4', caption })
    } else {
      await context.send({
        document:{ url:media.path },
        mimetype:'video/x-matroska',
        fileName:cleanName(item?.title) + '.S' + s + 'E' + e + '.mkv',
        caption,
      })
    }
    const bytes = Number(media?.probe?.format?.size || 0) || 0
    console.info('[MSCC_MEDIA_TRANSFER] ' + JSON.stringify({
      source:'VaPlayer',
      phase:'whatsapp-upload',
      season,
      episode:number,
      bytes,
      materializeMs,
      uploadMs:Date.now() - uploadStartedAt,
      success:true,
    }))
    return { delivered:true }
  } catch (error) {
    console.error('[MSCC_MEDIA_TRANSFER] ' + JSON.stringify({
      source:'VaPlayer',
      phase:'download-failed',
      stage,
      season,
      episode:number,
      materializeMs,
      errorName:String(error && error.name || 'Error'),
      error:safeError(error),
    }))
    const wrapped = new Error('VaPlayer failed at ' + episodeCode(season, number) + ': ' + safeError(error), { cause:error })
    wrapped.code = 'vaplayer-episode-delivery-failed'
    wrapped.stage = stage
    throw wrapped
  } finally {
    if (media && typeof media.cleanup === 'function') await media.cleanup().catch(() => {})
  }
}

async function downloadRange({
  item,
  seasonNumber,
  range,
  selection,
  quality,
  delivery,
  context,
  resolveImdb = () => imdbIdentity(context, item),
  deliver = deliverEpisode,
}) {
  const season = Number(seasonNumber)
  if (!Number.isInteger(season) || season <= 0) throw new Error('VaPlayer TV season is invalid.')
  const chosen = normalizeRangeEpisodes(range, selection)
  const title = String(item?.title || 'TV')
  const progressText = 'VaPlayer — ' + title + '\nStarting ' + chosen.length + ' episode' + (chosen.length === 1 ? '' : 's') + ' in ' + episodeCode(season, chosen[0].number) + '–' + episodeCode(season, chosen.at(-1).number) + '.'
  let progress = null
  if (typeof context?.progress === 'function') {
    try { progress = await context.progress(progressText) } catch {}
  }

  let completed = 0
  try {
    const imdbId = await resolveImdb(context, item)
    if (!/^tt\d{5,12}$/i.test(String(imdbId || ''))) {
      throw new Error('VaPlayer series IMDb identity is invalid.')
    }

    for (let index = 0; index < chosen.length; index += 1) {
      const episode = chosen[index]
      const code = episodeCode(season, episode.number)
      await updateProgress(progress, 'VaPlayer — ' + title + '\nPreparing ' + (index + 1) + '/' + chosen.length + ': ' + code + '.')
      await deliver(item, season, episode, quality, delivery, context, { imdbId })
      completed += 1
      await updateProgress(progress, 'VaPlayer — ' + title + '\nDelivered ' + completed + '/' + chosen.length + ': ' + code + '.')
    }

    const doneText = 'VaPlayer delivered all ' + completed + ' episodes for ' + title + ' — Season ' + season + '.'
    await updateProgress(progress, doneText, 'done')
    return { delivered:true, count:completed }
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error || 'Unknown error'))
    const failedEpisode = chosen[completed] || chosen.at(-1)
    const failedCode = episodeCode(season, failedEpisode.number)
    const remainingEnd = chosen.at(-1).number
    const publicMessage = completed
      ? 'VaPlayer delivered ' + completed + '/' + chosen.length + ' episodes, then stopped at ' + failedCode + '. The delivered files are already in chat. Retry episodes ' + failedEpisode.number + '-' + remainingEnd + '.'
      : 'VaPlayer could not deliver ' + failedCode + '. No episodes in this batch were confirmed delivered. Try that episode on its own or choose a lower quality.'
    failure.publicMessage = publicMessage
    failure.code = failure.code || 'vaplayer-tv-range-failed'
    await updateProgress(progress, publicMessage, 'fail')
    console.error('[MSCC_MEDIA_TRANSFER] ' + JSON.stringify({
      source:'VaPlayer',
      phase:'range-failed',
      season,
      total:chosen.length,
      completed,
      failedEpisode:Number(failedEpisode.number),
      errorName:String(failure.name || 'Error'),
      error:safeError(failure),
    }))
    throw failure
  }
}

export default {
  id:'vaplayer',
  name:'VaPlayer',
  description:'TV episodes resolved by IMDb identity and delivered copy-only from VaPlayer.',
  fallbackOrder:30,
  brandAliases:['VA Player'],

  async run({
    action, query, item, season, seasonNumber, episode, episodeId, selection, range,
    quality = 'source', delivery = 'document', context,
  }) {
    if (action === 'search') return { items:await searchMetadata(context, query, 'tv') }
    if (action === 'browse') return { items:await browseMetadata(context, 'tv') }
    if (action === 'seasons') return { seasons:await seasonRows(context, item) }
    if (action === 'episodes') {
      const number = Number(seasonNumber || season?.number || 1)
      return { title:item?.title, seasonNumber:number, episodes:await episodeRows(context, item, number) }
    }
    if (action === 'options') {
      const picked = episode || selection?.[0] || range?.start
      const ep = Number(picked?.number || episodeId || 0)
      const s = Number(seasonNumber || season?.number || picked?.seasonNumber || 1)
      if (!ep) return { qualities:['source','1080','720','480','360'], deliveries:['document','video'] }
      const imdbId = await imdbIdentity(context, item)
      const resolved = await inspectVaPlayer({ type:'tv', imdbId, season:s, episode:ep })
      return { qualities:resolved.qualities, deliveries:['document','video'] }
    }
    if (action === 'download') {
      const s = Number(seasonNumber || season?.number || episode?.seasonNumber || 1)
      const picked = episode || { id:episodeId, number:episodeId }
      return deliverEpisode(item, s, picked, quality, delivery, context)
    }
    if (action === 'downloadRange') {
      const s = Number(seasonNumber || season?.number || 1)
      return downloadRange({
        item,
        seasonNumber:s,
        range,
        selection,
        quality,
        delivery,
        context,
      })
    }
    throw new Error('Unsupported VaPlayer TV action: ' + action)
  },
}

export const _test = { safeError, episodeCode, normalizeRangeEpisodes, downloadRange }
