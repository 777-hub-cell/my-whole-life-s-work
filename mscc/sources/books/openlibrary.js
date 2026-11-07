import { clean, fetchJson, rankBookSearchResults, safeFileName, sendDocument, sizeText } from './_shared.js'

const OL = 'https://openlibrary.org'
const IA = 'https://archive.org'

function audioOrMeta(name = '') {
  return /(_meta\.sqlite|_files\.xml|_meta\.xml|_djvu\.xml|_scandata\.xml|_bw\.pdf|_text\.pdf)$/i.test(String(name))
}

function archiveFormats(identifier, metadata = {}) {
  const files = Array.isArray(metadata?.files) ? metadata.files : []
  const rows = []
  const seen = new Set()
  for (const file of files) {
    const name = String(file?.name || '')
    if (!name || audioOrMeta(name) || file?.private === true) continue
    const lower = name.toLowerCase()
    let format = ''
    let mimetype = ''
    let extension = ''
    if (lower.endsWith('.epub')) {
      format = 'EPUB'; mimetype = 'application/epub+zip'; extension = 'epub'
    } else if (lower.endsWith('.pdf')) {
      format = 'PDF'; mimetype = 'application/pdf'; extension = 'pdf'
    } else if (lower.endsWith('.txt')) {
      format = 'TXT'; mimetype = 'text/plain'; extension = 'txt'
    } else continue
    const bytes = Number(file?.size || 0)
    const maxBytes = format === 'PDF' ? 50 * 1024 * 1024 : format === 'EPUB' ? 40 * 1024 * 1024 : 10 * 1024 * 1024
    if (bytes > 0 && bytes > maxBytes) continue
    const key = format + ':' + name
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      id:identifier + '::' + name,
      title:format,
      format,
      language:'English',
      size:sizeText(file?.size),
      url:IA + '/download/' + encodeURIComponent(identifier) + '/' + name.split('/').map(encodeURIComponent).join('/'),
      mimetype,
      extension,
      fileName:name,
    })
  }
  const rank = { EPUB:0, PDF:1, TXT:2 }
  return rows.sort((a,b) => (rank[a.format] ?? 9) - (rank[b.format] ?? 9) || a.fileName.localeCompare(b.fileName))
}

async function search(query) {
  const fields = [
    'key','title','author_name','first_publish_year','ia','public_scan_b','ebook_access','language','cover_i','cover_edition_key',
  ].join(',')
  const { data } = await fetchJson(OL + '/search.json?' + new URLSearchParams({
    q:query,
    fields,
    limit:'40',
  }))
  const docs = Array.isArray(data?.docs) ? data.docs : []
  const items = docs.flatMap(doc => {
    const ia = Array.isArray(doc?.ia) ? doc.ia.filter(Boolean) : []
    const publicAccess = doc?.public_scan_b === true || String(doc?.ebook_access || '').toLowerCase() === 'public'
    if (!doc?.key || !doc?.title || !publicAccess || !ia.length) return []
    return [{
      id:String(doc.key).replace(/^\/works\//, ''),
      title:clean(doc.title, 180),
      author:Array.isArray(doc.author_name) ? clean(doc.author_name.join(', '), 140) : '',
      year:String(doc.first_publish_year || ''),
      ia:ia.slice(0, 8),
      publicScan:true,
      language:Array.isArray(doc.language) ? doc.language.slice(0, 8) : [],
      cover:doc.cover_i
        ? 'https://covers.openlibrary.org/b/id/' + encodeURIComponent(String(doc.cover_i)) + '-M.jpg'
        : doc.cover_edition_key
          ? 'https://covers.openlibrary.org/b/olid/' + encodeURIComponent(String(doc.cover_edition_key)) + '-M.jpg'
          : '',
    }]
  })
  return rankBookSearchResults(query, items, { limit:25 })
}

async function editions(item = {}) {
  const ids = Array.isArray(item?.ia) ? item.ia : []
  const rows = []
  let synopsis = String(item?.synopsis || '').trim()
  const workId = String(item?.id || '').trim()
  if (!synopsis && workId) {
    try {
      const { data:work } = await fetchJson(OL + '/works/' + encodeURIComponent(workId) + '.json', { timeoutMs:12000 })
      const description = work?.description
      synopsis = clean(typeof description === 'object' ? description?.value : description || '', 4000)
    } catch {}
  }
  for (const identifier of ids.slice(0, 8)) {
    try {
      const { data } = await fetchJson(IA + '/metadata/' + encodeURIComponent(identifier), { timeoutMs:12000 })
      const restricted = String(data?.metadata?.['access-restricted-item'] || '').toLowerCase() === 'true'
      if (restricted) continue
      rows.push(...archiveFormats(identifier, data))
    } catch {}
    if (rows.length >= 25) break
  }
  if (!rows.length) throw new Error('Open Library found the book, but no public EPUB/PDF/TXT file is currently available.')
  return {
    editions:rows.slice(0, 25),
    book:{ synopsis },
  }
}

export default {
  id:'openlibrary',
  name:'Open Library',
  description:'Open Library discovery with public Internet Archive EPUB/PDF/TXT files only.',

  async run({ action, query, item, edition, context }) {
    if (action === 'search') return { items:await search(clean(query, 180)) }
    if (action === 'editions') return editions(item)

    if (action === 'download') {
      const chosen = edition || {}
      const url = String(chosen.url || '').trim()
      if (!url) throw new Error('Open Library edition URL is missing.')
      const title = clean(item?.title || 'Open Library book', 160)
      const author = clean(item?.author || '', 100)
      return sendDocument(context, {
        url,
        mimetype:chosen.mimetype || 'application/octet-stream',
        fileName:safeFileName([title, author].filter(Boolean).join(' - '), chosen.extension || 'epub'),
      })
    }

    throw new Error('Unsupported Open Library action: ' + action)
  },

  _test:{ archiveFormats },
}
