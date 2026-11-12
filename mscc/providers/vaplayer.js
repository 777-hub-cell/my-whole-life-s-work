import { inspectInput, materializeCandidates, qualitiesFor } from './stream-copy.js'

const API = 'https://streamdata.vaplayer.ru/api.php'
const EMBED_BASE = 'https://nextgencloudfabric.com'
const UA = 'Mozilla/5.0 (Linux; Android 16; SM-A165F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'
const HTTP_TIMEOUT_MS = Math.max(5_000, Number(process.env.MSCC_VAPLAYER_HTTP_TIMEOUT_MS || 30_000))
const CACHE_TTL_MS = Math.max(10_000, Number(process.env.MSCC_VAPLAYER_CACHE_TTL_MS || 2 * 60_000))
const cache = new Map()

function normalizeImdb(value) {
  const imdb = String(value || '').trim()
  return /^tt\d{5,12}$/i.test(imdb) ? imdb.toLowerCase() : ''
}

function normalizeTmdb(value) {
  const tmdb = Number(value)
  return Number.isSafeInteger(tmdb) && tmdb > 0 ? tmdb : 0
}

function keyOf(type, tmdbId, imdbId, season, episode) {
  return [type, normalizeTmdb(tmdbId) || '', normalizeImdb(imdbId) || '', season || '', episode || ''].join('|')
}

function cached(key) {
  const row = cache.get(key)
  return row && row.expiresAt > Date.now() ? row.value : null
}

function store(key, value) {
  cache.set(key, { value, expiresAt:Date.now() + CACHE_TTL_MS })
  return value
}

async function get(url, headers = {}) {
  const response = await fetch(url, {
    headers:{
      'user-agent':UA,
      'accept-language':'en-US,en;q=0.9',
      ...headers,
    },
    redirect:'follow',
    signal:AbortSignal.timeout(HTTP_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error('VaPlayer HTTP ' + response.status)
  return response
}

function identityAttempts({ tmdbId, imdbId }) {
  const tmdb = normalizeTmdb(tmdbId)
  const imdb = normalizeImdb(imdbId)
  const attempts = []
  // TMDB is the preferred catalog identity; IMDb remains a compatibility fallback.
  if (tmdb) attempts.push({ param:'tmdb', value:String(tmdb), tmdbId:tmdb, imdbId:imdb })
  if (imdb) attempts.push({ param:'imdb', value:imdb, tmdbId:tmdb, imdbId:imdb })
  return attempts
}

export async function resolveVaPlayer({ type = 'movie', imdbId, tmdbId, season = 0, episode = 0 } = {}) {
  const imdb = normalizeImdb(imdbId)
  const tmdb = normalizeTmdb(tmdbId)
  const identities = identityAttempts({ tmdbId:tmdb, imdbId:imdb })
  if (!identities.length) throw new Error('VaPlayer requires a valid TMDB or IMDb ID.')

  const kind = String(type || '').toLowerCase() === 'tv' ? 'tv' : 'movie'
  const seasonNumber = Number(season) || 0
  const episodeNumber = Number(episode) || 0
  if (kind === 'tv' && (!(seasonNumber > 0) || !(episodeNumber > 0))) {
    throw new Error('VaPlayer TV resolution requires season and episode numbers.')
  }

  const key = keyOf(kind, tmdb, imdb, seasonNumber, episodeNumber)
  const saved = cached(key)
  if (saved) return saved

  const failures = []
  for (const identity of identities) {
    const params = new URLSearchParams({ [identity.param]:identity.value, type:kind })
    let referer
    if (kind === 'tv') {
      params.set('season', String(seasonNumber))
      params.set('episode', String(episodeNumber))
      referer = EMBED_BASE + '/embed/tv/' + identity.value + '/' + seasonNumber + '/' + episodeNumber
    } else {
      referer = EMBED_BASE + '/embed/movie/' + identity.value
    }

    try {
      const response = await get(API + '?' + params, {
        Referer:referer,
        Origin:EMBED_BASE,
        Accept:'application/json,*/*',
      })
      let data
      try { data = await response.json() } catch { data = {} }
      const urls = Array.isArray(data?.data?.stream_urls)
        ? data.data.stream_urls.filter(value => /^https?:\/\//i.test(String(value || '')))
        : []
      if (!urls.length) {
        failures.push({
          idType:identity.param,
          httpStatus:response.status,
          apiStatusCode:String(data?.status_code || ''),
          responseFields:Object.keys(data || {}).slice(0,12),
        })
        continue
      }

      const candidates = urls.slice(0, 8).map(url => ({
        url:String(url),
        headers:{
          // The stream host must see the same episode embed context as the API
          // lookup; sending only the provider homepage can fail Referer checks.
          Referer:referer,
          Origin:EMBED_BASE,
          'User-Agent':UA,
        },
      }))
      return store(key, {
        type:kind,
        tmdbId:tmdb || null,
        imdbId:imdb,
        season:seasonNumber,
        episode:episodeNumber,
        resolvedBy:identity.param,
        apiStatusCode:String(data?.status_code || ''),
        candidates,
      })
    } catch (error) {
      failures.push({
        idType:identity.param,
        errorName:String(error && error.name || 'Error'),
        error:String(error && error.message || error).slice(0,240),
      })
    }
  }

  const error = new Error('VaPlayer returned no playable streams for this title after checking its available TMDB and IMDb identities.')
  error.code = 'vaplayer-no-streams'
  console.warn('[MSCC_MEDIA_TRANSFER] ' + JSON.stringify({
    source:'VaPlayer',
    phase:'resolver-no-streams',
    type:kind,
    tmdbId:tmdb || null,
    imdbId:imdb || null,
    season:seasonNumber,
    episode:episodeNumber,
    attempts:failures,
  }))
  throw error
}

function safeDiagnosticMessage(error) {
  return String(error && error.message || error || 'Unknown error')
    .replace(/https?:\/\/[^\s"'<>]+/gi, value => {
      try { return new URL(value).origin } catch { return '[URL redacted]' }
    })
    .replace(/(token|key|sig|signature|auth|api[_-]?key)=([^& ]+)/gi, '$1=[redacted]')
    .slice(0,320)
}

function candidateHost(value) {
  try { return new URL(String(value || '')).host } catch { return 'unknown-host' }
}

export async function inspectVaPlayer(input) {
  const resolved = await resolveVaPlayer(input)
  const inspected = []
  const diagnostics = []
  for (const candidate of resolved.candidates) {
    try {
      const row = await inspectInput(candidate.url, candidate.headers || {})
      if (row.playable) {
        inspected.push({ ...candidate, ...row })
      } else {
        diagnostics.push({
          host:candidateHost(candidate.url),
          result:'no-video-stream',
          format:String(row.probe?.format?.format_name || '').slice(0,80),
          streams:(row.probe?.streams || []).map(stream => String(stream?.codec_type || 'unknown')).slice(0,8),
        })
      }
    } catch (error) {
      diagnostics.push({
        host:candidateHost(candidate.url),
        errorName:String(error && error.name || 'Error'),
        error:safeDiagnosticMessage(error),
      })
    }
  }
  if (!inspected.length) {
    const error = new Error('VaPlayer streams were returned but none were playable.')
    error.code = 'vaplayer-no-playable-candidates'
    console.warn('[MSCC_MEDIA_TRANSFER] ' + JSON.stringify({
      source:'VaPlayer',
      phase:'inspection-no-playable-candidates',
      type:resolved.type,
      tmdbId:resolved.tmdbId || null,
      imdbId:resolved.imdbId || null,
      season:resolved.season,
      episode:resolved.episode,
      candidateCount:resolved.candidates.length,
      diagnostics,
    }))
    throw error
  }
  return { ...resolved, inspected, qualities:qualitiesFor(inspected) }
}

export async function materializeVaPlayer(input, quality = 'source', delivery = 'document', options = {}) {
  const resolved = await inspectVaPlayer(input)
  return materializeCandidates(resolved.candidates, quality, delivery, {
    ...options,
    inspected:resolved.inspected,
  })
}

export const _test = { normalizeImdb, normalizeTmdb, keyOf, identityAttempts, safeDiagnosticMessage, candidateHost, resolveVaPlayer }
