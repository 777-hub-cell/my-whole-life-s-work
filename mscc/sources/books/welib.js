import { clean, decodeHtml, rankBookSearchResults, safeFileName, sendDocument, textFromHtml } from './_shared.js'

const SITE = 'https://welib.org'
const DEFAULT_LANGUAGE = 'English'
const FLARE_URL = String(
  process.env.MSCC_FLARESOLVERR_URL ||
  ('http://127.0.0.1:' + (process.env.MSCC_FLARE_PORT || '8191'))
).replace(/\/$/, '')
const MAX_TIMEOUT = Math.min(60000, Math.max(5000, Number(process.env.MSCC_WELIB_FLARE_TIMEOUT_MS || 30000)))
const SLOW_TIMEOUT = Math.min(45000, Math.max(5000, Number(process.env.MSCC_WELIB_SLOW_TIMEOUT_MS || 30000)))

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function htmlAttr(value = '') {
  return decodeHtml(String(value || '').replace(/\\u0026/gi, '&'))
}

async function flare(command, extra = {}, signal = null) {
  const timeoutSignal = AbortSignal.timeout(MAX_TIMEOUT + 10000)
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  const response = await fetch(FLARE_URL + '/v1', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ cmd:command, maxTimeout:MAX_TIMEOUT, ...extra }),
    signal:requestSignal,
  })
  const text = await response.text()
  if (!response.ok) throw new Error('FlareSolverr HTTP ' + response.status)
  let data
  try { data = JSON.parse(text) } catch { throw new Error('Invalid FlareSolverr response') }
  if (data?.status !== 'ok') throw new Error('FlareSolverr: ' + clean(data?.message || 'request failed', 220))
  return data
}

async function createSession(signal = null) {
  const data = await flare('sessions.create', {}, signal)
  return String(data?.session || '').trim()
}

async function destroySession(session) {
  if (!session) return
  await flare('sessions.destroy', { session }, AbortSignal.timeout(5000)).catch(() => {})
}

async function getHtml(url, { session = '', signal = null } = {}) {
  const data = await flare('request.get', { url, ...(session ? { session } : {}) }, signal)
  const solution = data?.solution || {}
  const status = Number(solution.status || 0)
  if (status && status >= 400) throw new Error('WeLib HTTP ' + status)
  const html = String(solution.response || '')
  if (!html) throw new Error('WeLib returned no page content.')
  return html
}

function parseFormat(text) {
  return /\b(epub|pdf|mobi|azw3|djvu|fb2|cbz|cbr|docx?|rtf|txt|lit)\b/i.exec(text)?.[1]?.toUpperCase() || ''
}

function parseLanguage(text) {
  const match = /\b(English|German|French|Spanish|Italian|Russian|Portuguese|Hindi|Bengali|Chinese|Japanese|Arabic|Turkish|Polish|Dutch|Korean)\b/i.exec(text)
  if (!match) return ''
  return match[1].slice(0, 1).toUpperCase() + match[1].slice(1).toLowerCase()
}

function parseSize(text) {
  return /\b\d+(?:\.\d+)?\s*(?:KB|MB|GB|KiB|MiB|GiB)\b/i.exec(text)?.[0] || ''
}

function parseYear(text) {
  return /\b(?:19|20)\d{2}\b/.exec(text)?.[0] || ''
}

function parseSearch(html, language = DEFAULT_LANGUAGE) {
  const source = String(html || '')
  const rx = /<a\b[^>]*href=["']\/md5\/([a-f0-9]{32})(?:[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
  const groups = new Map()
  let match
  while ((match = rx.exec(source))) {
    const md5 = match[1].toLowerCase()
    const title = clean(textFromHtml(match[2] || ''), 220)
    const current = groups.get(md5) || { md5, first:match.index, last:rx.lastIndex, title:'' }
    current.first = Math.min(current.first, match.index)
    current.last = Math.max(current.last, rx.lastIndex)
    if (title && !current.title) current.title = title
    groups.set(md5, current)
  }

  const ordered = [...groups.values()].filter(row => row.title).sort((a,b) => a.first - b.first)
  const wanted = String(language || DEFAULT_LANGUAGE).trim().toLowerCase()
  const items = []

  for (let index = 0; index < ordered.length; index++) {
    const row = ordered[index]
    const end = ordered[index + 1]?.first ?? Math.min(source.length, row.last + 5000)
    const segment = source.slice(row.first, end)
    const rowText = clean(textFromHtml(segment), 2400)
    const rowLanguage = parseLanguage(rowText)
    if (wanted && (!rowLanguage || rowLanguage.toLowerCase() !== wanted)) continue

    const format = parseFormat(rowText)
    const size = parseSize(rowText)
    const year = parseYear(rowText)
    items.push({
      id:row.md5,
      md5:row.md5,
      title:row.title,
      language:rowLanguage,
      format,
      size,
      year,
      url:SITE + '/md5/' + row.md5,
      detailUrl:SITE + '/md5/' + row.md5,
      rawText:rowText,
    })
    if (items.length >= 25) break
  }
  return items
}

async function search(query, language = DEFAULT_LANGUAGE, signal = null) {
  const q = clean(query, 180)
  if (!q) return []
  const html = await getHtml(SITE + '/search?' + new URLSearchParams({ q }), { signal })
  const items = parseSearch(html, language)
  return rankBookSearchResults(q, items, { limit:25 })
}

function extractUrls(html) {
  const text = htmlAttr(html)
  const out = []
  const add = value => {
    const url = htmlAttr(value).replace(/[),.;]+$/, '')
    if (!/^https?:\/\//i.test(url)) return
    if (/\/covers?\//i.test(url)) return
    if (!out.includes(url)) out.push(url)
  }

  const refresh = /<meta[^>]+http-equiv=["']?refresh["']?[^>]+url=["']?(https?:\/\/[^"'<>\s]+)/ig
  let match
  while ((match = refresh.exec(text))) add(match[1])

  const direct = /https?:\/\/[^"'<>\s]+/ig
  while ((match = direct.exec(text))) {
    const url = match[0]
    if (
      /\/ipfs\//i.test(url) ||
      /welib-(?:public|premium)\.org/i.test(url) ||
      /\/d\d+\/y\//i.test(url)
    ) add(url)
  }
  return out
}

async function probePayload(url) {
  try {
    const response = await fetch(url, {
      headers:{ range:'bytes=0-1023', 'user-agent':'Mozilla/5.0' },
      redirect:'follow',
      signal:AbortSignal.timeout(7000),
    })
    if (!(response.ok || response.status === 206)) return false
    const type = String(response.headers.get('content-type') || '').toLowerCase()
    if (type.includes('text/html')) return false
    const reader = response.body?.getReader()
    let bytes = new Uint8Array(0)
    if (reader) {
      try {
        const first = await reader.read()
        if (!first.done && first.value) bytes = first.value.slice(0, 1024)
      } finally {
        await reader.cancel().catch(() => {})
        reader.releaseLock()
      }
    } else {
      bytes = new Uint8Array(await response.arrayBuffer()).slice(0, 1024)
    }
    if (!bytes.length) return false
    const head = Buffer.from(bytes.slice(0, 96)).toString('utf8').trimStart().toLowerCase()
    if (head.startsWith('<!doctype html') || head.startsWith('<html')) return false
    return true
  } catch {
    return false
  }
}

async function firstUsable(urls, limit = 8) {
  const candidates = urls
    .filter(url => !/^https?:\/\/ipfs\.io\/ipfs\//i.test(url))
    .slice(0, limit)
  if (!candidates.length) return ''
  const results = await Promise.all(candidates.map(probePayload))
  const index = results.findIndex(Boolean)
  return index >= 0 ? candidates[index] : ''
}

async function resolveDownload(md5) {
  const hash = String(md5 || '').trim().toLowerCase()
  if (!/^[a-f0-9]{32}$/.test(hash)) throw new Error('WeLib MD5 is invalid.')

  const session = await createSession()
  try {
    try {
      const listing = await getHtml(SITE + '/ipfs_downloads/md5:' + hash, { session })
      const picked = await firstUsable(extractUrls(listing), 8)
      if (picked) return picked
    } catch {}

    const detail = await getHtml(SITE + '/md5/' + hash, { session })
    const direct = await firstUsable(extractUrls(detail), 8)
    if (direct) return direct

    const deadline = Date.now() + SLOW_TIMEOUT
    const slowUrl = SITE + '/slow_download/' + hash + '/0/0'
    while (Date.now() < deadline) {
      const page = await getHtml(slowUrl, { session }).catch(() => '')
      if (page) {
        const candidate = await firstUsable(extractUrls(page), 8)
        if (candidate) return candidate
      }
      await sleep(Math.min(8000, Math.max(1000, deadline - Date.now())))
    }
    throw new Error('WeLib download link did not become available.')
  } finally {
    await destroySession(session)
  }
}

function mimeFor(format) {
  switch (String(format || '').toUpperCase()) {
    case 'EPUB': return 'application/epub+zip'
    case 'PDF': return 'application/pdf'
    case 'MOBI': return 'application/x-mobipocket-ebook'
    case 'AZW3': return 'application/vnd.amazon.ebook'
    case 'TXT': return 'text/plain'
    case 'RTF': return 'application/rtf'
    default: return 'application/octet-stream'
  }
}

export default {
  id:'welib',
  name:'WeLib',
  description:'Multilingual ebook catalog; English by default with MD5-backed file resolution.',
  fallbackOrder:20,

  async run({ action, query, item, edition, language, context }) {
    if (action === 'search') {
      return { items:await search(query, language || DEFAULT_LANGUAGE, context?.signal || null) }
    }

    if (action === 'editions') {
      const chosen = item || {}
      const format = String(chosen.format || '').toUpperCase()
      return {
        book:{
          author:chosen.author || '',
          year:chosen.year || '',
          cover:chosen.cover || '',
          synopsis:chosen.synopsis || '',
        },
        editions:[{
          id:String(chosen.md5 || chosen.id || ''),
          title:format || 'Book file',
          format:format || '',
          language:chosen.language || DEFAULT_LANGUAGE,
          size:chosen.size || '',
          md5:String(chosen.md5 || chosen.id || ''),
        }],
      }
    }

    if (action === 'download') {
      const chosen = edition || item || {}
      const md5 = String(chosen.md5 || chosen.id || item?.md5 || item?.id || '')
      const url = await resolveDownload(md5)
      const format = String(chosen.format || item?.format || '').toUpperCase()
      const extension = String(format || 'bin').toLowerCase()
      return sendDocument(context, {
        url,
        mimetype:mimeFor(format),
        fileName:safeFileName(item?.title || 'book', extension),
      })
    }

    throw new Error('Unsupported WeLib action: ' + action)
  },

  _test:{ parseSearch, parseFormat, parseLanguage, extractUrls, probePayload, firstUsable },
}
