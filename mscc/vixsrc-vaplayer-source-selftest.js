import assert from 'node:assert/strict'
import vixMovie from './sources/movies/vixsrc.js'
import vaMovie from './sources/movies/vaplayer.js'
import vixTv from './sources/tv/vixsrc.js'
import vaTv from './sources/tv/vaplayer.js'
import { _test as vixTest } from './providers/vixsrc.js'
import { _test as vaTest } from './providers/vaplayer.js'
import { _test as copyTest } from './providers/stream-copy.js'

const context = {
  async resolveTmdbTitles(query, type) {
    if (type === 'movie') {
      return {
        matches:[{
          id:10331,
          title:'Night of the Living Dead',
          originalTitle:'Night of the Living Dead',
          year:1968,
        }],
      }
    }
    return {
      matches:[{
        id:1930,
        title:'The Beverly Hillbillies',
        originalTitle:'The Beverly Hillbillies',
        year:1962,
      }],
    }
  },
  async browseTmdbMedia(type) {
    return type === 'movie'
      ? { matches:[{ id:10378, title:'Big Buck Bunny', year:2008 }] }
      : { matches:[{ id:1930, title:'The Beverly Hillbillies', year:1962 }] }
  },
  async resolveTmdbMedia(id, type) {
    if (type === 'movie') {
      return { id, title:'Night of the Living Dead', imdbId:'tt0063350' }
    }
    return {
      id,
      title:'The Beverly Hillbillies',
      imdbId:'tt0055662',
      seasons:[
        { id:1001, number:1, name:'Season 1', episodeCount:36 },
        { id:1002, number:2, name:'Season 2', episodeCount:36 },
      ],
    }
  },
  async resolveTmdbSeason(id, seasonNumber) {
    return {
      seriesId:id,
      seasonNumber,
      episodes:[
        { id:5001, number:'1', seasonNumber, title:'The Clampetts Strike Oil' },
        { id:5002, number:'2', seasonNumber, title:'Getting Settled' },
      ],
    }
  },
}

for (const source of [vixMovie, vaMovie, vixTv, vaTv]) {
  assert.equal(typeof source.run, 'function')
  assert(source.id === 'vixsrc' || source.id === 'vaplayer')
}

let result = await vixMovie.run({ action:'search', query:'Night', context })
assert.equal(result.items[0].tmdbId, 10331)
assert.equal(result.items[0].id, 'tmdb:10331')

result = await vaMovie.run({ action:'browse', context })
assert.equal(result.items[0].title, 'Big Buck Bunny')

result = await vixTv.run({ action:'seasons', item:{ id:'tmdb:1930', tmdbId:1930, title:'The Beverly Hillbillies' }, context })
assert.equal(result.seasons.length, 2)
assert.equal(result.seasons[0].number, 1)

result = await vaTv.run({
  action:'episodes',
  item:{ id:'tmdb:1930', tmdbId:1930, title:'The Beverly Hillbillies' },
  seasonNumber:1,
  context,
})
assert.equal(result.episodes.length, 2)
assert.equal(result.episodes[0].number, '1')

assert.equal(vaTest.normalizeImdb('TT0063350'), 'tt0063350')
assert.equal(vaTest.normalizeImdb('bad'), '')
assert.equal(vixTest.field('token:"abc"; expires:"123"; url:"https:\\/\\/cdn.example\\/master.m3u8"', 'token'), 'abc')
assert.equal(vixTest.field('token:"abc"; expires:"123"; url:"https:\\/\\/cdn.example\\/master.m3u8"', 'url'), 'https://cdn.example/master.m3u8')
const vixHeaders = vixTest.streamHeaders('https://vixsrc.to/embed/170060?token=sample')
assert.equal(vixHeaders.Referer, 'https://vixsrc.to/embed/170060?token=sample')
assert.equal(vixHeaders.Origin, 'https://vixsrc.to')
assert.match(vixHeaders['User-Agent'], /Android/)

const choice = copyTest.chooseCandidate([
  { maxHeight:1080, programs:[{ id:1, height:1080, bandwidth:4000 }, { id:2, height:720, bandwidth:2200 }] },
  { maxHeight:720, programs:[{ id:3, height:720, bandwidth:1800 }] },
], '720')
assert.equal(choice.program.height, 720)

console.log('PASS VixSrc/VaPlayer movie+TV source fixtures')
