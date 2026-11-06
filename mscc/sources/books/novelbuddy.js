import { appendFile, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clean, fetchJson, fetchText, rankBookSearchResults, safeFileName, sendDocument, textFromHtml } from './_shared.js'

const API = 'https://api.novelbuddy.me'
const SITE = 'https://novelbuddy.me'

function positiveCount(...values) {
  for (const value of values) {
    const count = Number(value)
    if (Number.isSafeInteger(count) && count > 0) return count
  }
  return 0
}

function chapterOrdinal(chapter = {}) {
  const explicitKeys = ['chapter_number','chapterNumber','chapter_no','chapterNo']
  for (const key of explicitKeys) {
    const raw = chapter?.[key]
    if (raw === null || raw === undefined || String(raw).trim() === '') continue
    const value = Number(raw)
    if (Number.isSafeInteger(value) && value >= 0) return value
  }

  const name = String(chapter?.name || '')
  const named = /\b(?:chapter|ch\.?|part)\s*#?\s*(\d+)\b/i.exec(name)
  if (named) return Number(named[1])

  for (const key of ['number','order','sort_order','sequence']) {
    const raw = chapter?.[key]
    if (raw === null || raw === undefined || String(raw).trim() === '') continue
    const value = Number(raw)
    if (Number.isSafeInteger(value) && value >= 0) return value
  }
  return null
}

function assertCompleteChapters(novel, rows, expectedCount = 0) {
  const expected = positiveCount(expectedCount, novel?.chapterCount)
  if (!Array.isArray(rows) || !rows.length) throw new Error('NovelBuddy returned an empty chapter list.')
  if (expected && rows.length !== expected) {
    throw new Error(`NovelBuddy chapter list is incomplete: expected ${expected}, received ${rows.length}. Refusing to send a partial novel.`)
  }

  const ordinals = rows.map(row => chapterOrdinal(row) ?? (Number.isSafeInteger(row?.order) ? row.order : null))
  if (ordinals.every(value => value !== null)) {
    const sorted = [...ordinals].sort((a,b) => a-b)
    const start = sorted[0] === 0 ? 0 : 1
    for (let index = 0; index < sorted.length; index++) {
      if (sorted[index] !== start + index) {
        throw new Error(`NovelBuddy chapter sequence is incomplete: chapter ${start + index} is missing. Refusing to send a partial novel.`)
      }
    }
  } else if (ordinals.some(value => value !== null)) {
    throw new Error('NovelBuddy chapter numbering is inconsistent. Refusing to send a potentially incomplete novel.')
  } else if (expected && rows.length < expected) {
    throw new Error(`NovelBuddy is missing chapters: expected ${expected}, received ${rows.length}.`)
  }
  return true
}

function searchItems(data) {
  const rows = Array.isArray(data?.data?.items) ? data.data.items : []
  return rows.slice(0, 25).flatMap(item => {
    const id = String(item?.id || '').trim()
    const title = clean(item?.name || '', 180)
    const url = String(item?.url || '').trim()
    if (!id || !title || !url) return []
    const author = Array.isArray(item?.authors)
      ? clean(item.authors.map(value => value?.name || value).filter(Boolean).join(', '), 140)
      : clean(item?.author || item?.authorName || '', 140)
    return [{
      id,
      title,
      author,
      synopsis:clean(textFromHtml(item?.description || item?.summary || item?.synopsis || ''), 4000),
      cover:item?.cover ? (String(item.cover).startsWith('http') ? String(item.cover) : SITE + '/' + String(item.cover).replace(/^\//, '')) : '',
      url:url.startsWith('http') ? url : SITE + '/' + url.replace(/^\//, ''),
      slug:clean(item?.slug || '', 160),
      cv:Number(item?.cv || item?.content_version || 0) || 0,
      chapterCount:positiveCount(item?.chapter_count, item?.chapterCount, item?.total_chapters, item?.totalChapters),
    }]
  })
}

async function search(query) {
  const { data } = await fetchJson(API + '/titles/search?' + new URLSearchParams({
    q:query,
    limit:'24',
    page:'1',
  }), {
    headers:{ origin:SITE, referer:SITE + '/' },
  })
  return rankBookSearchResults(query, searchItems(data), { limit:25 })
}

function nextData(html) {
  const match = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(String(html || ''))
  if (!match) return null
  try { return JSON.parse(match[1]) } catch { return null }
}

async function details(item = {}) {
  const url = String(item?.url || '').trim()
  if (!url) return { id:String(item?.id || ''), title:item?.title || '', author:item?.author || '', cv:Number(item?.cv || 0) || 0, chapterCount:positiveCount(item?.chapterCount) }
  try {
    const { text } = await fetchText(url, {
      headers:{ accept:'text/html,application/xhtml+xml', referer:SITE + '/' },
      timeoutMs:15000,
    })
    const data = nextData(text)
    const manga = data?.props?.pageProps?.initialManga
    if (!manga) throw new Error('NovelBuddy details missing')
    return {
      id:String(manga.id || item?.id || ''),
      title:clean(manga.name || item?.title || '', 180),
      author:Array.isArray(manga.authors) ? clean(manga.authors.map(author => author?.name).filter(Boolean).join(', '), 140) : clean(item?.author || '', 140),
      cover:manga.cover ? (String(manga.cover).startsWith('http') ? String(manga.cover) : SITE + '/' + String(manga.cover).replace(/^\//, '')) : String(item?.cover || ''),
      synopsis:clean(textFromHtml(manga.description || manga.summary || manga.synopsis || item?.synopsis || ''), 4000),
      cv:Number(manga.content_version || manga.cv || item?.cv || 0) || 0,
      chapterCount:positiveCount(manga.chapter_count, manga.chapterCount, manga.total_chapters, manga.totalChapters, manga.chapters_count, manga.chaptersCount, item?.chapterCount),
      url,
    }
  } catch {
    return { id:String(item?.id || ''), title:item?.title || '', author:item?.author || '', cover:String(item?.cover || ''), synopsis:String(item?.synopsis || ''), cv:Number(item?.cv || 0) || 0, chapterCount:positiveCount(item?.chapterCount), url }
  }
}

async function chapters(novelId, cv = 0) {
  if (!novelId) throw new Error('NovelBuddy novel ID is missing.')
  const suffix = cv ? '?cv=' + encodeURIComponent(String(cv)) : ''
  const { data } = await fetchJson(API + '/titles/' + encodeURIComponent(novelId) + '/chapters' + suffix, {
    headers:{ origin:SITE, referer:SITE + '/' },
    timeoutMs:20000,
  })
  const payload = data?.data || {}
  const rawRows = Array.isArray(payload?.chapters) ? payload.chapters : []
  if (!rawRows.length) throw new Error('NovelBuddy returned no chapters.')

  const expectedCount = positiveCount(
    payload.total_chapters, payload.totalChapters, payload.chapter_count,
    payload.chapterCount, payload.total, payload.count,
    payload.pagination?.total, payload.meta?.total,
    data?.pagination?.total, data?.meta?.total,
  )
  const rows = rawRows.map((chapter, index) => ({
    id:String(chapter?.id || '').trim(),
    name:clean(chapter?.name || 'Chapter ' + (index + 1), 180),
    url:String(chapter?.url || '').trim(),
    order:chapterOrdinal(chapter),
  }))
  const missingIds = rows.filter(chapter => !chapter.id).length
  if (missingIds) {
    throw new Error(`NovelBuddy returned ${missingIds} chapter entr${missingIds === 1 ? 'y' : 'ies'} without IDs. Refusing to omit them silently.`)
  }

  const hasOrder = rows.every(chapter => chapter.order !== null)
  const ordered = hasOrder
    ? [...rows].sort((a,b) => a.order - b.order)
    : [...rows].reverse()
  assertCompleteChapters({ chapterCount:expectedCount }, ordered, expectedCount)
  return { items:ordered, expectedCount }
}

async function chapterText(novelId, chapter) {
  try {
    const { data } = await fetchJson(
      API + '/titles/' + encodeURIComponent(novelId) + '/chapters/' + encodeURIComponent(chapter.id),
      {
        headers:{ origin:SITE, referer:SITE + '/' },
        timeoutMs:20000,
      },
    )
    const content = data?.data?.chapter?.content
    const text = textFromHtml(content || '')
    if (text) return text
  } catch {}

  const url = chapter.url
    ? (chapter.url.startsWith('http') ? chapter.url : SITE + '/' + chapter.url.replace(/^\//, ''))
    : ''
  if (!url) throw new Error('NovelBuddy chapter content is unavailable: ' + chapter.name)
  const { text:html } = await fetchText(url, {
    headers:{ accept:'text/html,application/xhtml+xml', referer:SITE + '/' },
    timeoutMs:20000,
  })
  const data = nextData(html)
  const content = data?.props?.pageProps?.initialChapter?.content || ''
  const text = textFromHtml(content)
  if (!text) throw new Error('NovelBuddy chapter content is unavailable: ' + chapter.name)
  return text
}

async function wholeNovel(item) {
  const novel = await details(item)
  const chapterResult = await chapters(novel.id, novel.cv)
  const rows = chapterResult.items
  const expectedCount = positiveCount(novel.chapterCount, chapterResult.expectedCount)
  assertCompleteChapters(novel, rows, expectedCount)
  return { novel, chapters:rows, expectedCount:expectedCount || rows.length }
}

async function buildWholeNovelTxt(item) {
  const { novel, chapters:rows } = await wholeNovel(item || {})
  const file = join(tmpdir(), 'mscc-novelbuddy-' + randomUUID() + '.txt')
  const heading = [
    novel.title || item?.title || 'Novel',
    novel.author ? 'By ' + novel.author : '',
    '',
    'Chapters: ' + rows.length,
    '',
  ].filter((value, index) => value || index === 2).join('\n')
  await writeFile(file, heading + '\n', 'utf8')

  try {
    const batchSize = 4
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize)
      const texts = await Promise.all(batch.map(chapter => chapterText(novel.id, chapter)))
      if (texts.length !== batch.length || texts.some(text => !String(text || '').trim())) {
        throw new Error('NovelBuddy could not retrieve every chapter. No partial novel will be delivered.')
      }
      let block = ''
      for (let j = 0; j < batch.length; j++) {
        block += '\n\n' + batch[j].name + '\n' + '='.repeat(Math.min(72, Math.max(8, batch[j].name.length))) + '\n\n'
        block += texts[j].trim() + '\n'
      }
      await appendFile(file, block, 'utf8')
    }
    return {
      file,
      title:novel.title || item?.title || 'Novel',
      author:novel.author || item?.author || '',
      chapterCount:expectedCount,
    }
  } catch (error) {
    await rm(file, { force:true }).catch(() => {})
    throw error
  }
}

export default {
  id:'novelbuddy',
  name:'NovelBuddy',
  description:'Web-novel search with whole-novel TXT delivery.',
  fallbackOrder:10,

  async run({ action, query, item, edition, context }) {
    if (action === 'search') return { items:await search(clean(query, 180)) }

    if (action === 'editions') {
      const { novel, chapters:rows, expectedCount } = await wholeNovel(item)
      return {
        book:{
          author:novel.author || item?.author || '',
          cover:novel.cover || item?.cover || '',
          synopsis:novel.synopsis || item?.synopsis || '',
        },
        editions:[{
          id:'whole-txt',
          title:'TXT',
          format:'TXT',
          language:'English',
          size:expectedCount + ' chapters',
          wholeNovel:true,
        }],
      }
    }

    if (action === 'download') {
      const chosen = edition || {}
      if (chosen.id && chosen.id !== 'whole-txt') throw new Error('Unsupported NovelBuddy edition.')
      const built = await buildWholeNovelTxt(item || {})
      try {
        return await sendDocument(context, {
          file:built.file,
          mimetype:'text/plain',
          fileName:safeFileName([built.title, built.author].filter(Boolean).join(' - '), 'txt'),
        })
      } finally {
        await rm(built.file, { force:true }).catch(() => {})
      }
    }

    throw new Error('Unsupported NovelBuddy action: ' + action)
  },

  _test:{ searchItems, nextData, chapterOrdinal, assertCompleteChapters, positiveCount },
}
