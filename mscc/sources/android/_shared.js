export const APK_UA = 'MSCC/2.3 (Android APK source; +https://github.com/777-hub-cell/my-whole-life-s-work)'

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
    decodeHtml(String(value)
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')),
    20_000,
  )
}

export function sizeText(value) {
  const bytes = Number(value || 0) || 0
  if (!bytes) return ''
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1) + ' MB'
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB'
  return bytes + ' B'
}

export function safeFileName(value, extension = 'apk') {
  const base = clean(value, 180)
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'app'
  const ext = String(extension || 'apk').replace(/^\./, '').replace(/[^a-z0-9]/gi, '') || 'apk'
  return `${base}.${ext}`
}

export async function fetchText(url, { headers = {}, timeoutMs = 20000 } = {}) {
  const response = await fetch(url, {
    headers:{ 'user-agent':APK_UA, accept:'*/*', ...headers },
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

export async function sendApk(context, { url, fileName }) {
  if (!url) throw new Error('APK source returned no download URL.')
  if (typeof context?.send !== 'function') throw new Error('APK delivery context is unavailable.')
  await context.send({
    document:{ url },
    mimetype:'application/vnd.android.package-archive',
    fileName:safeFileName(fileName || 'app', 'apk'),
  })
  return { delivered:true }
}
