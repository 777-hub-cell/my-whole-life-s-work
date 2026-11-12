import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { dispatchNamespacedCommand, loadCommands } from './command-registry.js'
import { runStickerPackLimitCommand } from './sticker-pack-limit-command.js'
import {
  buildStickerPackProbePayload,
  parseStickerPackProbeCount,
  sendStickerPackProbe,
  STICKER_PACK_PROBE_LIMIT,
} from './utils/sticker-pack-probe.js'
import {
  patchStickerPackGuard,
  EXPECTED_BAILEYS_VERSION,
} from './tools/patch-sticker-pack-probe-limit.mjs'

assert.equal(parseStickerPackProbeCount('3'), 3)
assert.equal(parseStickerPackProbeCount('60'), 60)
assert.equal(parseStickerPackProbeCount('120'), 120)
assert.equal(parseStickerPackProbeCount(String(STICKER_PACK_PROBE_LIMIT)), STICKER_PACK_PROBE_LIMIT)
for (const invalid of ['', '2', '201', '80.5', '-5', 'abc', '8 0']) {
  assert.equal(parseStickerPackProbeCount(invalid), null, `invalid probe count accepted: ${invalid}`)
}

const original = `const prepare = () => {\n  if (stickers.length > 60) {\n    throw new Boom('Sticker pack exceeds the maximum limit of 60 stickers', { statusCode: 400 });\n  }\n}`
const patched = patchStickerPackGuard(original)
assert.match(patched, /stickers\.length > 200/)
assert.match(patched, /temporary probe ceiling of 200 stickers/)
assert.equal(patchStickerPackGuard(patched), patched, 'dependency patch must be idempotent')
assert.throws(() => patchStickerPackGuard('different upstream implementation'), /Unexpected/)

const payload = buildStickerPackProbePayload(65)
assert.equal(payload.stickers.length, 65)
assert.equal(payload.cover, payload.stickers[0].data)
assert.equal(payload.name, 'NIGHT Pack Test 65')
assert(payload.stickers.every(item => Buffer.isBuffer(item.data)))
assert(payload.stickers.every(item => item.data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))))
assert.equal(new Set(payload.stickers.map(item => item.data.toString('base64'))).size, 65, 'probe stickers must be unique')

let sendCalls = 0
let sentChat = ''
let sentPayload
let sentOptions
const result = await sendStickerPackProbe({
  sock:{
    async sendMessage(chat, message, options) {
      sendCalls += 1
      sentChat = chat
      sentPayload = message
      sentOptions = options
    },
  },
  chat:'15550000000@s.whatsapp.net',
  count:65,
  quoted:{ key:{ id:'quoted-message' } },
})
assert.equal(sendCalls, 1, 'one probe must make exactly one send attempt')
assert.equal(sentChat, '15550000000@s.whatsapp.net')
assert.equal(sentPayload.stickers.length, 65, 'probe must not split the candidate into multiple packs')
assert.equal(sentOptions.quoted.key.id, 'quoted-message')
assert.equal(result.count, 65)

const require = createRequire(import.meta.url)
const baileysEntry = require.resolve('@itsliaaa/baileys')
const baileysRoot = dirname(dirname(baileysEntry))
const pkg = JSON.parse(await readFile(join(baileysRoot, 'package.json'), 'utf8'))
assert.equal(pkg.version, EXPECTED_BAILEYS_VERSION)
const messagesSource = await readFile(join(baileysRoot, 'lib', 'Utils', 'messages.js'), 'utf8')
assert.match(messagesSource, /if \(stickers\.length > 200\)/, 'installed Baileys guard must be patched before live probing')

const registry = await loadCommands(new URL('./commands/', import.meta.url), {
  allowMissing:true,
  capabilityFromDirectory:true,
})
const command = registry.commands.get('pslimit')
assert.ok(command, '.pslimit must be registered')
assert.equal(command.name, 'pslimit')
assert.equal(command.ownerOnly, true, '.pslimit must be owner-only')
assert.equal(command.capability, 'media')
assert.equal(typeof command.run, 'function')

const privateRegistry = await loadCommands(new URL('./private-commands/', import.meta.url), {
  allowMissing:true,
})
const privateCommand = privateRegistry.commands.get('pslimit')
assert.ok(privateCommand, 'The Account A private owner console must register .pslimit')

let privateDispatchSendCount = 0
let privateDispatchPayload
const privateDispatchReplies = []
await dispatchNamespacedCommand({
  privateRegistry,
  publicRegistry:registry,
  rawText:'.pslimit 5',
  context:{
    publicPrefix:'.',
    publicCommandsEnabled:true,
    privateControl:true,
    isSupremeOwner:true,
    message:{ key:{ remoteJid:'15550000000@s.whatsapp.net', id:'private-probe' } },
    account:{ sock:{ sendMessage:async (_chat,payload) => {
      privateDispatchSendCount += 1
      privateDispatchPayload = payload
    } } },
    reply:async message => privateDispatchReplies.push(String(message)),
  },
})
assert.equal(privateDispatchSendCount,1, 'The Account A private route must send one native pack')
assert.equal(privateDispatchPayload.stickers.length,5)
assert(privateDispatchReplies.some(message => /Accepted: 5 stickers.*ONE pack/i.test(message)))

const deniedReplies = []
await dispatchNamespacedCommand({
  privateRegistry:{ commands:new Map(), canonical:[] },
  publicRegistry:registry,
  rawText:'.pslimit 80',
  context:{
    publicPrefix:'.',
    publicCommandsEnabled:true,
    privateControl:false,
    isPublicOwner:false,
    isSessionOwner:false,
    isSupremeOwner:false,
    message:{ key:{ remoteJid:'15550000000@s.whatsapp.net' } },
    reply:async message => deniedReplies.push(String(message)),
  },
})
assert(deniedReplies.some(message => /could not verify this sender as an authorized NIGHT owner/i.test(message)),
  'An owner-only probe denial must explain why it was ignored instead of failing silently')

let syntheticSendCount = 0
const syntheticReplies = []
const synthetic = await runStickerPackLimitCommand({
  args:['65'],
  publicPrefix:'.',
  privateControl:true,
  message:{ key:{ remoteJid:'15550000000@s.whatsapp.net' } },
  account:{ sock:{ sendMessage:async () => { syntheticSendCount += 1 } } },
  reply:async message => syntheticReplies.push(String(message)),
}, {
  sendStickerPackProbe:async input => ({ count:input.count, name:'NIGHT Pack Test' }),
})
assert.equal(synthetic.ok,true)
assert.equal(syntheticSendCount,0, 'Injected sender should be the only send path in this unit test')
assert(syntheticReplies.some(message => /Accepted: 65 stickers.*ONE pack/i.test(message)))

let querySendCount = 0
let queryPack
const queryReplies = []
const queryResult = await runStickerPackLimitCommand({
  args:['cat','4'],
  publicPrefix:'.',
  privateControl:true,
  message:{ key:{ remoteJid:'15550000000@s.whatsapp.net' } },
  account:{ sock:{ sendMessage:async () => {} } },
  reply:async message => queryReplies.push(String(message)),
}, {
  searchPinterestImages:async (query, options) => {
    assert.equal(query,'cat')
    assert.equal(options.limit,4)
    return Array.from({length:4},(_,i)=>({imageUrl:'https://images.example/' + i}))
  },
  downloadImageUrl:async url => ({ buffer:Buffer.from(url), contentType:'image/png' }),
  mediaToSticker:async buffer => Buffer.from('sticker:' + buffer.toString()),
  sendStickerPackProbe:async input => {
    querySendCount += 1
    queryPack = input
    return { count:input.count, name:input.packName }
  },
})
assert.equal(queryResult.ok,true)
assert.equal(querySendCount,1)
assert.equal(queryPack.count,4)
assert.equal(queryPack.stickers.length,4)
assert.match(queryPack.packName,/cat/i)
assert(queryReplies.some(message => /Accepted: 4 stickers.*ONE pack/i.test(message)))

const unauthorizedReplies = []
const unauthorized = await runStickerPackLimitCommand({
  args:['80'],
  publicPrefix:'.',
  privateControl:false,
  isPublicOwner:false,
  isSessionOwner:false,
  isSupremeOwner:false,
  message:{ key:{ remoteJid:'15550000000@s.whatsapp.net' } },
  account:{ sock:{ sendMessage:async () => { throw new Error('must not send') } } },
  reply:async message => unauthorizedReplies.push(String(message)),
})
assert.equal(unauthorized.reason,'owner-verification-failed')
assert(unauthorizedReplies.some(message => /could not verify/i.test(message)))

const groupReplies = []
let groupSendCount = 0
await command.run({
  args:['65'],
  publicPrefix:'.',
  message:{ key:{ remoteJid:'120363000000000000@g.us' } },
  account:{ sock:{ sendMessage:async () => { groupSendCount += 1 } } },
  reply:async message => groupReplies.push(String(message)),
})
assert.equal(groupSendCount, 0, '.pslimit must never send into a group')
assert(groupReplies.some(message => /private one-to-one chat/i.test(message)))

console.log('PASS .pslimit owner-only registration, direct-chat restriction, single-pack payload, 200-item probe patch, and count validation')
