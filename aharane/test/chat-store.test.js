import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createChatStore } from '../src/chat-store.js'

test('chat history persists by account, marks read and stores incoming media privately', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-chat-'))
  try {
    const store = createChatStore({ dataDir: dir, logger: { warn() {} } })
    await store.init()
    const jid = '2348012345678@s.whatsapp.net'
    await store.recordMessage({
      sessionId: 'public',
      message: { key: { id: 'message-1', remoteJid: jid, fromMe: false }, pushName: 'Contact', messageTimestamp: 1760000000, message: { conversation: 'Hello' } },
    })
    const chats = await store.listChats('public')
    assert.equal(chats.length, 1)
    assert.equal(chats[0].jid, jid)
    assert.equal(chats[0].unreadCount, 1)
    const messages = await store.getMessages('public', jid)
    assert.equal(messages[0].text, 'Hello')
    await store.markRead('public', jid)
    assert.equal((await store.listChats('public'))[0].unreadCount, 0)
    assert.equal((await store.listChats('private')).length, 0)
    await store.recordMessage({
      sessionId: 'public',
      message: { key: { id: 'message-2', remoteJid: jid, fromMe: false }, pushName: 'Contact', messageTimestamp: 1760000001, message: { imageMessage: { mimetype: 'image/png', fileLength: 5, caption: 'Photo' } } },
      downloadMedia: async () => Buffer.from('image'),
    })
    const [mediaMessage] = (await store.getMessages('public', jid)).filter(row => row.id === 'message-2')
    assert.match(mediaMessage.mediaUrl, /\/aharane\/api\/chats\/public\/media\//)
    const media = await store.getMedia('public', 'message-2')
    assert.equal(media.mimeType, 'image/png')
    assert.equal(media.size, 5)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('outgoing attachments are retained for conversation history', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-chat-out-'))
  try {
    const store = createChatStore({ dataDir: dir })
    await store.init()
    const jid = '2348012345678@s.whatsapp.net'
    await store.recordOutgoingMedia({
      sessionId: 'public', jid, buffer: Buffer.from('photo'), mimeType: 'image/jpeg',
      fileName: 'photo.jpg', text: 'Caption', sendResult: { key: { id: 'sent-1' } },
    })
    const [message] = await store.getMessages('public', jid)
    assert.equal(message.fromMe, true)
    assert.equal(message.text, 'Caption')
    assert.equal(message.fileName, 'photo.jpg')
    assert.equal((await store.getMedia('public', 'sent-1')).size, 5)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
