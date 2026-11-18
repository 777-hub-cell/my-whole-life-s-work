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

test('public ownerOnly commands check only the Public Owner identity', async () => {
  let calls = 0
  const registry = {
    scope: 'public',
    commands: new Map([['danger', { name: 'danger', ownerOnly: true, run: async () => { calls += 1 } }]]),
    canonical: [],
  }
  const denied = await dispatchCommand({
    registry, rawText: '!danger',
    context: { sessionId: 'public', isPublicOwner: false },
  })
  assert.equal(denied, false)
  assert.equal(calls, 0)
  const allowed = await dispatchCommand({
    registry, rawText: '!danger',
    context: { sessionId: 'public', isPublicOwner: true },
  })
  assert.equal(allowed, true)
  assert.equal(calls, 1)
})

test('private commands never run in a public session or without verified private control', async () => {
  let calls = 0
  const registry = {
    scope: 'private',
    commands: new Map([['secret', { name: 'secret', run: async () => { calls += 1 } }]]),
    canonical: [],
  }
  assert.equal(await dispatchCommand({ registry, rawText: '!secret', context: { sessionId: 'public', privateControl: true } }), false)
  assert.equal(await dispatchCommand({ registry, rawText: '!secret', context: { sessionId: 'private', privateControl: false } }), false)
  assert.equal(calls, 0)
  assert.equal(await dispatchCommand({ registry, rawText: '!secret', context: { sessionId: 'private', privateControl: true } }), true)
  assert.equal(calls, 1)
})

test('command parser preserves argument text and rejects malformed names', () => {
  assert.deepEqual(parseCommand('!play  First  Choice'), {
    name: 'play', args: ['First', 'Choice'], rawArgs: 'First  Choice',
  })
  assert.equal(parseCommand('hello'), null)
  assert.equal(parseCommand('!'), null)
  assert.equal(parseCommand('!bad/name'), null)
})
