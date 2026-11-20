import { appendFile, chmod, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { basename, extname, join } from 'node:path'

const ACCOUNTS = new Set(['private', 'public'])
const MAX_TEXT = 12000
const MAX_MEDIA_BYTES = 24 * 1024 * 1024
const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'sticker', 'document'])
const VIEW_ONCE_TYPES = new Set(['image', 'video'])
const EXTENSIONS = new Map([
  ['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/webp', '.webp'], ['image/gif', '.gif'],
  ['video/mp4', '.mp4'], ['video/3gpp', '.3gp'],
  ['audio/ogg', '.ogg'], ['audio/mpeg', '.mp3'], ['audio/mp4', '.m4a'], ['audio/aac', '.aac'],
  ['application/pdf', '.pdf'], ['text/plain', '.txt'],
])

function accountId(value) {
  const id = String(value || '').trim().toLowerCase()
  if (!ACCOUNTS.has(id)) throw Object.assign(new Error('Unknown WhatsApp account.'), { status: 404 })
  return id
}
function safeJid(value) {
  const jid = String(value || '').trim()
  if (/^\d{7,15}@s\.whatsapp\.net$/.test(jid)) return jid
  if (/^\d{5,25}-\d{5,25}@g\.us$/.test(jid)) return jid
  if (/^\d{5,25}@lid$/.test(jid)) return jid
  return ''
}
function unwrap(content) {
  let current = content || {}
  let viewOnce = false
  for (let i = 0; i < 5; i += 1) {
    const onceWrapper = current.viewOnceMessage
      || current.viewOnceMessageV2
      || current.viewOnceMessageV2Extension
    if (onceWrapper) viewOnce = true
    const next = current.ephemeralMessage?.message
      || onceWrapper?.message
      || current.documentWithCaptionMessage?.message
      || current.editedMessage?.message
      || current.associatedChildMessage?.message
    if (!next) break
    current = next
  }
  return { body: current, viewOnce }
}
function quotedMessageId(message) {
  const { body } = unwrap(message?.message)
  for (const value of Object.values(body || {})) {
    const context = value?.contextInfo
    const id = String(context?.stanzaId || context?.quotedMessage?.key?.id || '').trim()
    if (id) return id.slice(0, 256)
  }
  return ''
}
function quotedMessageIdFromSource(serialized) {
  if (!serialized) return ''
  try { return quotedMessageId(JSON.parse(serialized)) } catch { return '' }
}
function messageContent(message) {
  const { body, viewOnce } = unwrap(message?.message)
  const pairs = [
    ['conversation', 'conversation'], ['extendedTextMessage', 'extendedTextMessage'],
    ['imageMessage', 'image'], ['videoMessage', 'video'], ['audioMessage', 'audio'],
    ['stickerMessage', 'sticker'], ['documentMessage', 'document'],
    ['contactMessage', 'contact'], ['contactsArrayMessage', 'contact'],
    ['locationMessage', 'location'], ['liveLocationMessage', 'location'],
    ['pollCreationMessage', 'poll'], ['pollCreationMessageV3', 'poll'],
    ['reactionMessage', 'reaction'], ['buttonsResponseMessage', 'response'],
    ['listResponseMessage', 'response'], ['templateButtonReplyMessage', 'response'],
  ]
  for (const [key, type] of pairs) {
    if (!body[key]) continue
    const value = body[key]
    let text = ''
    if (typeof value === 'string') {
      text = value
    } else if (type === 'contact') {
      const contacts = Array.isArray(value.contacts) ? value.contacts : [value]
      text = contacts.map(contact => [
        String(contact.displayName || contact.name || '').trim(),
        String(contact.vcard || '').trim(),
      ].filter(Boolean).join('\n')).filter(Boolean).join('\n\n')
    } else if (type === 'location') {
      const hasLatitude = value.degreesLatitude !== null &&
        value.degreesLatitude !== undefined && String(value.degreesLatitude).trim() !== ''
      const hasLongitude = value.degreesLongitude !== null &&
        value.degreesLongitude !== undefined && String(value.degreesLongitude).trim() !== ''
      const latitude = hasLatitude ? Number(value.degreesLatitude) : NaN
      const longitude = hasLongitude ? Number(value.degreesLongitude) : NaN
      const hasCoordinates = hasLatitude && hasLongitude &&
        Number.isFinite(latitude) && Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
      text = [
        String(value.name || '').trim(),
        String(value.address || '').trim(),
        hasCoordinates ? 'Coordinates: ' + latitude + ', ' + longitude : '',
        String(value.comment || value.caption || '').trim(),
      ].filter(Boolean).join('\n')
    } else if (type === 'poll') {
      const options = Array.isArray(value.options) ? value.options : []
      text = [
        String(value.name || value.question || value.title || value.text || '').trim(),
        ...options.map(option => String(option?.optionName || option?.name || '').trim()).filter(Boolean).map(option => '• ' + option),
      ].filter(Boolean).join('\n')
    } else {
      text = String(value.text || value.caption || value.name || value.selectedDisplayText || value.comment || '')
    }
    const mimeType = String(value.mimetype || '')
    const fileName = String(value.fileName || '')
    const size = Number(value.fileLength?.toString?.() || value.fileLength || 0) || 0
    return {
      type,
      text: text.slice(0, MAX_TEXT),
      mimeType,
      fileName,
      size,
      duration: Math.max(0, Number(value.seconds || value.duration || 0) || 0),
      ptt: type === 'audio' && value.ptt === true,
      media: MEDIA_TYPES.has(type),
      viewOnce: viewOnce && VIEW_ONCE_TYPES.has(type),
    }
  }
  return { type: 'unsupported', text: '', mimeType: '', fileName: '', size: 0, duration: 0, ptt: false, media: false, viewOnce: false }
}
function timestamp(value) {
  const n = Number(value?.toString?.() || value || 0)
  if (!Number.isFinite(n) || n <= 0) return Date.now()
  return n < 10_000_000_000 ? n * 1000 : n
}
function safeName(value) {
  const base = basename(String(value || 'attachment')).replace(/[\u0000-\u001f<>:"\\/\\\\|?*]/g, '_').slice(0, 100)
  return base || 'attachment'
}
function mediaExtension(mimeType, fileName) {
  const known = EXTENSIONS.get(String(mimeType || '').toLowerCase())
  if (known) return known
  const extension = extname(safeName(fileName)).toLowerCase()
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : '.bin'
}
function mediaUrl(account, id) {
  return '/aharane/api/chats/' + account + '/media/' + encodeURIComponent(id)
}

export function createChatStore({ dataDir, logger = console } = {}) {
  if (!dataDir) throw new TypeError('Chat store requires a persistent data directory.')
  const root = join(dataDir, 'chats')
  const mediaRoot = join(dataDir, 'chat-media')
  const files = Object.fromEntries(['private', 'public'].map(id => [id, join(root, id + '.jsonl')]))
  const readMarkers = Object.fromEntries(['private', 'public'].map(id => [id, join(root, id + '.read.json')]))
  const deletedFiles = Object.fromEntries(['private', 'public'].map(id => [id, join(root, id + '.deleted.jsonl')]))
  const sendKeyFiles = Object.fromEntries(['private', 'public'].map(id => [id, join(root, id + '.send-keys.json')]))
  const queues = new Map()
  const ready = new Set()
  const initializing = new Map()
  const knownMessageKeys = new Map([...ACCOUNTS].map(id => [id, new Set()]))
  const MAX_KNOWN_MESSAGE_KEYS = 10000

  async function init() {
    await mkdir(root, { recursive: true, mode: 0o700 })
    await mkdir(mediaRoot, { recursive: true, mode: 0o700 })
    for (const id of ACCOUNTS) {
      await mkdir(join(mediaRoot, id), { recursive: true, mode: 0o700 })
      await chmod(join(mediaRoot, id), 0o700)
    }
  }

  async function ensureReady(id) {
    const account = accountId(id)
    if (ready.has(account)) return
    if (!initializing.has(account)) {
      const task = (async () => {
        await init()
        const text = await readFile(files[account], 'utf8').catch(error => {
          if (error?.code === 'ENOENT') return ''
          throw error
        })
        const keys = knownMessageKeys.get(account)
        const lines = text.split(String.fromCharCode(10)).filter(Boolean).slice(-MAX_KNOWN_MESSAGE_KEYS)
        for (const line of lines) {
          try {
            const row = JSON.parse(line)
            if (row && safeJid(row.jid) && typeof row.id === 'string') keys.add(row.jid + '|' + row.id)
          } catch {}
        }
        ready.add(account)
      })()
      initializing.set(account, task)
    }
    const pending = initializing.get(account)
    try {
      await pending
    } finally {
      if (initializing.get(account) === pending) initializing.delete(account)
    }
  }

  function enqueue(id, task) {
    const account = accountId(id)
    const previous = queues.get(account) || Promise.resolve()
    const next = previous.catch(() => {}).then(task)
    const tracked = next.finally(() => {
      if (queues.get(account) === tracked) queues.delete(account)
    })
    queues.set(account, tracked)
    return next
  }

  async function readRows(id) {
    const account = accountId(id)
    await ensureReady(account)
    const text = await readFile(files[account], 'utf8').catch(error => {
      if (error?.code === 'ENOENT') return ''
      throw error
    })
    const rows = []
    for (const line of text.split('\n')) {
      if (!line) continue
      try {
        const row = JSON.parse(line)
        if (row && safeJid(row.jid) && typeof row.id === 'string') rows.push(row)
      } catch {
        logger.warn?.({ event: 'chat-store.invalid-row', accountId: account })
      }
    }
    return rows
  }

  async function readSendKeys(account) {
    return readFile(sendKeyFiles[account], 'utf8')
      .then(JSON.parse)
      .catch(error => {
        if (error?.code === 'ENOENT') return {}
        throw error
      })
  }

  async function writeSendKeys(account, value) {
    const temporary = sendKeyFiles[account] + '.' + randomUUID() + '.tmp'
    try {
      await writeFile(temporary, JSON.stringify(value), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      await rename(temporary, sendKeyFiles[account])
      await chmod(sendKeyFiles[account], 0o600)
    } finally {
      await unlink(temporary).catch(() => {})
    }
  }

  async function beginIdempotentSend(id, { clientMessageId, jid: jidValue, text, quotedMessageId = '' } = {}) {
    const account = accountId(id)
    const jid = safeJid(jidValue)
    const key = String(clientMessageId || '')
    if (!jid || !/^[A-Za-z0-9_-]{8,128}$/.test(key)) {
      throw Object.assign(new Error('A valid client message id and conversation are required.'), { status: 400 })
    }
    const content = String(text || '')
    const quote = String(quotedMessageId || '')
    const payloadHash = createHash('sha256').update(JSON.stringify({ jid, text: content, quotedMessageId: quote })).digest('hex')
    await ensureReady(account)
    return enqueue(account, async () => {
      const entries = await readSendKeys(account)
      const existing = entries[key]
      if (existing) {
        if (existing.payloadHash !== payloadHash || existing.jid !== jid) {
          throw Object.assign(new Error('This client message id was already used for different message content.'), { status: 409 })
        }
        if (existing.state === 'sent') return { state: 'sent', messageId: existing.messageId || '' }
        return { state: 'uncertain', messageId: existing.messageId || '' }
      }
      entries[key] = {
        clientMessageId: key,
        jid,
        payloadHash,
        state: 'sending',
        messageId: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      await writeSendKeys(account, entries)
      return { state: 'sending', messageId: '' }
    })
  }

  async function completeIdempotentSend(id, clientMessageId, messageId) {
    const account = accountId(id), key = String(clientMessageId || '')
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw Object.assign(new Error('Invalid client message id.'), { status: 400 })
    return enqueue(account, async () => {
      const entries = await readSendKeys(account)
      const existing = entries[key]
      if (!existing) throw Object.assign(new Error('The send intent was not found.'), { status: 404 })
      if (existing.state === 'sent' && existing.messageId && existing.messageId !== String(messageId || '')) {
        throw Object.assign(new Error('The client message id resolved to a different WhatsApp message.'), { status: 409 })
      }
      existing.state = 'sent'
      existing.messageId = String(messageId || '').slice(0, 256)
      existing.updatedAt = Date.now()
      await writeSendKeys(account, entries)
      return { state: 'sent', messageId: existing.messageId }
    })
  }

  async function getIdempotentSend(id, clientMessageId) {
    const account = accountId(id), key = String(clientMessageId || '')
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) return null
    const entries = await readSendKeys(account)
    const row = entries[key]
    return row ? { state: row.state, messageId: row.messageId || '' } : null
  }

  async function recordDeleted(id, jid, messageId) {
    const account = accountId(id)
    const key = String(messageId || '')
    if (!jid || !/^[A-Za-z0-9_-]{1,256}$/.test(key)) return
    const rows = await readFile(deletedFiles[account], 'utf8').catch(error => {
      if (error?.code === 'ENOENT') return ''
      throw error
    })
    const existing = rows.split('\n').filter(Boolean).slice(-1000).some(line => {
      try { const row = JSON.parse(line); return row.jid === jid && row.id === key } catch { return false }
    })
    if (!existing) {
      await appendFile(deletedFiles[account], JSON.stringify({ jid, id: key, deletedAt: Date.now() }) + '\n', { encoding: 'utf8', mode: 0o600 })
      await chmod(deletedFiles[account], 0o600)
    }
  }

  async function listDeletedMessageIds(id, jidValue, limit = 1000) {
    const account = accountId(id), jid = safeJid(jidValue)
    if (!jid) throw Object.assign(new Error('Invalid WhatsApp conversation.'), { status: 400 })
    await ensureReady(account)
    const content = await readFile(deletedFiles[account], 'utf8').catch(error => {
      if (error?.code === 'ENOENT') return ''
      throw error
    })
    return content.split('\n').filter(Boolean).slice(-Math.max(1, Math.min(2000, Number(limit) || 1000)))
      .flatMap(line => {
        try {
          const row = JSON.parse(line)
          return row.jid === jid && typeof row.id === 'string' ? [row.id] : []
        } catch { return [] }
      })
  }

  async function writeReadMarkers(id, markers) {
    const account = accountId(id)
    const file = readMarkers[account]
    const tmp = file + '.' + randomUUID() + '.tmp'
    await writeFile(tmp, JSON.stringify(markers), { mode: 0o600, flag: 'wx' })
    await rename(tmp, file)
    await chmod(file, 0o600)
  }

  async function persist(id, record) {
    const account = accountId(id)
    await ensureReady(account)
    return enqueue(account, async () => {
      const key = record.jid + '|' + record.id
      const known = knownMessageKeys.get(account)
      if (known.has(key)) {
        const rows = await readRows(account)
        const index = rows.findIndex(row => row.jid === record.jid && row.id === record.id)
        if (index >= 0) {
          const previous = rows[index]
          const sameMedia = previous.type === record.type &&
            previous.mimeType === record.mimeType &&
            previous.fileName === record.fileName &&
            previous.size === record.size
          const updated = {
            ...previous,
            ...record,
            status: record.status || previous.status || '',
            reactions: Array.isArray(previous.reactions) ? previous.reactions : [],
            starred: previous.starred === true,
            viewOnceViewed: previous.viewOnceViewed === true,
            mediaFile: sameMedia ? (previous.mediaFile || '') : '',
            mediaUrl: sameMedia ? (previous.mediaUrl || '') : '',
            mediaUnavailable: sameMedia ? (previous.mediaUnavailable || record.mediaUnavailable || '') : (record.mediaUnavailable || ''),
            sourceMessage: sameMedia && previous.mediaFile ? '' : record.sourceMessage,
          }
          if (JSON.stringify(updated) !== JSON.stringify(previous)) {
            if (!sameMedia && previous.mediaFile && /^[a-f0-9]{64}\.[a-z0-9]{1,8}$/.test(previous.mediaFile)) {
              await unlink(join(mediaRoot, account, previous.mediaFile)).catch(() => {})
            }
            rows[index] = updated
            await rewriteRows(account, rows)
          }
          return updated
        }
        // The bounded in-memory de-duplication set may have outlived an old
        // row index. Do not append a duplicate without checking disk state.
        return record
      }
      await appendFile(files[account], JSON.stringify(record) + String.fromCharCode(10), { encoding: 'utf8', mode: 0o600 })
      await chmod(files[account], 0o600)
      known.add(key)
      if (known.size > MAX_KNOWN_MESSAGE_KEYS) known.delete(known.values().next().value)
      return record
    })
  }

  async function recordMessage({ sessionId, message, socket } = {}) {
    const account = accountId(sessionId)
    const key = message?.key || {}
    const jid = safeJid(key.remoteJid)
    const id = String(key.id || '').slice(0, 256)
    if (!jid || !id || !message?.message) return null
    const extracted = messageContent(message)
    const ts = timestamp(message.messageTimestamp)
    const fromMe = key.fromMe === true
    if (extracted.type === 'reaction') {
      const { body } = unwrap(message.message)
      const reaction = body.reactionMessage || {}
      return applyReaction(account, jid, String(reaction.key?.id || ''), String(reaction.text || ''),
        fromMe ? 'You' : (String(message.pushName || key.participant || 'Contact').slice(0, 120)))
    }

    let sourceMessage = ''
    try {
        const serialized = JSON.stringify(message)
        if (serialized && Buffer.byteLength(serialized, 'utf8') <= 512 * 1024) sourceMessage = serialized
    } catch {}
    const record = {
      id, jid, fromMe, participant: String(key.participant || ''),
      pushName: String(message.pushName || '').slice(0, 120),
      timestamp: ts, type: extracted.type, text: extracted.text,
      mimeType: extracted.mimeType, fileName: extracted.fileName ? safeName(extracted.fileName) : '',
      size: extracted.size, duration: extracted.duration || 0, ptt: extracted.ptt === true,
      mediaFile: '', mediaUrl: '', sourceMessage,
      quotedMessageId: quotedMessageId(message),
      viewOnce: extracted.viewOnce, viewOnceViewed: false, status: '',
      reactions: [], starred: false,
    }
    if (extracted.media && extracted.size > MAX_MEDIA_BYTES) {
      record.mediaUnavailable = 'Media is larger than the Local Studio download limit.'
    } else if (extracted.media && !sourceMessage) {
      record.mediaUnavailable = 'This older or unsupported media message cannot be downloaded on demand.'
    }

    await persist(account, record)
    return record
  }

  async function listChats(id, { limit = 200, query = '' } = {}) {
    const account = accountId(id)
    const [rows, markersRaw] = await Promise.all([
      readRows(account),
      readFile(readMarkers[account], 'utf8').then(JSON.parse).catch(() => ({})),
    ])
    const lastByJid = new Map()
    const nameByJid = new Map()
    const unread = new Map()
    for (const row of rows) {
      const old = lastByJid.get(row.jid)
      if (!old || row.timestamp >= old.timestamp) lastByJid.set(row.jid, row)
      if (row.pushName && (!nameByJid.has(row.jid) || row.timestamp >= nameByJid.get(row.jid).timestamp)) nameByJid.set(row.jid, { name: row.pushName, timestamp: row.timestamp })
      if (!row.fromMe && row.timestamp > Number(markersRaw[row.jid] || 0)) {
        unread.set(row.jid, (unread.get(row.jid) || 0) + 1)
      }
    }
    const term = String(query || '').trim().toLowerCase()
    return [...lastByJid.values()]
      .filter(row => !term || row.jid.toLowerCase().includes(term) ||
        row.pushName.toLowerCase().includes(term) || row.text.toLowerCase().includes(term))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 200)))
      .map(row => ({
        jid: row.jid,
        name: nameByJid.get(row.jid)?.name || row.jid.replace(/@.*$/, ''),
        group: row.jid.endsWith('@g.us'),
        lastMessage: row.viewOnce ? 'View once · ' + (row.type === 'video' ? 'Video' : 'Photo') : row.text || (row.type === 'unsupported' ? 'Message' : 'Attachment · ' + row.type),
        lastMessageType: row.type, timestamp: row.timestamp,
        fromMe: row.fromMe, unreadCount: unread.get(row.jid) || 0,
      }))
  }

  async function getMessages(id, jidValue, { limit = 200, before = 0, after = 0, beforeId = '', afterId = '' } = {}) {
    const account = accountId(id)
    const jid = safeJid(jidValue)
    if (!jid) throw Object.assign(new Error('Invalid WhatsApp conversation.'), { status: 400 })
    const rows = await readRows(account)
    const maxBefore = Number(before) || Infinity
    const minAfter = Number(after) || 0
    const olderThanCursor = row => {
      if (!Number.isFinite(maxBefore)) return true
      if (row.timestamp < maxBefore) return true
      if (row.timestamp > maxBefore) return false
      return beforeId ? String(row.id).localeCompare(String(beforeId)) < 0 : false
    }
    const newerThanCursor = row => {
      if (!minAfter || row.timestamp > minAfter) return true
      if (row.timestamp < minAfter) return false
      // Older clients without a message-id cursor receive the inclusive
      // timestamp boundary; the composite primary key makes that safe.
      return afterId ? String(row.id).localeCompare(String(afterId)) > 0 : true
    }
    const pageLimit = Math.max(1, Math.min(500, Number(limit) || 200))
    const matching = rows.filter(row =>
      row.jid === jid && olderThanCursor(row) && newerThanCursor(row)
    ).sort((a, b) => a.timestamp - b.timestamp || String(a.id).localeCompare(String(b.id)))
    const isOlderPage = Number(before) > 0
    const isDeltaPage = Number(after) > 0
    const page = isOlderPage ? matching.slice(-pageLimit) : isDeltaPage ? matching.slice(0, pageLimit) : matching.slice(-pageLimit)
    return page.map(row => ({
        id: row.id, jid: row.jid, fromMe: row.fromMe, participant: row.participant,
        pushName: row.pushName, timestamp: row.timestamp, type: row.type, text: row.text,
        mimeType: row.mimeType, fileName: row.fileName, size: row.size, duration: row.duration || 0,
        mediaUrl: row.viewOnce ? '' : row.mediaFile ? row.mediaUrl || mediaUrl(account, row.id) : '',
        viewOnce: row.viewOnce === true, viewOnceViewed: row.viewOnceViewed === true,
        mediaUnavailable: row.mediaUnavailable || '', mediaAvailable: Boolean(row.sourceMessage && MEDIA_TYPES.has(row.type) && !row.mediaUnavailable),
        quotedMessageId: row.quotedMessageId || quotedMessageIdFromSource(row.sourceMessage),
        reactions: Array.isArray(row.reactions) ? row.reactions : [], starred: row.starred === true, ptt: row.ptt === true, status: row.status || '',
      }))
  }

  async function searchMessages(id, { query = '', limit = 60, jid: jidValue = '' } = {}) {
    const account = accountId(id)
    const term = String(query || '').trim().toLocaleLowerCase()
    if (term.length < 2) return []
    const rows = await readRows(account)
    const wantedJid = jidValue ? safeJid(jidValue) : ''
    if (jidValue && !wantedJid) throw Object.assign(new Error('Invalid WhatsApp conversation.'), { status: 400 })
    return rows
      .filter(row => (!wantedJid || row.jid === wantedJid) && [row.text, row.pushName, row.fileName, row.jid].some(value =>
        String(value || '').toLocaleLowerCase().includes(term)
      ))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, Math.max(1, Math.min(100, Number(limit) || 60)))
      .map(row => ({
        id: row.id, jid: row.jid, fromMe: row.fromMe, pushName: row.pushName,
        timestamp: row.timestamp, type: row.type, text: row.text,
        fileName: row.fileName,
      }))
  }

  async function getMessage(id, jidValue, messageId) {
    const account = accountId(id), jid = safeJid(jidValue), key = String(messageId || '')
    if (!jid || !/^[A-Za-z0-9_-]{1,256}$/.test(key)) throw Object.assign(new Error('Invalid message reference.'), { status: 400 })
    const rows = await readRows(account), row = rows.find(item => item.jid === jid && item.id === key)
    if (!row) return null
    let sourceMessage = null
    if (row.sourceMessage) {
      try { sourceMessage = reviveMessage(JSON.parse(row.sourceMessage)) } catch {}
    }
    if (!sourceMessage && ['conversation', 'extendedTextMessage'].includes(row.type) && row.text) {
      sourceMessage = { key: { remoteJid: row.jid, id: row.id, fromMe: row.fromMe === true, ...(row.participant ? { participant: row.participant } : {}) },
        message: { conversation: row.text }, messageTimestamp: Math.floor(row.timestamp / 1000), pushName: row.pushName || '' }
    }
    return { id: row.id, jid: row.jid, fromMe: row.fromMe, participant: row.participant,
      pushName: row.pushName, timestamp: row.timestamp, type: row.type, text: row.text,
      mimeType: row.mimeType, fileName: row.fileName, size: row.size, viewOnce: row.viewOnce === true,
      key: { remoteJid: row.jid, id: row.id, fromMe: row.fromMe === true, ...(row.participant ? { participant: row.participant } : {}) },
      starred: row.starred === true, sourceMessage }
  }

  function reviveMessage(value) {
    if (Array.isArray(value)) return value.map(reviveMessage)
    if (!value || typeof value !== 'object') return value
    if (value.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data)
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, reviveMessage(child)]))
  }

  async function downloadMessageMedia(id, jidValue, messageId, downloadMedia, socket) {
    const account = accountId(id), jid = safeJid(jidValue), key = String(messageId || '')
    if (!jid || !/^[A-Za-z0-9_-]{1,256}$/.test(key) || typeof downloadMedia !== 'function') {
      throw Object.assign(new Error('Invalid media request.'), { status: 400 })
    }
    return enqueue(account, async () => {
      const rows = await readRows(account), row = rows.find(item => item.jid === jid && item.id === key)
      if (!row || !MEDIA_TYPES.has(row.type) || row.viewOnceViewed) return null
      if (row.mediaFile && /^[a-f0-9]{64}\.[a-z0-9]{1,8}$/.test(row.mediaFile)) {
        const cachedPath = join(mediaRoot, account, row.mediaFile)
        const cachedInfo = await stat(cachedPath).catch(() => null)
        if (cachedInfo?.isFile() && cachedInfo.size <= MAX_MEDIA_BYTES) {
          return { id: row.id, mediaUrl: row.viewOnce ? '' : row.mediaUrl || mediaUrl(account, key), viewOnce: row.viewOnce === true }
        }
        row.mediaFile = ''
        row.mediaUrl = ''
      }
      if (!row.sourceMessage) return null
      if (row.size > MAX_MEDIA_BYTES) return null
      let source
      try { source = reviveMessage(JSON.parse(row.sourceMessage)) } catch { return null }
      try {
        const data = await downloadMedia(source, socket)
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data || [])
        if (!buffer.length || buffer.length > MAX_MEDIA_BYTES) {
          row.mediaUnavailable = 'Media exceeded the supported size limit.'
          row.sourceMessage = ''
          await rewriteRows(account, rows)
          return null
        }
        const digest = createHash('sha256').update(account + ':' + key).digest('hex')
        const extension = mediaExtension(row.mimeType, row.fileName)
        const storedName = digest + extension
        const full = join(mediaRoot, account, storedName)
        const temp = full + '.' + randomUUID() + '.tmp'
        await writeFile(temp, buffer, { flag: 'wx', mode: 0o600 })
        await rename(temp, full)
        row.mediaFile = storedName; row.size = buffer.length
        row.mediaUrl = row.viewOnce ? '' : mediaUrl(account, key)
        row.sourceMessage = ''
        if (!row.fileName) row.fileName = 'WhatsApp ' + row.type + extension
        await rewriteRows(account, rows)
        return { id: row.id, mediaUrl: row.mediaUrl, viewOnce: row.viewOnce === true }
      } catch (error) {
        logger.warn?.({ event: 'chat-media.download-failed', accountId: account, messageId: key, error: String(error?.message || error).slice(0, 160) })
        row.mediaUnavailable = 'WhatsApp media is no longer available to download.'
        row.sourceMessage = ''
        await rewriteRows(account, rows)
        throw Object.assign(new Error(row.mediaUnavailable), { status: 410 })
      }
    })
  }

  async function applyReaction(id, jidValue, messageId, emoji, actor = 'You') {
    const account = accountId(id), jid = safeJid(jidValue), key = String(messageId || '')
    if (!jid || !/^[A-Za-z0-9_-]{1,256}$/.test(key)) throw Object.assign(new Error('Invalid message reference.'), { status: 400 })
    return enqueue(account, async () => {
      const rows = await readRows(account), row = rows.find(item => item.jid === jid && item.id === key)
      if (!row) return null
      const reactions = Array.isArray(row.reactions) ? row.reactions.filter(item => item.actor !== actor) : []
      if (emoji) reactions.push({ actor: String(actor).slice(0, 120), emoji: String(emoji).slice(0, 16) })
      row.reactions = reactions
      await rewriteRows(account, rows)
      return reactions
    })
  }

  async function deleteMessage(id, jidValue, messageId) {
    const account = accountId(id), jid = safeJid(jidValue), key = String(messageId || '')
    if (!jid || !/^[A-Za-z0-9_-]{1,256}$/.test(key)) throw Object.assign(new Error('Invalid message reference.'), { status: 400 })
    return enqueue(account, async () => {
      const rows = await readRows(account), index = rows.findIndex(item => item.jid === jid && item.id === key)
      if (index < 0) return false
      const [removed] = rows.splice(index, 1)
      await recordDeleted(account, jid, key)
      if (removed.mediaFile && /^[a-f0-9]{64}\.[a-z0-9]{1,8}$/.test(removed.mediaFile)) {
        await unlink(join(mediaRoot, account, removed.mediaFile)).catch(() => {})
      }
      await rewriteRows(account, rows)
      return true
    })
  }

  async function markMessageDeletedRemotely(id, jidValue, messageId) {
    const account = accountId(id), jid = safeJid(jidValue), key = String(messageId || '')
    if (!jid || !/^[A-Za-z0-9_-]{1,256}$/.test(key)) throw Object.assign(new Error('Invalid message reference.'), { status: 400 })
    return enqueue(account, async () => {
      const rows = await readRows(account)
      const row = rows.find(item => item.jid === jid && item.id === key)
      if (!row || row.fromMe === true || row.deletedByRemote === true) return Boolean(row?.deletedByRemote)
      row.deletedByRemote = true
      row.deletedAt = Date.now()
      // Keep the original message body and its server-side media reference.
      // This is an informational marker, not a local delete/tombstone.
      await rewriteRows(account, rows)
      return true
    })
  }

  async function updateMessageStatus(id, jidValue, messageId, status) {
    const account = accountId(id), jid = safeJid(jidValue), key = String(messageId || '')
    if (!jid || !/^[A-Za-z0-9_-]{1,256}$/.test(key)) throw Object.assign(new Error('Invalid message reference.'), { status: 400 })
    const value = String(status || '').toLowerCase()
    if (!['pending', 'sent', 'delivered', 'read', 'failed'].includes(value)) return null
    return enqueue(account, async () => {
      const rows = await readRows(account), row = rows.find(item => item.jid === jid && item.id === key)
      if (!row || row.viewOnceViewed === true || row.status === value) return row || null
      row.status = value
      await rewriteRows(account, rows)
      return { id: row.id, jid: row.jid, status: row.status }
    })
  }

  async function deleteConversationMessages(id, jidValue) {
    const account = accountId(id), jid = safeJid(jidValue)
    if (!jid) throw Object.assign(new Error('Invalid WhatsApp conversation.'), { status: 400 })
    return enqueue(account, async () => {
      const rows = await readRows(account)
      const removed = rows.filter(row => row.jid === jid)
      if (!removed.length) return 0
      for (const row of removed) {
        await recordDeleted(account, jid, row.id)
        if (row.mediaFile && /^[a-f0-9]{64}\.[a-z0-9]{1,8}$/.test(row.mediaFile)) {
          await unlink(join(mediaRoot, account, row.mediaFile)).catch(() => {})
        }
      }
      await rewriteRows(account, rows.filter(row => row.jid !== jid))
      for (const row of removed) knownMessageKeys.get(account)?.delete(jid + '|' + row.id)
      return removed.length
    })
  }

  async function setStarred(id, jidValue, messageId, starred) {
    const account = accountId(id), jid = safeJid(jidValue), key = String(messageId || '')
    if (!jid || !/^[A-Za-z0-9_-]{1,256}$/.test(key)) throw Object.assign(new Error('Invalid message reference.'), { status: 400 })
    return enqueue(account, async () => {
      const rows = await readRows(account), row = rows.find(item => item.jid === jid && item.id === key)
      if (!row) return null
      row.starred = starred === true
      await rewriteRows(account, rows)
      return { id: row.id, starred: row.starred }
    })
  }

  async function listStarredMessages(id, { limit = 200 } = {}) {
    const account = accountId(id), rows = await readRows(account)
    return rows.filter(row => row.starred === true)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 200)))
      .map(row => ({
        id: row.id, jid: row.jid, fromMe: row.fromMe, pushName: row.pushName,
        timestamp: row.timestamp, type: row.type, text: row.text, fileName: row.fileName,
        mediaUrl: row.viewOnce ? '' : row.mediaFile ? row.mediaUrl || mediaUrl(account, row.id) : '',
      }))
  }

  async function getMediaGallery(id, jidValue, { limit = 300 } = {}) {
    const account = accountId(id), jid = safeJid(jidValue)
    if (!jid) throw Object.assign(new Error('Invalid WhatsApp conversation.'), { status: 400 })
    const rows = await readRows(account)
    return rows.filter(row => row.jid === jid && MEDIA_TYPES.has(row.type) && row.viewOnce !== true)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 300)))
      .map(row => ({
        id: row.id, type: row.type, text: row.text, fileName: row.fileName,
        mimeType: row.mimeType, size: row.size, timestamp: row.timestamp,
        mediaUrl: row.mediaFile ? row.mediaUrl || mediaUrl(account, row.id) : '',
        mediaAvailable: Boolean(row.sourceMessage && !row.mediaUnavailable), mediaUnavailable: row.mediaUnavailable || '',
      }))
  }

  async function exportConversation(id, jidValue, { limit = 500 } = {}) {
    const account = accountId(id), jid = safeJid(jidValue)
    if (!jid) throw Object.assign(new Error('Invalid WhatsApp conversation.'), { status: 400 })
    const rows = await readRows(account)
    return rows.filter(row => row.jid === jid)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-Math.max(1, Math.min(5000, Number(limit) || 500)))
      .map(row => ({
        id: row.id, jid: row.jid, fromMe: row.fromMe, participant: row.participant,
        pushName: row.pushName, timestamp: row.timestamp, type: row.type, text: row.text,
        mimeType: row.mimeType, fileName: row.fileName, size: row.size, duration: row.duration || 0,
        starred: row.starred === true, reactions: Array.isArray(row.reactions) ? row.reactions : [],
        mediaUrl: row.viewOnce ? '' : row.mediaFile ? row.mediaUrl || mediaUrl(account, row.id) : '',
        mediaAvailable: Boolean(row.sourceMessage && MEDIA_TYPES.has(row.type) && !row.mediaUnavailable),
        mediaUnavailable: row.mediaUnavailable || '',
      }))
  }

  async function markUnread(id, jidValue) {
    const account = accountId(id), jid = safeJid(jidValue)
    if (!jid) throw Object.assign(new Error('Invalid WhatsApp conversation.'), { status: 400 })
    const rows = await readRows(account)
    const latestIncoming = rows.filter(row => row.jid === jid && !row.fromMe)
      .reduce((max, row) => Math.max(max, Number(row.timestamp) || 0), 0)
    const markers = await readFile(readMarkers[account], 'utf8').then(JSON.parse).catch(() => ({}))
    markers[jid] = Math.max(0, latestIncoming - 1)
    await writeReadMarkers(account, markers)
    return { jid, unreadCount: rows.filter(row => row.jid === jid && !row.fromMe && row.timestamp > markers[jid]).length }
  }

  async function hasConversation(id, jidValue) {
    const account = accountId(id), jid = safeJid(jidValue)
    if (!jid) return false
    const rows = await readRows(account)
    return rows.some(row => row.jid === jid)
  }

  async function getMedia(id, messageId) {
    const account = accountId(id)
    const key = String(messageId || '')
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(key)) throw Object.assign(new Error('Invalid media identifier.'), { status: 400 })
    const rows = await readRows(account)
    const row = rows.find(item => item.id === key && item.mediaFile && item.viewOnce !== true)
    if (!row || !/^[a-f0-9]{64}\.[a-z0-9]{1,8}$/.test(row.mediaFile)) return null
    const full = join(mediaRoot, account, row.mediaFile)
    const info = await stat(full).catch(() => null)
    if (!info?.isFile() || info.size > MAX_MEDIA_BYTES) return null
    return { path: full, jid: row.jid, mimeType: row.mimeType || 'application/octet-stream', fileName: row.fileName || 'attachment', size: info.size }
  }

  async function getViewOnceInfo(id, messageId) {
    const account = accountId(id)
    const key = String(messageId || '')
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(key)) throw Object.assign(new Error('Invalid media identifier.'), { status: 400 })
    const rows = await readRows(account)
    const row = rows.find(item => item.id === key && item.viewOnce === true)
    if (!row) return null
    return { jid: row.jid, viewed: row.viewOnceViewed === true, mimeType: row.mimeType || '' }
  }

  async function rewriteRows(account, rows) {
    const temporary = files[account] + '.' + randomUUID() + '.tmp'
    try {
      const content = rows.length ? rows.map(row => JSON.stringify(row)).join('\n') + '\n' : ''
      await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      await rename(temporary, files[account])
      await chmod(files[account], 0o600)
    } finally {
      await unlink(temporary).catch(() => {})
    }
  }

  async function consumeViewOnceMedia(id, messageId) {
    const account = accountId(id)
    const key = String(messageId || '')
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(key)) throw Object.assign(new Error('Invalid media identifier.'), { status: 400 })
    return enqueue(account, async () => {
      const rows = await readRows(account)
      const row = rows.find(item => item.id === key && item.viewOnce === true)
      if (!row || row.viewOnceViewed === true || !/^[a-f0-9]{64}\.[a-z0-9]{1,8}$/.test(String(row.mediaFile || ''))) return null
      const full = join(mediaRoot, account, row.mediaFile)
      const info = await stat(full).catch(() => null)
      if (!info?.isFile() || info.size <= 0 || info.size > MAX_MEDIA_BYTES) return null
      const buffer = await readFile(full).catch(() => null)
      if (!buffer?.length || buffer.length > MAX_MEDIA_BYTES) return null

      // Persist the consumed state before responding. All consumers are serialized
      // per account, and the ordinary media endpoint refuses view-once records.
      row.viewOnceViewed = true
      row.mediaFile = ''
      row.mediaUrl = ''
      row.mediaUnavailable = 'This view-once media has already been opened.'
      await rewriteRows(account, rows)
      await unlink(full).catch(error => {
        logger.warn?.({ event: 'chat-media.view-once-cleanup-failed', accountId: account, messageId: key, error: String(error?.message || error).slice(0, 160) })
      })
      return {
        buffer, jid: row.jid, mimeType: row.mimeType || 'application/octet-stream',
        fileName: row.fileName || 'view-once-media', size: buffer.length,
      }
    })
  }

  async function markRead(id, jidValue) {
    const account = accountId(id), jid = safeJid(jidValue)
    if (!jid) throw Object.assign(new Error('Invalid WhatsApp conversation.'), { status: 400 })
    const rows = await readRows(account)
    const latest = rows.filter(row => row.jid === jid).reduce((max, row) => Math.max(max, row.timestamp), 0)
    const markers = await readFile(readMarkers[account], 'utf8').then(JSON.parse).catch(() => ({}))
    markers[jid] = latest || Date.now()
    await writeReadMarkers(account, markers)
    return { jid, readThrough: markers[jid] }
  }


  async function recordOutgoingMedia({ sessionId, jid: jidValue, buffer, mimeType, fileName, sendResult, text = '', ptt = false, duration = 0 } = {}) {
    const account = accountId(sessionId), jid = safeJid(jidValue)
    const id = String(sendResult?.key?.id || '')
    if (!jid || !id || !Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_MEDIA_BYTES) {
      throw Object.assign(new Error('Invalid outgoing media record.'), { status: 400 })
    }
    await ensureReady(account)
    const digest = createHash('sha256').update(account + ':' + id).digest('hex')
    const extension = mediaExtension(mimeType, fileName)
    const storedName = digest + extension
    const full = join(mediaRoot, account, storedName)
    const temp = full + '.' + randomUUID() + '.tmp'
    await writeFile(temp, buffer, { flag: 'wx', mode: 0o600 })
    await rename(temp, full)
    const type = String(mimeType || '').startsWith('image/') ? (mimeType === 'image/webp' ? 'sticker' : 'image')
      : String(mimeType || '').startsWith('video/') ? 'video'
      : String(mimeType || '').startsWith('audio/') ? 'audio' : 'document'
    const record = {
      id, jid, fromMe: true, participant: '', pushName: 'You', timestamp: Date.now(),
      type, text: String(text || '').slice(0, MAX_TEXT), mimeType: String(mimeType || ''),
      fileName: safeName(fileName), size: buffer.length, duration: Math.max(0, Number(duration) || 0), mediaFile: storedName,
      mediaUrl: mediaUrl(account, id), status: 'sent', ptt: ptt === true, reactions: [],
    }
    await persist(account, record)
    return record
  }

  async function metrics() {
    const now = Date.now(), hourlyMessages = Array(24).fill(0)
    let messagesLast24h = 0, totalMessages = 0
    for (const id of ACCOUNTS) {
      const rows = await readRows(id)
      totalMessages += rows.length
      for (const row of rows) {
        const age = now - Number(row.timestamp || 0)
        if (age < 0 || age >= 24 * 60 * 60 * 1000) continue
        messagesLast24h += 1
        const bucket = 23 - Math.min(23, Math.floor(age / (60 * 60 * 1000)))
        hourlyMessages[bucket] += 1
      }
    }
    return { messagesLast24h, totalMessages, hourlyMessages }
  }

  async function mediaUsage() {
    await init()
    let total = 0, count = 0
    async function visit(directory) {
      const { readdir } = await import('node:fs/promises')
      const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        const full = join(directory, entry.name)
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) await visit(full)
        else if (entry.isFile()) {
          const info = await stat(full).catch(() => null)
          if (info) { total += info.size; count += 1 }
        }
      }
    }
    await visit(mediaRoot)
    return { bytes: total, files: count }
  }

  return { init, recordMessage, recordOutgoingMedia, listChats, getMessages, searchMessages, getMessage, downloadMessageMedia, applyReaction, updateMessageStatus, markMessageDeletedRemotely, setStarred, listStarredMessages, getMediaGallery, exportConversation, markUnread, deleteMessage, deleteConversationMessages, listDeletedMessageIds, beginIdempotentSend, completeIdempotentSend, getIdempotentSend, hasConversation, getMedia, getViewOnceInfo, consumeViewOnceMedia, markRead, mediaUsage, metrics }
}
