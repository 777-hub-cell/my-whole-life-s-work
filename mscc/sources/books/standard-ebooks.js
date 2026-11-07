import { clean, fetchText, rankBookSearchResults, safeFileName, sendDocument, textFromHtml } from './_shared.js'

const ORIGIN = 'https://standardebooks.org'

function absolute(path) {
  try { return new URL(String(path || ''), ORIGIN).href } catch { return '' }
}

function authorFromPath(pathname = '') {
  const parts = String(pathname).split('/').filter(Boolean)
  const slug = parts[1] || ''
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map(word => word.length <= 2 ? word.toUpperCase() : word[0]?.toUpperCase() + word.slice(1))
    .join(' ')
}

function parseSearch(html, query = '') {
  const out = []
  const seen = new Set()
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const match of String(html || '').matchAll(re)) {
    const href = String(match[1] || '')
    let url
    try { url = new URL(href, ORIGIN) } catch { continue }
    if (url.origin !== ORIGIN) continue
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] !== 'ebooks' || parts.length < 3 || parts.length > 4) continue
    if (['downloads','text','feeds'].includes(parts.at(-1))) continue
    const title = textFromHtml(match[2])
    if (!title || title.length > 220 || seen.has(url.pathname)) continue
    if (/^(read|download|details|source|github|wikipedia)$/i.test(title)) continue
    const img = /<img\b[^>]*src=["']([^"']+)["']/i.exec(match[2] || '')
    seen.add(url.pathname)
    out.push({
      id:url.pathname,
      title:clean(title, 180),
      author:authorFromPath(url.pathname),
      url:url.href,
      cover:img?.[1]
        ? absolute(img[1])
        : url.href.replace(/\/$/, '') + '/downloads/cover.jpg?source=download',
    })
    if (out.length >= 25) break
  }
  return query ? rankBookSearchResults(query, out, { limit:25 }) : out
}

function pageSynopsis(html = '') {
  const source = String(html || '')
  const meta = /<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']+)["'][^>]*>/i.exec(source)
    || /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*>/i.exec(source)
  return clean(textFromHtml(meta?.[1] || ''), 4000)
}

function parseEditions(html = '') {
  const rows = []
  const seen = new Set()
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi

  for (const match of String(html || '').matchAll(re)) {
    const href = absolute(match[1])
    if (!href || !href.startsWith(ORIGIN + '/')) continue
    let parsed
    try { parsed = new URL(href) } catch { continue }
    if (!parsed.pathname.includes('/downloads/')) continue

    const lower = parsed.pathname.toLowerCase()
    const label = textFromHtml(match[2] || '')
    let row = null

    if (lower.endsWith('.kepub.epub')) {
      row = { title:'KEPUB', format:'KEPUB', mimetype:'application/epub+zip', extension:'kepub.epub' }
    } else if (lower.endsWith('.advanced.epub')) {
      row = { title:'Advanced EPUB', format:'EPUB', mimetype:'application/epub+zip', extension:'advanced.epub' }
    } else if (lower.endsWith('.epub')) {
      row = { title:/compatible/i.test(label) ? 'Compatible EPUB' : 'EPUB', format:'EPUB', mimetype:'application/epub+zip', extension:'epub' }
    } else if (lower.endsWith('.azw3')) {
      row = { title:'AZW3', format:'AZW3', mimetype:'application/vnd.amazon.ebook', extension:'azw3' }
    }

    if (!row) continue
    const download = new URL(href)
    download.searchParams.set('source', 'download')
    const downloadUrl = download.href
    if (seen.has(downloadUrl)) continue
    seen.add(downloadUrl)
    rows.push({
      id:downloadUrl,
      ...row,
      language:'English',
      url:downloadUrl,
    })
  }

  const rank = { EPUB:0, KEPUB:1, AZW3:2 }
  return rows.sort((a,b) => (rank[a.format] ?? 9) - (rank[b.format] ?? 9) || a.title.localeCompare(b.title)).slice(0, 25)
}

async function search(query) {
  const url = ORIGIN + '/ebooks?' + new URLSearchParams({
    query,
    sort:'relevance',
    view:'list',
    'per-page':'48',
  })
  const { text } = await fetchText(url, {
    headers:{ accept:'text/html,application/xhtml+xml', 'accept-language':'en-US,en;q=0.9' },
    timeoutMs:20000,
  })
  return parseSearch(text, query)
}

async function editions(item = {}) {
  const url = String(item?.url || '').trim()
  if (!/^https:\/\/standardebooks\.org\/ebooks\//i.test(url)) {
    throw new Error('Standard Ebooks item URL is missing.')
  }
  const { text } = await fetchText(url, {
    headers:{ accept:'text/html,application/xhtml+xml', 'accept-language':'en-US,en;q=0.9' },
    timeoutMs:20000,
  })
  const rows = parseEditions(text)
  if (!rows.length) throw new Error('Standard Ebooks could not resolve download formats.')
  return {
    editions:rows,
    book:{ synopsis:pageSynopsis(text) },
  }
}

export default {
  id:'standard-ebooks',
  name:'Standard Ebooks',
  description:'Polished public-domain editions in EPUB, AZW3 and KEPUB formats.',

  async run({ action, query, item, edition, context }) {
    if (action === 'search') return { items:await search(clean(query, 180)) }
    if (action === 'editions') return editions(item)

    if (action === 'download') {
      const chosen = edition || {}
      const url = String(chosen.url || '').trim()
      if (!url) throw new Error('Standard Ebooks edition URL is missing.')
      const title = clean(item?.title || 'Standard Ebook', 160)
      const author = clean(item?.author || '', 100)
      return sendDocument(context, {
        url,
        mimetype:chosen.mimetype || 'application/epub+zip',
        fileName:safeFileName([title, author].filter(Boolean).join(' - '), chosen.extension || 'epub'),
      })
    }

    throw new Error('Unsupported Standard Ebooks action: ' + action)
  },

  _test:{ parseSearch, parseEditions, pageSynopsis },
}
