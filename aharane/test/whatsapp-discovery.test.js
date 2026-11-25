import test from 'node:test'
import assert from 'node:assert/strict'
import { createWhatsAppDiscovery } from '../src/whatsapp-discovery.js'

test('Status has no discovery or storage API; Channel reads remain available', () => {
  const store = createWhatsAppDiscovery()
  assert.deepEqual(Object.keys(store).sort(), ['channelUpdates', 'listChannels'])
  assert.equal('recordStatus' in store, false)
  assert.equal('listStatuses' in store, false)
  assert.equal('getStatusMedia' in store, false)
})

test('channels are loaded exclusively from the authenticated session', async () => {
  const store = createWhatsAppDiscovery()
  const calls = []
  const socket = {
    newsletterSubscribed: async () => [
      { id: '12345678901@newsletter', name: 'Official' },
      { id: 'not-a-channel', name: 'Invalid entry' },
    ],
    newsletterFetchMessages: async (...args) => {
      calls.push(args)
      return [{ serverId: 12, messageTimestamp: 1800000000, message: { conversation: 'Update from the channel' } }]
    },
  }
  const listed = await store.listChannels('public', socket)
  assert.equal(listed.supported, true)
  assert.equal(listed.accountId, 'public')
  assert.equal(listed.channels.length, 1)
  assert.equal(listed.channels[0].name, 'Official')
  const result = await store.channelUpdates('public', socket, '12345678901@newsletter')
  assert.equal(result.updates[0].text, 'Update from the channel')
  assert.deepEqual(calls[0], ['jid', '12345678901@newsletter', 20, 0, 0])
  await assert.rejects(store.channelUpdates('public', socket, '12399999999@newsletter'), /not subscribed/)
  await assert.rejects(store.channelUpdates('public', socket, 'http://localhost'), /Invalid Channel/)
  await assert.rejects(store.listChannels('unknown', socket), /Unknown WhatsApp session/)
  assert.equal((await store.listChannels('private', {})).supported, false)
  assert.equal((await store.channelUpdates('private', {}, '12345678901@newsletter')).supported, false)
})
