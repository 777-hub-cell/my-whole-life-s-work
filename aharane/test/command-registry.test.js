import test from 'node:test'
import assert from 'node:assert/strict'
import { loadCommandRegistry, dispatchCommand, parseCommand } from '../src/command-registry.js'

test('public and private command registries are separate namespaces', async () => {
  const publicRegistry = await loadCommandRegistry(new URL('../commands/', import.meta.url), { scope: 'public' })
  const privateRegistry = await loadCommandRegistry(new URL('../private-commands/', import.meta.url), { scope: 'private' })
  assert.deepEqual([...publicRegistry.commands.keys()].sort(), ['help', 'ping'])
  assert.equal(privateRegistry.commands.size, 0)
  assert.equal(publicRegistry.scope, 'public')
  assert.equal(privateRegistry.scope, 'private')
})

const owners = { privateOwnerNumber: '2348012345678', publicOwnerNumber: '2348055555555' }
const ownerJid = '2348012345678@s.whatsapp.net'
const publicOwnerJid = '2348055555555@s.whatsapp.net'
const strangerJid = '2348077777777@s.whatsapp.net'
const groupJid = '120363000000000001@g.us'
const msg = (remoteJid, fromMe = false, extra = {}) => ({ key: { id: 'm1', remoteJid, fromMe, ...extra }, message: { conversation: 'x' } })
const publicAuth = (jid, over = {}) => ({
  source: 'direct', sessionId: 'public', ownerConfig: owners, message: msg(jid), remoteJid: jid, senderJid: jid, ...over,
})
const privateAuth = (over = {}) => ({
  source: 'direct', sessionId: 'private', ownerConfig: owners, message: msg(ownerJid, true), remoteJid: ownerJid,
  senderJid: ownerJid, ownJid: ownerJid, ...over,
})
const registryOf = (scope, name, command = {}) => {
  const calls = []
  return {
    calls,
    registry: { scope, commands: new Map([[name, { name, run: async ctx => { calls.push(ctx) }, ...command }]]), canonical: [] },
  }
}

test('public ownerOnly commands check only the verified Public Owner identity', async () => {
  const { registry, calls } = registryOf('public', 'danger', { ownerOnly: true })
  assert.equal(await dispatchCommand({ registry, rawText: '!danger', auth: publicAuth(strangerJid) }), false)
  assert.equal(calls.length, 0)
  assert.equal(await dispatchCommand({ registry, rawText: '!danger', auth: publicAuth(publicOwnerJid) }), true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].isPublicOwner, true)
  // The Private Owner never inherits Public Owner privilege.
  assert.equal(await dispatchCommand({ registry, rawText: '!danger', auth: publicAuth(ownerJid) }), false)
})

test('ordinary public commands work for any direct sender but not groups, self or other sessions', async () => {
  const { registry, calls } = registryOf('public', 'ping')
  assert.equal(await dispatchCommand({ registry, rawText: '!ping', auth: publicAuth(strangerJid) }), true)
  assert.equal(calls[0].isPublicOwner, false)
  assert.equal(await dispatchCommand({ registry, rawText: '!ping', auth: publicAuth(groupJid, { senderJid: strangerJid }) }), false)
  assert.equal(await dispatchCommand({ registry, rawText: '!ping', auth: publicAuth(strangerJid, { message: msg(strangerJid, true) }) }), false)
  assert.equal(await dispatchCommand({ registry, rawText: '!ping', auth: publicAuth(strangerJid, { sessionId: 'private' }) }), false)
  assert.equal(await dispatchCommand({ registry, rawText: '!ping', auth: publicAuth('status@broadcast') }), false)
  assert.equal(calls.length, 1)
})

test('private commands run only for verified Private Owner self-chat control', async () => {
  const { registry, calls } = registryOf('private', 'secret')
  const run = auth => dispatchCommand({ registry, rawText: '!secret', auth })
  assert.equal(await run(privateAuth({ sessionId: 'public' })), false)
  assert.equal(await run(privateAuth({ message: msg(ownerJid, false) })), false)
  assert.equal(await run(privateAuth({ remoteJid: strangerJid, message: msg(strangerJid, true) })), false)
  assert.equal(await run(privateAuth({ remoteJid: groupJid, message: msg(groupJid, true) })), false)
  assert.equal(await run(privateAuth({ ownerConfig: { ...owners, privateOwnerNumber: '' } })), false)
  assert.equal(await run(privateAuth({ ownJid: strangerJid })), false)
  assert.equal(calls.length, 0)
  assert.equal(await run(privateAuth()), true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].privateControl, true)
})

test('a public registry can never be dispatched for the private session or vice versa', async () => {
  const pub = registryOf('public', 'ping')
  const prv = registryOf('private', 'secret')
  assert.equal(await dispatchCommand({ registry: pub.registry, rawText: '!ping', auth: privateAuth() }), false)
  assert.equal(await dispatchCommand({ registry: prv.registry, rawText: '!secret', auth: publicAuth(publicOwnerJid) }), false)
})

test('dispatch ignores spoofed privilege flags and denies without verified auth', async () => {
  const { registry, calls } = registryOf('private', 'secret')
  const spoof = { sessionId: 'private', privateControl: true, isPrivateOwner: true, isPublicOwner: true }
  assert.equal(await dispatchCommand({ registry, rawText: '!secret', context: spoof }), false)
  assert.equal(await dispatchCommand({ registry, rawText: '!secret', context: spoof, auth: {} }), false)
  assert.equal(await dispatchCommand({ registry, rawText: '!secret', context: spoof, auth: privateAuth({ source: 'api' }) }), false)
  assert.equal(await dispatchCommand({ registry, rawText: '!secret', context: spoof, auth: privateAuth({ source: undefined }) }), false)
  assert.equal(calls.length, 0)
  // Even when allowed, caller-supplied flags are overwritten by evaluator output.
  const pub = registryOf('public', 'ping')
  await dispatchCommand({ registry: pub.registry, rawText: '!ping', auth: publicAuth(strangerJid), context: { isPublicOwner: true, privateControl: true } })
  assert.equal(pub.calls[0].isPublicOwner, false)
  assert.equal(pub.calls[0].privateControl, false)
})

test('denied dispatch reports only a safe reason code through the audit hook', async () => {
  const { registry } = registryOf('private', 'secret')
  const seen = []
  await dispatchCommand({
    registry, rawText: '!secret sensitive text', auth: privateAuth({ message: msg(ownerJid, false) }),
    onDenied: (d, meta) => seen.push({ d, meta }),
  })
  assert.equal(seen.length, 1)
  assert.deepEqual(Object.keys(seen[0].d).sort(), ['allow', 'policyVersion', 'reason'])
  assert.equal(seen[0].d.reason, 'not-from-owner-session')
  assert.ok(!JSON.stringify(seen).includes('sensitive'))
})

test('command parser preserves argument text and rejects malformed names', () => {
  assert.deepEqual(parseCommand('!play  First  Choice'), {
    name: 'play', args: ['First', 'Choice'], rawArgs: 'First  Choice',
  })
  assert.equal(parseCommand('hello'), null)
  assert.equal(parseCommand('!'), null)
  assert.equal(parseCommand('!bad/name'), null)
})
