import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import {
  inspectWhatsAppCapabilities,
  normalizeConnectionUpdate,
  normalizeReceiptStatus,
  WHATSAPP_LIBRARY,
  WHATSAPP_TRANSPORT_CONTRACT_VERSION,
} from '../src/whatsapp-contract.js'

test('connection updates are normalized without leaking QR material', () => {
  const normalized = normalizeConnectionUpdate({ connection: 'open', qr: 'secret-qr-payload' })
  assert.deepEqual(normalized, {
    contractVersion: WHATSAPP_TRANSPORT_CONTRACT_VERSION,
    state: 'connected',
    qrAvailable: true,
  })
  assert.equal(JSON.stringify(normalized).includes('secret-qr-payload'), false)
  assert.equal(normalizeConnectionUpdate({ connection: 'connecting' }).state, 'connecting')
  assert.equal(normalizeConnectionUpdate({ connection: 'close' }).state, 'disconnected')
  assert.equal(normalizeConnectionUpdate({ connection: 'unexpected' }).state, 'unknown')
})

test('Baileys receipt values map to normalized transport labels', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(normalizeReceiptStatus), [
    'failed', 'pending', 'sent', 'delivered', 'read', 'read',
  ])
  assert.equal(normalizeReceiptStatus('READ'), 'read')
  assert.equal(normalizeReceiptStatus('unrecognised'), null)
  assert.equal(normalizeReceiptStatus(Number.NaN), null)
})

test('capability report reflects methods on the selected authenticated socket only', () => {
  const socket = {
    ev: new EventEmitter(),
    sendMessage() {},
    groupMetadata() {},
    groupParticipantsUpdate() {},
    newsletterSubscribed() {},
  }
  const capabilities = inspectWhatsAppCapabilities(socket, { mediaDownloadAvailable: true })
  assert.equal(capabilities.contractVersion, 1)
  assert.equal(capabilities.messages.send, true)
  assert.equal(capabilities.receipts.updateEvents, true)
  assert.equal(capabilities.media.download, true)
  assert.equal(capabilities.groups.readMetadata, true)
  assert.equal(capabilities.groups.updateParticipants, true)
  assert.equal(capabilities.channels.listSubscribed, true)
  assert.equal(capabilities.channels.readUpdates, false)
  assert.equal(capabilities.status.supported, false)
  assert.equal(inspectWhatsAppCapabilities(null).messages.send, false)
})

test('the adapter identity matches the pinned package', () => {
  assert.deepEqual(WHATSAPP_LIBRARY, { packageName: '@itsliaaa/baileys', version: '0.5.6' })
})
