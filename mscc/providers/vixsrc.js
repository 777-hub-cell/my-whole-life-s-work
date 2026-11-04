import { inspectCandidates, materializeCandidates, qualitiesFor } from './stream-copy.js'

const BASE = 'https://vixsrc.to'
const UA = 'Mozilla/5.0 (Linux; Android 16; SM-A165F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'
const HTTP_TIMEOUT_MS = Math.max(5_000, Number(process.env.MSCC_VIXSRC_HTTP_TIMEOUT_MS || 30_000))
const CACHE_TTL_MS = Math.max(10_000, Number(process.env.MSCC_VIXSRC_CACHE_TTL_MS || 2 * 60_000))
const cache = new Map()

function cacheKey(type, tmdbId, season, episode) {
  return [type, tmdbId, season || '', episode || ''].join('|')
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
  if (!response.ok) throw new Error('VixSrc HTTP ' + response.status)
  return response
}

function streamHeaders(embedUrl) {
  return {
    Referer:String(embedUrl || BASE + '/'),
    Origin:BASE,
    'User-Agent':UA,
  }
}

function field(html, name) {
  const patterns = name === 'url'
    ? [/\burl\s*:\s*["']([^"']+)["']/i, /["']url["']\s*:\s*["']([^"']+)["']/i]
    : name === 'token'
      ? [/\btoken\s*:\s*["']([^"']+)["']/i, /["']token["']\s*:\s*["']([^"']+)["']/i]
      : [/\bexpires\s*:\s*["']([^"']+)["']/i, /["']expires["']\s*:\s*["']([^"']+)["']/i]
  for (const pattern of patterns) {
    const match = pattern.exec(String(html || ''))
    if (match) return match[1].replace(/\\\//g, '/').replace(/&amp;/g, '&')
  }
  return ''
}

export async function resolveVixSrc({ type = 'movie', tmdbId, season = 0, episode = 0 } = {}) {
  const id = Number(tmdbId)
  if (!Number.isInteger(id) || id <= 0) throw new Error('VixSrc requires a valid TMDB ID.')
  const kind = String(type || '').toLowerCase() === 'tv' ? 'tv' : 'movie'
  const seasonNumber = Number(season) || 0
  const episodeNumber = Number(episode) || 0
  if (kind === 'tv' && (!(seasonNumber > 0) || !(episodeNumber > 0))) {
    throw new Error('VixSrc TV resolution requires season and episode numbers.')
  }

  const key = cacheKey(kind, id, seasonNumber, episodeNumber)
  const saved = cached(key)
  if (saved) return saved

  const api = kind === 'movie'
    ? BASE + '/api/movie/' + id
    : BASE + '/api/tv/' + id + '/' + seasonNumber + '/' + episodeNumber
  const baseHeaders = {
    accept:'application/json,*/*',
    referer:BASE,
    origin:BASE,
  }
  const apiResponse = await get(api, baseHeaders)
  let data
  try { data = await apiResponse.json() } catch { data = {} }
  const src = String(data?.src || '').trim()
  if (!src) throw new Error('VixSrc returned no playable source for this title.')

  const embedUrl = new URL(src, BASE).href
  const embedResponse = await get(embedUrl, { ...baseHeaders, accept:'text/html,*/*' })
  const html = await embedResponse.text()
  const token = field(html, 'token')
  const expires = field(html, 'expires')
  const rawUrl = field(html, 'url')
  if (!token || !expires || !rawUrl) throw new Error('VixSrc player configuration was incomplete.')

  const master = new URL(rawUrl, embedUrl)
  master.searchParams.set('token', token)
  master.searchParams.set('expires', expires)
  master.searchParams.set('h', '1')

  const candidate = {
    url:master.href,
    headers:streamHeaders(embedUrl),
  }
  return store(key, {
    type:kind,
    tmdbId:id,
    season:seasonNumber,
    episode:episodeNumber,
    api,
    embedUrl,
    candidates:[candidate],
  })
}

export async function inspectVixSrc(input) {
  const resolved = await resolveVixSrc(input)
  const inspected = await inspectCandidates(resolved.candidates)
  if (!inspected.length) throw new Error('VixSrc resolved a stream but it was not playable.')
  return { ...resolved, inspected, qualities:qualitiesFor(inspected) }
}

export async function materializeVixSrc(input, quality = 'source', delivery = 'document', options = {}) {
  const resolved = await inspectVixSrc(input)
  return materializeCandidates(resolved.candidates, quality, delivery, {
    ...options,
    inspected:resolved.inspected,
  })
}

export const _test = { field, cacheKey, streamHeaders }
