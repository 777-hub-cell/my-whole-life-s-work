import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { loadCommands } from './command-registry.js'
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
  assert.equal(parseStickerPackProbeCount(invalid), null, \`invalid probe count accepted: \${invalid}\`)
}

const original = \`const prepare = () => {\\n  if (stickers.length > 60) {\\n    throw new Boom('Sticker pack exceeds the maximum limit of 60 stickers', { statusCode: 400 });\\n  }\\n}\`
const patched = patchStickerPackGuard(original)
assert.match(patched, /stickers\\.length > 200/)
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
assert.match(messagesSource, /if \\(stickers\\.length > 200\\)/, 'installed Baileys guard must be patched before live probing')

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
