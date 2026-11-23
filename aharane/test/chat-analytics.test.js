import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createChatStore } from '../src/chat-store.js'

test('monthly chart counts ordinary inbound and outbound chats and avoids duplicate events', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'aharane-analytics-'))
  try {
    const store = createChatStore({ dataDir })
    const jid = '2348012345678@s.whatsapp.net'
    const timestamp = Math.floor(Date.now() / 1000) - 10
    const incoming = {
      key: { id: 'incoming-month', remoteJid: jid, fromMe: false },
      messageTimestamp: timestamp, message: { conversation: 'ordinary message' },
    }
    const outgoing = {
      key: { id: 'outgoing-month', remoteJid: jid, fromMe: true },
      messageTimestamp: timestamp, message: { conversation: 'ordinary reply' },
    }
    await store.recordMessage({ sessionId: 'public', message: incoming })
    await store.recordMessage({ sessionId: 'public', message: incoming })
    await store.recordMessage({ sessionId: 'public', message: outgoing })
    const stats = (await store.metrics()).thisMonth
    assert.equal(stats.timeZone, 'UTC')
    assert.equal(stats.sent, 1)
    assert.equal(stats.received, 1)
    assert.equal(stats.dailySent.reduce((a, b) => a + b, 0), 1)
    assert.equal(stats.dailyReceived.reduce((a, b) => a + b, 0), 1)
    assert.equal(Number.isNaN(Date.parse(stats.availableSince)), false)
    assert.equal(stats.dailySent.length, stats.dailyReceived.length)
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('delayed receipts do not downgrade confirmed read delivery', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'aharane-receipt-'))
  try {
    const store = createChatStore({ dataDir })
    const jid = '2348012345678@s.whatsapp.net'
    const id = 'out-of-order-status'
    await store.recordMessage({
      sessionId: 'public',
      message: {
        key: { id, remoteJid: jid, fromMe: true },
        messageTimestamp: Math.floor(Date.now() / 1000) - 30,
        message: { conversation: 'sent text' }
      }
    })
    await store.updateMessageStatus('public', jid, id, 'read')
    await store.updateMessageStatus('public', jid, id, 'delivered')
    await store.updateMessageStatus('public', jid, id, 'failed')
    const messages = await store.getMessages('public', jid, { limit: 5 })
    assert.equal(messages.find(row => row.id === id)?.status, 'read')
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})
