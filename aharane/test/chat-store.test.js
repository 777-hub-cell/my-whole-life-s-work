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
    assert.equal(media.jid, jid)
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

test('chat store preserves LID-addressed inbox messages as distinct conversations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-chat-lid-'))
  try {
    const store = createChatStore({ dataDir: dir, logger: { warn() {} } })
    await store.init()
    const jid = '123456789012345@lid'
    await store.recordMessage({
      sessionId: 'private',
      message: { key: { id: 'lid-message-1', remoteJid: jid, fromMe: false }, pushName: 'Private contact', messageTimestamp: 1760000010, message: { conversation: 'LID inbox message' } },
    })
    const chats = await store.listChats('private')
    assert.equal(chats.length, 1)
    assert.equal(chats[0].jid, jid)
    const messages = await store.getMessages('private', jid)
    assert.equal(messages.length, 1)
    assert.equal(messages[0].text, 'LID inbox message')
  } finally { await rm(dir, { recursive: true, force: true }) }
})


test('view-once media is labelled, withheld from normal media URLs and consumed only once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-chat-once-'))
  try {
    const store = createChatStore({ dataDir: dir, logger: { warn() {} } })
    await store.init()
    const jid = '2348012345678@s.whatsapp.net'
    await store.recordMessage({
      sessionId: 'private',
      message: {
        key: { id: 'once-video-1', remoteJid: jid, fromMe: false },
        pushName: 'Contact',
        messageTimestamp: 1760000020,
        message: {
          ephemeralMessage: {
            message: {
              viewOnceMessageV2Extension: {
                message: {
                  videoMessage: { mimetype: 'video/mp4', fileLength: 10, caption: 'Watch once' },
                },
              },
            },
          },
        },
      },
      downloadMedia: async () => Buffer.from('once-video'),
    })

    const [message] = await store.getMessages('private', jid)
    assert.equal(message.type, 'video')
    assert.equal(message.viewOnce, true)
    assert.equal(message.viewOnceViewed, false)
    assert.equal(message.text, 'Watch once')
    assert.equal(message.mediaUrl, '')
    assert.equal(await store.getMedia('private', 'once-video-1'), null)

    const info = await store.getViewOnceInfo('private', 'once-video-1')
    assert.deepEqual(info, { jid, viewed: false, mimeType: 'video/mp4' })
    const opened = await store.consumeViewOnceMedia('private', 'once-video-1')
    assert.equal(opened.buffer.toString(), 'once-video')
    assert.equal(opened.mimeType, 'video/mp4')

    const [after] = await store.getMessages('private', jid)
    assert.equal(after.viewOnce, true)
    assert.equal(after.viewOnceViewed, true)
    assert.equal(after.mediaUrl, '')
    assert.equal(await store.consumeViewOnceMedia('private', 'once-video-1'), null)
    assert.equal(await store.getMedia('private', 'once-video-1'), null)
    assert.equal((await store.mediaUsage()).bytes, 0)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('legacy view-once wrappers are identified without changing ordinary image messages', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-chat-once-v1-'))
  try {
    const store = createChatStore({ dataDir: dir, logger: { warn() {} } })
    await store.init()
    const jid = '2348012345678@s.whatsapp.net'
    await store.recordMessage({
      sessionId: 'public',
      message: {
        key: { id: 'once-image-1', remoteJid: jid, fromMe: false },
        message: { viewOnceMessage: { message: { imageMessage: { mimetype: 'image/jpeg', fileLength: 4 } } } },
      },
      downloadMedia: async () => Buffer.from('once'),
    })
    await store.recordMessage({
      sessionId: 'public',
      message: {
        key: { id: 'normal-image-1', remoteJid: jid, fromMe: false },
        message: { imageMessage: { mimetype: 'image/jpeg', fileLength: 4 } },
      },
      downloadMedia: async () => Buffer.from('norm'),
    })
    const messages = await store.getMessages('public', jid)
    const once = messages.find(row => row.id === 'once-image-1')
    const normal = messages.find(row => row.id === 'normal-image-1')
    assert.equal(once.viewOnce, true)
    assert.equal(once.mediaUrl, '')
    assert.equal(normal.viewOnce, false)
    assert.match(normal.mediaUrl, /\/aharane\/api\/chats\/public\/media\//)
    assert.ok(await store.getMedia('public', 'normal-image-1'))
  } finally { await rm(dir, { recursive: true, force: true }) }
})
