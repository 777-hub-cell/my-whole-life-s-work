import { mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { timingSafeEqual } from 'node:crypto'
import express from 'express'
import pino from 'pino'
import makeWASocket, { Browsers, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys'
import {
  commandResponse,
  isAllowedInbound,
  isSafeMessageUpsert,
  normalizePhone,
  parseAllowedSenders,
} from './policy.js'

const APP_NAME = 'Aharane'
const HOST = process.env.AHARANE_HOST || '127.0.0.1'
const PORT = Number(process.env.AHARANE_PORT || 8790)
const DATA_DIR = resolve(process.env.AHARANE_DATA_DIR || '/var/lib/aharane')
const AUTH_DIR = join(DATA_DIR, 'whatsapp-auth')
const ADMIN_TOKEN = String(process.env.AHARANE_ADMIN_TOKEN || '')
const OWNER_NUMBER = String(process.env.AHARANE_OWNER_NUMBER || '')
const EXTRA_ALLOWED_SENDERS = String(process.env.AHARANE_ALLOWED_SENDERS || '')
const ALLOWED_SENDERS = parseAllowedSenders([OWNER_NUMBER, EXTRA_ALLOWED_SENDERS].filter(Boolean).join(','))
const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

if (HOST !== '127.0.0.1') {
  throw new Error('AHARANE_HOST must remain bound to 127.0.0.1')
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('AHARANE_PORT must be a valid TCP port')
}
if (ADMIN_TOKEN.length < 32) {
  throw new Error('AHARANE_ADMIN_TOKEN must contain at least 32 characters')
}

await mkdir(DATA_DIR, { recursive: true, mode: 0o700 })
await mkdir(AUTH_DIR, { recursive: true, mode: 0o700 })

let socket = null
let socketReady = Promise.resolve()
let state = 'starting'
let registered = false
let reconnectAttempts = 0
let lastConnectedAt = 0
let reconnectTimer = null
let startPromise = null
let pairRequestActive = false
let shuttingDown = false

const seenMessageIds = new Map()
const commandTimes = new Map()
const pairAttempts = new Map()

function waitWithTimeout(promise, timeoutMs, message) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs) }),
  ]).finally(() => clearTimeout(timer))
}

function tokenMatches(candidate) {
  const supplied = Buffer.from(String(candidate || ''))
  const expected = Buffer.from(ADMIN_TOKEN)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

function requireAdmin(req, res, next) {
  const authorization = String(req.get('authorization') || '')
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  if (!match || !tokenMatches(match[1])) {
    res.status(401).json({ ok: false, error: 'Admin authentication required' })
    return
  }
  next()
}

function allowPairAttempt(ip) {
  const now = Date.now()
  const windowMs = 15 * 60 * 1000
  const current = pairAttempts.get(ip)
  const record = !current || now - current.startedAt >= windowMs
    ? { startedAt: now, count: 0 }
    : current
  record.count += 1
  pairAttempts.set(ip, record)
  for (const [key, value] of pairAttempts) {
    if (now - value.startedAt >= windowMs) pairAttempts.delete(key)
  }
  return record.count <= 4
}

function allowCommand(sender) {
  const now = Date.now()
  const previous = commandTimes.get(sender) || 0
  if (now - previous < 1200) return false
  commandTimes.set(sender, now)
  if (commandTimes.size > 500) {
    for (const [key, at] of commandTimes) if (now - at > 60_000) commandTimes.delete(key)
  }
  return true
}

function textFromMessage(message) {
  const content = message?.message?.ephemeralMessage?.message
    || message?.message?.viewOnceMessageV2?.message
    || message?.message
    || {}
  return String(
    content.conversation
    || content.extendedTextMessage?.text
    || content.imageMessage?.caption
    || content.videoMessage?.caption
    || ''
  ).trim()
}

function markMessageSeen(id) {
  if (!id) return false
  if (seenMessageIds.has(id)) return true
  seenMessageIds.set(id, Date.now())
  if (seenMessageIds.size > 1500) {
    const first = seenMessageIds.keys().next().value
    seenMessageIds.delete(first)
  }
  return false
}

async function handleMessages(currentSocket, event) {
  if (!isSafeMessageUpsert(event)) return
  for (const message of event.messages) {
    if (!message?.message || message.key?.fromMe) continue
    if (markMessageSeen(message.key?.id)) continue

    const remoteJid = String(message.key?.remoteJid || '')
    if (!isAllowedInbound({ remoteJid, fromMe: false, allowedSenders: ALLOWED_SENDERS })) continue

    const text = textFromMessage(message)
    const reply = commandResponse(text)
    if (!reply) continue

    const sender = remoteJid.slice(0, remoteJid.indexOf('@'))
    if (!allowCommand(sender)) continue

    try {
      await currentSocket.sendMessage(remoteJid, { text: reply }, { quoted: message })
    } catch {
      logger.warn({ event: 'message.reply-failed' })
    }
  }
}

function scheduleReconnect() {
  if (shuttingDown || reconnectTimer || state === 'needs-pairing') return
  reconnectAttempts += 1
  if (reconnectAttempts > 12) {
    state = 'degraded'
    logger.error({ event: 'whatsapp.reconnect-limit-reached' })
    return
  }
  const delayMs = Math.min(60_000, 2_000 * (2 ** Math.min(5, reconnectAttempts - 1)))
  state = 'reconnecting'
  logger.warn({ event: 'whatsapp.reconnect-scheduled', attempt: reconnectAttempts, delayMs })
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void startSocket().catch(() => {
      state = 'degraded'
      scheduleReconnect()
    })
  }, delayMs)
  reconnectTimer.unref?.()
}

async function startSocket() {
  if (shuttingDown) return null
  if (socket) return socket
  if (startPromise) return startPromise

  startPromise = (async () => {
    const auth = await useMultiFileAuthState(AUTH_DIR)
    registered = auth.state.creds.registered === true
    let signalReady
    socketReady = new Promise(resolveReady => { signalReady = resolveReady })

    const currentSocket = makeWASocket({
      auth: auth.state,
      logger,
      browser: Browsers.macOS(APP_NAME),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      generateHighQualityLinkPreview: false,
    })
    socket = currentSocket
    state = registered ? 'connecting' : 'pairing'

    currentSocket.ev.on('creds.update', () => {
      registered = auth.state.creds.registered === true
      void auth.saveCreds().catch(() => logger.warn({ event: 'auth.save-failed' }))
    })

    currentSocket.ev.on('connection.update', update => {
      if (update?.qr || update?.connection === 'connecting' || update?.connection === 'open') {
        signalReady?.()
        signalReady = null
      }
      if (update?.connection === 'open') {
        registered = true
        state = 'connected'
        reconnectAttempts = 0
        lastConnectedAt = Date.now()
        logger.info({ event: 'whatsapp.connected' })
      }
      if (update?.connection === 'close') {
        const code = update.lastDisconnect?.error?.output?.statusCode
        socket = null
        if (code === DisconnectReason.loggedOut || code === 401) {
          registered = false
          state = 'needs-pairing'
          logger.error({ event: 'whatsapp.auth-rejected' })
          return
        }
        state = 'disconnected'
        logger.warn({ event: 'whatsapp.connection-closed', code: Number.isFinite(code) ? code : null })
        scheduleReconnect()
      }
    })

    currentSocket.ev.on('messages.upsert', event => {
      void handleMessages(currentSocket, event).catch(() => {
        logger.warn({ event: 'message.handler-failed' })
      })
    })

    logger.info({ event: 'whatsapp.socket-started', registered })
    return currentSocket
  })()

  try {
    return await startPromise
  } finally {
    startPromise = null
  }
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '8kb', strict: true }))
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, max-age=0')
  res.set('Pragma', 'no-cache')
  next()
})
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, service: 'aharane' })
})
app.get('/api/status', requireAdmin, (_req, res) => {
  res.json({
    ok: true,
    service: APP_NAME,
    state,
    connected: state === 'connected',
    registered,
    reconnectAttempts,
    lastConnectedAt: lastConnectedAt || null,
    allowlistedSenderCount: ALLOWED_SENDERS.size,
    groupsEnabled: false,
  })
})
app.post('/api/pair-code', requireAdmin, async (req, res) => {
  if (pairRequestActive) {
    res.status(409).json({ ok: false, error: 'A pairing request is already in progress' })
    return
  }
  const ip = String(req.ip || 'local')
  if (!allowPairAttempt(ip)) {
    res.status(429).json({ ok: false, error: 'Pairing rate limit reached; try again later' })
    return
  }
  const phoneNumber = normalizePhone(req.body?.phoneNumber)
  if (!phoneNumber) {
    res.status(400).json({ ok: false, error: 'Enter a valid international phone number using 7 to 15 digits' })
    return
  }
  if (registered) {
    res.status(409).json({ ok: false, error: 'Aharane is already paired; disconnect the existing linked device before pairing another number' })
    return
  }
  if (state === 'needs-pairing') {
    res.status(409).json({ ok: false, error: 'WhatsApp rejected this saved session. Back up and repair only Aharane authentication before pairing again.' })
    return
  }

  pairRequestActive = true
  try {
    const currentSocket = socket || await startSocket()
    if (!currentSocket) throw new Error('WhatsApp socket is unavailable')
    await waitWithTimeout(socketReady, 12_000, 'WhatsApp connection is not ready; retry shortly')
    const pairingCode = await currentSocket.requestPairingCode(phoneNumber)
    state = 'pairing'
    res.json({ ok: true, pairingCode: String(pairingCode).replace(/\s/g, '') })
  } catch {
    res.status(503).json({ ok: false, error: 'Pairing code could not be generated. Check the server connection and retry shortly.' })
  } finally {
    pairRequestActive = false
  }
})
app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url)), {
  index: 'index.html',
  fallthrough: true,
  etag: false,
  maxAge: 0,
}))

const server = app.listen(PORT, HOST, () => {
  logger.info({ event: 'http.listening', host: HOST, port: PORT })
})
server.on('error', error => {
  logger.error({ event: 'http.server-failed', code: error?.code || 'unknown' })
  process.exitCode = 1
})

await startSocket().catch(() => {
  state = 'degraded'
  logger.error({ event: 'whatsapp.initial-start-failed' })
  scheduleReconnect()
})

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  state = 'stopping'
  if (reconnectTimer) clearTimeout(reconnectTimer)
  try { socket?.end?.(undefined) } catch {}
  await new Promise(resolveClose => server.close(() => resolveClose()))
  logger.info({ event: 'process.stopped', signal })
}

process.once('SIGTERM', () => { void shutdown('SIGTERM') })
process.once('SIGINT', () => { void shutdown('SIGINT') })

if (ALLOWED_SENDERS.size === 0) {
  logger.warn({ event: 'security.inbound-deny-all', reason: 'No WhatsApp sender allowlist is configured' })
}
