export const BOOK_UA = 'MSCC/2.3 (books source; +https://github.com/777-hub-cell/my-whole-life-s-work)'

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

export async function sendDocument(context, {
  url = '',
  file = '',
  data = null,
  mimetype = 'application/octet-stream',
  fileName = 'book',
} = {}) {
  if (typeof context?.send !== 'function') throw new Error('Book delivery context is unavailable.')
  let document
  if (data != null) document = Buffer.isBuffer(data) ? data : Buffer.from(data)
  else if (file) document = { url:file }
  else if (url) document = { url }
  else throw new Error('Book source returned no document.')
  await context.send({ document, mimetype, fileName })
  return { delivered:true }
}
