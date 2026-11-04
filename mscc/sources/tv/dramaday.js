const API_ROOT = 'https://dramaday.me/wp-json/wp/v2'

const MIRROR_QUALITY = /\b(2160p|1080p|720p|540p|480p|360p)\s+(HDTV|WEB-DL)(?:\s+(x265|x264|AV1))?/gi
const EXCLUDED_TITLE = /\b(?:OST|soundtrack|official soundtrack)\b|\bpart\s*\d+\s*OST\b/i

function safePageUrl(value) {
  try {
    const url = new URL(String(value || ''))
    if (url.protocol !== 'https:' || url.hostname !== 'dramaday.me') return ''
    return url.href
  } catch {
    return ''
  }
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/gi, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
}

function cellLines(value) {
  return decodeEntities(String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function plainText(value) {
  return cellLines(value).join(' ').trim()
}

function titleText(value) {
  if (value && typeof value === 'object') return plainText(value.rendered || '')
  return plainText(value)
}

function mapPost(post) {
  const title = titleText(post?.title)
  const url = safePageUrl(post?.url || post?.link)
  if (!title || !url || EXCLUDED_TITLE.test(title)) return null
  return {
    id:url,
    title,
    description:'Dramaday catalogue · Open episode list',
  }
}

function extractEpisodeRows(renderedHtml) {
  const rows = []
  const matches = [...String(renderedHtml || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
  for (const match of matches) {
    const cells = [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(row => row[1])
    if (cells.length < 2) continue

    const episodeNumber = Number(plainText(cells[0]).match(/\d+/)?.[0] || 0)
    if (!Number.isInteger(episodeNumber) || episodeNumber <= 0) continue

    const qualityText = cellLines(cells[1]).join(' ')
    const qualities = [...qualityText.matchAll(MIRROR_QUALITY)]
      .map(row => [row[1], row[2], row[3]].filter(Boolean).join(' '))
    if (!qualities.length) continue

    rows.push({
      id:String(episodeNumber),
      number:String(episodeNumber),
      title:`Episode ${episodeNumber} · ${qualities.length} quality variants`,
    })
  }

  const seen = new Set()
  return rows
    .sort((a,b) => Number(a.number) - Number(b.number))
    .filter(row => {
      if (seen.has(row.number)) return false
      seen.add(row.number)
      return true
    })
}

function pageSlug(value) {
  const pageUrl = safePageUrl(value)
  if (!pageUrl) throw new Error('Dramaday page URL is missing or invalid.')
  const slug = new URL(pageUrl).pathname.split('/').filter(Boolean).at(-1)
  if (!slug) throw new Error('Dramaday page URL has no post slug.')
  return slug
}

async function requestJson(path, { signal, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Dramaday requires fetch support.')
  const url = new URL(path, API_ROOT + '/')
  const response = await fetchImpl(url.href, {
    headers:{ Accept:'application/json' },
    signal,
  })
  if (!response?.ok) {
    throw new Error(`Dramaday API returned HTTP ${response?.status || 0}.`)
  }
  return response.json()
}

async function searchTitles(query, context) {
  const params = new URLSearchParams({
    search:String(query || '').trim(),
    per_page:'20',
  })
  const results = await requestJson(`search?${params}`, context)
  if (!Array.isArray(results)) throw new Error('Dramaday search returned an unexpected response.')
  return results
    .filter(row => row?.type === 'post' || row?.subtype === 'post')
    .map(mapPost)
    .filter(Boolean)
    .slice(0,20)
}

async function browseTitles(context) {
  const params = new URLSearchParams({
    per_page:'20',
    orderby:'date',
    order:'desc',
    _fields:'id,slug,link,title',
  })
  const results = await requestJson(`posts?${params}`, context)
  if (!Array.isArray(results)) throw new Error('Dramaday catalogue returned an unexpected response.')
  return results.map(mapPost).filter(Boolean).slice(0,20)
}

async function loadPost(item, context) {
  const slug = pageSlug(item?.id || item?.url)
  const params = new URLSearchParams({
    slug,
    _fields:'id,slug,link,title,content',
  })
  const posts = await requestJson(`posts?${params}`, context)
  const post = Array.isArray(posts) ? posts[0] : null
  if (!post?.content?.rendered) throw new Error('Dramaday did not return the selected drama page.')
  return {
    url:safePageUrl(post.link || item?.id),
    html:post.content.rendered,
  }
}

function catalogueOnlyResult(item) {
  return {
    catalogueOnly:true,
    pageUrl:safePageUrl(item?.id || item?.url),
  }
}

export default {
  id:'dramaday',
  name:'Dramaday (catalogue only)',
  description:'Searches Dramaday and lists episode metadata. No automatic mirror bypass or media delivery.',
  catalogueOnly:true,
  fallbackOrder:50,

  async run({ action, query, item, context = {} }) {
    const requestContext = {
      signal:context.signal,
      fetchImpl:context.fetch || globalThis.fetch,
    }

    if (action === 'search') return { items:await searchTitles(query, requestContext) }
    if (action === 'browse') return { items:await browseTitles(requestContext) }

    if (action === 'seasons' || action === 'episodes') {
      const page = await loadPost(item, requestContext)
      const episodes = extractEpisodeRows(page.html)
      if (!episodes.length) throw new Error('Dramaday did not expose a readable episode table for this drama.')
      return {
        title:item?.title || 'Dramaday drama',
        seasonNumber:1,
        episodes,
      }
    }

    if (action === 'options') return catalogueOnlyResult(item)

    if (action === 'download' || action === 'downloadRange') {
      const pageUrl = safePageUrl(item?.id || item?.url)
      return {
        text:[
          'Dramaday is catalogue-only in MSCC.',
          'Its mirror URLs are third-party shorteners and no direct playable media URL has been verified, so no download was started.',
          pageUrl ? `Open the drama catalogue: ${pageUrl}` : '',
        ].filter(Boolean).join('\n\n'),
      }
    }

    throw new Error('Unsupported Dramaday TV action: ' + action)
  },
}

export const _test = {
  safePageUrl,
  extractEpisodeRows,
  pageSlug,
  mapPost,
}
