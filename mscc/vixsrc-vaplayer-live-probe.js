import {
  inspectVixSrc,
  materializeVixSrc,
} from './providers/vixsrc.js'
import {
  inspectVaPlayer,
  materializeVaPlayer,
} from './providers/vaplayer.js'

function numericQuality(qualities) {
  return (qualities || []).find(value => /^\d+$/.test(String(value))) || 'source'
}

function proof(media, requested) {
  const probe = media?.probe || {}
  const video = (probe?.streams || []).find(row => row?.codec_type === 'video')
  const audio = (probe?.streams || []).find(row => row?.codec_type === 'audio')
  const duration = Number(probe?.format?.duration || 0)
  const size = Number(probe?.format?.size || 0)
  if (!video || !(duration > 0) || !(size > 0)) throw new Error('Runtime materializer output did not reopen.')
  if (/^\d+$/.test(String(requested)) && Number(video.height) !== Number(requested)) {
    throw new Error('Requested ' + requested + 'p but got ' + String(video.height || 0) + 'p.')
  }
  return {
    requestedQuality:String(requested),
    extension:media.extension,
    selectedHeight:media.selectedHeight,
    duration,
    bytes:size,
    video:{ codec:video.codec_name, width:video.width, height:video.height },
    audio:audio ? { codec:audio.codec_name } : null,
  }
}

async function runCase({ provider, kind, input, delivery, allowUnavailable = false }) {
  const inspect = provider === 'VixSrc' ? inspectVixSrc : inspectVaPlayer
  const materialize = provider === 'VixSrc' ? materializeVixSrc : materializeVaPlayer
  let inspected
  try {
    inspected = await inspect(input)
  } catch (error) {
    // A live provider may have no listing for a particular title; that is
    // availability data, not a media-copy regression. Keep the exact Avatar
    // S1E1 VaPlayer case required, while letting this unrelated movie probe report.
    if (allowUnavailable && ['vaplayer-no-streams','vaplayer-no-playable-candidates'].includes(error?.code)) {
      return { provider, kind, delivery, available:false, reason:'no-playable-streams', complete:false }
    }
    throw error
  }
  const quality = numericQuality(inspected.qualities)
  const media = await materialize(input, quality, delivery, { durationSeconds:8 })
  try {
    return {
      provider,
      kind,
      qualities:inspected.qualities,
      candidateCount:inspected.inspected.length,
      delivery,
      ...proof(media, quality),
      complete:true,
    }
  } finally {
    await media.cleanup()
  }
}

const rows = []
rows.push(await runCase({
  provider:'VixSrc',
  kind:'movie',
  input:{ type:'movie', tmdbId:10331 },
  delivery:'video',
}))
rows.push(await runCase({
  provider:'VixSrc',
  kind:'tv',
  input:{ type:'tv', tmdbId:1930, season:1, episode:1 },
  delivery:'document',
}))
rows.push(await runCase({
  provider:'VaPlayer',
  kind:'movie',
  input:{ type:'movie', imdbId:'tt0063350' },
  delivery:'document',
  allowUnavailable:true,
}))
rows.push(await runCase({
  provider:'VaPlayer',
  kind:'tv',
  // Use the exact Avatar S1E1 title from the reported WhatsApp failure.
  // VaPlayer accepts TMDB or IMDb identity; the resolver tries TMDB first.
  input:{ type:'tv', tmdbId:246, imdbId:'tt0417299', season:1, episode:1 },
  delivery:'document',
}))

const summary = {
  rows,
  vixsrcMovie:rows.some(row => row.provider === 'VixSrc' && row.kind === 'movie' && row.complete),
  vixsrcTv:rows.some(row => row.provider === 'VixSrc' && row.kind === 'tv' && row.complete),
  vaplayerMovie:rows.some(row => row.provider === 'VaPlayer' && row.kind === 'movie' && row.complete),
  vaplayerMovieUnavailable:rows.some(row => row.provider === 'VaPlayer' && row.kind === 'movie' && row.available === false),
  vaplayerTv:rows.some(row => row.provider === 'VaPlayer' && row.kind === 'tv' && row.complete),
}
summary.complete = summary.vixsrcMovie && summary.vixsrcTv && summary.vaplayerTv
console.log(JSON.stringify(summary,null,2))
if (!summary.complete) process.exitCode = 1
