import test from 'node:test'
import assert from 'node:assert/strict'
import { createWhatsAppDiscovery } from '../src/whatsapp-discovery.js'

test('received statuses are account-specific, expire and do not become bot commands', () => {
  const clock = 1_800_000_000_000
  const store = createWhatsAppDiscovery({ now: () => clock })
  const message = {
    key: { remoteJid: 'status@broadcast', participant: '2348012345678@s.whatsapp.net', id: 'status-1' },
    messageTimestamp: Math.floor((clock - 5000) / 1000),
    message: { imageMessage: { caption: 'Genuine status' } },
  }
  assert.equal(store.recordStatus('private', message), true)
  assert.equal(store.listStatuses('private').length, 1)
  assert.equal(store.listStatuses('public').length, 0)
  assert.equal(store.listStatuses('private')[0].mediaKind, 'image')
  assert.equal(store.recordStatus('public', { ...message, key: { ...message.key, remoteJid: '2349999999999@s.whatsapp.net' } }), false)
  assert.equal(store.recordStatus('private', {
    ...message, messageTimestamp: Math.floor((clock - 90_000_000) / 1000),
  }), false)
})

test('channels are loaded exclusively from the authenticated session', async () => {
  const store = createWhatsAppDiscovery()
  const calls = []
  const socket = {
    newsletterSubscribed: async () => [{ id: '12345678901@newsletter', name: 'Official' }],
    newsletterFetchMessages: async (...args) => {
      calls.push(args)
      return [{ serverId: 12, messageTimestamp: 1800000000, message: { conversation: 'Update from the channel' } }]
    },
  }
  const listed = await store.listChannels('public', socket)
  assert.equal(listed.supported, true)
  assert.equal(listed.channels[0].name, 'Official')
  const result = await store.channelUpdates('public', socket, '12345678901@newsletter')
  assert.equal(result.updates[0].text, 'Update from the channel')
  assert.deepEqual(calls[0], ['jid', '12345678901@newsletter', 20, 0, 0])
  await assert.rejects(store.channelUpdates('public', socket, '12399999999@newsletter'), /not subscribed/)
  await assert.rejects(store.channelUpdates('public', socket, 'http://localhost'), /Invalid Channel/)
  assert.equal((await store.listChannels('private', {})).supported, false)
})
