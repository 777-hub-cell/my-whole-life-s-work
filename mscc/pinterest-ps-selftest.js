import assert from 'node:assert/strict'
import {
  PINTEREST_SEARCH_MAX,
  parsePinterestSearchArgs,
  pinterestPackName,
} from './utils/pinterest-search.js'
import {
  extractUrlsFromText,
  parsePsFile,
  parsePsRangeArgs,
  psPackNameFromFile,
} from './utils/ps-source.js'
import {
  NATIVE_STICKER_PACK_MAX,
  splitStickerPackBuffers,
} from './utils/sticker-pack.js'
import { loadCommands } from './command-registry.js'

assert.equal(PINTEREST_SEARCH_MAX, 150)
assert.equal(NATIVE_STICKER_PACK_MAX, 60)

assert.deepEqual(
  parsePinterestSearchArgs(['SpongeBob', 'SquarePants', 'funny', 'reaction', '80']),
  { query:'SpongeBob SquarePants funny reaction', count:80 },
)
assert.deepEqual(
  parsePinterestSearchArgs(['cat']),
  { query:'cat', count:30 },
)
assert.deepEqual(
  parsePinterestSearchArgs(['anime', '999']),
  { query:'anime', count:150 },
)
assert.equal(pinterestPackName('SpongeBob SquarePants funny reaction'), 'SpongeBob')

const buffers = count => Array.from({ length:count }, (_, index) => Buffer.from([index % 251]))
assert.deepEqual(splitStickerPackBuffers(buffers(50)).map(chunk => chunk.length), [50])
assert.deepEqual(splitStickerPackBuffers(buffers(60)).map(chunk => chunk.length), [60])
assert.deepEqual(splitStickerPackBuffers(buffers(61)).map(chunk => chunk.length), [31,30])
assert.deepEqual(splitStickerPackBuffers(buffers(120)).map(chunk => chunk.length), [60,60])
assert.deepEqual(splitStickerPackBuffers(buffers(121)).map(chunk => chunk.length), [41,40,40])
assert.equal(splitStickerPackBuffers(buffers(2)).length, 0)
assert.ok(splitStickerPackBuffers(buffers(150)).every(chunk => chunk.length <= 60))

assert.equal(psPackNameFromFile('Teletubis.txt'), 'Teletubis')
assert.deepEqual(parsePsRangeArgs(['1-50'], 200), {
  start:0,
  end:49,
  customPackName:'',
})
assert.deepEqual(parsePsRangeArgs(['My', 'Pack', '51-100'], 200), {
  start:50,
  end:99,
  customPackName:'My Pack',
})

const urls = extractUrlsFromText('one https://example.com/a.jpg, two https://example.com/b.png')
assert.deepEqual(urls, ['https://example.com/a.jpg', 'https://example.com/b.png'])
const txt = parsePsFile(Buffer.from('https://example.com/a.jpg\nhttps://example.com/b.png'), 'links.txt')
assert.equal(txt.urls.length, 2)
assert.equal(txt.images.length, 0)

const registry = await loadCommands(new URL('./commands/', import.meta.url), {
  capabilityFromDirectory:true,
})
const ps = registry.commands.get('ps')
const pin = registry.commands.get('pin')
assert.ok(ps, 'Missing .ps command')
assert.ok(pin, 'Missing .pin command')
assert.equal(ps.capability, 'media')
assert.equal(pin.capability, 'search')
assert.equal(ps.adminOnly === true, false)
assert.equal(ps.ownerOnly === true, false)
assert.equal(pin.adminOnly === true, false)
assert.equal(pin.ownerOnly === true, false)

console.log('Pinterest + PS self-test passed')
