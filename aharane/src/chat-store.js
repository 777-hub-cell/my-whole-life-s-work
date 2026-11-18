import { appendFile, chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { basename, extname, join } from 'node:path'

const ACCOUNTS = new Set(['private', 'public'])
const MAX_TEXT = 12000
const MAX_MEDIA_BYTES = 24 * 1024 * 1024
const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'sticker', 'document'])
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
  for (let i = 0; i < 5; i += 1) {
    const next = current.ephemeralMessage?.message
      || current.viewOnceMessage?.message
      || current.viewOnceMessageV2?.message
      || current.documentWithCaptionMessage?.message
      || current.editedMessage?.message
    if (!next) break
    current = next
  }
  return current
}
function messageContent(message) {
  const body = unwrap(message?.message)
  const pairs = [
    ['conversation', 'conversation'], ['extendedTextMessage', 'extendedTextMessage'],
    ['imageMessage', 'image'], ['videoMessage', 'video'], ['audioMessage', 'audio'],
    ['stickerMessage', 'sticker'], ['documentMessage', 'document'],
    ['contactMessage', 'contact'], ['locationMessage', 'location'],
    ['liveLocationMessage', 'location'], ['pollCreationMessage', 'poll'],
    ['pollCreationMessageV3', 'poll'], ['reactionMessage', 'reaction'],
    ['buttonsResponseMessage', 'response'], ['listResponseMessage', 'response'],
    ['templateButtonReplyMessage', 'response'],
  ]
  for (const [key, type] of pairs) {
    if (!body[key]) continue
    const value = body[key]
    const text = typeof value === 'string' ? value
      : String(value.text || value.caption || value.name || value.selectedDisplayText || value.comment || '')
    const mimeType = String(value.mimetype || '')
    const fileName = String(value.fileName || '')
    const size = Number(value.fileLength?.toString?.() || value.fileLength || 0) || 0
    return { type, text: text.slice(0, MAX_TEXT), mimeType, fileName, size, media: MEDIA_TYPES.has(type) }
  }
  return { type: 'unsupported', text: '', mimeType: '', fileName: '', size: 0, media: false }
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
  const queues = new Map()
  const ready = new Set()

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
    await init()
    ready.add(account)
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
      const rows = await readRows(account)
      if (rows.some(row => row.id === record.id && row.jid === record.jid)) return record
      await appendFile(files[account], JSON.stringify(record) + '\n', { encoding: 'utf8', mode: 0o600 })
      await chmod(files[account], 0o600)
      return record
    })
  }

  async function recordMessage({ sessionId, message, socket, downloadMedia } = {}) {
    const account = accountId(sessionId)
    const key = message?.key || {}
    const jid = safeJid(key.remoteJid)
    const id = String(key.id || '').slice(0, 256)
    if (!jid || !id || !message?.message) return null
    const extracted = messageContent(message)
    const ts = timestamp(message.messageTimestamp)
    const fromMe = key.fromMe === true
    const record = {
      id, jid, fromMe, participant: String(key.participant || ''),
      pushName: String(message.pushName || '').slice(0, 120),
      timestamp: ts, type: extracted.type, text: extracted.text,
      mimeType: extracted.mimeType, fileName: extracted.fileName ? safeName(extracted.fileName) : '',
      size: extracted.size, mediaFile: '', mediaUrl: '', status: '',
    }

    if (extracted.media && typeof downloadMedia === 'function' &&
        (!extracted.size || extracted.size <= MAX_MEDIA_BYTES)) {
      try {
        const data = await downloadMedia(message, socket)
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data || [])
        if (buffer.length && buffer.length <= MAX_MEDIA_BYTES) {
          const digest = createHash('sha256').update(account + ':' + id).digest('hex')
          const extension = mediaExtension(extracted.mimeType, extracted.fileName)
          const storedName = digest + extension
          const full = join(mediaRoot, account, storedName)
          const temp = full + '.' + randomUUID() + '.tmp'
          await writeFile(temp, buffer, { flag: 'wx', mode: 0o600 })
          await rename(temp, full)
          record.mediaFile = storedName
          record.size = buffer.length
          record.mediaUrl = mediaUrl(account, id)
          if (!record.fileName) record.fileName = 'WhatsApp ' + extracted.type + extension
        } else {
          record.mediaUnavailable = 'Media exceeded the supported size limit.'
        }
      } catch (error) {
        logger.warn?.({ event: 'chat-media.download-failed', accountId: account, messageId: id, error: String(error?.message || error).slice(0, 160) })
        record.mediaUnavailable = 'WhatsApp media is no longer available to download.'
      }
    } else if (extracted.media) {
      record.mediaUnavailable = extracted.size > MAX_MEDIA_BYTES
        ? 'Media is larger than the Local Studio download limit.'
        : 'Media download is not available for this message.'
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
    const unread = new Map()
    for (const row of rows) {
      const old = lastByJid.get(row.jid)
      if (!old || row.timestamp >= old.timestamp) lastByJid.set(row.jid, row)
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
        name: row.pushName || row.jid.replace(/@.*$/, ''),
        group: row.jid.endsWith('@g.us'),
        lastMessage: row.text || (row.type === 'unsupported' ? 'Message' : 'Attachment · ' + row.type),
        lastMessageType: row.type, timestamp: row.timestamp,
        fromMe: row.fromMe, unreadCount: unread.get(row.jid) || 0,
      }))
  }

  async function getMessages(id, jidValue, { limit = 200, before = 0 } = {}) {
    const account = accountId(id)
    const jid = safeJid(jidValue)
    if (!jid) throw Object.assign(new Error('Invalid WhatsApp conversation.'), { status: 400 })
    const rows = await readRows(account)
    const maxBefore = Number(before) || Infinity
    return rows.filter(row => row.jid === jid && row.timestamp < maxBefore)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-Math.max(1, Math.min(500, Number(limit) || 200)))
      .map(row => ({
        id: row.id, jid: row.jid, fromMe: row.fromMe, participant: row.participant,
        pushName: row.pushName, timestamp: row.timestamp, type: row.type, text: row.text,
        mimeType: row.mimeType, fileName: row.fileName, size: row.size,
        mediaUrl: row.mediaFile ? row.mediaUrl || mediaUrl(account, row.id) : '',
        mediaUnavailable: row.mediaUnavailable || '', status: row.status || '',
      }))
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
    const row = rows.find(item => item.id === key && item.mediaFile)
    if (!row || !/^[a-f0-9]{64}\.[a-z0-9]{1,8}$/.test(row.mediaFile)) return null
    const full = join(mediaRoot, account, row.mediaFile)
    const info = await stat(full).catch(() => null)
    if (!info?.isFile() || info.size > MAX_MEDIA_BYTES) return null
    return { path: full, mimeType: row.mimeType || 'application/octet-stream', fileName: row.fileName || 'attachment', size: info.size }
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


  async function recordOutgoingMedia({ sessionId, jid: jidValue, buffer, mimeType, fileName, sendResult, text = '' } = {}) {
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
      fileName: safeName(fileName), size: buffer.length, mediaFile: storedName,
      mediaUrl: mediaUrl(account, id), status: 'sent',
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

  return { init, recordMessage, recordOutgoingMedia, listChats, getMessages, hasConversation, getMedia, markRead, mediaUsage, metrics }
}
