const WIKI_API = 'https://en.wikipedia.org/w/api.php'
const UA = 'MSCC/2.3 (+https://github.com/777-hub-cell/my-whole-life-s-work)'

function clean(value, max = 4000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

async function wikiJson(params) {
  const url = new URL(WIKI_API)
  for (const [key, value] of Object.entries({
    format:'json',
    formatversion:'2',
    origin:'*',
    ...params,
  })) {
    url.searchParams.set(key, String(value))
  }

  const response = await fetch(url, {
    headers:{
      'user-agent':UA,
      accept:'application/json',
      'accept-language':'en-US,en;q=0.9',
    },
    redirect:'follow',
    signal:AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Wikipedia returned HTTP ${response.status}.`)
  const data = await response.json()
  if (data?.error) throw new Error(data.error?.info || 'Wikipedia request failed.')
  return data
}

export function normalizeWikiSearch(data) {
  const rows = Array.isArray(data?.query?.search) ? data.query.search : []
  return rows
    .map((item, index) => ({
      title:clean(item?.title, 220),
      pageid:Number(item?.pageid || 0) || 0,
      snippet:clean(String(item?.snippet || '').replace(/<[^>]+>/g, ''), 500),
      index,
    }))
    .filter(item => item.title && item.pageid)
}

export function normalizeWikiPage(data, fallbackTitle = '') {
  const pages = Array.isArray(data?.query?.pages) ? data.query.pages : []
  const page = pages.find(item => !item?.missing) || null
  if (!page) return null

  const title = clean(page.title || fallbackTitle, 220)
  const extract = clean(page.extract, 2200)
  const url = clean(page.fullurl, 2000) ||
    (title ? 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_')) : '')
  const thumbnail = clean(page?.thumbnail?.source, 2000)

  if (!title || !extract) return null
  return {
    pageid:Number(page.pageid || 0) || 0,
    title,
    extract,
    url,
    thumbnail,
  }
}

export async function searchWikipedia(query, { limit = 5 } = {}) {
  const term = clean(query, 240)
  if (!term) return []
  const data = await wikiJson({
    action:'query',
    list:'search',
    srsearch:term,
    srnamespace:0,
    srlimit:Math.max(1, Math.min(10, Number(limit) || 5)),
    srprop:'snippet',
  })
  return normalizeWikiSearch(data)
}

export async function wikipediaArticle(query) {
  const results = await searchWikipedia(query, { limit:5 })
  if (!results.length) return null

  const top = results[0]
  const data = await wikiJson({
    action:'query',
    pageids:top.pageid,
    prop:'extracts|info|pageimages',
    exintro:'1',
    explaintext:'1',
    exsectionformat:'plain',
    inprop:'url',
    piprop:'thumbnail',
    pithumbsize:'640',
  })

  const article = normalizeWikiPage(data, top.title)
  return article ? { ...article, matches:results } : null
}
