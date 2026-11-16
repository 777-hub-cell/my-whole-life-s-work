import { appendFile, cp, lstat, mkdir, open, readFile, realpath, readdir, rename, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { constants as fsConstants, createReadStream } from 'node:fs'
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve, join, dirname, sep, relative, isAbsolute, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { WebSocket, WebSocketServer } from 'ws'
import pino from 'pino'
import makeWASocket, { Browsers, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys'
import {
  commandResponse,
  isAllowedInbound,
  isSafeMessageUpsert,
  normalizePhone,
  parseAllowedSenders,
} from './policy.js'
import { compareUpdateContents, extractUpdateArchive, inspectUpdateArchive, MAX_ARCHIVE_BYTES } from './update-manager.js'

const APP_NAME = 'Aharane'
const HOST = process.env.AHARANE_HOST || '127.0.0.1'
const PORT = Number(process.env.AHARANE_PORT || 8790)
const DATA_DIR = resolve(process.env.AHARANE_DATA_DIR || '/var/lib/aharane')
const AUTH_DIR = join(DATA_DIR, 'whatsapp-auth')
const ADMIN_TOKEN = String(process.env.AHARANE_ADMIN_TOKEN || '')
const OWNER_NUMBER = String(process.env.AHARANE_OWNER_NUMBER || '')
const EXTRA_ALLOWED_SENDERS = String(process.env.AHARANE_ALLOWED_SENDERS || '')
const ALLOWED_SENDERS = parseAllowedSenders([OWNER_NUMBER, EXTRA_ALLOWED_SENDERS].filter(Boolean).join(','))
const APP_BASE = resolve('/opt/aharane')
const CURRENT_RELEASE = join(APP_BASE, 'current')
const RELEASES_DIR = join(APP_BASE, 'releases')
const UPDATE_DIR = join(DATA_DIR, 'updates')
const UPLOADS_DIR = join(UPDATE_DIR, 'uploads')
const UPDATE_STATE_FILE = join(UPDATE_DIR, 'state.json')
const MANUAL_EDIT_STATE_FILE = join(UPDATE_DIR, 'manual-edit-state.json')
const UPDATE_CHUNK_BYTES = 1024 * 1024
const MAX_SOURCE_FILE_BYTES = 512 * 1024
const SOURCE_DIRS = new Set(['src', 'public', 'scripts', 'test', 'examples'])
const SOURCE_ROOT_FILES = new Set(['README.md', 'UPDATE-PACKAGE.md', 'LICENSE', 'AGENTS.md', 'package.json'])
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json', '.md', '.html', '.css', '.txt', '.yml', '.yaml'])
const execFileAsync = promisify(execFile)
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
await mkdir(UPDATE_DIR, { recursive: true, mode: 0o700 })
await mkdir(UPLOADS_DIR, { recursive: true, mode: 0o700 })

let socket = null
let socketReady = Promise.resolve()
let state = 'starting'
let registered = false
let reconnectAttempts = 0
let lastConnectedAt = 0
let reconnectTimer = null
let startPromise = null
let pairRequestActive = false
let updateInProgress = false
let shuttingDown = false

const seenMessageIds = new Map()
const commandTimes = new Map()
const pairAttempts = new Map()
const studioClients = new Set()
let studioEventSequence = 0

function studioRuntimeSnapshot() {
  return {
    state,
    connected: state === 'connected',
    registered,
    reconnectAttempts,
    lastConnectedAt: lastConnectedAt || null,
    allowlistedSenderCount: ALLOWED_SENDERS.size,
    groupsEnabled: false,
  }
}

function publishStudioEvent(type, data = {}) {
  const event = {
    id: ++studioEventSequence,
    type,
    at: new Date().toISOString(),
    data,
  }
  const payload = JSON.stringify(event)
  for (const client of studioClients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(payload) } catch {}
    }
  }
}

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

async function readJsonFile(filePath) {
  try { return JSON.parse(await readFile(filePath, 'utf8')) }
  catch { return null }
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 })
  const temporary = filePath + '.tmp-' + randomUUID()
  await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' })
  await rename(temporary, filePath)
}

function validUpdateId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
}

function uploadDirectory(updateId) {
  if (!validUpdateId(updateId)) throw new Error('Invalid update ID.')
  return join(UPLOADS_DIR, updateId)
}

async function currentReleaseDirectory() {
  return realpath(CURRENT_RELEASE)
}

async function sourceWorkspaceDirectory() {
  const manual = await readJsonFile(MANUAL_EDIT_STATE_FILE)
  if (manual?.status !== 'pending') return currentReleaseDirectory()
  const workspace = String(manual.workspaceRelease || '')
  if (!workspace.startsWith(RELEASES_DIR + sep)) {
    sourcePathError(409, 'MANUAL_WORKSPACE_INVALID', 'The saved source workspace is outside Aharane releases.')
  }
  const actual = await realpath(workspace).catch(() => null)
  if (!actual || !actual.startsWith(RELEASES_DIR + sep)) {
    sourcePathError(409, 'MANUAL_WORKSPACE_MISSING', 'The saved source workspace is missing. Discard the pending edits before continuing.')
  }
  return actual
}

async function currentBotVersion() {
  try {
    const packageJson = JSON.parse(await readFile(join(await currentReleaseDirectory(), 'package.json'), 'utf8'))
    return String(packageJson.version || 'unknown')
  } catch { return 'unknown' }
}

async function currentUpdateState() {
  return await readJsonFile(UPDATE_STATE_FILE) || { status: 'idle' }
}

function sourcePathError(status, code, message) {
  throw Object.assign(new Error(message), { status, code })
}

async function safeSourceTarget(value, { allowMissing = false } = {}) {
  let relativePath = String(value || '').replace(/^\/+/, '')
  if (!relativePath || relativePath.length > 512) sourcePathError(400, 'PATH_REQUIRED', 'Choose a source file or folder using a path shorter than 512 characters.')
  const normalized = normalizeUpdatePath(relativePath)
  const parts = normalized.path.split('/')
  if (parts.length > 8 || parts.some(part => part.startsWith('.'))) sourcePathError(403, 'PATH_NOT_ALLOWED', 'Hidden files and deeply nested paths are not available in the source editor.')
  if (!SOURCE_DIRS.has(parts[0]) && !(parts.length === 1 && SOURCE_ROOT_FILES.has(parts[0]))) {
    sourcePathError(403, 'PATH_NOT_ALLOWED', 'That path is outside the editable Aharane source workspace.')
  }
  if (parts.length > 1 && SOURCE_ROOT_FILES.has(parts[0])) {
    sourcePathError(403, 'PATH_NOT_ALLOWED', 'A root documentation file cannot contain child paths.')
  }
  if (parts.length > 1 && !SOURCE_EXTENSIONS.has(extname(parts.at(-1)).toLowerCase())) {
    sourcePathError(403, 'FILE_TYPE_NOT_ALLOWED', 'Only approved text and source files are available in the editor.')
  }
  const base = await sourceWorkspaceDirectory()
  let full = base
  let info = null
  for (let index = 0; index < parts.length; index += 1) {
    full = join(full, parts[index])
    info = await lstat(full).catch(error => {
      if (error?.code === 'ENOENT') return null
      throw error
    })
    if (!info && (!allowMissing || index < parts.length - 1)) {
      sourcePathError(404, 'FILE_NOT_FOUND', 'The selected source file or folder does not exist.')
    }
    if (info?.isSymbolicLink()) sourcePathError(403, 'SYMLINK_BLOCKED', 'Symbolic links are not available in the source editor.')
    if (info && index < parts.length - 1 && !info.isDirectory()) {
      sourcePathError(400, 'NOT_A_FOLDER', 'A parent path is not a folder.')
    }
  }
  const relativePathFromRoot = relative(base, full)
  if (!relativePathFromRoot || relativePathFromRoot === '..' || relativePathFromRoot.startsWith('..' + sep) || isAbsolute(relativePathFromRoot)) {
    sourcePathError(403, 'PATH_ESCAPE', 'The selected path is outside Aharane’s release directory.')
  }
  if (info) {
    const actual = await realpath(full)
    const actualRelative = relative(base, actual)
    if (actualRelative === '..' || actualRelative.startsWith('..' + sep) || isAbsolute(actualRelative)) {
      sourcePathError(403, 'PATH_ESCAPE', 'The selected file resolves outside Aharane’s release directory.')
    }
  }
  return { path: normalized.path, parts, full, info, base }
}

async function listSourceFiles(relativePath = '') {
  if (!relativePath) {
    const rootEntries = []
    for (const name of [...SOURCE_DIRS, ...SOURCE_ROOT_FILES]) {
      const target = await safeSourceTarget(name).catch(() => null)
      if (!target?.info) continue
      rootEntries.push({
        name,
        path: name,
        type: target.info.isDirectory() ? 'folder' : 'file',
        size: target.info.isFile() ? target.info.size : null,
        modified: target.info.mtime.toISOString(),
        readOnly: false,
      })
    }
    rootEntries.sort((a, b) => Number(b.type === 'folder') - Number(a.type === 'folder') || a.name.localeCompare(b.name))
    return { path: '', children: rootEntries }
  }

  const parent = await safeSourceTarget(relativePath)
  if (!parent.info.isDirectory()) sourcePathError(400, 'NOT_A_FOLDER', 'Choose a folder to browse.')
  const rows = await readdir(parent.full, { withFileTypes: true })
  const children = []
  for (const row of rows) {
    if (row.name.startsWith('.')) continue
    const childPath = parent.path + '/' + row.name
    const target = await safeSourceTarget(childPath).catch(() => null)
    if (!target?.info || target.info.isSymbolicLink()) continue
    if (target.info.isDirectory()) {
      children.push({ name: row.name, path: childPath, type: 'folder', size: null, modified: target.info.mtime.toISOString(), readOnly: false })
    } else if (target.info.isFile() && SOURCE_EXTENSIONS.has(extname(row.name).toLowerCase())) {
      children.push({
        name: row.name,
        path: childPath,
        type: 'file',
        size: target.info.size,
        modified: target.info.mtime.toISOString(),
        readOnly: false,
      })
    }
  }
  children.sort((a, b) => Number(b.type === 'folder') - Number(a.type === 'folder') || a.name.localeCompare(b.name))
  return { path: parent.path, children: children.slice(0, 500) }
}

async function ensureManualEditBackup() {
  const currentRelease = await currentReleaseDirectory()
  const existing = await readJsonFile(MANUAL_EDIT_STATE_FILE)
  if (existing?.status === 'pending') {
    if (existing.currentRelease !== currentRelease) {
      sourcePathError(409, 'MANUAL_CHANGES_STALE', 'The active release changed. Discard the old draft before editing this version.')
    }
    const workspace = String(existing.workspaceRelease || '')
    if (!workspace.startsWith(RELEASES_DIR + sep) || !await stat(workspace).catch(() => null)) {
      sourcePathError(409, 'MANUAL_WORKSPACE_MISSING', 'The saved source workspace is missing. Discard the pending edits before continuing.')
    }
    return existing
  }
  if (!currentRelease.startsWith(RELEASES_DIR + sep)) {
    sourcePathError(409, 'RELEASE_PATH_INVALID', 'The current Aharane release cannot be copied safely.')
  }

  const workspace = join(RELEASES_DIR, `manual-edit-workspace-${Date.now()}-${randomUUID().slice(0, 8)}`)
  await cp(currentRelease, workspace, {
    recursive: true,
    errorOnExist: true,
    force: false,
    filter: source => {
      const segments = source.split(sep)
      return !segments.includes('node_modules') && !segments.includes('.git')
    },
  })
  const modulesPath = join(currentRelease, 'node_modules')
  const modulesInfo = await stat(modulesPath).catch(() => null)
  if (modulesInfo?.isDirectory()) {
    await symlink(await realpath(modulesPath), join(workspace, 'node_modules'), 'dir')
  }

  const state = {
    status: 'pending',
    currentRelease,
    previousRelease: currentRelease,
    workspaceRelease: workspace,
    modifiedPaths: [],
    createdAt: new Date().toISOString(),
  }
  await writeJsonAtomic(MANUAL_EDIT_STATE_FILE, state)
  return state
}
async function recordManualEdit(sourcePath, action) {
  const state = await ensureManualEditBackup()
  const byPath = new Map((state.modifiedPaths || []).map(item => [item.path, item]))
  byPath.set(sourcePath, { path: sourcePath, action, modifiedAt: new Date().toISOString() })
  state.modifiedPaths = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
  await writeJsonAtomic(MANUAL_EDIT_STATE_FILE, state)
  return state
}

async function validateSourceContent(sourcePath, content) {
  if (Buffer.byteLength(content, 'utf8') > MAX_SOURCE_FILE_BYTES) {
    sourcePathError(413, 'FILE_TOO_LARGE', 'Source files must be 512 KB or smaller in the editor.')
  }
  const extension = extname(sourcePath).toLowerCase()
  if (extension === '.json') {
    try { JSON.parse(content) }
    catch { sourcePathError(400, 'INVALID_JSON', 'The JSON file is not valid JSON.') }
  }
  if (['.js', '.mjs', '.cjs'].includes(extension)) {
    const temporary = join(UPDATE_DIR, '.source-check-' + randomUUID() + extension)
    try {
      await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      await execFileAsync(process.execPath, ['--check', temporary], { timeout: 10_000, maxBuffer: 32 * 1024 })
    } catch (error) {
      const message = String(error?.stderr || error?.message || 'JavaScript syntax validation failed.')
        .replaceAll(temporary, sourcePath).split('\n').slice(0, 4).join(' ').slice(0, 360)
      sourcePathError(400, 'INVALID_SOURCE_SYNTAX', message || 'JavaScript syntax validation failed.')
    } finally {
      await rm(temporary, { force: true }).catch(() => {})
    }
  }
}

async function assembleUpdateArchive(updateId) {
  const directory = uploadDirectory(updateId)
  const metadata = await readJsonFile(join(directory, 'upload.json'))
  if (!metadata || !['uploading', 'validated'].includes(metadata.status)) {
    throw new Error('Upload a ZIP package before validating it.')
  }
  const archivePath = join(directory, 'update.zip')

  if (metadata.status === 'uploading') {
    await rm(archivePath, { force: true })
    const hash = createHash('sha256')
    let assembledSize = 0
    for (let index = 0; index < metadata.totalChunks; index += 1) {
      const partPath = join(directory, String(index).padStart(5, '0') + '.part')
      const part = await readFile(partPath).catch(() => null)
      if (!part) throw new Error(`ZIP upload is incomplete. Missing chunk ${index + 1} of ${metadata.totalChunks}.`)
      assembledSize += part.length
      hash.update(part)
      await appendFile(archivePath, part, { mode: 0o600 })
    }
    if (assembledSize !== metadata.size || hash.digest('hex') !== metadata.sha256) {
      await rm(archivePath, { force: true })
      throw new Error('The uploaded ZIP failed its size or SHA-256 integrity check.')
    }
  }

  const archiveInfo = await stat(archivePath).catch(() => null)
  if (!archiveInfo?.isFile() || archiveInfo.size !== metadata.size) {
    throw new Error('The stored ZIP package is missing or has an unexpected size.')
  }
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(archivePath)) hash.update(chunk)
  if (hash.digest('hex') !== metadata.sha256) {
    throw new Error('The stored ZIP package failed its SHA-256 integrity check.')
  }

  const inspection = await inspectUpdateArchive(archivePath)
  const releaseDirectory = await currentReleaseDirectory()
  const changes = await compareUpdateContents(releaseDirectory, inspection.files)
  metadata.status = 'validated'
  metadata.validatedAt = new Date().toISOString()
  metadata.inspection = inspection
  metadata.changes = changes
  metadata.archivePath = archivePath
  await writeJsonAtomic(join(directory, 'upload.json'), metadata)

  if (metadata.totalChunks) {
    for (let index = 0; index < metadata.totalChunks; index += 1) {
      await rm(join(directory, String(index).padStart(5, '0') + '.part'), { force: true })
    }
  }
  return { metadata, inspection, changes }
}
async function activatePreparedUpdate(updateId, releaseDirectory, previousRelease, manifest) {
  const state = {
    status: 'awaiting-healthcheck',
    updateId,
    version: manifest.bot_version,
    previousRelease,
    candidateRelease: releaseDirectory,
    startedAt: new Date().toISOString(),
  }
  await writeJsonAtomic(UPDATE_STATE_FILE, state)
  const nextLink = join(APP_BASE, '.current-next-' + randomUUID())
  await symlink(releaseDirectory, nextLink, 'dir')
  await rename(nextLink, CURRENT_RELEASE)
  logger.warn({ event: 'update.release-activated', version: manifest.bot_version })
  setTimeout(() => process.exit(1), 350)
}

async function prepareAndActivateUpdate(updateId) {
  const directory = uploadDirectory(updateId)
  const metadata = await readJsonFile(join(directory, 'upload.json'))
  let releaseDirectory = ''
  try {
    if (!metadata || metadata.status !== 'validated') throw new Error('The ZIP has not passed validation.')
    const archivePath = join(directory, 'update.zip')
    const inspection = await inspectUpdateArchive(archivePath)
    if (inspection.manifest.bot_version !== metadata.inspection?.manifest?.bot_version) {
      throw new Error('The validated ZIP changed before deployment.')
    }
    const previousRelease = await currentReleaseDirectory()
    if (!previousRelease.startsWith(RELEASES_DIR + sep)) throw new Error('Current Aharane release is outside its release directory.')
    const version = inspection.manifest.bot_version.replace(/[^0-9A-Za-z.-]/g, '-')
    releaseDirectory = join(RELEASES_DIR, `zip-${version}-${Date.now()}-${updateId.slice(0, 8)}`)
    await mkdir(RELEASES_DIR, { recursive: true, mode: 0o750 })
    await mkdir(releaseDirectory, { mode: 0o750 })
    await extractUpdateArchive(archivePath, releaseDirectory)

    const packageJson = JSON.parse(await readFile(join(releaseDirectory, 'package.json'), 'utf8'))
    const hasLockfile = Boolean(await stat(join(releaseDirectory, 'package-lock.json')).catch(() => null))
    const installArgs = hasLockfile
      ? ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund']
      : ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund']
    await execFileAsync('npm', installArgs, {
      cwd: releaseDirectory,
      timeout: 6 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        PATH: process.env.PATH || '/usr/bin:/bin',
        HOME: DATA_DIR,
        NODE_ENV: 'production',
        NPM_CONFIG_CACHE: join(UPDATE_DIR, 'npm-cache'),
        NPM_CONFIG_IGNORE_SCRIPTS: 'true',
        NPM_CONFIG_FUND: 'false',
        NPM_CONFIG_AUDIT: 'false',
      },
    })
    await execFileAsync(process.execPath, ['--check', join(releaseDirectory, 'src/index.js')], {
      cwd: releaseDirectory,
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    })
    await writeFile(join(releaseDirectory, '.deployed-source-ref'), `zip:${inspection.manifest.bot_version}\n`, { mode: 0o440 })
    await activatePreparedUpdate(updateId, releaseDirectory, previousRelease, inspection.manifest)
  } catch (error) {
    if (releaseDirectory) await rm(releaseDirectory, { recursive: true, force: true }).catch(() => {})
    await writeJsonAtomic(UPDATE_STATE_FILE, {
      status: 'failed',
      updateId,
      version: metadata?.inspection?.manifest?.bot_version || null,
      message: String(error?.message || 'Update preparation failed').slice(0, 300),
      finishedAt: new Date().toISOString(),
    }).catch(() => {})
    logger.error({ event: 'update.preparation-failed', message: String(error?.message || 'unknown').slice(0, 200) })
    updateInProgress = false
  }
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

    publishStudioEvent('whatsapp.command.received', { command: text.split(/\\s+/, 1)[0].slice(0, 40) })
    try {
      await currentSocket.sendMessage(remoteJid, { text: reply }, { quoted: message })
      publishStudioEvent('whatsapp.command.replied', { command: text.split(/\\s+/, 1)[0].slice(0, 40) })
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
  publishStudioEvent('whatsapp.status', studioRuntimeSnapshot())
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
    publishStudioEvent('whatsapp.status', studioRuntimeSnapshot())

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
        publishStudioEvent('whatsapp.status', studioRuntimeSnapshot())
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
          publishStudioEvent('whatsapp.status', studioRuntimeSnapshot())
          logger.error({ event: 'whatsapp.auth-rejected' })
          return
        }
        state = 'disconnected'
        publishStudioEvent('whatsapp.status', studioRuntimeSnapshot())
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
app.use(express.json({ limit: '2mb', strict: true }))
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
    ...studioRuntimeSnapshot(),
  })
})
app.get('/api/studio/snapshot', requireAdmin, async (_req, res) => {
  res.json({
    ok: true,
    service: APP_NAME,
    runtime: studioRuntimeSnapshot(),
    currentVersion: await currentBotVersion(),
    update: await currentUpdateState(),
    serverTime: new Date().toISOString(),
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
    publishStudioEvent('whatsapp.status', studioRuntimeSnapshot())
    res.json({ ok: true, pairingCode: String(pairingCode).replace(/\s/g, '') })
  } catch {
    res.status(503).json({ ok: false, error: 'Pairing code could not be generated. Check the server connection and retry shortly.' })
  } finally {
    pairRequestActive = false
  }
})
app.get('/api/update/status', requireAdmin, async (_req, res) => {
  const manual = await readJsonFile(MANUAL_EDIT_STATE_FILE)
  res.json({
    ok: true,
    currentVersion: await currentBotVersion(),
    update: await currentUpdateState(),
    manualEdits: { pending: manual?.status === 'pending', changedCount: manual?.modifiedPaths?.length || 0 },
    maxArchiveBytes: MAX_ARCHIVE_BYTES,
  })
})

app.post('/api/update/upload/start', requireAdmin, async (req, res) => {
  try {
    const updateId = String(req.body?.updateId || '')
    const filename = String(req.body?.filename || '')
    const size = Number(req.body?.size)
    const totalChunks = Number(req.body?.totalChunks)
    const sha256 = String(req.body?.sha256 || '').toLowerCase()
    if (!validUpdateId(updateId) || !/\.zip$/i.test(filename) || !Number.isSafeInteger(size) || size < 22 || size > MAX_ARCHIVE_BYTES) {
      return res.status(400).json({ ok: false, error: 'Choose a valid ZIP file no larger than 50 MB.' })
    }
    if (!Number.isInteger(totalChunks) || totalChunks !== Math.ceil(size / UPDATE_CHUNK_BYTES) || totalChunks > 50) {
      return res.status(400).json({ ok: false, error: 'The ZIP upload has an invalid chunk layout.' })
    }
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      return res.status(400).json({ ok: false, error: 'The ZIP upload is missing a valid SHA-256 checksum.' })
    }
    if (updateInProgress) return res.status(409).json({ ok: false, error: 'An Aharane update is already running.' })
    const existingEntries = await readdir(UPLOADS_DIR, { withFileTypes: true })
    let retainedPackages = 0
    let retainedBytes = 0
    const now = Date.now()
    for (const entry of existingEntries) {
      if (!entry.isDirectory() || !validUpdateId(entry.name) || entry.name === updateId) continue
      const existingDirectory = uploadDirectory(entry.name)
      const existing = await readJsonFile(join(existingDirectory, 'upload.json'))
      if (!existing) continue
      const age = now - new Date(existing.createdAt || 0).getTime()
      if (existing.status === 'uploading' && age > 24 * 60 * 60 * 1000) {
        await rm(existingDirectory, { recursive: true, force: true })
        continue
      }
      if (['uploading', 'validated'].includes(existing.status)) {
        retainedPackages += 1
        retainedBytes += Number(existing.size) || 0
      }
    }
    if (retainedPackages >= 10 || retainedBytes + size > 250 * 1024 * 1024) {
      return res.status(507).json({ ok: false, error: 'The ZIP package library is full. Remove an older package before uploading another.' })
    }
    const directory = uploadDirectory(updateId)
    await rm(directory, { recursive: true, force: true })
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await writeJsonAtomic(join(directory, 'upload.json'), {
      updateId, filename: filename.slice(0, 160), size, totalChunks, sha256, status: 'uploading',
      createdAt: new Date().toISOString(),
    })
    res.status(201).json({ ok: true, updateId, chunkBytes: UPDATE_CHUNK_BYTES, totalChunks })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || 'Could not start ZIP upload.') })
  }
})

app.post('/api/update/upload/chunk', requireAdmin, async (req, res) => {
  try {
    const updateId = String(req.body?.updateId || '')
    const index = Number(req.body?.index)
    const data = String(req.body?.data || '')
    const directory = uploadDirectory(updateId)
    const metadata = await readJsonFile(join(directory, 'upload.json'))
    if (!metadata || metadata.status !== 'uploading') return res.status(409).json({ ok: false, error: 'This ZIP upload is not active.' })
    if (!Number.isInteger(index) || index < 0 || index >= metadata.totalChunks || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      return res.status(400).json({ ok: false, error: 'Invalid ZIP chunk.' })
    }
    const bytes = Buffer.from(data, 'base64')
    const expectedBytes = index === metadata.totalChunks - 1
      ? metadata.size - (index * UPDATE_CHUNK_BYTES)
      : UPDATE_CHUNK_BYTES
    if (bytes.toString('base64') !== data || bytes.length !== expectedBytes) {
      return res.status(400).json({ ok: false, error: 'The ZIP chunk failed its size check.' })
    }
    const partPath = join(directory, String(index).padStart(5, '0') + '.part')
    await writeFile(partPath, bytes, { flag: 'wx', mode: 0o600 })
    res.status(201).json({ ok: true, received: index + 1, total: metadata.totalChunks })
  } catch (error) {
    const status = /EEXIST/.test(String(error?.code || error?.message)) ? 409 : 400
    res.status(status).json({ ok: false, error: status === 409 ? 'This ZIP chunk was already received.' : String(error?.message || 'Could not store ZIP chunk.') })
  }
})

app.get('/api/files/tree', requireAdmin, async (req, res) => {
  try {
    const result = await listSourceFiles(String(req.query.item || ''))
    const manual = await readJsonFile(MANUAL_EDIT_STATE_FILE)
    res.json({ ok: true, ...result, pending: manual?.status === 'pending', changedCount: manual?.modifiedPaths?.length || 0 })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not list Aharane source files.') })
  }
})

app.get('/api/files/preview', requireAdmin, async (req, res) => {
  let handle
  try {
    const target = await safeSourceTarget(req.query.item)
    if (!target.info?.isFile()) return res.status(400).json({ ok: false, error: 'Choose a source file to preview.' })
    if (!SOURCE_EXTENSIONS.has(extname(target.path).toLowerCase()) && !SOURCE_ROOT_FILES.has(target.parts[0])) {
      return res.status(403).json({ ok: false, error: 'This file type is not available in the source editor.' })
    }
    if (target.info.size > MAX_SOURCE_FILE_BYTES) return res.status(413).json({ ok: false, error: 'This source file exceeds the 512 KB editor limit.' })
    handle = await open(target.full, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0))
    const info = await handle.stat()
    if (!info.isFile() || info.size > MAX_SOURCE_FILE_BYTES) return res.status(413).json({ ok: false, error: 'The file changed or exceeds the editor limit.' })
    const content = await handle.readFile('utf8')
    const sha256 = createHash('sha256').update(content).digest('hex')
    const manual = await readJsonFile(MANUAL_EDIT_STATE_FILE)
    res.json({
      ok: true,
      path: target.path,
      name: target.parts.at(-1),
      content,
      size: info.size,
      modified: info.mtime.toISOString(),
      sha256,
      language: extname(target.path).slice(1) || 'text',
      pending: manual?.status === 'pending',
    })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not read the selected source file.') })
  } finally {
    await handle?.close().catch(() => {})
  }
})

app.get('/api/files/draft-status', requireAdmin, async (_req, res) => {
  const manual = await readJsonFile(MANUAL_EDIT_STATE_FILE)
  res.json({
    ok: true,
    pending: manual?.status === 'pending',
    modifiedPaths: manual?.status === 'pending' ? (manual.modifiedPaths || []) : [],
    changedCount: manual?.status === 'pending' ? (manual.modifiedPaths || []).length : 0,
  })
})

app.post('/api/files', requireAdmin, async (req, res) => {
  try {
    if (updateInProgress) return res.status(409).json({ ok: false, error: 'Aharane is currently deploying. File changes are disabled.' })
    const parentPath = String(req.body?.parentPath || '')
    const name = String(req.body?.name || '').trim()
    const type = String(req.body?.type || 'file')
    const initialParent = await safeSourceTarget(parentPath)
    if (!initialParent.info?.isDirectory()) return res.status(400).json({ ok: false, error: 'Choose an existing source folder.' })
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(name) || name.startsWith('.')) {
      return res.status(400).json({ ok: false, error: 'Use a simple file or folder name without hidden path segments.' })
    }
    const childPath = initialParent.path + '/' + name
    const initialTarget = await safeSourceTarget(childPath, { allowMissing: true })
    if (initialTarget.info) return res.status(409).json({ ok: false, error: 'A file or folder with that name already exists.' })
    if (type === 'folder' && req.body?.content !== undefined) {
      return res.status(400).json({ ok: false, error: 'Folders cannot contain file content.' })
    }
    if (type !== 'folder' && (type !== 'file' || !SOURCE_EXTENSIONS.has(extname(name).toLowerCase()))) {
      return res.status(400).json({ ok: false, error: 'Choose a supported source-file extension such as .js, .json, .md, .html or .css.' })
    }

    await ensureManualEditBackup()
    const parent = await safeSourceTarget(parentPath)
    if (!parent.info?.isDirectory()) return res.status(400).json({ ok: false, error: 'The source folder changed. Refresh the Files Manager.' })
    const target = await safeSourceTarget(parent.path + '/' + name, { allowMissing: true })
    if (target.info) return res.status(409).json({ ok: false, error: 'A file or folder with that name already exists.' })

    if (type === 'folder') {
      await mkdir(target.full, { mode: 0o750 })
      await recordManualEdit(target.path, 'created-folder')
      return res.status(201).json({ ok: true, path: target.path, type: 'folder' })
    }

    const content = String(req.body?.content ?? '')
    await validateSourceContent(target.path, content)
    await writeFile(target.full, content, { encoding: 'utf8', mode: 0o640, flag: 'wx' })
    await recordManualEdit(target.path, 'created-file')
    res.status(201).json({ ok: true, path: target.path, type: 'file', size: Buffer.byteLength(content) })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not create the source file or folder.') })
  }
})

app.put('/api/files/content', requireAdmin, async (req, res) => {
  let handle
  try {
    if (updateInProgress) return res.status(409).json({ ok: false, error: 'Aharane is currently deploying. File changes are disabled.' })
    let target = await safeSourceTarget(req.body?.path)
    if (!target.info?.isFile()) return res.status(400).json({ ok: false, error: 'Choose an existing source file.' })
    const content = String(req.body?.content ?? '')
    await validateSourceContent(target.path, content)
    handle = await open(target.full, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0))
    const original = await handle.readFile()
    const currentHash = createHash('sha256').update(original).digest('hex')
    await handle.close()
    handle = null
    if (req.body?.expectedSha256 && req.body.expectedSha256 !== currentHash) {
      return res.status(409).json({ ok: false, error: 'This file changed after you opened it. Reload it before saving to avoid overwriting newer content.' })
    }

    await ensureManualEditBackup()
    target = await safeSourceTarget(target.path)
    if (!target.info?.isFile()) return res.status(409).json({ ok: false, error: 'The source file changed. Reload the Files Manager.' })
    const temporary = target.full + '.aharane-edit-' + randomUUID()
    try {
      await writeFile(temporary, content, { encoding: 'utf8', mode: 'wx', flag: 'wx' })
      await rename(temporary, target.full)
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {})
      throw error
    }
    await recordManualEdit(target.path, 'modified-file')
    res.json({
      ok: true,
      path: target.path,
      size: Buffer.byteLength(content),
      sha256: createHash('sha256').update(content).digest('hex'),
      pending: true,
    })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not save the source file.') })
  } finally {
    await handle?.close().catch(() => {})
  }
})

app.post('/api/files/delete', requireAdmin, async (req, res) => {
  try {
    if (updateInProgress) return res.status(409).json({ ok: false, error: 'Aharane is currently deploying. File changes are disabled.' })
    const paths = Array.isArray(req.body?.paths) ? [...new Set(req.body.paths.map(String))] : []
    if (!paths.length || paths.length > 50) return res.status(400).json({ ok: false, error: 'Choose between 1 and 50 source files.' })
    const initialTargets = []
    for (const sourcePath of paths) {
      const target = await safeSourceTarget(sourcePath)
      if (!target.info?.isFile()) return res.status(400).json({ ok: false, error: 'Only individual source files can be deleted.' })
      if (SOURCE_ROOT_FILES.has(target.parts[0])) return res.status(403).json({ ok: false, error: 'Root package and documentation files are protected from deletion.' })
      initialTargets.push(target.path)
    }
    await ensureManualEditBackup()
    const targets = []
    for (const sourcePath of initialTargets) {
      const target = await safeSourceTarget(sourcePath)
      if (!target.info?.isFile()) return res.status(409).json({ ok: false, error: 'A selected source file changed. Refresh the Files Manager.' })
      targets.push(target)
    }
    for (const target of targets) {
      await rm(target.full, { force: false })
      await recordManualEdit(target.path, 'deleted-file')
    }
    res.json({ ok: true, deleted: targets.map(target => target.path), pending: true })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not delete the selected source files.') })
  }
})

app.post('/api/files/apply', requireAdmin, async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ ok: false, error: 'Explicit confirmation is required to apply saved file edits.' })
  if (updateInProgress) return res.status(409).json({ ok: false, error: 'Another Aharane deployment is already running.' })
  const manual = await readJsonFile(MANUAL_EDIT_STATE_FILE)
  if (!manual || manual.status !== 'pending' || !Array.isArray(manual.modifiedPaths) || !manual.modifiedPaths.length) {
    return res.status(409).json({ ok: false, error: 'There are no saved manual file edits to apply.' })
  }
  try {
    const current = await currentReleaseDirectory()
    const workspace = String(manual.workspaceRelease || '')
    if (current !== manual.currentRelease || !workspace.startsWith(RELEASES_DIR + sep)) {
      return res.status(409).json({ ok: false, error: 'The active release or edit workspace changed. Reload the Files Manager before applying these edits.' })
    }
    const actualWorkspace = await realpath(workspace)
    if (!actualWorkspace.startsWith(RELEASES_DIR + sep) || actualWorkspace === current) {
      return res.status(409).json({ ok: false, error: 'The saved edit workspace is not a separate Aharane release.' })
    }
    await execFileAsync(process.execPath, ['--check', join(actualWorkspace, 'src/index.js')], { cwd: actualWorkspace, timeout: 15_000, maxBuffer: 1024 * 1024 })
    await execFileAsync('npm', ['run', 'check'], {
      cwd: actualWorkspace,
      timeout: 2 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
      env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: DATA_DIR, NODE_ENV: 'test', NPM_CONFIG_CACHE: join(UPDATE_DIR, 'npm-cache'), NPM_CONFIG_IGNORE_SCRIPTS: 'true', NPM_CONFIG_FUND: 'false', NPM_CONFIG_AUDIT: 'false' },
    })
    updateInProgress = true
    const updateId = randomUUID()
    await writeJsonAtomic(UPDATE_STATE_FILE, {
      status: 'awaiting-healthcheck',
      source: 'manual-files',
      updateId,
      version: await currentBotVersion(),
      previousRelease: current,
      candidateRelease: actualWorkspace,
      startedAt: new Date().toISOString(),
    })
    const nextLink = join(APP_BASE, '.current-manual-' + randomUUID())
    try {
      await symlink(actualWorkspace, nextLink, 'dir')
      await rename(nextLink, CURRENT_RELEASE)
    } catch (error) {
      await rm(nextLink, { force: true }).catch(() => {})
      updateInProgress = false
      await writeJsonAtomic(UPDATE_STATE_FILE, {
        status: 'failed',
        source: 'manual-files',
        updateId,
        message: String(error?.message || 'Could not activate the saved source release.').slice(0, 300),
        finishedAt: new Date().toISOString(),
      }).catch(() => {})
      throw error
    }
    res.status(202).json({ ok: true, status: 'awaiting-healthcheck', updateId, message: 'Saved file changes passed validation. Aharane is switching to the prepared release and restarting.' })
    setTimeout(() => process.exit(1), 350)
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.stderr || error?.message || 'Source validation failed.').slice(0, 1200) })
  }
})

app.post('/api/files/discard', requireAdmin, async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ ok: false, error: 'Explicit confirmation is required to discard saved file edits.' })
  if (updateInProgress) return res.status(409).json({ ok: false, error: 'Another Aharane deployment is already running.' })
  const manual = await readJsonFile(MANUAL_EDIT_STATE_FILE)
  if (!manual || manual.status !== 'pending') return res.status(409).json({ ok: false, error: 'There are no saved manual edits to discard.' })
  try {
    const current = await currentReleaseDirectory()
    const workspace = String(manual.workspaceRelease || '')
    if (current !== manual.currentRelease || !workspace.startsWith(RELEASES_DIR + sep)) {
      return res.status(409).json({ ok: false, error: 'The saved edits no longer match the active release.' })
    }
    const actualWorkspace = await realpath(workspace)
    if (!actualWorkspace.startsWith(RELEASES_DIR + sep) || actualWorkspace === current) {
      return res.status(409).json({ ok: false, error: 'The saved edit workspace is not a separate Aharane release.' })
    }
    await rm(actualWorkspace, { recursive: true, force: true })
    await rm(MANUAL_EDIT_STATE_FILE, { force: true })
    res.json({ ok: true, pending: false, message: 'The staged edits were discarded. The running Aharane release was never changed.' })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not discard saved file edits.') })
  }
})

app.get('/api/files/packages', requireAdmin, async (_req, res) => {
  try {
    const entries = await readdir(UPLOADS_DIR, { withFileTypes: true })
    const packages = []
    for (const entry of entries) {
      if (!entry.isDirectory() || !validUpdateId(entry.name)) continue
      const directory = uploadDirectory(entry.name)
      const metadata = await readJsonFile(join(directory, 'upload.json'))
      if (!metadata || metadata.status !== 'validated' || !metadata.inspection) continue
      const archive = await stat(join(directory, 'update.zip')).catch(() => null)
      if (!archive?.isFile()) continue
      packages.push({
        updateId: entry.name,
        filename: metadata.filename,
        size: metadata.size,
        status: metadata.status,
        version: metadata.inspection.manifest.bot_version,
        createdAt: metadata.createdAt,
        validatedAt: metadata.validatedAt || null,
        fileCount: metadata.inspection.fileCount,
      })
    }
    packages.sort((a, b) => String(b.validatedAt || b.createdAt).localeCompare(String(a.validatedAt || a.createdAt)))
    res.json({ ok: true, packages })
  } catch {
    res.status(500).json({ ok: false, error: 'Could not read Aharane update packages.' })
  }
})

app.post('/api/files/packages/remove', requireAdmin, async (req, res) => {
  try {
    const updateId = String(req.body?.updateId || '')
    if (!validUpdateId(updateId)) return res.status(400).json({ ok: false, error: 'Invalid package ID.' })
    if (updateInProgress) return res.status(409).json({ ok: false, error: 'A deployment is running; packages cannot be removed right now.' })
    const directory = uploadDirectory(updateId)
    const metadata = await readJsonFile(join(directory, 'upload.json'))
    if (!metadata || metadata.status !== 'validated') return res.status(404).json({ ok: false, error: 'The update package was not found.' })
    const current = await currentUpdateState()
    if (current.updateId === updateId && ['preparing', 'awaiting-healthcheck'].includes(current.status)) {
      return res.status(409).json({ ok: false, error: 'This package is currently being deployed.' })
    }
    await rm(directory, { recursive: true, force: true })
    res.json({ ok: true })
  } catch {
    res.status(400).json({ ok: false, error: 'Could not remove the selected ZIP package.' })
  }
})

app.post('/api/update/validate', requireAdmin, async (req, res) => {
  try {
    const updateId = String(req.body?.updateId || '')
    const { metadata, inspection, changes } = await assembleUpdateArchive(updateId)
    res.json({
      ok: true,
      updateId,
      filename: metadata.filename,
      manifest: inspection.manifest,
      fileCount: inspection.fileCount,
      totalUncompressedBytes: inspection.totalUncompressedBytes,
      files: inspection.files.slice(0, 250),
      changes,
      currentVersion: await currentBotVersion(),
    })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || 'ZIP validation failed.') })
  }
})

app.post('/api/update/deploy', requireAdmin, async (req, res) => {
  const updateId = String(req.body?.updateId || '')
  if (!validUpdateId(updateId) || req.body?.confirm !== true) {
    return res.status(400).json({ ok: false, error: 'Explicit deployment confirmation is required.' })
  }
  if (updateInProgress) return res.status(409).json({ ok: false, error: 'An Aharane update is already running.' })
  const manualEdits = await readJsonFile(MANUAL_EDIT_STATE_FILE)
  if (manualEdits?.status === 'pending') return res.status(409).json({ ok: false, error: 'Apply or discard saved Files Manager edits before deploying a ZIP update.' })
  const metadata = await readJsonFile(join(uploadDirectory(updateId), 'upload.json'))
  if (!metadata || metadata.status !== 'validated' || !metadata.inspection) {
    return res.status(409).json({ ok: false, error: 'Validate this Aharane ZIP before deploying it.' })
  }
  updateInProgress = true
  await writeJsonAtomic(UPDATE_STATE_FILE, {
    status: 'preparing',
    updateId,
    version: metadata.inspection.manifest.bot_version,
    startedAt: new Date().toISOString(),
  })
  res.status(202).json({ ok: true, status: 'preparing', updateId, message: 'Aharane is preparing the new release. Keep this page open to follow its status.' })
  setImmediate(() => { void prepareAndActivateUpdate(updateId) })
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

const studioWss = new WebSocketServer({
  noServer: true,
  maxPayload: 64 * 1024,
  perMessageDeflate: false,
})

server.on('upgrade', (req, transport, head) => {
  let pathname = ''
  try { pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname } catch {}
  if (pathname !== '/ws') {
    transport.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
    transport.destroy()
    return
  }

  const authorization = String(req.headers.authorization || '')
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  if (!match || !tokenMatches(match[1])) {
    transport.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
    transport.destroy()
    return
  }

  studioWss.handleUpgrade(req, transport, head, client => {
    studioWss.emit('connection', client, req)
  })
})

studioWss.on('connection', client => {
  studioClients.add(client)
  client.send(JSON.stringify({
    id: ++studioEventSequence,
    type: 'studio.connected',
    at: new Date().toISOString(),
    data: studioRuntimeSnapshot(),
  }))

  let messageWindowStartedAt = Date.now()
  let messageCount = 0
  client.on('message', (raw, isBinary) => {
    if (isBinary) {
      client.close(1003, 'Text messages only')
      return
    }
    const now = Date.now()
    if (now - messageWindowStartedAt >= 10_000) {
      messageWindowStartedAt = now
      messageCount = 0
    }
    messageCount += 1
    if (messageCount > 30) {
      client.close(1008, 'Message rate limit exceeded')
      return
    }

    let message
    try { message = JSON.parse(String(raw)) } catch {
      client.send(JSON.stringify({ type: 'studio.error', data: { error: 'Send a valid JSON message.' } }))
      return
    }

    if (message?.type === 'ping') {
      client.send(JSON.stringify({ type: 'pong', at: new Date().toISOString() }))
      return
    }
    if (message?.type === 'status.get') {
      client.send(JSON.stringify({
        id: ++studioEventSequence,
        type: 'studio.snapshot',
        at: new Date().toISOString(),
        data: studioRuntimeSnapshot(),
      }))
      return
    }
    client.send(JSON.stringify({
      type: 'studio.error',
      data: { error: 'Unsupported message type. Available messages: ping, status.get.' },
    }))
  })

  client.on('close', () => studioClients.delete(client))
  client.on('error', () => studioClients.delete(client))
})
server.on('error', error => {
  logger.error({ event: 'http.server-failed', code: error?.code || 'unknown' })
  process.exitCode = 1
})

await startSocket().catch(() => {
  state = 'degraded'
  publishStudioEvent('whatsapp.status', studioRuntimeSnapshot())
  logger.error({ event: 'whatsapp.initial-start-failed' })
  scheduleReconnect()
})

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  state = 'stopping'
  publishStudioEvent('whatsapp.status', studioRuntimeSnapshot())
  for (const client of studioClients) client.close(1001, 'Aharane is shutting down')
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
