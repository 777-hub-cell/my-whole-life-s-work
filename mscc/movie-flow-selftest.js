import { runMovieCommand } from './movie-flow.js'

const calls = []
const lists = []
const interactive = []
const replies = []
let saved = null
let holdNextDownload = false
let releaseHeldDownload = null
let signalHeldDownloadStarted = () => {}
let heldDownloadStarted = Promise.resolve()
const progressRuns = []

async function makeProgress(initial) {
  let finish
  const finished = new Promise(resolve => { finish = resolve })
  const run = { initial:String(initial), updates:[], finished }
  progressRuns.push(run)
  const update = async value => { run.updates.push(String(value)); finish(); return value }
  return { done:update, fail:update }
}

const ctx = {
  publicPrefix:'.',
  listSources:() => [{ id:'alpha', name:'Alpha Movies' }],
  getDeliveryDefault:() => saved,
  reply:async value => { replies.push(String(value)); return value },
  replyList:async value => { lists.push(value); return value },
  replyInteractive:async value => { interactive.push(value); return value },
  progress:makeProgress,
  resolveTmdbTitles:async query => ({
    query,
    aliases:[query, 'The Matrix'],
    matches:[{ id:603, title:'The Matrix', year:1999 }],
    source:'tmdb',
  }),
  resolveTmdbMedia:async id => ({
    id:Number(id),
    type:'movie',
    title:'The Matrix',
    aliases:['The Matrix','Matrix'],
    year:1999,
  }),
  executeSource:async ({ explicitSource, payload }) => {
    calls.push({ explicitSource, payload })
    if (payload.action === 'search') {
      if (payload.query === 'matrixx') {
        return { status:'ok', source:{ id:'alpha', name:'Alpha Movies' }, result:{ items:[] } }
      }
      return {
        status:'ok',
        source:{ id:'alpha', name:'Alpha Movies' },
        result:{ items:[
          { id:'matrix', title:'The Matrix', year:1999 },
          { id:'matrix-reloaded', title:'The Matrix Reloaded', year:2003 },
        ] },
      }
    }
    if (payload.action === 'options') {
      return {
        status:'ok',
        source:{ id:'alpha', name:'Alpha Movies' },
        result:{ qualities:['1080','720'], deliveries:['document','video'] },
      }
    }
    if (payload.action === 'download') {
      if (holdNextDownload) {
        holdNextDownload = false
        return new Promise(resolve => {
          releaseHeldDownload = () => resolve({
            status:'ok',
            source:{ id:'alpha', name:'Alpha Movies' },
            result:{ delivered:true },
          })
          signalHeldDownloadStarted()
        })
      }
      return {
        status:'ok',
        source:{ id:'alpha', name:'Alpha Movies' },
        result:{ text:'OK:movie:' + payload.quality + ':' + payload.delivery },
      }
    }
    throw new Error('Unexpected movie action ' + payload.action)
  },
}

await runMovieCommand(ctx, { args:['matrixx'] })
const searches = calls.filter(call => call.payload.action === 'search').map(call => call.payload.query)
if (searches.join('|') !== 'matrixx|The Matrix') {
  throw new Error('Movie TMDB alias retry failed: ' + searches.join('|'))
}
const resultList = lists.at(-1)
const movieRow = resultList?.rows?.find(row => row.id.includes('~title'))
if (!movieRow) throw new Error('Movie search results did not expose a selectable title')

await runMovieCommand(ctx, { args:movieRow.id.split(/\\s+/).slice(1) })
const optionList = lists.at(-1)
if (optionList?.buttonText !== 'Choose quality') {
  throw new Error('Movie selection did not open the dedicated quality menu')
}
if (interactive.length) {
  throw new Error('Movie quality menu must not mix quick-reply and single-select controls')
}
const optionRows = optionList?.sections?.flatMap(section => section.rows) || []
const option = optionRows.find(row => row.id.includes('~download') && /1080p.*Document/.test(row.title))
if (!option) throw new Error('Movie quality and delivery choices missing')
if (!optionRows.some(row => row.title === 'Add to Library')) {
  throw new Error('Movie quick actions were not preserved in the selection menu')
}

replies.length = 0
await runMovieCommand(ctx, { args:option.id.split(/\s+/).slice(1) })
const firstDelivery = progressRuns.at(-1)
await firstDelivery.finished
if (!firstDelivery.updates.some(value => value.includes('OK:movie:1080:document'))) {
  throw new Error('Movie download option did not reach source download')
}
if (!firstDelivery.initial.includes('download queued')) {
  throw new Error('Movie download was not acknowledged before source delivery')
}

// A stalled provider must not hold the chat command queue open.
holdNextDownload = true
let resolveStarted
heldDownloadStarted = new Promise(resolve => { resolveStarted = resolve })
signalHeldDownloadStarted = resolveStarted
const returnedQuickly = await Promise.race([
  runMovieCommand(ctx, { args:option.id.split(/\s+/).slice(1) }).then(() => true),
  new Promise(resolve => setTimeout(() => resolve(false), 500)),
])
if (!returnedQuickly) throw new Error('Movie command waited for the entire media download')
await heldDownloadStarted
const heldProgress = progressRuns.at(-1)
if (heldProgress.updates.length) throw new Error('Held download unexpectedly completed before its gate was released')
if (typeof releaseHeldDownload !== 'function') throw new Error('Held download test could not reach the source')
releaseHeldDownload()
await heldProgress.finished
if (!heldProgress.updates.some(value => value.includes('was sent'))) {
  throw new Error('Held movie download did not report completion')
}

saved = { quality:'720', delivery:'video' }
calls.length = 0
replies.length = 0
await runMovieCommand(ctx, { args:['The','Matrix'] })
const savedDelivery = progressRuns.at(-1)
await savedDelivery.finished
if (!calls.some(call => call.payload.action === 'download' && call.payload.quality === '720' && call.payload.delivery === 'video')) {
  throw new Error('Saved movie delivery default was not applied')
}

lists.length = 0
saved = null
await runMovieCommand(ctx, { args:['~tmdb','603'] })
if (!lists.at(-1)?.sections?.length) throw new Error('TMDB movie handoff did not enter download options')

console.log('PASS movie search/identity/download flow')
