import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createChatStore } from '../src/chat-store.js'

test('chat history persists by account, marks read and downloads incoming media only on request', async () => {
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
    })
    const [beforeDownload] = (await store.getMessages('public', jid)).filter(row => row.id === 'message-2')
    assert.equal(beforeDownload.mediaUrl, '')
    assert.equal(beforeDownload.mediaAvailable, true)
    assert.equal(await store.getMedia('public', 'message-2'), null)
    await store.downloadMessageMedia('public', jid, 'message-2', async () => Buffer.from('image'), {})
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
    await store.recordMessage({
      sessionId: 'private',
      message: { key: { id: 'lid-message-2', remoteJid: jid, fromMe: false }, messageTimestamp: 1760000020, message: { conversation: 'Later message without a push name' } },
    })
    const chats = await store.listChats('private')
    assert.equal(chats.length, 1)
    assert.equal(chats[0].jid, jid)
    assert.equal(chats[0].name, 'Private contact')
    const messages = await store.getMessages('private', jid)
    assert.equal(messages.length, 2)
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
    })
    await store.downloadMessageMedia('private', jid, 'once-video-1', async () => Buffer.from('once-video'), {})

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
    })
    await store.recordMessage({
      sessionId: 'public',
      message: {
        key: { id: 'normal-image-1', remoteJid: jid, fromMe: false },
        message: { imageMessage: { mimetype: 'image/jpeg', fileLength: 4 } },
      },
    })
    await store.downloadMessageMedia('public', jid, 'once-image-1', async () => Buffer.from('once'), {})
    await store.downloadMessageMedia('public', jid, 'normal-image-1', async () => Buffer.from('norm'), {})
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

test('message search finds older messages, names and filenames in a single account only', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-chat-search-'))
  try {
    const store = createChatStore({ dataDir: dir })
    await store.init()
    const jid = '2348012345678@s.whatsapp.net'
    await store.recordMessage({
      sessionId: 'private',
      message: { key: { id: 'search-old', remoteJid: jid, fromMe: false }, pushName: 'Older Contact', messageTimestamp: 1760000000, message: { conversation: 'Needle hidden in old history' } },
    })
    await store.recordMessage({
      sessionId: 'private',
      message: { key: { id: 'search-new', remoteJid: jid, fromMe: false }, pushName: 'Older Contact', messageTimestamp: 1760001000, message: { conversation: 'A newer unrelated message' } },
    })
    const results = await store.searchMessages('private', { query: 'needle', limit: 20 })
    assert.equal(results.length, 1)
    assert.equal(results[0].id, 'search-old')
    assert.equal((await store.searchMessages('public', { query: 'needle' })).length, 0)
    assert.deepEqual(await store.searchMessages('private', { query: 'x' }), [])
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('text messages retain quote source, reactions attach to the target bubble, and local deletion removes them', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-chat-actions-'))
  try {
    const store = createChatStore({ dataDir: dir })
    await store.init()
    const jid = '2348012345678@s.whatsapp.net'
    const original = { key: { id: 'target-1', remoteJid: jid, fromMe: false }, pushName: 'Mira', message: { conversation: 'Original message' } }
    await store.recordMessage({ sessionId: 'private', message: original })
    const source = await store.getMessage('private', jid, 'target-1')
    assert.equal(source.sourceMessage.message.conversation, 'Original message')
    const reaction = {
      key: { id: 'reaction-1', remoteJid: jid, fromMe: false },
      pushName: 'Quincy',
      message: { reactionMessage: { key: { id: 'target-1', remoteJid: jid, fromMe: false }, text: '❤️' } },
    }
    await store.recordMessage({ sessionId: 'private', message: reaction })
    let [message] = await store.getMessages('private', jid)
    assert.deepEqual(message.reactions, [{ actor: 'Quincy', emoji: '❤️' }])
    await store.applyReaction('private', jid, 'target-1', '👍', 'You')
    ;[message] = await store.getMessages('private', jid)
    assert.deepEqual(message.reactions, [{ actor: 'Quincy', emoji: '❤️' }, { actor: 'You', emoji: '👍' }])
    assert.equal(await store.deleteMessage('private', jid, 'target-1'), true)
    assert.equal(await store.getMessage('private', jid, 'target-1'), null)
  } finally { await rm(dir, { recursive: true, force: true }) }
})


test('starred messages persist and can be collected across conversations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-chat-starred-'))
  try {
    const store = createChatStore({ dataDir: dir })
    await store.init()
    const first = '2348012345678@s.whatsapp.net'
    const second = '2348098765432@s.whatsapp.net'
    await store.recordMessage({
      sessionId: 'private',
      message: { key: { id: 'star-1', remoteJid: first, fromMe: false }, pushName: 'Mira', messageTimestamp: 1760000100, message: { conversation: 'Keep this for later' } },
    })
    await store.recordMessage({
      sessionId: 'private',
      message: { key: { id: 'star-2', remoteJid: second, fromMe: true }, messageTimestamp: 1760000200, message: { conversation: 'Another saved message' } },
    })
    assert.deepEqual(await store.setStarred('private', first, 'star-1', true), { id: 'star-1', starred: true })
    await store.setStarred('private', second, 'star-2', true)
    const starred = await store.listStarredMessages('private')
    assert.deepEqual(starred.map(row => row.id), ['star-2', 'star-1'])
    assert.equal((await store.getMessages('private', first))[0].starred, true)
    await store.setStarred('private', first, 'star-1', false)
    assert.deepEqual((await store.listStarredMessages('private')).map(row => row.id), ['star-2'])
    assert.deepEqual(await store.listStarredMessages('public'), [])
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('media gallery and chat export describe saved attachments without auto-downloading', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-chat-gallery-'))
  try {
    const store = createChatStore({ dataDir: dir, logger: { warn() {} } })
    await store.init()
    const jid = '2348012345678@s.whatsapp.net'
    await store.recordMessage({
      sessionId: 'public',
      message: { key: { id: 'gallery-photo', remoteJid: jid, fromMe: false }, pushName: 'Contact', messageTimestamp: 1760000300, message: { imageMessage: { mimetype: 'image/png', fileLength: 5, caption: 'A picture' } } },
    })
    const gallery = await store.getMediaGallery('public', jid)
    assert.equal(gallery.length, 1)
    assert.equal(gallery[0].type, 'image')
    assert.equal(gallery[0].mediaUrl, '')
    assert.equal(gallery[0].mediaAvailable, true)
    const exported = await store.exportConversation('public', jid)
    assert.equal(exported.length, 1)
    assert.equal(exported[0].text, 'A picture')
    assert.equal(exported[0].mediaUrl, '')
    assert.equal(exported[0].mediaAvailable, true)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('mark unread restores one fresh incoming notification without changing account history', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-chat-unread-'))
  try {
    const store = createChatStore({ dataDir: dir, logger: { warn() {} } })
    await store.init()
    const jid = '2348012345678@s.whatsapp.net'
    await store.recordMessage({
      sessionId: 'private',
      message: { key: { id: 'unread-old', remoteJid: jid, fromMe: false }, messageTimestamp: 1760000400, message: { conversation: 'Earlier' } },
    })
    await store.recordMessage({
      sessionId: 'private',
      message: { key: { id: 'unread-new', remoteJid: jid, fromMe: false }, messageTimestamp: 1760000401, message: { conversation: 'Latest' } },
    })
    await store.markRead('private', jid)
    assert.equal((await store.listChats('private'))[0].unreadCount, 0)
    const unread = await store.markUnread('private', jid)
    assert.equal(unread.unreadCount, 1)
    assert.equal((await store.listChats('private'))[0].unreadCount, 1)
    assert.equal((await store.listChats('public')).length, 0)
  } finally { await rm(dir, { recursive: true, force: true }) }
})


test('replayed message IDs are deduplicated by a bounded in-memory key index', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-chat-dedupe-'))
  try {
    const store = createChatStore({ dataDir: dir, logger: { warn() {} } })
    const message = {
      key: { remoteJid: '2348012345678@s.whatsapp.net', id: 'duplicate-message-id', fromMe: false },
      message: { conversation: 'same message' },
      messageTimestamp: 1760000000,
    }
    await store.recordMessage({ sessionId: 'public', message })
    await store.recordMessage({ sessionId: 'public', message })
    const rows = await store.getMessages('public', message.key.remoteJid)
    assert.equal(rows.length, 1)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('contact cards retain vCards, locations retain coordinates and polls retain their options', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-chat-structured-'))
  try {
    const store = createChatStore({ dataDir: dir, logger: { warn() {} } })
    await store.init()
    const jid = '2348012345678@s.whatsapp.net'
    const messages = [
      {
        key: { id: 'contact-card-1', remoteJid: jid, fromMe: false },
        message: {
          contactMessage: {
            displayName: 'Ada Lovelace',
            vcard: [
              'BEGIN:VCARD',
              'VERSION:3.0',
              'FN:Ada Lovelace',
              'TEL;TYPE=CELL:+2348012345678',
              'EMAIL:ada@example.test',
              'END:VCARD',
            ].join('\n'),
          },
        },
      },
      {
        key: { id: 'location-1', remoteJid: jid, fromMe: false },
        message: {
          locationMessage: {
            name: 'Ibadan City Hall',
            address: 'Oyo State, Nigeria',
            degreesLatitude: 7.3775,
            degreesLongitude: 3.947,
          },
        },
      },
      {
        key: { id: 'location-no-coordinates', remoteJid: jid, fromMe: false },
        message: {
          locationMessage: {
            name: 'Undisclosed place',
            address: 'Nigeria',
            degreesLatitude: null,
            degreesLongitude: '',
          },
        },
      },
      {
        key: { id: 'contact-array-1', remoteJid: jid, fromMe: false },
        message: {
          contactsArrayMessage: {
            displayName: 'Shared contacts',
            contacts: [{
              displayName: 'Grace Hopper',
              vcard: ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Grace Hopper', 'TEL:+15550102030', 'END:VCARD'].join('\n'),
            }],
          },
        },
      },
      {
        key: { id: 'voice-note-1', remoteJid: jid, fromMe: false },
        message: {
          audioMessage: {
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true,
            seconds: 4,
            fileLength: 2048,
          },
        },
      },
      {
        key: { id: 'poll-1', remoteJid: jid, fromMe: false },
        message: {
          pollCreationMessage: {
            name: 'Where should we meet?',
            options: [{ optionName: 'Ibadan' }, { optionName: 'Lagos' }],
          },
        },
      },
    ]

    for (const message of messages) {
      await store.recordMessage({ sessionId: 'private', message })
    }

    const rows = await store.getMessages('private', jid)
    const contact = rows.find(row => row.id === 'contact-card-1')
    const contactArray = rows.find(row => row.id === 'contact-array-1')
    const location = rows.find(row => row.id === 'location-1')
    const locationWithoutCoordinates = rows.find(row => row.id === 'location-no-coordinates')
    const voiceNote = rows.find(row => row.id === 'voice-note-1')
    const poll = rows.find(row => row.id === 'poll-1')

    assert.equal(contact.type, 'contact')
    assert.match(contact.text, /Ada Lovelace/)
    assert.match(contact.text, /TEL;TYPE=CELL:\+2348012345678/)
    assert.match(contact.text, /EMAIL:ada@example.test/)

    assert.equal(contactArray.type, 'contact')
    assert.match(contactArray.text, /Grace Hopper/)
    assert.match(contactArray.text, /TEL:\+15550102030/)

    assert.equal(location.type, 'location')
    assert.match(location.text, /Ibadan City Hall/)
    assert.match(location.text, /Oyo State, Nigeria/)
    assert.match(location.text, /Coordinates: 7\.3775, 3\.947/)

    assert.equal(locationWithoutCoordinates.type, 'location')
    assert.doesNotMatch(locationWithoutCoordinates.text, /Coordinates:/)

    assert.equal(voiceNote.type, 'audio')
    assert.equal(voiceNote.ptt, true)
    assert.equal(voiceNote.duration, 4)
    assert.equal(voiceNote.mimeType, 'audio/ogg; codecs=opus')

    assert.equal(poll.type, 'poll')
    assert.match(poll.text, /Where should we meet\?/)
    assert.match(poll.text, /Ibadan/)
    assert.match(poll.text, /Lagos/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})



test('idempotent text send intents survive restart and never resend an uncertain request', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-send-idempotency-'))
  try {
    const clientMessageId = 'native-client-message-0001'
    const jid = '2348777777777@s.whatsapp.net'
    const first = createChatStore({ dataDir: dir, logger: { warn() {} } })
    await first.init()
    assert.deepEqual(
      await first.beginIdempotentSend('private', { clientMessageId, jid, text: 'hello', quotedMessageId: '' }),
      { state: 'sending', messageId: '' }
    )

    const persisted = JSON.parse(await readFile(join(dir, 'chats', 'private.send-keys.json'), 'utf8'))
    const expectedPayloadHash = createHash('sha256')
      .update(JSON.stringify({ jid, text: 'hello', quotedMessageId: '' }))
      .digest('hex')
    assert.equal(persisted[clientMessageId].payloadHash, expectedPayloadHash)
    assert.equal(persisted[clientMessageId].jid, jid)

    const afterProcessRestart = createChatStore({ dataDir: dir, logger: { warn() {} } })
    await afterProcessRestart.init()
    let replayedIntent
    try {
      replayedIntent = await afterProcessRestart.beginIdempotentSend(
        'private', { clientMessageId, jid, text: 'hello', quotedMessageId: '' }
      )
    } catch (error) {
      throw new Error('Same-content retry after restart failed: ' + error.message, { cause: error })
    }
    assert.deepEqual(replayedIntent, { state: 'uncertain', messageId: '' })
    assert.equal(
      (await afterProcessRestart.getIdempotentSend('private', clientMessageId)).state,
      'sending'
    )
    await afterProcessRestart.completeIdempotentSend('private', clientMessageId, 'whatsapp-message-1')
    const completedEntry = JSON.parse(await readFile(join(dir, 'chats', 'private.send-keys.json'), 'utf8'))[clientMessageId]
    assert.equal(completedEntry.payloadHash, expectedPayloadHash)
    assert.equal(completedEntry.jid, jid)
    let completedReplay
    try {
      completedReplay = await afterProcessRestart.beginIdempotentSend(
        'private', { clientMessageId, jid, text: 'hello', quotedMessageId: '' }
      )
    } catch (error) {
      throw new Error('Same-content retry after completion failed: ' + error.message, { cause: error })
    }
    assert.deepEqual(completedReplay, { state: 'sent', messageId: 'whatsapp-message-1' })
    let reusedIdError = null
    try {
      await afterProcessRestart.beginIdempotentSend(
        'private',
        { clientMessageId, jid, text: 'different text', quotedMessageId: '' }
      )
    } catch (error) {
      reusedIdError = error
    }
    assert.equal(reusedIdError?.status, 409)
    assert.deepEqual(
      await afterProcessRestart.beginIdempotentSend(
        'private',
        { clientMessageId: 'native-client-message-0002', jid, text: 'next valid message', quotedMessageId: '' }
      ),
      { state: 'sending', messageId: '' }
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('edited messages reconcile duplicate IDs and preserve reactions, stars and delivery state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-chat-edits-'))
  try {
    const store = createChatStore({ dataDir: dir, logger: { warn() {} } })
    await store.init()
    const jid = '2348666666666@s.whatsapp.net'
    const key = { id: 'edit-1', remoteJid: jid, fromMe: false }
    await store.recordMessage({
      sessionId: 'private',
      message: { key, messageTimestamp: 1763000000, message: { conversation: 'original text' } },
    })
    await store.setStarred('private', jid, 'edit-1', true)
    await store.applyReaction('private', jid, 'edit-1', '❤️', 'Alice')
    await store.updateMessageStatus('private', jid, 'edit-1', 'delivered')

    await store.recordMessage({
      sessionId: 'private',
      message: {
        key,
        messageTimestamp: 1763000000,
        message: { editedMessage: { message: { conversation: 'corrected text' } } },
      },
    })
    let rows = await store.getMessages('private', jid, { limit: 20 })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].text, 'corrected text')
    assert.equal(rows[0].starred, true)
    assert.deepEqual(rows[0].reactions, [{ actor: 'Alice', emoji: '❤️' }])
    assert.equal(rows[0].status, 'delivered')

    await store.updateMessageStatus('private', jid, 'edit-1', 'read')
    rows = await store.getMessages('private', jid, { limit: 20 })
    assert.equal(rows[0].status, 'read')

    assert.equal(await store.deleteMessage('private', jid, 'edit-1'), true)
    assert.deepEqual(await store.getMessages('private', jid, { limit: 20 }), [])
    assert.deepEqual(await store.listDeletedMessageIds('private', jid), ['edit-1'])
    assert.equal(await store.deleteMessage('private', jid, 'edit-1'), false)
    assert.deepEqual(await store.listDeletedMessageIds('private', jid), ['edit-1'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('messages deleted by the other participant stay in the Hub store with a deletion marker', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-remote-delete-'))
  try {
    const store = createChatStore({ dataDir: dir, logger: { warn() {} } })
    await store.init()
    const jid = '2348777777777@s.whatsapp.net'
    await store.recordMessage({
      sessionId: 'private',
      message: {
        key: { id: 'kept-after-delete', remoteJid: jid, fromMe: false },
        messageTimestamp: 1764000000,
        pushName: 'Other participant',
        message: { conversation: 'Please keep this message in Hub.' },
      },
    })
    assert.equal(
      await store.markMessageDeletedRemotely('private', jid, 'kept-after-delete'),
      true
    )
    const messages = await store.getMessages('private', jid, { limit: 20 })
    assert.equal(messages.length, 1)
    assert.equal(messages[0].text, 'Please keep this message in Hub.')
    assert.equal(messages[0].deletedByRemote, true)
    assert.ok(messages[0].deletedAt > 0)
    assert.deepEqual(await store.listDeletedMessageIds('private', jid), [])

    // Only the other participant's message is retained this way. Owner-side
    // deletion continues to use the existing explicit delete/tombstone path.
    await store.recordMessage({
      sessionId: 'private',
      message: {
        key: { id: 'own-message', remoteJid: jid, fromMe: true },
        messageTimestamp: 1764000001,
        message: { conversation: 'An outgoing message.' },
      },
    })
    assert.equal(await store.markMessageDeletedRemotely('private', jid, 'own-message'), false)
    assert.equal((await store.getMessages('private', jid, { limit: 20 })).length, 2)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('remote deletion retention preserves an already downloaded incoming attachment', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-remote-delete-media-'))
  try {
    const store = createChatStore({ dataDir: dir, logger: { warn() {} } })
    await store.init()
    const jid = '2348788888888@s.whatsapp.net'
    await store.recordMessage({
      sessionId: 'private',
      message: {
        key: { id: 'retained-photo', remoteJid: jid, fromMe: false },
        messageTimestamp: 1764100000,
        pushName: 'Other participant',
        message: { imageMessage: { mimetype: 'image/png', fileLength: 5, caption: 'Keep this photo' } },
      },
    })
    const downloaded = await store.downloadMessageMedia(
      'private', jid, 'retained-photo', async () => Buffer.from('photo')
    )
    assert.ok(downloaded?.mediaUrl)
    assert.ok(await store.getMedia('private', 'retained-photo'))

    assert.equal(await store.markMessageDeletedRemotely('private', jid, 'retained-photo'), true)
    const [message] = await store.getMessages('private', jid, { limit: 20 })
    assert.equal(message.text, 'Keep this photo')
    assert.equal(message.deletedByRemote, true)
    assert.equal(message.mediaUrl, downloaded.mediaUrl)
    assert.ok(await store.getMedia('private', 'retained-photo'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('incremental chat sync uses a composite timestamp/message cursor and preserves unread markers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-chat-sync-'))
  try {
    const store = createChatStore({ dataDir: dir, logger: { warn() {} } })
    await store.init()
    const jid = '2348012345678@s.whatsapp.net'
    for (const [id, second, text] of [
      ['sync-1', 1760001000, 'first cached'],
      ['sync-2', 1760001001, 'second message'],
      ['sync-3', 1760001001, 'third message'],
      ['sync-4', 1760001001, 'fourth message'],
      ['sync-5', 1760001002, 'fifth message'],
    ]) {
      await store.recordMessage({
        sessionId: 'private',
        message: {
          key: { id, remoteJid: jid, fromMe: false },
          messageTimestamp: second,
          message: { conversation: text },
        },
      })
    }
    const initial = await store.getMessages('private', jid, { limit: 2 })
    assert.deepEqual(initial.map(message => message.id), ['sync-4', 'sync-5'])
    const delta = await store.getMessages('private', jid, { after: 1760001001000, afterId: 'sync-2', limit: 2 })
    assert.deepEqual(delta.map(message => message.id), ['sync-3', 'sync-4'])
    const nextDelta = await store.getMessages('private', jid, { after: 1760001001000, afterId: 'sync-4', limit: 2 })
    assert.deepEqual(nextDelta.map(message => message.id), ['sync-5'])
    const older = await store.getMessages('private', jid, { before: 1760001001000, beforeId: 'sync-4', limit: 2 })
    assert.deepEqual(older.map(message => message.id), ['sync-2', 'sync-3'])
    assert.equal((await store.listChats('private'))[0].unreadCount, 5)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
