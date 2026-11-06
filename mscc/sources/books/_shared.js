import { readFile, stat } from 'node:fs/promises'
import AdmZip from 'adm-zip'
import { posix as pathPosix } from 'node:path'

export const BOOK_UA = 'MSCC/2.3 (books source; +https://github.com/777-hub-cell/my-whole-life-s-work)'

const MAX_BOOK_BYTES = 100 * 1024 * 1024
const BOOK_LIMITS = Object.freeze({
  epub:80 * 1024 * 1024,
  kepub:80 * 1024 * 1024,
  pdf:100 * 1024 * 1024,
  txt:20 * 1024 * 1024,
  mobi:80 * 1024 * 1024,
  azw3:80 * 1024 * 1024,
  rtf:40 * 1024 * 1024,
  doc:40 * 1024 * 1024,
  docx:40 * 1024 * 1024,
})

const SEARCH_STOP_WORDS = new Set([
  'a','an','and','are','as','at','by','for','from','in','into','of','on','or',
  'the','to','with','book','books','novel','edition','series',
])

export function clean(value, max = 300) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function decodeHtml(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n) || 32))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16) || 32))
}

export function textFromHtml(value = '') {
  return clean(
    decodeHtml(
      String(value)
        .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p\s*>/gi, '\n\n')
        .replace(/<\/div\s*>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
    ).replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n'),
    20_000_000,
  )
}

function searchTokens(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(token => token && !SEARCH_STOP_WORDS.has(token))
}

export function rankBookSearchResults(query, items, { limit = 25 } = {}) {
  const rows = Array.isArray(items) ? items : []
  const queryText = String(query || '').trim()
  const queryTokens = searchTokens(queryText)
  if (!queryTokens.length) return rows.slice(0, limit)

  const ranked = []
  for (const item of rows) {
    const title = String(item?.title || item?.name || '')
    const author = String(item?.author || item?.authorName || '')
    const extra = [
      item?.series, item?.seriesName, item?.synopsis, item?.description,
      item?.summary, item?.rawText, item?.subtitle, item?.subject,
    ].filter(Boolean).join(' ')
    const titleTokens = new Set(searchTokens(title))
    const authorTokens = new Set(searchTokens(author))
    const allTokens = new Set([...titleTokens, ...authorTokens, ...searchTokens(extra)])
    const matched = queryTokens.filter(token => allTokens.has(token))
    if (matched.length !== queryTokens.length) continue

    const normalizedQuery = searchTokens(queryText).join(' ')
    const normalizedTitle = searchTokens(title).join(' ')
    const normalizedAuthor = searchTokens(author).join(' ')
    let score = 0
    if (normalizedTitle === normalizedQuery) score += 120
    else if (normalizedTitle.includes(normalizedQuery)) score += 80
    if (queryTokens.every(token => titleTokens.has(token))) score += 60
    score += queryTokens.filter(token => titleTokens.has(token)).length * 12
    score += queryTokens.filter(token => authorTokens.has(token)).length * 4
    if (normalizedAuthor === normalizedQuery) score += 10
    ranked.push({ item, score })
  }

  return ranked
    .sort((a,b) => b.score - a.score)
    .slice(0, limit)
    .map(row => row.item)
}

export async function fetchText(url, {
  headers = {},
  method = 'GET',
  body,
  timeoutMs = 15000,
} = {}) {
  const response = await fetch(url, {
    method,
    headers:{
      'user-agent':BOOK_UA,
      'accept':'*/*',
      ...headers,
    },
    body,
    redirect:'follow',
    signal:AbortSignal.timeout(timeoutMs),
  })
  const text = await response.text()
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} for ${new URL(url).hostname}`)
    error.status = response.status
    error.bodyPreview = text.slice(0, 300)
    throw error
  }
  return { text, response }
}

export async function fetchJson(url, options = {}) {
  const { text, response } = await fetchText(url, {
    ...options,
    headers:{ accept:'application/json', ...(options.headers || {}) },
  })
  try {
    return { data:JSON.parse(text), response }
  } catch {
    const error = new Error(`Invalid JSON from ${new URL(url).hostname}`)
    error.bodyPreview = text.slice(0, 300)
    throw error
  }
}

export function safeFileName(value, extension = '') {
  const base = clean(value, 180)
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'book'
  const ext = String(extension || '').replace(/^\./, '').replace(/[^a-z0-9.]/gi, '')
  return ext ? `${base}.${ext}` : base
}

export function sizeText(value) {
  const bytes = Number(value || 0) || 0
  if (!bytes) return ''
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1) + ' MB'
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB'
  return bytes + ' B'
}

function fileKind(mimetype = '', fileName = '') {
  const mime = String(mimetype || '').toLowerCase()
  const name = String(fileName || '').toLowerCase()
  if (mime.includes('epub') || name.endsWith('.epub')) return name.endsWith('.kepub.epub') ? 'kepub' : 'epub'
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf'
  if (mime.includes('text/plain') || name.endsWith('.txt')) return 'txt'
  if (mime.includes('mobipocket') || name.endsWith('.mobi')) return 'mobi'
  if (mime.includes('vnd.amazon.ebook') || name.endsWith('.azw3')) return 'azw3'
  if (mime.includes('rtf') || name.endsWith('.rtf')) return 'rtf'
  if (name.endsWith('.docx')) return 'docx'
  if (name.endsWith('.doc')) return 'doc'
  return ''
}

export function validateBookDocument(data, { mimetype = '', fileName = 'book' } = {}) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data || [])
  const kind = fileKind(mimetype, fileName)
  const maxBytes = BOOK_LIMITS[kind] || MAX_BOOK_BYTES
  if (!buffer.length) throw new Error('The book provider returned an empty file.')
  if (buffer.length > maxBytes) throw new Error(`The selected book file is too large (${sizeText(buffer.length)}; limit ${sizeText(maxBytes)}).`)
  const minBytes = kind === 'epub' || kind === 'kepub' ? 1024 : 128
  if (buffer.length < minBytes) throw new Error('The selected book file is too small to be a complete document.')

  const head = buffer.subarray(0, Math.min(buffer.length, 512))
  const headText = head.toString('utf8').trimStart().toLowerCase()
  if (headText.startsWith('<!doctype html') || headText.startsWith('<html') || headText.startsWith('<?xml')) {
    throw new Error('The book provider returned a web page instead of the requested file.')
  }

  if (kind === 'epub' || kind === 'kepub') {
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new Error('The provider response is not a valid EPUB ZIP archive.')
    let entries
    try {
      entries = new AdmZip(buffer).getEntries()
    } catch {
      throw new Error('The EPUB archive is damaged or incomplete.')
    }
    const entryMap = new Map(entries.map(entry => [
      String(entry.entryName || '').replace(/^\//, '').toLowerCase(),
      entry,
    ]))
    const mimeEntry = entryMap.get('mimetype')
    const containerEntry = entryMap.get('meta-inf/container.xml')
    if (!mimeEntry || !containerEntry || !entries.some(entry => String(entry.entryName || '').toLowerCase().endsWith('.opf'))) {
      throw new Error('The EPUB is missing required package files and cannot be trusted as complete.')
    }
    if (mimeEntry.getData().toString('utf8').trim() !== 'application/epub+zip') {
      throw new Error('The EPUB archive has an invalid mimetype entry.')
    }

    let containerText
    try { containerText = containerEntry.getData().toString('utf8') } catch {
      throw new Error('The EPUB container file is damaged.')
    }
    const rootfilePath = /full-path=["']([^"']+\.opf)["']/i.exec(containerText)?.[1]
    const opfEntry = rootfilePath
      ? entryMap.get(decodeURIComponent(rootfilePath).toLowerCase())
      : entries.find(entry => String(entry.entryName || '').toLowerCase().endsWith('.opf'))
    if (!opfEntry) throw new Error('The EPUB package document is missing.')
    let opfText
    try { opfText = opfEntry.getData().toString('utf8') } catch {
      throw new Error('The EPUB package document is damaged.')
    }
    if (!/<(?:[a-z0-9]+:)?manifest\b/i.test(opfText) || !/<(?:[a-z0-9]+:)?spine\b/i.test(opfText)) {
      throw new Error('The EPUB package document has no readable manifest or spine.')
    }

    const manifest = new Map()
    for (const match of opfText.matchAll(/<(?:[a-z0-9]+:)?item\b([^>]*)>/gi)) {
      const id = /\bid=["']([^"']+)["']/i.exec(match[1])?.[1]
      const href = /\bhref=["']([^"']+)["']/i.exec(match[1])?.[1]
      if (id && href) manifest.set(id, href)
    }
    const spineIds = [...opfText.matchAll(/<(?:[a-z0-9]+:)?itemref\b[^>]*\bidref=["']([^"']+)["'][^>]*>/gi)]
      .map(match => match[1])
    if (!spineIds.length) throw new Error('The EPUB contains no readable spine items.')

    const packagePath = String(opfEntry.entryName || '').replace(/^\//, '')
    let readableBytes = 0
    for (const id of spineIds) {
      const href = manifest.get(id)
      if (!href) throw new Error('The EPUB spine references a missing manifest item.')
      let decodedHref
      try { decodedHref = decodeURIComponent(href.split(/[?#]/, 1)[0]) } catch { decodedHref = href.split(/[?#]/, 1)[0] }
      const itemPath = pathPosix.normalize(pathPosix.join(pathPosix.dirname(packagePath), decodedHref)).toLowerCase()
      const entry = entryMap.get(itemPath)
      if (!entry) throw new Error('The EPUB is missing a reading-content file referenced by its spine.')
      let body
      try { body = entry.getData() } catch {
        throw new Error('An EPUB reading-content file is damaged or truncated.')
      }
      if (!body.length) throw new Error('The EPUB contains an empty reading-content file.')
      readableBytes += body.length
    }
    if (readableBytes < 256) throw new Error('The EPUB contains too little reading content to be a complete book.')
  } else if (kind === 'pdf') {
    if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-' ||
        !buffer.subarray(Math.max(0, buffer.length - 4096)).toString('latin1').includes('%%EOF')) {
      throw new Error('The PDF is damaged, incomplete, or not a real PDF file.')
    }
  } else if (kind === 'txt') {
    if (buffer.includes(0)) throw new Error('The provider returned binary data instead of plain text.')
    let decoded
    try { decoded = new TextDecoder('utf-8', { fatal:true }).decode(buffer) } catch {
      throw new Error('The text file is not valid UTF-8 and cannot be verified.')
    }
    if (decoded.replace(/\s/g, '').length < 80) {
      throw new Error('The text file is too short to be a complete book.')
    }
  } else if (kind === 'rtf') {
    if (!/^\s*\{\\rtf/i.test(buffer.subarray(0, 32).toString('utf8'))) {
      throw new Error('The RTF file is invalid or incomplete.')
    }
  } else if (kind === 'mobi' || kind === 'azw3') {
    if (buffer.subarray(60, 68).toString('ascii') !== 'BOOKMOBI') {
      throw new Error('The ebook file does not have a valid MOBI/AZW3 header.')
    }
  }
  return { valid:true, kind, bytes:buffer.length }
}

async function readRemoteDocument(url, maxBytes) {
  let parsed
  try { parsed = new URL(String(url || '')) } catch { throw new Error('The book source returned an invalid download URL.') }
  if (!['https:','http:'].includes(parsed.protocol)) throw new Error('The book download URL must use HTTP or HTTPS.')
  if (parsed.username || parsed.password) throw new Error('The book download URL contains unsupported credentials.')

  const response = await fetch(parsed.href, {
    headers:{ 'user-agent':BOOK_UA, accept:'*/*' },
    redirect:'follow',
    signal:AbortSignal.timeout(90000),
  })
  if (!response.ok) throw new Error(`Book download failed with HTTP ${response.status}.`)
  const length = Number(response.headers.get('content-length') || 0)
  if (length > maxBytes) {
    await response.body?.cancel().catch(() => {})
    throw new Error(`The selected book file is too large (${sizeText(length)}; limit ${sizeText(maxBytes)}).`)
  }
  if (!response.body) {
    const data = Buffer.from(await response.arrayBuffer())
    if (data.length > maxBytes) throw new Error(`The selected book file exceeds the ${sizeText(maxBytes)} limit.`)
    return data
  }

  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
      total += chunk.length
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        throw new Error(`The selected book file exceeds the ${sizeText(maxBytes)} limit.`)
      }
      chunks.push(chunk)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, total)
}

export async function sendDocument(context, {
  url = '',
  file = '',
  data = null,
  mimetype = 'application/octet-stream',
  fileName = 'book',
} = {}) {
  if (typeof context?.send !== 'function') throw new Error('Book delivery context is unavailable.')
  const kind = fileKind(mimetype, fileName)
  const maxBytes = BOOK_LIMITS[kind] || MAX_BOOK_BYTES
  let document
  if (data != null) document = Buffer.isBuffer(data) ? data : Buffer.from(data)
  else if (file) {
    const metadata = await stat(file)
    if (metadata.size > maxBytes) throw new Error(`The selected book file exceeds the ${sizeText(maxBytes)} limit.`)
    document = await readFile(file)
  } else if (url) document = await readRemoteDocument(url, maxBytes)
  else throw new Error('Book source returned no document.')

  validateBookDocument(document, { mimetype, fileName })
  await context.send({ document, mimetype, fileName })
  return { delivered:true, bytes:document.length }
}

export const _test = { fileKind, maxBookBytes:kind => BOOK_LIMITS[String(kind || '').toLowerCase()] || MAX_BOOK_BYTES }
