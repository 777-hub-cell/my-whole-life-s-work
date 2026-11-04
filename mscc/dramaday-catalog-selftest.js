import assert from 'node:assert/strict'
import dramaday, { _test } from './sources/tv/dramaday.js'
import { runTvCommand } from './tv-flow.js'

const PAGE_URL = 'https://dramaday.me/love-in-disguise/'
const QUALITY_LABELS = [
  '1080p HDTV',
  '720p HDTV x265',
  '540p HDTV x264',
  '1080p WEB-DL',
  '1080p WEB-DL AV1',
  '720p WEB-DL x265',
  '540p WEB-DL x264',
]
const MIRRORS = ['FileDitch','MEGA','Pixeldrain','Send','Buzzheavier','Vikingfile']

const episodeRows = Array.from({ length:6 }, (_, index) => {
  const number = String(index + 1).padStart(2, '0')
  const links = QUALITY_LABELS.map(() =>
    MIRRORS.map(name => '<a href="https://example.invalid/' + name + '">' + name + '</a>').join(' ')
  ).join('<br>')
  return '<tr><td>' + number + '</td><td>' + QUALITY_LABELS.join('<br>') + '</td><td>' + links + '</td></tr>'
}).join('')

const rendered = [
  '<table>',
  '<tr><th>Episode</th><th>Quality</th><th>Download</th></tr>',
  episodeRows,
  '</table>',
].join('')

const parsed = _test.extractEpisodeRows(rendered)
assert.equal(parsed.length, 6, 'episode parser should identify all six episode rows')
assert.deepEqual(parsed.map(row => row.number), ['1','2','3','4','5','6'])
assert.ok(parsed.every(row => row.title.includes('7 quality variants')))
assert.equal(_test.safePageUrl(PAGE_URL), PAGE_URL)
assert.equal(_test.safePageUrl('https://example.com/love-in-disguise/'), '')
assert.equal(_test.pageSlug(PAGE_URL), 'love-in-disguise')

const calls = []
const fakeFetch = async rawUrl => {
  const url = new URL(rawUrl)
  calls.push(url.href)
  if (url.pathname.endsWith('/search')) {
    return {
      ok:true,
      status:200,
      json:async () => [
        { type:'post', subtype:'post', title:'Love in Disguise', url:PAGE_URL },
        { type:'post', subtype:'post', title:'Love in Disguise OST Part.4', url:'https://dramaday.me/ost-part-4/' },
      ],
    }
  }
  if (url.pathname.endsWith('/posts') && url.searchParams.get('slug') === 'love-in-disguise') {
    return {
      ok:true,
      status:200,
      json:async () => [{
        link:PAGE_URL,
        content:{ rendered },
      }],
    }
  }
  throw new Error('Unexpected Dramaday API request: ' + url.href)
}

const searched = await dramaday.run({
  action:'search',
  query:'Love in Disguise',
  context:{ fetch:fakeFetch },
})
assert.equal(searched.items.length, 1, 'OST results should not appear as TV drama search results')
assert.equal(searched.items[0].id, PAGE_URL)
assert.equal(searched.items[0].title, 'Love in Disguise')

const seasons = await dramaday.run({
  action:'seasons',
  item:searched.items[0],
  context:{ fetch:fakeFetch },
})
assert.equal(seasons.seasonNumber, 1)
assert.equal(seasons.episodes.length, 6)
assert.equal(seasons.episodes[0].title, 'Episode 1 · 7 quality variants')
assert.ok(calls.some(url => url.includes('/posts?slug=love-in-disguise')))

const options = await dramaday.run({ action:'options', item:searched.items[0] })
assert.equal(options.catalogueOnly, true)
assert.equal(options.pageUrl, PAGE_URL)

const guardedDownload = await dramaday.run({ action:'download', item:searched.items[0] })
assert.match(guardedDownload.text, /catalogue-only/i)
assert.match(guardedDownload.text, /no download was started/i)
assert.ok(guardedDownload.text.includes(PAGE_URL))

const flowCalls = []
const replies = []
let session = null
const ctx = {
  publicPrefix:'.',
  commandReplyInput:'1',
  executeSource:async ({ payload }) => {
    flowCalls.push(payload.action)
    if (payload.action === 'search') {
      return {
        status:'ok',
        source:{ id:'dramaday', name:'Dramaday (catalogue only)' },
        result:{ items:[{ id:PAGE_URL, title:'Love in Disguise' }] },
      }
    }
    if (payload.action === 'seasons') {
      return {
        status:'ok',
        source:{ id:'dramaday', name:'Dramaday (catalogue only)' },
        result:{ seasonNumber:1, episodes:[{ id:'1', number:'1', title:'Episode 1' }] },
      }
    }
    if (payload.action === 'options') {
      return {
        status:'ok',
        source:{ id:'dramaday', name:'Dramaday (catalogue only)' },
        result:{ catalogueOnly:true, pageUrl:PAGE_URL },
      }
    }
    if (payload.action === 'download' || payload.action === 'downloadRange') {
      throw new Error('Catalogue-only TV flow must not start a download')
    }
    throw new Error('Unexpected TV source action: ' + payload.action)
  },
  getDeliveryDefault:() => null,
  setCommandReplySession:value => { session = value },
  getCommandReplySession:() => session,
  clearCommandReplySession:() => { session = null },
  reply:async value => { replies.push(String(value)); return value },
}

await runTvCommand(ctx, { args:['Love','in','Disguise'] })
assert.equal(session?.kind, 'number-selection')
await runTvCommand(ctx, { args:['~numbers'] })
assert.equal(session, null, 'catalogue-only completion should clear the reply-selection session')
assert.deepEqual(flowCalls, ['search','seasons','options'])
assert.ok(replies.at(-1).includes(PAGE_URL))
assert.match(replies.at(-1), /will not start an automatic download/i)

console.log('PASS Dramaday public API catalogue parser and catalogue-only TV flow')
