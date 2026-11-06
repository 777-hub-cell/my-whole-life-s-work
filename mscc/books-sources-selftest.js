import { SourceRegistry } from './source-registry.js'
import gutenberg from './sources/books/gutenberg.js'
import standardEbooks from './sources/books/standard-ebooks.js'
import openLibrary from './sources/books/openlibrary.js'
import novelBuddy from './sources/books/novelbuddy.js'
import { rankBookSearchResults } from './sources/books/_shared.js'

const registry = new SourceRegistry({
  rootUrl:new URL('./sources/', import.meta.url),
  storage:{ brandForCapability:() => 'MSCC' },
})
await registry.load()

const ids = registry.list('books').map(source => source.id).sort()
const expected = ['gutenberg','openlibrary','standard-ebooks'].sort()
if (ids.join('|') !== expected.join('|')) {
  throw new Error('Unexpected books source set: ' + ids.join('|'))
}
if (registry.mode('books') !== 'user-choice') {
  throw new Error('Books must remain user-selectable by source.')
}

const gutSearch = gutenberg._test.parseSearch(`
<li class="booklink">
  <a href="/ebooks/1342">
    <img src="/cache/epub/1342/pg1342.cover.medium.jpg">
    <span class="title">Pride and Prejudice</span>
    <span class="subtitle">Jane Austen</span>
  </a>
</li>`)
if (gutSearch.length !== 1 || gutSearch[0].id !== '1342' || !gutSearch[0].cover.includes('pg1342.cover.medium.jpg')) {
  throw new Error('Gutenberg search parsing failed.')
}
const gutRows = gutenberg._test.parseEditions(`
<a href="/ebooks/1342.epub3.images">EPUB3 (with images)</a>
<a href="/ebooks/1342.txt.utf-8">Plain Text UTF-8</a>
`)
if (gutRows.map(row => row.format).join('|') !== 'EPUB|TXT') {
  throw new Error('Gutenberg edition parsing failed.')
}

const seHtml = `
<a href="/ebooks/charlotte-bronte">Charlotte Brontë</a>
<a href="/ebooks/charlotte-bronte/jane-eyre"><span>Jane Eyre</span></a>
`
const seItems = standardEbooks._test.parseSearch(seHtml)
if (seItems.length !== 1 || seItems[0].title !== 'Jane Eyre') {
  throw new Error('Standard Ebooks search parsing failed.')
}
if (!seItems[0].cover.includes('/downloads/cover.jpg?source=download')) {
  throw new Error('Standard Ebooks cover URL missing.')
}
const seEditions = standardEbooks._test.parseEditions(`
<a href="/ebooks/charlotte-bronte/jane-eyre/downloads/jane-eyre.epub">Compatible epub</a>
<a href="/ebooks/charlotte-bronte/jane-eyre/downloads/jane-eyre.kepub.epub">kepub</a>
<a href="/ebooks/charlotte-bronte/jane-eyre/downloads/jane-eyre.azw3">azw3</a>
`)
if (!seEditions.some(row => row.format === 'EPUB' && row.url.includes('jane-eyre.epub?source=download'))) {
  throw new Error('Standard Ebooks download-link parsing failed.')
}

const iaRows = openLibrary._test.archiveFormats('public-item', {
  files:[
    { name:'book.epub', size:'123456' },
    { name:'book.pdf', size:'456789' },
    { name:'secret.epub', size:'123', private:true },
    { name:'book_meta.xml', size:'10' },
  ],
})
if (iaRows.length !== 2 || iaRows.some(row => /secret|meta/.test(row.url))) {
  throw new Error('Open Library public archive filtering failed.')
}

const nbItems = novelBuddy._test.searchItems({
  data:{ items:[{ id:'123', name:'Example Novel', url:'/novel/example-novel', slug:'example-novel', cover:'/covers/example.jpg', authors:[{name:'Example Author'}] }] },
})
if (nbItems.length !== 1 || nbItems[0].id !== '123' || !nbItems[0].url.startsWith('https://novelbuddy.me/')) {
  throw new Error('NovelBuddy search result parsing failed.')
}
if (nbItems[0].author !== 'Example Author' || !nbItems[0].cover.endsWith('/covers/example.jpg')) {
  throw new Error('NovelBuddy cover/author metadata missing.')
}
const next = novelBuddy._test.nextData('<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"initialManga":{"id":"123"}}}}</script>')
if (next?.props?.pageProps?.initialManga?.id !== '123') {
  throw new Error('NovelBuddy __NEXT_DATA__ parsing failed.')
}

if (novelBuddy.disabled !== true || registry.get('books', 'novelbuddy') !== null) {
  throw new Error('NovelBuddy must remain disabled until automated access is authorized.')
}
if (registry.get('books', 'welib') !== null) {
  throw new Error('WeLib must remain disabled without verified distribution rights.')
}



const percyMatches = rankBookSearchResults('percy jackson', [
  { title:'Poetry', author:'Ring Lardner' },
  { title:'The Sea of Monsters', author:'Rick Riordan', rawText:'Percy Jackson and the Olympians' },
  { title:'Percy Jackson and the Lightning Thief', author:'Rick Riordan' },
])
if (percyMatches.length !== 2 || percyMatches.some(item => item.title === 'Poetry')) {
  throw new Error('Book search relevance admitted an unrelated title.')
}

const peterMatches = rankBookSearchResults('Peter and Jane', [
  { title:'Sense and Sensibility', author:'Jane Austen' },
  { title:'Peter and Jane', author:'S. Macnaughtan' },
])
if (peterMatches.length !== 1 || peterMatches[0].author !== 'S. Macnaughtan') {
  throw new Error('Book search relevance did not keep the exact Peter and Jane match.')
}

const unrelatedStandard = standardEbooks._test.parseSearch(
  '<a href="/ebooks/ring-lardner/poetry">Poetry</a>',
  'percy jackson',
)
if (unrelatedStandard.length) throw new Error('Standard Ebooks returned Poetry for Percy Jackson.')

const unrelatedGutenberg = gutenberg._test.parseSearch(`
<li class="booklink">
  <a href="/ebooks/100"><span class="title">Poetry</span><span class="subtitle">Ring Lardner</span></a>
</li>`, 'percy jackson')
if (unrelatedGutenberg.length) throw new Error('Project Gutenberg returned an irrelevant Percy Jackson result.')

const boundedFiles = openLibrary._test.archiveFormats('bounded-item', {
  files:[
    { name:'book.pdf', size:'213909504' },
    { name:'book.txt', size:'614400' },
  ],
})
if (boundedFiles.length !== 1 || boundedFiles[0].format !== 'TXT') {
  throw new Error('Open Library exposed an oversized PDF edition.')
}

const incompleteNovelChapters = Array.from({ length:19 }, (_, index) => ({
  id:String(index + 2),
  name:'Chapter ' + (index + 2),
}))
let chapterGapRejected = false
try {
  novelBuddy._test.assertCompleteChapters({}, incompleteNovelChapters)
} catch (error) {
  chapterGapRejected = /chapter 1 is missing/i.test(String(error?.message || ''))
}
if (!chapterGapRejected) throw new Error('NovelBuddy accepted a novel whose first chapter is missing.')

const orderedButMissingFirst = incompleteNovelChapters.map((chapter, index) => ({
  ...chapter,
  order:index,
}))
let indexedChapterGapRejected = false
try {
  novelBuddy._test.assertCompleteChapters({}, orderedButMissingFirst)
} catch (error) {
  indexedChapterGapRejected = /chapter 1 is missing/i.test(String(error?.message || ''))
}
if (!indexedChapterGapRejected) {
  throw new Error('NovelBuddy trusted array position over explicit chapter titles and omitted Chapter 1.')
}

let chapterCountRejected = false
try {
  novelBuddy._test.assertCompleteChapters({ chapterCount:20 }, incompleteNovelChapters, 20)
} catch (error) {
  chapterCountRejected = /expected 20, received 19/i.test(String(error?.message || ''))
}
if (!chapterCountRejected) throw new Error('NovelBuddy accepted fewer chapters than the source declared.')

console.log('PASS book search relevance, edition size limits and novel completeness')

console.log('PASS books/novels sources: ' + expected.join(' | '))
