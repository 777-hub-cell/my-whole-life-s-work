import { clean, fetchText, rankBookSearchResults, safeFileName, sendDocument, textFromHtml } from './_shared.js'

const ORIGIN = 'https://www.gutenberg.org'

function absolute(value = '') {
  try { return new URL(String(value || ''), ORIGIN).href } catch { return '' }
}

function parseSearch(html = '', query = '') {
  const blocks = String(html || '').match(/<li\b[^>]*class=["'][^"']*\bbooklink\b[^"']*["'][^>]*>[\s\S]*?<\/li>/gi) || []
  const items = []
  const seen = new Set()
  for (const block of blocks) {
    const href = /<a\b[^>]*href=["']([^"']*\/ebooks\/(\d+)[^"']*)["']/i.exec(block)
    const id = href?.[2] || ''
    if (!id || seen.has(id)) continue
    const titleMatch = /<span\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(block)
    const authorMatch = /<span\b[^>]*class=["'][^"']*\bsubtitle\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(block)
    const imgMatch = /<img\b[^>]*src=["']([^"']+)["']/i.exec(block)
    const title = textFromHtml(titleMatch?.[1] || '')
    if (!title) continue
    seen.add(id)
    items.push({
      id,
      title:clean(title, 180),
      author:clean(textFromHtml(authorMatch?.[1] || ''), 140),
      year:'',
      url:ORIGIN + '/ebooks/' + id,
      cover:absolute(imgMatch?.[1] || ''),
    })
    if (items.length >= 25) break
  }
  return query ? rankBookSearchResults(query, items, { limit:25 }) : items
}

function classifyDownload(href = '', label = '') {
  const url = absolute(href)
  if (!url) return null
  const lower = (String(href) + ' ' + String(label)).toLowerCase()
  if (/\.epub|epub/.test(lower)) return {
    format:'EPUB',
    mimetype:'application/epub+zip',
    extension:'epub',
    title:/images/.test(lower) ? 'EPUB (with images)' : 'EPUB',
    url,
  }
  if (/\.txt|plain text|utf-?8/.test(lower)) return {
    format:'TXT',
    mimetype:'text/plain',
    extension:'txt',
    title:/utf-?8/.test(lower) ? 'TXT (UTF-8)' : 'TXT',
    url,
  }
  if (/\.pdf|pdf/.test(lower)) return {
    format:'PDF',
    mimetype:'application/pdf',
    extension:'pdf',
    title:'PDF',
    url,
  }
  return null
}

function parseEditions(html = '') {
  const rows = []
  const seen = new Set()
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const match of String(html || '').matchAll(re)) {
    const entry = classifyDownload(match[1], textFromHtml(match[2] || ''))
    if (!entry || seen.has(entry.url)) continue
    seen.add(entry.url)
    rows.push({
      id:entry.url,
      title:entry.title,
      format:entry.format,
      language:'English',
      url:entry.url,
      mimetype:entry.mimetype,
      extension:entry.extension,
    })
  }
  const rank = { EPUB:0, PDF:1, TXT:2 }
  return rows.sort((a,b) => (rank[a.format] ?? 9) - (rank[b.format] ?? 9) || a.title.localeCompare(b.title)).slice(0, 25)
}

async function search(query) {
  const { text } = await fetchText(
    ORIGIN + '/ebooks/search/?' + new URLSearchParams({ query, submit_search:'Go!' }),
    {
      headers:{ accept:'text/html,application/xhtml+xml', 'accept-language':'en-US,en;q=0.9' },
      timeoutMs:20000,
    },
  )
  return parseSearch(text, query)
}

async function editions(item = {}) {
  const id = String(item?.id || '').trim()
  if (!/^\d+$/.test(id)) throw new Error('Project Gutenberg book ID is missing.')
  const { text } = await fetchText(ORIGIN + '/ebooks/' + id, {
    headers:{ accept:'text/html,application/xhtml+xml', 'accept-language':'en-US,en;q=0.9' },
    timeoutMs:20000,
  })
  const rows = parseEditions(text)
  if (!rows.length) throw new Error('Project Gutenberg has no supported downloadable format for this book.')
  return rows
}

export default {
  id:'gutenberg',
  name:'Project Gutenberg',
  description:'Public-domain ebooks with EPUB, PDF and plain-text downloads.',

  async run({ action, query, item, edition, context }) {
    if (action === 'search') return { items:await search(clean(query, 180)) }
    if (action === 'editions') return { editions:await editions(item) }
    if (action === 'download') {
      const chosen = edition || {}
      const url = String(chosen.url || '').trim()
      if (!url) throw new Error('Project Gutenberg edition URL is missing.')
      const title = clean(item?.title || 'Project Gutenberg book', 160)
      const author = clean(item?.author || '', 100)
      return sendDocument(context, {
        url,
        mimetype:chosen.mimetype || 'application/octet-stream',
        fileName:safeFileName([title, author].filter(Boolean).join(' - '), chosen.extension || 'epub'),
      })
    }
    throw new Error('Unsupported Project Gutenberg action: ' + action)
  },

  _test:{ parseSearch, parseEditions, classifyDownload },
}
