const LRCLIB_ORIGIN = 'https://lrclib.net'
const USER_AGENT = 'MSCC/2.3 (https://github.com/777-hub-cell/my-whole-life-s-work)'

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalized(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function durationSeconds(value) {
  if (Number.isFinite(Number(value)) && Number(value) > 0) {
    return Math.round(Number(value))
  }

  const raw = clean(value)
  if (!raw) return 0
  const parts = raw.split(':').map(part => Number(part))
  if (parts.some(part => !Number.isFinite(part) || part < 0)) return 0
  if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1])
  if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2])
  return 0
}

function stripSynced(raw) {
  return String(raw || '')
    .split(/\r?\n/)
    .map(line => line.replace(/(?:\[\d{1,3}:\d{2}(?:\.\d{1,3})?\])+/g, '').trim())
    .filter(Boolean)
    .join('\n')
    .trim()
}

export function parseLyricsRecord(item) {
  if (!item || typeof item !== 'object') return null
  const instrumental = item.instrumental === true
  const plain = cleanMultiline(item.plainLyrics)
  const syncedRaw = cleanMultiline(item.syncedLyrics)
  const syncedPlain = stripSynced(syncedRaw)

  if (!instrumental && !plain && !syncedPlain) return null

  return {
    id:String(item.id ?? '').trim(),
    title:clean(item.trackName),
    artist:clean(item.artistName),
    album:clean(item.albumName),
    duration:durationSeconds(item.duration),
    instrumental,
    plain:plain || syncedPlain,
    synced:syncedRaw,
    raw:item,
  }
}

function cleanMultiline(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim()
}

function tokenScore(expected, actual) {
  const left = normalized(expected)
  const right = normalized(actual)
  if (!left || !right) return 0
  if (left === right) return 12
  if (right.includes(left) || left.includes(right)) return 8

  const wanted = new Set(left.split(' ').filter(Boolean))
  const have = new Set(right.split(' ').filter(Boolean))
  if (!wanted.size || !have.size) return 0
  let overlap = 0
  for (const token of wanted) if (have.has(token)) overlap += 1
  return (overlap / Math.max(wanted.size, have.size)) * 6
}

export function scoreLyricsCandidate(track, candidate, query = '') {
  if (!candidate) return -Infinity

  let score = 0
  score += tokenScore(track?.title || query, candidate.title) * 2
  score += tokenScore(track?.artist, candidate.artist) * 1.5
  score += tokenScore(track?.album, candidate.album) * 0.5

  const expectedDuration = durationSeconds(track?.durationSeconds || track?.duration)
  if (expectedDuration && candidate.duration) {
    const delta = Math.abs(expectedDuration - candidate.duration)
    if (delta <= 2) score += 8
    else if (delta <= 5) score += 5
    else if (delta <= 12) score += 2
    else if (delta >= 45) score -= 4
  }

  if (candidate.instrumental) score += 0.25
  if (candidate.plain) score += 0.5
  return score
}

async function requestJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers:{
      Accept:'application/json',
      'User-Agent':USER_AGENT,
    },
    redirect:'follow',
    signal:AbortSignal.timeout(12_000),
  })

  if (response.status === 404 || response.status === 429) return null
  if (!response.ok) throw new Error(`Lyrics provider returned HTTP ${response.status}.`)
  return response.json()
}

async function exactLookup(track, fetchImpl) {
  const title = clean(track?.title)
  const artist = clean(track?.artist)
  if (!title || !artist) return null

  const url = new URL('/api/get', LRCLIB_ORIGIN)
  url.searchParams.set('track_name', title)
  url.searchParams.set('artist_name', artist)

  const album = clean(track?.album)
  if (album) url.searchParams.set('album_name', album)

  const seconds = durationSeconds(track?.durationSeconds || track?.duration)
  if (seconds > 0 && seconds <= 3600) url.searchParams.set('duration', String(seconds))

  const payload = await requestJson(url, fetchImpl)
  return parseLyricsRecord(payload)
}

function queryVariants(query = '') {
  const raw = clean(query)
  if (!raw) return []
  const punctuationCollapsed = raw.replace(/[^\p{L}\p{N}]+/gu, '')
  const punctuationSpaced = raw.replace(/[-_]+/g, ' ').replace(/[’']/g, '')
  const singleLetterCollapsed = raw.replace(/\b([A-Za-z])(?:\s*[-.]\s*|\s+)(?=[A-Za-z]\b)/g, '$1')
  return [...new Set([
    raw,
    clean(punctuationSpaced),
    clean(singleLetterCollapsed),
    clean(punctuationCollapsed),
  ].filter(Boolean))]
}

async function searchLookup(track, query, fetchImpl) {
  const title = clean(track?.title)
  const artist = clean(track?.artist)
  const variants = [
    ...queryVariants(query),
    ...queryVariants([title, artist].filter(Boolean).join(' ')),
    ...queryVariants(title),
  ]
  let best = null

  for (const q of [...new Set(variants)]) {
    const url = new URL('/api/search', LRCLIB_ORIGIN)
    url.searchParams.set('q', q)

    let payload
    try {
      payload = await requestJson(url, fetchImpl)
    } catch {
      continue
    }
    if (!Array.isArray(payload) || !payload.length) continue

    const candidate = payload
      .map(parseLyricsRecord)
      .filter(Boolean)
      .map(item => ({
        candidate:item,
        score:scoreLyricsCandidate(track, item, q),
      }))
      .sort((a, b) => b.score - a.score)[0]

    if (candidate && (!best || candidate.score > best.score)) best = candidate
    if (best && best.score >= 22) break
  }

  return best?.candidate || null
}

export async function resolveLyrics({
  query = '',
  track = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Lyrics networking is unavailable.')

  const normalizedTrack = track ? {
    title:clean(track.title || track.name),
    artist:clean(track.artist || track.author || track.uploader),
    album:clean(track.album),
    duration:track.durationSeconds || track.duration || 0,
    durationSeconds:durationSeconds(track.durationSeconds || track.duration),
  } : null

  let exact = null
  if (normalizedTrack?.title && normalizedTrack?.artist) {
    try {
      exact = await exactLookup(normalizedTrack, fetchImpl)
    } catch (error) {
      console.warn('MSCC lyrics exact lookup failed:', error?.message || error)
    }
  }
  if (exact) return { ...exact, provider:'LRCLIB', match:'exact' }

  const searched = await searchLookup(normalizedTrack || {}, query, fetchImpl)
  if (!searched) return null
  return { ...searched, provider:'LRCLIB', match:'search' }
}

export function splitLyricsText(text, maxChars = 3500) {
  const source = cleanMultiline(text)
  if (!source) return []

  const max = Math.max(500, Number(maxChars) || 3500)
  const lines = source.split('\n')
  const chunks = []
  let current = ''

  for (const line of lines) {
    const addition = current ? `\n${line}` : line
    if (current && current.length + addition.length > max) {
      chunks.push(current)
      current = ''
    }

    if (line.length <= max) {
      current = current ? `${current}\n${line}` : line
      continue
    }

    if (current) {
      chunks.push(current)
      current = ''
    }
    for (let offset = 0; offset < line.length; offset += max) {
      chunks.push(line.slice(offset, offset + max))
    }
  }

  if (current) chunks.push(current)
  return chunks
}
