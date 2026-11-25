import { appendFile, cp, lstat, mkdir, open, readFile, realpath, readdir, rename, rm, stat, statfs, symlink, writeFile } from 'node:fs/promises'
import { constants as fsConstants, createReadStream } from 'node:fs'
import { createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { createSourceZip } from './source-export.js'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve, join, dirname, sep, relative, isAbsolute, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { WebSocket, WebSocketServer } from 'ws'
import pino from 'pino'
import makeWASocket, { Browsers, DisconnectReason, useMultiFileAuthState, WAMessageStubType, downloadMediaMessage, getKeyAuthor, jidNormalizedUser } from '@itsliaaa/baileys'
import { createPollVoteEnvelope, decryptIncomingPollVote } from './chat-polls.js'
import {
  isPrivateVisibleChatJid,
  isSafeMessageUpsert,
  normalizePhone,
  senderNumberFromJid,
} from './policy.js'
import { createAccountRuntime } from './account-runtime.js'
import {
  WHATSAPP_LIBRARY,
  WHATSAPP_TRANSPORT_CONTRACT_VERSION,
  inspectWhatsAppCapabilities,
  normalizeReceiptStatus,
} from './whatsapp-contract.js'
import { loadCommandRegistry, dispatchCommand, parseCommand } from './command-registry.js'
import { resolveExecutionAuthorization } from './authorization.js'
import { loadOwnerConfig, normalizeOwnerConfig, saveOwnerConfig } from './owner-config.js'
import { createWhatsAppDiscovery } from './whatsapp-discovery.js'
import { compareUpdateContents, extractUpdateArchive, inspectUpdateArchive, MAX_ARCHIVE_BYTES, normalizeUpdatePath } from './update-manager.js'
import { createChatStore } from './chat-store.js'
import { createEngineStore } from './engine-store.js'
import { createSchedulerStore } from './scheduler-store.js'
import { createSchedulerRunner } from './scheduler-runner.js'
import {
  createEngineRunner,
  describeEngineCapabilities,
  diagnoseEngine,
  httpResponseForEnvelope,
  invokeEngine,
} from './engine-invocation.js'
import { loadStudioSettings, saveStudioSettings, normalizeStudioSettings, normalizeChatVisibility, normalizeChatAppearance, isChatVisible, envView } from './studio-settings.js'
import { createActivityStore } from './activity-store.js'
import { createAiReplyService } from './ai-reply.js'
import { createVisualCommandStore, normalizeWorkflow, assertSupportedWorkflowSchema, exportWorkflow, importWorkflow, validateWorkflow, executeVisualWorkflow, currentVisualNodeLibrary, registerEngineNode, unregisterEngineNode } from './visual-command-builder.js'

const APP_NAME = 'Aharane'
const PROCESS_STARTED_AT = Date.now()

const PRIVATE_COMMAND_PREFIX = '.'
const PUBLIC_COMMAND_PREFIX = '!'
const HOST = process.env.AHARANE_HOST || '127.0.0.1'
const PORT = Number(process.env.AHARANE_PORT || 8790)
const DATA_DIR = resolve(process.env.AHARANE_DATA_DIR || '/var/lib/aharane')
// The existing auth directory remains the public session so upgrades do not
// require moving or re-pairing the current linked device.
const AUTH_DIR = join(DATA_DIR, 'whatsapp-auth')
const PRIVATE_AUTH_DIR = join(DATA_DIR, 'whatsapp-auth-private')
const OWNER_CONFIG_FILE = join(DATA_DIR, 'owner-config.json')
const ADMIN_AUTH_FILE = join(DATA_DIR, 'admin-auth.json')
const ADMIN_SETUP_CODE_FILE = join(DATA_DIR, 'admin-setup-code')
const ADMIN_TOKEN = String(process.env.AHARANE_ADMIN_TOKEN || '')
const LEGACY_PRIVATE_OWNER_NUMBER = String(process.env.AHARANE_PRIVATE_OWNER_NUMBER || '')
const LEGACY_PUBLIC_OWNER_NUMBER = String(process.env.AHARANE_PUBLIC_OWNER_NUMBER || process.env.AHARANE_OWNER_NUMBER || '')
const LEGACY_PUBLIC_BOT_NUMBER = String(process.env.AHARANE_PUBLIC_BOT_NUMBER || '')
const APP_BASE = resolve('/opt/aharane')
const CURRENT_RELEASE = join(APP_BASE, 'current')
const RELEASES_DIR = join(APP_BASE, 'releases')
const UPDATE_DIR = join(DATA_DIR, 'updates')
const DEPLOY_LOCK_DIR = join(DATA_DIR, 'deploy-lock')
const UPLOADS_DIR = join(UPDATE_DIR, 'uploads')
const UPDATE_STATE_FILE = join(UPDATE_DIR, 'state.json')
const MANUAL_EDIT_STATE_FILE = join(UPDATE_DIR, 'manual-edit-state.json')
const UPDATE_CHUNK_BYTES = 1024 * 1024
const MAX_SOURCE_FILE_BYTES = 512 * 1024
const SOURCE_DIRS = new Set(['src', 'public', 'scripts', 'test', 'examples', 'commands', 'private-commands', 'plugins', 'lib', 'control-centre'])
const SOURCE_ROOT_FILES = new Set(['README.md', 'UPDATE-PACKAGE.md', 'LICENSE', 'AGENTS.md', 'package.json'])
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json', '.md', '.html', '.css', '.txt', '.yml', '.yaml', '.svg', '.webmanifest'])
const execFileAsync = promisify(execFile)
const scryptAsync = promisify(scrypt)
const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const aiReplyService = createAiReplyService({ env: process.env })

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
await mkdir(PRIVATE_AUTH_DIR, { recursive: true, mode: 0o700 })
await mkdir(UPDATE_DIR, { recursive: true, mode: 0o700 })
await mkdir(UPLOADS_DIR, { recursive: true, mode: 0o700 })

let ownerConfig = await loadOwnerConfig(OWNER_CONFIG_FILE, {
  privateOwnerNumber: LEGACY_PRIVATE_OWNER_NUMBER,
  publicOwnerNumber: LEGACY_PUBLIC_OWNER_NUMBER,
  publicBotNumber: LEGACY_PUBLIC_BOT_NUMBER,
})
const chatStore = createChatStore({ dataDir: DATA_DIR, logger })
const activityStore = createActivityStore({ dataDir: DATA_DIR })
const visualCommandStore = createVisualCommandStore(join(DATA_DIR, 'visual-commands.json'))
const engineStore = createEngineStore({ dataDir: DATA_DIR })
const schedulerStore = createSchedulerStore(join(DATA_DIR, 'scheduled-workflows.json'))
await Promise.all([chatStore.init(), activityStore.init(), visualCommandStore.init(), engineStore.init(), schedulerStore.init()])
for (const engine of await engineStore.list()) registerEngineNode(engine)

// Workflows and the Scheduler reach the sandbox only through invokeEngine (via this runner). A
// pinned revision runs exactly that saved snapshot; otherwise the latest saved Engine runs and its
// revision is recorded in the result.
const runStoredEngine = createEngineRunner({ store: engineStore, logger })

async function executeScheduledWorkflow(schedule) {
  const workflow = visualCommandStore.get(schedule.workflowId)
  if (!workflow || !workflow.enabled) throw new Error('The scheduled command is missing or disabled.')
  const trigger = workflow.nodes.find(node => node.type === 'trigger.command')
  if (!trigger) throw new Error('Only saved command-trigger workflows can be scheduled.')
  const destinationError = scheduledDestinationError(workflow, schedule.destinationJid)
  if (destinationError) throw new Error(destinationError)

  const session = accountRuntime?.get(schedule.account)
  if (!session || session.state !== 'connected' || !session.socket) {
    throw new Error('The ' + schedule.account + ' WhatsApp session is not connected. This occurrence was recorded as failed and will not be replayed.')
  }
  const currentSocket = session.socket
  const destinationJid = schedule.destinationJid
  // Re-evaluate owner privilege now; an approval from when the schedule was
  // created is never trusted after the owner configuration or session changed.
  const privileges = resolveExecutionAuthorization({
    source: 'scheduler',
    sessionId: schedule.account,
    ownerConfig,
    ownJid: currentSocket.user?.id || '',
  })
  if (schedule.account === 'private' && !privileges.privateControl) {
    throw new Error('Scheduled run denied by owner policy (' + privileges.decisions.privateControl.reason + '). This occurrence was recorded as failed and will not be replayed.')
  }
  const ownerNumber = schedule.account === 'private'
    ? ownerConfig.privateOwnerNumber
    : ownerConfig.publicOwnerNumber
  const senderJid = String(ownerNumber || '').replace(/\\D/g, '') + '@s.whatsapp.net'
  const visualWorkflowSocket = {
    sendMessage: async (...args) => {
      const sent = await currentSocket.sendMessage(...args)
      if (sent?.key?.id) await chatStore.recordMessage({ sessionId: schedule.account, message: sent, socket: currentSocket })
      return sent
    },
  }
  for (const method of [
    'groupMetadata',
    'groupUpdateSubject',
    'groupUpdateDescription',
    'groupParticipantsUpdate',
    'groupSettingUpdate',
    'updateBlockStatus',
    'updateProfileName',
    'updateProfileStatus',
    'newsletterCreate',
    'newsletterFollow',
    'newsletterUnfollow',
  ]) {
    if (typeof currentSocket[method] === 'function') {
      visualWorkflowSocket[method] = (...args) => currentSocket[method](...args)
    }
  }

  const prefix = schedule.account === 'private' ? PRIVATE_COMMAND_PREFIX : PUBLIC_COMMAND_PREFIX
  const commandName = String(trigger.config.command || '')
  const messageText = prefix + commandName + ' scheduled'
  const message = {
    key: {
      id: 'aharane-scheduled-' + String(schedule.claimedRunId).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120),
      remoteJid: destinationJid,
      fromMe: true,
      ...(destinationJid.endsWith('@g.us') ? { participant: currentSocket.user?.id || senderJid } : {}),
    },
    message: { conversation: messageText },
  }
  const result = await executeVisualWorkflow(workflow, {
    store: visualCommandStore,
    runEngine: runStoredEngine,
    context: {
      sessionId: schedule.account,
      privateControl: privileges.privateControl,
      isPublicOwner: privileges.isPublicOwner,
      allowedPublicSender: privileges.allowedPublicSender,
      socket: visualWorkflowSocket,
      message,
      messageText,
      sender: senderJid,
      senderJid,
      isGroupChat: destinationJid.endsWith('@g.us'),
      remoteJid: destinationJid,
      commandName,
      rawArgs: '',
      args: [],
      scheduledExecution: true,
      scheduleId: schedule.id,
      scheduleRunId: schedule.claimedRunId,
    },
  })
  if (!result.ok) throw new Error(result.error || 'Scheduled workflow failed.')
  return {
    ok: true,
    summary: 'Scheduled command .' .replace('.', prefix) + commandName + ' completed.',
    trace: result.trace,
  }
}
const SETTINGS_FILE = join(DATA_DIR, 'studio-settings.json')
const CHAT_WALLPAPER_FILE = join(DATA_DIR, 'chat-wallpaper')
let studioSettings = await loadStudioSettings(SETTINGS_FILE)
let accountRuntime = null
let publicCommandRegistry = null
let privateCommandRegistry = null
let updateInProgress = false
let shuttingDown = false
let sourceMutationTail = Promise.resolve()

const seenMessageIds = new Map()
const commandTimes = new Map()
const studioClients = new Set()
let studioEventSequence = 0

function studioRuntimeSnapshot() {
  const runtime = accountRuntime?.snapshot() || {
    state: 'starting',
    connected: false,
    registered: false,
    reconnectAttempts: 0,
    lastConnectedAt: null,
    accounts: {},
  }
  return {
    ...runtime,
    groupsEnabled: false,
    ownerIdentities: {
      ownerConfigured: Boolean(ownerConfig?.ownerNumber || ownerConfig?.privateOwnerNumber),
      privateOwnerConfigured: Boolean(ownerConfig?.ownerNumber || ownerConfig?.privateOwnerNumber),
      publicOwnerConfigured: Boolean(ownerConfig?.ownerNumber || ownerConfig?.publicOwnerNumber),
    },
  }
}

function publishStudioEvent(type, data = {}) {
  void activityStore.append({ level: type.includes('failed') || type.includes('error') ? 'error' : 'info', source: 'runtime', message: type, details: data }).catch(() => {})
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

const ADMIN_SESSION_COOKIE = 'aharane_admin_session'
const ADMIN_SESSION_SECONDS = 30 * 24 * 60 * 60
const adminLoginAttempts = new Map()
let adminSetupInProgress = false

function requestCookie(req, name) {
  const raw = String(req.headers?.cookie || '')
  for (const part of raw.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) {
      try { return decodeURIComponent(value.join('=')) } catch { return '' }
    }
  }
  return ''
}

function sameOriginRequest(req) {
  const origin = String(req.headers?.origin || req.get?.('origin') || '')
  const host = String(req.headers?.host || req.get?.('host') || '').toLowerCase()
  if (!origin || !host) return false
  try {
    const url = new URL(origin)
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)
    return url.host.toLowerCase() === host && (url.protocol === 'https:' || (local && url.protocol === 'http:'))
  } catch { return false }
}

function allowAdminLogin(ip) {
  const now = Date.now(), windowMs = 15 * 60 * 1000
  const old = adminLoginAttempts.get(ip)
  const record = !old || now - old.startedAt >= windowMs ? { startedAt: now, count: 0 } : old
  record.count += 1
  adminLoginAttempts.set(ip, record)
  for (const [key, value] of adminLoginAttempts) if (now - value.startedAt >= windowMs) adminLoginAttempts.delete(key)
  return record.count <= 8
}

function validPassword(password) {
  const value = String(password || '')
  const bytes = Buffer.byteLength(value, 'utf8')
  return bytes >= 12 && bytes <= 128 && !value.includes('\0')
}

async function passwordDigest(password, salt) {
  return await scryptAsync(String(password), Buffer.from(salt, 'base64url'), 64, {
    N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024,
  })
}

async function makePasswordRecord(password) {
  const salt = randomBytes(16).toString('base64url')
  const passwordHash = (await passwordDigest(password, salt)).toString('base64url')
  return {
    passwordHash,
    salt,
    sessionKey: randomBytes(32).toString('base64url'),
    passwordChangedAt: new Date().toISOString(),
  }
}

async function passwordMatches(password, auth) {
  if (!auth?.passwordHash || !auth?.salt || !validPassword(password)) return false
  const actual = await passwordDigest(password, auth.salt)
  const expected = Buffer.from(auth.passwordHash, 'base64url')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function adminSessionSignature(expiry, auth) {
  const key = Buffer.from(String(auth?.sessionKey || ''), 'base64url')
  if (key.length !== 32) return ''
  return createHmac('sha256', key).update('aharane-admin-session-v2:' + String(expiry)).digest('base64url')
}

function adminSessionMatches(candidate, auth) {
  const parts = String(candidate || '').split('.')
  if (parts.length !== 2 || !auth?.sessionKey) return false
  const expiry = Number(parts[0]), now = Math.floor(Date.now() / 1000)
  if (!Number.isSafeInteger(expiry) || expiry <= now || expiry > now + ADMIN_SESSION_SECONDS + 60) return false
  const actual = Buffer.from(parts[1])
  const expected = Buffer.from(adminSessionSignature(parts[0], auth))
  return actual.length === expected.length && expected.length > 0 && timingSafeEqual(actual, expected)
}

function setAdminSessionCookie(res, auth) {
  const expiry = Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS
  const session = expiry + '.' + adminSessionSignature(expiry, auth)
  const cookie = ADMIN_SESSION_COOKIE + '=' + encodeURIComponent(session) +
    '; Path=/aharane/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + ADMIN_SESSION_SECONDS
  res.set('Set-Cookie', cookie)
  return expiry
}

function clearAdminSessionCookie(res) {
  res.set('Set-Cookie', ADMIN_SESSION_COOKIE + '=; Path=/aharane/; HttpOnly; Secure; SameSite=Strict; Max-Age=0')
}

async function requireAdmin(req, res, next) {
  try {
    const authorization = String(req.get('authorization') || '')
    const match = authorization.match(/^Bearer\s+(.+)$/i)
    const bearer = match?.[1] || ''
    const auth = await readJsonFile(ADMIN_AUTH_FILE)
    const cookieSession = adminSessionMatches(requestCookie(req, ADMIN_SESSION_COOKIE), auth)
    const bearerSession = adminSessionMatches(bearer, auth)
    // The install-time token is only a bootstrap credential. Once the owner
    // creates a Studio password, revoke that permanent bearer alternative.
    const adminBearer = !auth?.passwordHash && tokenMatches(bearer)
    if (!adminBearer && !bearerSession && !cookieSession) {
      res.status(401).json({ ok: false, error: 'Admin authentication required' })
      return
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
        !adminBearer && !bearerSession && !sameOriginRequest(req)) {
      res.status(403).json({ ok: false, error: 'Cross-origin requests are not allowed.' })
      return
    }
    next()
  } catch {
    res.status(500).json({ ok: false, error: 'Could not verify the admin session.' })
  }
}

function allowCommand(sender) {
  const now = Date.now()
  const previous = commandTimes.get(sender) || 0
  const configuredCooldown = Number(studioSettings?.[sender.split(':')[0]]?.commandCooldown ?? 1.2)
  const cooldownMs = Number.isFinite(configuredCooldown) ? Math.max(0, configuredCooldown * 1000) : 1200
  if (cooldownMs > 0 && now - previous < cooldownMs) return false
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
async function acquireDeployLock(source) {
  try { await mkdir(DEPLOY_LOCK_DIR, { mode: 0o700 }) }
  catch (error) { if (error?.code === 'EEXIST') return false; throw error }
  try {
    await writeJsonAtomic(join(DEPLOY_LOCK_DIR, 'owner.json'), { source: String(source || 'source-mutation'), pid: process.pid, startedAt: new Date().toISOString() })
    return true
  } catch (error) {
    await rm(DEPLOY_LOCK_DIR, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}
async function setDeployLockSource(source) {
  await writeJsonAtomic(join(DEPLOY_LOCK_DIR, 'owner.json'), { source: String(source || 'deployment'), pid: process.pid, startedAt: new Date().toISOString() })
}
async function releaseDeployLock() {
  await rm(DEPLOY_LOCK_DIR, { recursive: true, force: true })
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

async function clearEmptyStaleManualEdits(currentRelease, manual) {
  if (manual?.status !== 'pending' || manual.currentRelease === currentRelease ||
      !Array.isArray(manual.modifiedPaths) || manual.modifiedPaths.length !== 0) return false
  const workspace = String(manual.workspaceRelease || '')
  if (!workspace.startsWith(RELEASES_DIR + sep)) {
    sourcePathError(409, 'MANUAL_WORKSPACE_INVALID', 'The stale source workspace is outside Aharane releases.')
  }
  const actual = await realpath(workspace).catch(() => null)
  if (!actual || !actual.startsWith(RELEASES_DIR + sep) || actual === currentRelease) {
    sourcePathError(409, 'MANUAL_WORKSPACE_MISSING', 'The stale source workspace cannot be safely discarded.')
  }
  await rm(actual, { recursive: true, force: true })
  await rm(MANUAL_EDIT_STATE_FILE, { force: true })
  return true
}

async function sourceWorkspaceDirectory() {
  const current = await currentReleaseDirectory()
  const manual = await readJsonFile(MANUAL_EDIT_STATE_FILE)
  if (manual?.status !== 'pending') return current
  if (await clearEmptyStaleManualEdits(current, manual)) return current
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
  if (info?.isFile() && parts.length > 1 && !SOURCE_EXTENSIONS.has(extname(parts.at(-1)).toLowerCase())) {
    sourcePathError(403, 'FILE_TYPE_NOT_ALLOWED', 'Only approved text and source files are available in the editor.')
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
    // Enumerate the real release root first, then apply the explicit allowlist.
    // The old per-name safeSourceTarget loop silently converted every path error
    // into an empty result, making a healthy release look like an empty Files root.
    const base = await sourceWorkspaceDirectory()
    const rows = await readdir(base, { withFileTypes: true })
    const rootEntries = []
    for (const row of rows) {
      if (row.isSymbolicLink()) continue
      const isFolder = row.isDirectory() && SOURCE_DIRS.has(row.name)
      const isFile = row.isFile() && SOURCE_ROOT_FILES.has(row.name)
      if (!isFolder && !isFile) continue
      const info = await lstat(join(base, row.name)).catch(() => null)
      if (!info || info.isSymbolicLink() || (isFolder && !info.isDirectory()) || (isFile && !info.isFile())) continue
      rootEntries.push({
        name: row.name,
        path: row.name,
        type: isFolder ? 'folder' : 'file',
        size: isFile ? info.size : null,
        modified: info.mtime.toISOString(),
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
      const cleared = await clearEmptyStaleManualEdits(currentRelease, existing)
      if (!cleared) {
        const workspace = String(existing.workspaceRelease || '')
        const actual = await realpath(workspace).catch(() => null)
        if (!workspace.startsWith(RELEASES_DIR + sep) || !actual ||
            !actual.startsWith(RELEASES_DIR + sep) || actual === currentRelease) {
          sourcePathError(409, 'MANUAL_WORKSPACE_MISSING', 'The older source draft is missing or cannot be safely opened.')
        }
        // Keep the previous draft writable so autosave, rename, move and delete
        // continue to work. Applying it still requires the explicit recovery step.
        return existing
      }
    } else {
      const workspace = String(existing.workspaceRelease || '')
      if (!workspace.startsWith(RELEASES_DIR + sep) || !await stat(workspace).catch(() => null)) {
        sourcePathError(409, 'MANUAL_WORKSPACE_MISSING', 'The saved source workspace is missing. Discard the pending edits before continuing.')
      }
      return existing
    }
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
async function recoverStaleManualEditWorkspace() {
  const currentRelease = await currentReleaseDirectory()
  const manual = await readJsonFile(MANUAL_EDIT_STATE_FILE)
  if (manual?.status !== 'pending') {
    sourcePathError(409, 'NO_MANUAL_DRAFT', 'There is no saved Files Manager draft to recover.')
  }
  if (manual.currentRelease === currentRelease) {
    return { ...manual, recovered: false }
  }

  const workspacePath = String(manual.workspaceRelease || '')
  if (!workspacePath.startsWith(RELEASES_DIR + sep)) {
    sourcePathError(409, 'MANUAL_WORKSPACE_INVALID', 'The older source draft is outside Aharane releases.')
  }
  const oldWorkspace = await realpath(workspacePath).catch(() => null)
  if (!oldWorkspace || !oldWorkspace.startsWith(RELEASES_DIR + sep) || oldWorkspace === currentRelease) {
    sourcePathError(409, 'MANUAL_WORKSPACE_MISSING', 'The older source draft is missing or cannot be safely recovered.')
  }

  const newWorkspace = join(RELEASES_DIR, `manual-edit-workspace-recovered-${Date.now()}-${randomUUID().slice(0, 8)}`)
  const allowedActions = new Set([
    'modified-file', 'created-file', 'deleted-file', 'deleted-folder', 'created-folder',
    'renamed-from', 'renamed-to', 'moved-from', 'moved-to',
  ])
  const entries = []
  for (const item of manual.modifiedPaths || []) {
    const action = String(item?.action || '')
    if (!allowedActions.has(action)) {
      sourcePathError(409, 'MANUAL_DRAFT_REVIEW_REQUIRED', 'The older draft contains an operation that needs manual review.')
    }
    const normalized = normalizeUpdatePath(String(item?.path || '')).path
    const parts = normalized.split('/')
    if (parts.length > 8 || parts.some(part => part.startsWith('.') ||
        (!SOURCE_DIRS.has(parts[0]) && !(parts.length === 1 && SOURCE_ROOT_FILES.has(parts[0]))))) {
      sourcePathError(403, 'PATH_NOT_ALLOWED', 'The older draft contains a path outside the editable Aharane source workspace.')
    }
    entries.push({ path: normalized, action })
  }

  async function inspectEntry(root, relativePath) {
    const parts = relativePath.split('/')
    let full = root
    let info = null
    for (let index = 0; index < parts.length; index += 1) {
      full = join(full, parts[index])
      info = await lstat(full).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error))
      if (!info) return { full, info: null }
      if (info.isSymbolicLink()) {
        sourcePathError(403, 'SYMLINK_BLOCKED', 'A draft recovery path cannot be a symbolic link.')
      }
      if (index < parts.length - 1 && !info.isDirectory()) {
        sourcePathError(409, 'MANUAL_DRAFT_REVIEW_REQUIRED', 'A draft parent path is no longer a folder: ' + relativePath)
      }
    }
    if (info) {
      const actual = await realpath(full)
      const actualRelative = relative(root, actual)
      if (actualRelative === '..' || actualRelative.startsWith('..' + sep) || isAbsolute(actualRelative)) {
        sourcePathError(403, 'PATH_ESCAPE', 'A draft recovery path resolves outside its release directory.')
      }
    }
    return { full, info }
  }

  try {
    await cp(currentRelease, newWorkspace, {
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
      await symlink(await realpath(modulesPath), join(newWorkspace, 'node_modules'), 'dir')
    }

    const ignored = new Set()
    // A deleted directory supersedes every earlier edit below that path.
    // Do not try to replay children that no longer exist in the saved workspace.
    for (const folder of entries.filter(item => item.action === 'deleted-folder')) {
      for (const entry of entries) if (entry.path.startsWith(folder.path + '/')) ignored.add(entry.path)
    }
    const movePairs = []
    const fromEntries = entries.filter(item => ['renamed-from', 'moved-from'].includes(item.action))
    const toEntries = entries.filter(item => ['renamed-to', 'moved-to'].includes(item.action))
    for (const destination of toEntries) {
      const isRename = destination.action === 'renamed-to'
      const candidates = fromEntries.filter(source =>
        !ignored.has(source.path) &&
        source.action === (isRename ? 'renamed-from' : 'moved-from') &&
        (isRename
          ? dirname(source.path) === dirname(destination.path)
          : source.path.split('/').at(-1) === destination.path.split('/').at(-1))
      )
      const stagedDestination = await inspectEntry(oldWorkspace, destination.path)
      if (!stagedDestination.info) continue
      const source = candidates.find(candidate => candidate.path !== destination.path)
      if (!source) continue
      const sourceInDraft = await inspectEntry(oldWorkspace, source.path)
      // The source path has normally disappeared from the staged tree. Its
      // destination contains the complete renamed/moved file or directory.
      if (sourceInDraft.info) continue
      ignored.add(source.path)
      ignored.add(destination.path)
      const isDirectory = stagedDestination.info.isDirectory()
      const covers = path => path === source.path || path === destination.path ||
        (isDirectory && (path.startsWith(source.path + '/') || path.startsWith(destination.path + '/')))
      for (const entry of entries) if (covers(entry.path)) ignored.add(entry.path)
      movePairs.push({ sourcePath: source.path, destinationPath: destination.path, isDirectory })
    }

    const removals = entries.filter(item =>
      !ignored.has(item.path) && ['deleted-file', 'deleted-folder', 'renamed-from', 'moved-from'].includes(item.action)
    )
    const folders = entries.filter(item => !ignored.has(item.path) && item.action === 'created-folder')
    const copies = entries.filter(item =>
      !ignored.has(item.path) && ['modified-file', 'created-file', 'renamed-to', 'moved-to'].includes(item.action)
    )

    async function copyDraftEntry(sourcePath, destinationPath, expectedType = null) {
      const source = await inspectEntry(oldWorkspace, sourcePath)
      if (!source.info || (expectedType === 'file' && !source.info.isFile()) ||
          (expectedType === 'folder' && !source.info.isDirectory())) {
        sourcePathError(409, 'MANUAL_DRAFT_REVIEW_REQUIRED', 'A saved draft item is missing or has the wrong type: ' + sourcePath)
      }
      const target = await inspectEntry(newWorkspace, destinationPath)
      if (target.info) await rm(target.full, { recursive: target.info.isDirectory(), force: true })
      await mkdir(dirname(target.full), { recursive: true, mode: 0o750 })
      const parent = await realpath(dirname(target.full))
      const parentRelative = relative(newWorkspace, parent)
      if (parentRelative === '..' || parentRelative.startsWith('..' + sep) || isAbsolute(parentRelative)) {
        sourcePathError(403, 'PATH_ESCAPE', 'A recovered draft parent resolves outside the current release.')
      }
      await cp(source.full, target.full, { recursive: source.info.isDirectory(), force: true })
    }

    for (const item of removals) {
      const target = await inspectEntry(newWorkspace, item.path)
      if (target.info) await rm(target.full, { recursive: target.info.isDirectory(), force: true })
    }
    for (const item of folders) {
      const target = await inspectEntry(newWorkspace, item.path)
      if (target.info && !target.info.isDirectory()) await rm(target.full, { force: true })
      await mkdir(target.full, { recursive: true, mode: 0o750 })
    }
    for (const pair of movePairs) {
      const target = await inspectEntry(newWorkspace, pair.sourcePath)
      if (target.info) await rm(target.full, { recursive: target.info.isDirectory(), force: true })
      await copyDraftEntry(pair.destinationPath, pair.destinationPath, pair.isDirectory ? 'folder' : 'file')
    }
    for (const item of copies) {
      await copyDraftEntry(item.path, item.path, ['modified-file', 'created-file'].includes(item.action) ? 'file' : null)
    }

    const recovered = {
      ...manual,
      currentRelease,
      previousRelease: currentRelease,
      workspaceRelease: newWorkspace,
      rebasedFrom: manual.currentRelease,
      rebasedAt: new Date().toISOString(),
    }
    await writeJsonAtomic(MANUAL_EDIT_STATE_FILE, recovered)
    await rm(oldWorkspace, { recursive: true, force: true }).catch(() => {})
    return { ...recovered, recovered: true }
  } catch (error) {
    await rm(newWorkspace, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

async function recordManualEdits(changes) {
  const state = await ensureManualEditBackup()
  const byPath = new Map((state.modifiedPaths || []).map(item => [item.path, item]))
  const modifiedAt = new Date().toISOString()
  for (const change of changes || []) {
    if (!change?.path || !change?.action) continue
    byPath.set(change.path, { path: change.path, action: change.action, modifiedAt })
  }
  state.modifiedPaths = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
  await writeJsonAtomic(MANUAL_EDIT_STATE_FILE, state)
  return state
}
async function recordManualEdit(sourcePath, action) {
  return recordManualEdits([{ path: sourcePath, action }])
}

async function validateSourceContent(sourcePath, content, { syntax = true } = {}) {
  if (Buffer.byteLength(content, 'utf8') > MAX_SOURCE_FILE_BYTES) {
    sourcePathError(413, 'FILE_TOO_LARGE', 'Source files must be 512 KB or smaller in the editor.')
  }
  if (!syntax) return
  const extension = extname(sourcePath).toLowerCase()
  if (['.json', '.webmanifest'].includes(extension)) {
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

async function validateManualEditWorkspaceFiles(workspace, modifiedPaths) {
  const checked = new Set()
  for (const item of modifiedPaths || []) {
    if (!['modified-file', 'created-file', 'renamed-to', 'moved-to'].includes(item?.action)) continue
    const normalized = normalizeUpdatePath(String(item?.path || '')).path
    if (normalized === 'package.json' || normalized === 'package-lock.json') {
      sourcePathError(409, 'DEPENDENCY_UPDATE_REQUIRED', 'Package and dependency manifest changes must be deployed as a validated ZIP update so production dependencies can be installed safely.')
    }
    if (checked.has(normalized)) continue
    checked.add(normalized)
    const parts = normalized.split('/')
    if (!SOURCE_DIRS.has(parts[0]) && !(parts.length === 1 && SOURCE_ROOT_FILES.has(parts[0]))) {
      sourcePathError(403, 'PATH_NOT_ALLOWED', 'A staged file is outside the editable Aharane source workspace.')
    }
    const full = join(workspace, ...parts)
    const info = await lstat(full).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error))
    if (!info || !info.isFile()) continue
    if (info.isSymbolicLink()) sourcePathError(403, 'SYMLINK_BLOCKED', 'A staged source file cannot be a symbolic link.')
    const extension = extname(normalized).toLowerCase()
    if (['.json', '.webmanifest'].includes(extension)) {
      try { JSON.parse(await readFile(full, 'utf8')) }
      catch { sourcePathError(400, 'INVALID_JSON', 'A staged JSON or web manifest file is not valid JSON: ' + normalized) }
    }
    if (['.js', '.mjs', '.cjs'].includes(extension)) {
      try {
        await execFileAsync(process.execPath, ['--check', full], { cwd: workspace, timeout: 10_000, maxBuffer: 32 * 1024 })
      } catch (error) {
        const message = String(error?.stderr || error?.message || 'JavaScript syntax validation failed.')
          .replaceAll(full, normalized).split('\n').slice(0, 4).join(' ').slice(0, 360)
        sourcePathError(400, 'INVALID_SOURCE_SYNTAX', message || ('JavaScript syntax validation failed: ' + normalized))
      }
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
    await releaseDeployLock().catch(() => {})
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

function currentPollActorKey(accountId) {
  const socket = accountRuntime.get(accountId)?.socket
  const voterJid = jidNormalizedUser(String(socket?.user?.id || ''))
  return voterJid ? createHash('sha256').update(voterJid, 'utf8').digest('hex') : ''
}

function findPollUpdate(message) {
  let current = message?.message
  for (let depth = 0; current && depth < 6; depth += 1) {
    if (current.pollUpdateMessage) return current.pollUpdateMessage
    const next =
      current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.viewOnceMessageV2Extension?.message ||
      current.deviceSentMessage?.message ||
      current.documentWithCaptionMessage?.message ||
      current.editedMessage?.message ||
      null
    if (!next) return null
    current = next
  }
  return null
}

async function applyIncomingPollVote(accountId, currentSocket, message, pollUpdate) {
  const jid = String(message?.key?.remoteJid || '')
  const pollMessageId = String(pollUpdate?.pollCreationMessageKey?.id || '')
  const normalizedMe = jidNormalizedUser(String(currentSocket?.user?.id || ''))
  const voterJid = getKeyAuthor(message?.key, normalizedMe)
  if (!jid || !pollMessageId || !voterJid || !normalizedMe) return false
  const pollMessage = await chatStore.getMessage(accountId, jid, pollMessageId)
  if (!pollMessage || pollMessage.type !== 'poll' || !pollMessage.sourceMessage) return false
  const selectedHashes = decryptIncomingPollVote({
    pollMessage,
    vote: pollUpdate.vote,
    voterJid,
  })
  if (!selectedHashes.length) return false
  const actorKey = createHash('sha256').update(String(voterJid), 'utf8').digest('hex')
  const result = await chatStore.applyPollVote(accountId, jid, pollMessageId, actorKey, selectedHashes)
  if (!result) return false
  publishStudioEvent('whatsapp.poll.updated', { accountId, jid, pollMessageId })
  return true
}

function markMessageSeen(id) {
  if (!id) return false
  if (seenMessageIds.has(id)) return true
  seenMessageIds.set(id, Date.now())
  if (seenMessageIds.size > 3000) {
    const first = seenMessageIds.keys().next().value
    seenMessageIds.delete(first)
  }
  return false
}

const whatsappDiscovery = createWhatsAppDiscovery()

async function handleMessages(sessionId, currentSocket, event) {
  if (!isSafeMessageUpsert(event)) return
  for (const message of event.messages) {
    if (!message?.message || !message.key?.id) continue

    const remoteJid = String(message.key?.remoteJid || '')
    if (remoteJid === 'status@broadcast') {
      continue // Status is excluded from Aharane and is never stored or exposed.
    }
    const pollUpdate = findPollUpdate(message)
    if (pollUpdate) {
      const shouldPersistPoll = sessionId === 'private'
        ? isPrivateVisibleChatJid(remoteJid)
        : sessionId === 'public' && message.key.fromMe !== true && isPrivateVisibleChatJid(remoteJid)
      if (shouldPersistPoll) {
        try {
          await applyIncomingPollVote(sessionId, currentSocket, message, pollUpdate)
        } catch (error) {
          logger.warn?.({
            event: 'chat.poll.vote-decrypt-failed',
            accountId: sessionId,
            pollMessageId: String(pollUpdate.pollCreationMessageKey?.id || ''),
            error: String(error?.message || error).slice(0, 180),
          })
        }
      }
      continue
    }
    const rawSenderJid = String(message.key?.participant || remoteJid)
    const senderAlternateJid = String(remoteJid.endsWith('@g.us')
      ? (message.key?.participantAlt || '')
      : (message.key?.remoteJidAlt || ''))
    // Prefer the phone-number identity paired by Baileys when WhatsApp uses
    // LIDs. This is used for allow-list, owner and rate-limit checks only;
    // outgoing replies continue to use the original remoteJid.
    const senderJid = senderNumberFromJid(rawSenderJid)
      ? rawSenderJid
      : (senderNumberFromJid(senderAlternateJid) ? senderAlternateJid : rawSenderJid)
    const shouldPersist =
      (sessionId === 'private' && isPrivateVisibleChatJid(remoteJid)) ||
      (sessionId === 'public' && message.key.fromMe !== true && isPrivateVisibleChatJid(remoteJid))
    if (shouldPersist) await chatStore.recordMessage({ sessionId, message, socket: currentSocket })
    if (markMessageSeen(sessionId + ':' + message.key.id)) continue

    const messageText = textFromMessage(message)
    let registry
    let isPublicOwner = false
    let privateControl = false
    let allowedForAutomation = false

    // One canonical evaluation per inbound message. Identity proof comes only
    // from verified transport metadata; the privilege flags below are derived
    // here by the evaluator and nowhere else.
    const authorizationProof = {
      source: 'direct',
      sessionId,
      ownerConfig,
      message,
      remoteJid,
      remoteJidAlt: message.key?.remoteJidAlt,
      senderJid,
      participantJid: rawSenderJid,
      participantAltJid: senderAlternateJid,
      ownJid: currentSocket.user?.id || '',
      ownLid: currentSocket.user?.lid || '',
    }
    const privileges = resolveExecutionAuthorization(authorizationProof)

    if (sessionId === 'private') {
      if (!isPrivateVisibleChatJid(remoteJid)) continue
      await chatStore.recordMessage({ sessionId, message, socket: currentSocket })
      if (!privileges.privateControl) continue
      const visualCommandNames = new Set(visualCommandStore.list('private')
        .filter(workflow => workflow.enabled)
        .flatMap(workflow => {
          const trigger = workflow.nodes.find(node => node.type === 'trigger.command')
          return trigger ? [trigger.config.command, ...(trigger.config.aliases || [])].map(value => String(value).toLowerCase()) : []
        }))
      // Private control also requires the text to be a known command.
      const privateCommand = parseCommand(messageText, PRIVATE_COMMAND_PREFIX)
      if (!privateCommand || !(privateCommandRegistry.commands.has(privateCommand.name) ||
          visualCommandNames.has(privateCommand.name))) continue
      privateControl = privileges.privateControl
      allowedForAutomation = true
      registry = privateCommandRegistry
    } else if (sessionId === 'public') {
      if (message.key.fromMe === true || !isPrivateVisibleChatJid(remoteJid)) continue
      // Public direct messages are open to valid WhatsApp senders. Ordinary
      // commands remain direct-chat-only; visual workflows can opt into groups
      // individually through their configured chat scope.
      const allowedToUseCommands = privileges.canRunPublicCommands
      const allowedVisualSender = privileges.allowedPublicSender
      const firstConversationMessage = allowedToUseCommands && !await chatStore.hasConversation(sessionId, remoteJid)
      if (studioSettings.public.autoRead) await currentSocket.readMessages([message.key]).catch(() => {})
      if (!allowedVisualSender) continue
      if (allowedToUseCommands && firstConversationMessage && studioSettings.public.welcomeMessage) {
        const welcome = await currentSocket.sendMessage(remoteJid, { text: studioSettings.public.welcomeMessage })
        await chatStore.recordMessage({ sessionId, message: welcome, socket: currentSocket })
      }
      allowedForAutomation = true
      if (allowedToUseCommands) registry = publicCommandRegistry
      isPublicOwner = privileges.isPublicOwner
    } else {
      continue
    }

    const visualWorkflowSocket = {
      sendMessage: async (...args) => {
        const sent = await currentSocket.sendMessage(...args)
        if (sent?.key?.id) await chatStore.recordMessage({ sessionId, message: sent, socket: currentSocket })
        return sent
      },
    }
    for (const method of [
      'groupMetadata',
      'groupUpdateSubject',
      'groupUpdateDescription',
      'groupParticipantsUpdate',
      'groupSettingUpdate',
      'updateBlockStatus',
      'updateProfileName',
      'updateProfileStatus',
      'newsletterCreate',
      'newsletterFollow',
      'newsletterUnfollow',
    ]) {
      if (typeof currentSocket[method] === 'function') {
        visualWorkflowSocket[method] = (...args) => currentSocket[method](...args)
      }
    }

    const workflowContext = {
      sessionId,
      privateControl,
      isPublicOwner,
      allowedPublicSender: sessionId === 'public' && allowedForAutomation,
      socket: visualWorkflowSocket,
      message,
      messageText,
      sender: senderJid,
      senderJid,
      isGroupChat: remoteJid.endsWith('@g.us'),
      remoteJid,
      commandName: '',
      rawArgs: '',
      args: [],
    }

    // Message Received workflows run only after the same account-specific
    // authorization gates used by the existing command dispatcher.
    if (allowedForAutomation && sessionId === 'public' &&
        allowCommand('visual-message:' + (senderJid || remoteJid))) {
      for (const workflow of visualCommandStore.findMessageTriggers(sessionId)) {
        try {
          const result = await executeVisualWorkflow(workflow, { store: visualCommandStore, context: workflowContext, runEngine: runStoredEngine, deduplicate: true })
          if (!result.ok) {
            logger.warn({ event: 'visual-workflow.failed', workflowId: workflow.id, account: sessionId, error: result.error })
            publishStudioEvent('visual-workflow.failed', { workflowId: workflow.id, account: sessionId, error: result.error })
          } else {
            publishStudioEvent('visual-workflow.completed', { workflowId: workflow.id, account: sessionId })
          }
        } catch (error) {
          logger.warn({ event: 'visual-workflow.failed', workflowId: workflow.id, account: sessionId, error: String(error?.message || error) })
        }
      }
    }

    if (!messageText) continue
    const prefix = sessionId === 'private' ? PRIVATE_COMMAND_PREFIX : PUBLIC_COMMAND_PREFIX
    const parsedCommand = parseCommand(messageText, prefix)
    if (!parsedCommand) continue
    if (!allowCommand(sessionId + ':' + (sessionId === 'private'
      ? ownerConfig.privateOwnerNumber
      : senderNumberFromJid(senderJid)))) continue

    const command = parsedCommand.name.slice(0, 40)
    const visualWorkflows = visualCommandStore.findCommand(sessionId, parsedCommand.name)
    if (visualWorkflows.length) {
      for (const workflow of visualWorkflows) {
        try {
          const result = await executeVisualWorkflow(workflow, {
            store: visualCommandStore,
            runEngine: runStoredEngine,
            deduplicate: true,
            context: {
              ...workflowContext,
              commandName: parsedCommand.name,
              rawArgs: parsedCommand.rawArgs,
              args: parsedCommand.args,
            },
          })
          if (!result.ok) {
            logger.warn({ event: 'visual-workflow.failed', workflowId: workflow.id, account: sessionId, command, error: result.error })
            publishStudioEvent('visual-workflow.failed', { workflowId: workflow.id, account: sessionId, command, error: result.error })
          } else {
            publishStudioEvent('visual-workflow.completed', { workflowId: workflow.id, account: sessionId, command })
          }
        } catch (error) {
          logger.warn({ event: 'visual-workflow.failed', workflowId: workflow.id, account: sessionId, command, error: String(error?.message || error) })
        }
      }
      publishStudioEvent('whatsapp.command.received', { sessionId, scope: sessionId, command, visual: true })
      continue
    }
    if (!registry?.commands?.has(parsedCommand.name)) continue

    try {
      const handled = await dispatchCommand({
        registry,
        rawText: messageText,
        prefix,
        auth: authorizationProof,
        onDenied: denied => logger.warn({
          event: 'command.denied', sessionId, command, reason: denied.reason, policyVersion: denied.policyVersion,
        }),
        context: {
          reply: async value => {
            if (studioSettings[sessionId].showTyping) await currentSocket.sendPresenceUpdate('composing', remoteJid).catch(() => {})
            try {
              const sent = await currentSocket.sendMessage(remoteJid, { text: String(value) }, { quoted: message })
              await chatStore.recordMessage({ sessionId, message: sent, socket: currentSocket })
              return sent
            } finally {
              if (studioSettings[sessionId].showTyping) await currentSocket.sendPresenceUpdate('paused', remoteJid).catch(() => {})
            }
          },
        },
      })
      if (!handled) continue
      publishStudioEvent('whatsapp.command.received', { sessionId, scope: sessionId, command })
      publishStudioEvent('whatsapp.command.replied', { sessionId, scope: sessionId, command })
    } catch {
      logger.warn({ event: 'message.command-failed', sessionId, command })
    }
  }
}

publicCommandRegistry = await loadCommandRegistry(new URL('../commands/', import.meta.url), { scope: 'public' })
privateCommandRegistry = await loadCommandRegistry(new URL('../private-commands/', import.meta.url), { scope: 'private' })

accountRuntime = createAccountRuntime({
  authDirs: { public: AUTH_DIR, private: PRIVATE_AUTH_DIR },
  loadAuthState: useMultiFileAuthState,
  makeSocket: ({ auth }) => {
    // The pinned Baileys fork prefers Node's built-in Undici WebSocket on
    // Node 22+, which currently hides useful handshake failure details.
    // Force its supported ws fallback for this Node server instead.
    const nativeWebSocket = globalThis.WebSocket
    try {
      globalThis.WebSocket = undefined
      return makeWASocket({
        auth,
        logger,
        browser: Browsers.macOS('Chrome'),
        markOnlineOnConnect: false,
        syncFullHistory: false,
        // Keep Baileys' default selective history policy. Disabling all sync
        // prevents initial LID mappings and can destabilize fresh WhatsApp links.
        // Baileys 0.5.6 calls messageRetryManager.flushAll() on close, but that
        // method is absent in this release; disable the affected retry cache.
        enableRecentMessageCache: false,
        generateHighQualityLinkPreview: false,
      })
    } finally {
      globalThis.WebSocket = nativeWebSocket
    }
  },
  loggedOutCode: DisconnectReason.loggedOut,
  onMessages: ({ sessionId, socket: currentSocket, event }) =>
    handleMessages(sessionId, currentSocket, event),
  onMessageUpdates: async ({ sessionId, socket, updates }) => {
    if (!Array.isArray(updates)) return
    for (const item of updates) {
      const jid = String(item?.key?.remoteJid || '')
      const messageId = String(item?.key?.id || '')
      if (!jid || !messageId) continue
      const update = item?.update || {}

      // Baileys v7 emits a delete-for-everyone protocol message as a
      // messages.update entry with message=null and messageStubType=REVOKE.
      if (update.message === null && update.messageStubType === WAMessageStubType.REVOKE) {
        if (item.key?.fromMe === false) {
          // Another participant revoked it. Preserve the original content,
          // including our own message if the other participant revoked it.
          await chatStore.markMessageDeletedByOther(sessionId, jid, messageId)
        } else if (item.key?.fromMe === true) {
          // Our linked account revoked its own message; retain the existing
          // explicit owner-side deletion semantics.
          await chatStore.deleteMessage(sessionId, jid, messageId)
        }
        continue
      }

      // Protocol MESSAGE_EDIT updates are also emitted here, not as upserts.
      // Rebuild the original message key from its stored record so its sender,
      // group participant and timestamp remain attached to the edited payload.
      if (update.message?.editedMessage) {
        const existing = await chatStore.getMessage(sessionId, jid, messageId)
        if (existing) {
          await chatStore.recordMessage({
            sessionId,
            socket,
            message: {
              key: {
                remoteJid: jid,
                id: messageId,
                fromMe: existing.fromMe === true,
                ...(existing.participant ? { participant: existing.participant } : {}),
              },
              message: update.message,
              messageTimestamp: update.messageTimestamp || existing.timestamp,
              pushName: existing.pushName || '',
            },
          })
        }
      }

      const status = normalizeReceiptStatus(update.status)
      if (status) await chatStore.updateMessageStatus(sessionId, jid, messageId, status)
    }
  },
  onMessageDeletes: async ({ sessionId, update }) => {
    if (update?.jid && update?.all === true) {
      // A remote clear/delete-all event must not erase the Hub's incoming history.
      // Mark only messages known to be from the other participant; preserve the
      // owner's own messages and any rows whose direction is unknown.
      await chatStore.markConversationIncomingMessagesDeletedRemotely(sessionId, update.jid)
      return
    }
    const keys = Array.isArray(update?.keys) ? update.keys : (update?.key ? [update.key] : [])
    for (const key of keys) {
      const jid = String(key?.remoteJid || '')
      const messageId = String(key?.id || '')
      if (!jid || !messageId) continue
      const existing = await chatStore.getMessage(sessionId, jid, messageId)
      if (!existing || existing.deletedByRemote === true) continue
      if (key?.fromMe === false || (existing.directionKnown !== false && existing.fromMe === false)) {
        // A message deleted by the other participant stays in Aharane Hub.
        // Preserve its body and media reference, with a visible deleted marker.
        await chatStore.markMessageDeletedRemotely(sessionId, jid, messageId, key?.fromMe)
      } else if (key?.fromMe === true || (existing.directionKnown !== false && existing.fromMe === true)) {
        // Keep the existing behaviour for the account owner's own deleted messages.
        await chatStore.deleteMessage(sessionId, jid, messageId)
      }
      // Unknown direction is intentionally kept; never discard a message when
      // the socket event does not identify who sent it.
    }
  },
  publish: () => publishStudioEvent('whatsapp.status', studioRuntimeSnapshot()),
  onCalls: async ({ sessionId, socket, calls }) => {
    if (!studioSettings[sessionId].rejectCalls || !Array.isArray(calls)) return
    for (const call of calls) {
      if (call?.id && call?.from) await socket.rejectCall(call.id, call.from).catch(() => {})
    }
  },
  onConnection: async ({ sessionId, socket, update }) => {
    if (update?.connection === 'open' && socket?.sendPresenceUpdate) {
      await socket.sendPresenceUpdate(studioSettings[sessionId].alwaysOnline ? 'available' : 'unavailable').catch(() => {})
    }
  },
  logger,
})

const app = express()
app.set('trust proxy', 'loopback')
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
app.get('/api/auth/status', async (_req, res) => {
  const auth = await readJsonFile(ADMIN_AUTH_FILE)
  res.json({ ok: true, setupRequired: !auth?.passwordHash })
})

app.post('/api/auth/setup', async (req, res) => {
  if (!sameOriginRequest(req)) return res.status(403).json({ ok: false, error: 'Cross-origin requests are not allowed.' })
  const ip = String(req.ip || 'unknown')
  if (!allowAdminLogin(ip)) return res.status(429).json({ ok: false, error: 'Too many setup attempts. Try again in 15 minutes.' })
  if (adminSetupInProgress) return res.status(409).json({ ok: false, error: 'Password setup is already in progress.' })
  adminSetupInProgress = true
  try {
    if (await readJsonFile(ADMIN_AUTH_FILE)) return res.status(409).json({ ok: false, error: 'A Studio password has already been created.' })
    const suppliedCode = String(req.body?.setupCode || '')
    const storedCode = await readFile(ADMIN_SETUP_CODE_FILE, 'utf8').catch(() => '')
    const supplied = Buffer.from(suppliedCode)
    const expected = Buffer.from(storedCode.trim())
    if (!storedCode || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return res.status(401).json({ ok: false, error: 'The one-time setup code was not accepted. Generate a fresh code on the server.' })
    }
    const password = String(req.body?.password || '')
    if (!validPassword(password)) return res.status(400).json({ ok: false, error: 'Choose a password between 12 and 128 bytes.' })
    const auth = await makePasswordRecord(password)
    await writeJsonAtomic(ADMIN_AUTH_FILE, auth)
    await rm(ADMIN_SETUP_CODE_FILE, { force: true })
    adminLoginAttempts.delete(ip)
    const expiresAt = setAdminSessionCookie(res, auth)
    res.json({ ok: true, expiresAt })
  } catch (error) {
    logger.error({ event: 'admin.password-setup-failed', error: String(error?.message || error) })
    res.status(500).json({ ok: false, error: 'Password setup failed. Generate a new one-time code if required.' })
  } finally {
    adminSetupInProgress = false
  }
})

app.post('/api/auth/login', async (req, res) => {
  if (!sameOriginRequest(req)) return res.status(403).json({ ok: false, error: 'Cross-origin requests are not allowed.' })
  const ip = String(req.ip || 'unknown')
  if (!allowAdminLogin(ip)) return res.status(429).json({ ok: false, error: 'Too many sign-in attempts. Try again in 15 minutes.' })
  try {
    const auth = await readJsonFile(ADMIN_AUTH_FILE)
    if (!auth?.passwordHash) return res.status(409).json({ ok: false, error: 'Create your Studio password first.' })
    if (!await passwordMatches(req.body?.password, auth)) return res.status(401).json({ ok: false, error: 'The Studio password was not accepted.' })
    adminLoginAttempts.delete(ip)
    const expiresAt = setAdminSessionCookie(res, auth)
    res.json({ ok: true, expiresAt })
  } catch {
    res.status(500).json({ ok: false, error: 'Could not sign in right now.' })
  }
})

app.post('/api/auth/change-password', requireAdmin, async (req, res) => {
  if (!sameOriginRequest(req)) return res.status(403).json({ ok: false, error: 'Cross-origin requests are not allowed.' })
  try {
    const auth = await readJsonFile(ADMIN_AUTH_FILE)
    if (!await passwordMatches(req.body?.currentPassword, auth)) return res.status(401).json({ ok: false, error: 'Your current password was not accepted.' })
    const newPassword = String(req.body?.newPassword || '')
    if (!validPassword(newPassword)) return res.status(400).json({ ok: false, error: 'Choose a new password between 12 and 128 bytes.' })
    const updated = await makePasswordRecord(newPassword)
    await writeJsonAtomic(ADMIN_AUTH_FILE, updated)
    const expiresAt = setAdminSessionCookie(res, updated)
    res.json({ ok: true, expiresAt })
  } catch (error) {
    logger.error({ event: 'admin.password-change-failed', error: String(error?.message || error) })
    res.status(500).json({ ok: false, error: 'Could not change the Studio password.' })
  }
})

app.post('/api/auth/logout', (req, res) => {
  if (!sameOriginRequest(req)) return res.status(403).json({ ok: false, error: 'Cross-origin requests are not allowed.' })
  clearAdminSessionCookie(res)
  res.json({ ok: true })
})

function visualWorkflowCommandConflict(workflow) {
  const trigger = workflow.nodes.find(node => node.type === 'trigger.command')
  if (!trigger) return null
  const registry = workflow.account === 'private' ? privateCommandRegistry : publicCommandRegistry
  const names = [trigger.config.command, ...(Array.isArray(trigger.config.aliases) ? trigger.config.aliases : [])]
    .map(value => String(value || '').trim().toLowerCase()).filter(Boolean)
  return names.find(name => registry?.commands?.has(name)) || null
}

function visualWorkflowPayload(workflow) {
  return { ...workflow, validation: validateWorkflow(workflow) }
}

// Custom Engine source is executed in a constrained QuickJS WASM context.
// Only declared exact HTTPS host allowlists are exposed through the network capability.
app.get('/api/engines', requireAdmin, async (_req, res) => {
  try {
    res.json({ ok: true, engines: await engineStore.list(), executionAvailable: true })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})
app.get('/api/engines/:id', requireAdmin, async (req, res) => {
  try {
    const engine = await engineStore.get(req.params.id)
    if (!engine) return res.status(404).json({ ok: false, error: 'Engine not found.' })
    res.json({ ok: true, engine, executionAvailable: true })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || error) })
  }
})
app.post('/api/engines', requireAdmin, async (req, res) => {
  try {
    const existing = await engineStore.get(req.body?.manifest?.id)
    if (existing) return res.status(409).json({ ok: false, error: 'Engine already exists. Use the edit endpoint.' })
    const engine = await engineStore.save(req.body?.manifest, req.body?.code)
    res.status(201).json({ ok: true, engine, executionAvailable: true })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || error) })
  }
})
app.put('/api/engines/:id', requireAdmin, async (req, res) => {
  try {
    if (req.body?.manifest?.id !== req.params.id) throw new Error('Engine ID cannot change. Create a new Engine for a new ID.')
    const current = await engineStore.get(req.params.id)
    if (!current) return res.status(404).json({ ok: false, error: 'Engine not found.' })
    const engine = await engineStore.save(req.body.manifest, req.body.code, req.body.expectedVersion, { expectedRevision: req.body.expectedRevision })
    res.json({ ok: true, engine, executionAvailable: true })
  } catch (error) {
    res.status(409).json({ ok: false, error: String(error?.message || error) })
  }
})
app.get('/api/engines/:id/revisions', requireAdmin, async (req, res) => {
  try {
    if (!await engineStore.get(req.params.id)) return res.status(404).json({ ok: false, error: 'Engine not found.' })
    res.json({ ok: true, revisions: await engineStore.listRevisions(req.params.id) })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || error) })
  }
})
app.get('/api/engines/:id/revisions/:revision', requireAdmin, async (req, res) => {
  try {
    const engine = await engineStore.getRevision(req.params.id, req.params.revision)
    if (!engine) return res.status(404).json({ ok: false, error: 'Engine revision not found.' })
    res.json({ ok: true, engine })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || error) })
  }
})
app.get('/api/engines/:id/capabilities', requireAdmin, async (req, res) => {
  try {
    const engine = await engineStore.get(req.params.id)
    if (!engine) return res.status(404).json({ ok: false, error: 'Engine not found.' })
    res.json({ ok: true, revision: engine.revision, sha256: engine.sha256, capabilities: describeEngineCapabilities(engine.manifest), diagnostics: diagnoseEngine(engine) })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || error) })
  }
})
// Engine Library test action: runs a SAVED revision through the same sandbox as workflows. The
// invocation source is fixed here; a client cannot choose it. Inputs/outputs are never logged.
app.post('/api/engines/:id/run', requireAdmin, async (req, res) => {
  const controller = new AbortController()
  res.on('close', () => { if (!res.writableEnded) controller.abort() })
  try {
    const envelope = await invokeEngine({
      store: engineStore,
      logger,
      signal: controller.signal,
      request: {
        engineId: req.params.id,
        revision: req.body?.revision,
        inputs: req.body?.inputs,
        source: 'library-test',
        correlationId: req.body?.correlationId,
      },
    })
    logger.info({ event: 'engine.test-run', engineId: req.params.id, revision: envelope.engine?.revision, outcome: envelope.outcome, correlationId: envelope.correlationId })
    const response = httpResponseForEnvelope(envelope)
    res.status(response.status).json(response.body)
  } catch (error) {
    logger.error({ event: 'engine.test-run-failed', engineId: req.params.id })
    res.status(500).json({ ok: false, outcome: 'infrastructure', message: 'The Engine test run failed unexpectedly.', error: 'The Engine test run failed unexpectedly.' })
  }
})
app.delete('/api/engines/:id', requireAdmin, async (req, res) => {
  try {
    const references = visualCommandStore.list().filter(workflow =>
      workflow.nodes.some(node => node.type === 'engine.' + req.params.id || node.config?.engineId === req.params.id)
    )
    const removed = await engineStore.remove(req.params.id, { confirm: req.body?.confirm, usedBy: references })
    if (!removed) return res.status(404).json({ ok: false, error: 'Engine not found.' })
    unregisterEngineNode(req.params.id)
    res.json({ ok: true })
  } catch (error) {
    res.status(409).json({ ok: false, error: String(error?.message || error) })
  }
})

function scheduledDestinationError(workflow, destinationJid) {
  const jid = String(destinationJid || '').trim()
  const trigger = workflow?.nodes?.find(node => node.type === 'trigger.command')
  if (!workflow?.enabled || !trigger) return 'Schedules require an enabled saved command workflow.'
  if (trigger.config?.requireQuoted === true || trigger.config?.requireQuoted === 'true' ||
      trigger.config?.requireReply === true || trigger.config?.requireReply === 'true') {
    return 'A scheduled command cannot require a quoted or replied-to incoming message.'
  }
  const scope = String(trigger.config?.chatScope || 'direct')
  const direct = /^\\d{7,15}@s\\.whatsapp\\.net$/.test(jid) || /^\\d{5,25}@lid$/.test(jid)
  const group = /^\\d{5,25}-\\d{7,20}@g\\.us$/.test(jid)
  if (workflow.account === 'private') {
    const owner = String(ownerConfig.privateOwnerNumber || '').replace(/\\D/g, '')
    if (!owner) return 'Configure the Private Owner before scheduling Private commands.'
    if (jid !== owner + '@s.whatsapp.net') return 'Private scheduled commands can only send to the configured Private Owner self-chat.'
    return ''
  }
  if (workflow.account !== 'public') return 'The selected workflow account is invalid.'
  if (direct && (scope === 'direct' || scope === 'both')) return ''
  if (group && (scope === 'groups' || scope === 'both')) return ''
  return group
    ? 'This command is not configured to run in groups.'
    : 'Choose a valid WhatsApp direct-chat or permitted group destination.'
}

app.get('/api/schedules', requireAdmin, async (req, res) => {
  try {
    const account = String(req.query.account || '')
    if (account && !['private', 'public'].includes(account)) return res.status(400).json({ ok: false, error: 'Account must be private or public.' })
    const rows = await schedulerStore.list()
    res.json({ ok: true, schedules: account ? rows.filter(item => item.account === account) : rows })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})

app.post('/api/schedules', requireAdmin, async (req, res) => {
  try {
    const workflowId = String(req.body?.workflowId || '')
    const workflow = visualCommandStore.get(workflowId)
    if (!workflow) return res.status(404).json({ ok: false, error: 'Saved command workflow not found.' })
    const destinationJid = String(req.body?.destinationJid || '')
    const destinationError = scheduledDestinationError(workflow, destinationJid)
    if (destinationError) return res.status(400).json({ ok: false, error: destinationError })
    const schedule = await schedulerStore.create({
      ...req.body,
      workflowId,
      account: workflow.account,
      destinationJid,
    })
    publishStudioEvent('scheduler.created', { scheduleId: schedule.id, workflowId, account: workflow.account })
    res.status(201).json({ ok: true, schedule })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || error) })
  }
})

app.put('/api/schedules/:id', requireAdmin, async (req, res) => {
  try {
    const current = await schedulerStore.get(req.params.id)
    if (!current) return res.status(404).json({ ok: false, error: 'Schedule not found.' })
    const workflow = visualCommandStore.get(current.workflowId)
    if (!workflow) return res.status(409).json({ ok: false, error: 'The scheduled command no longer exists.' })
    const destinationJid = String(req.body?.destinationJid ?? current.destinationJid)
    const destinationError = scheduledDestinationError(workflow, destinationJid)
    if (destinationError) return res.status(400).json({ ok: false, error: destinationError })
    const updated = await schedulerStore.update(req.params.id, { ...req.body, destinationJid })
    res.json({ ok: true, schedule: updated })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || error) })
  }
})

app.post('/api/schedules/:id/enabled', requireAdmin, async (req, res) => {
  try {
    if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ ok: false, error: 'enabled must be true or false.' })
    const current = await schedulerStore.get(req.params.id)
    if (!current) return res.status(404).json({ ok: false, error: 'Schedule not found.' })
    const workflow = visualCommandStore.get(current.workflowId)
    if (req.body.enabled) {
      const destinationError = scheduledDestinationError(workflow, current.destinationJid)
      if (destinationError) return res.status(400).json({ ok: false, error: destinationError })
    }
    const updated = await schedulerStore.setEnabled(req.params.id, req.body.enabled)
    res.json({ ok: true, schedule: updated })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || error) })
  }
})

app.delete('/api/schedules/:id', requireAdmin, async (req, res) => {
  try {
    const removed = await schedulerStore.remove(req.params.id)
    if (!removed) return res.status(404).json({ ok: false, error: 'Schedule not found.' })
    publishStudioEvent('scheduler.deleted', { scheduleId: req.params.id })
    res.json({ ok: true })
  } catch (error) {
    res.status(409).json({ ok: false, error: String(error?.message || error) })
  }
})

app.get('/api/visual-commands', requireAdmin, (req, res) => {
  const account = String(req.query.account || '')
  if (account && !['private', 'public'].includes(account)) {
    return res.status(400).json({ ok: false, error: 'Account must be private or public.' })
  }
  const workflows = visualCommandStore.list(account || undefined).map(visualWorkflowPayload)
  res.json({ ok: true, workflows, library: currentVisualNodeLibrary(), customNodes: visualCommandStore.listCustomNodes(), storageWarning: visualCommandStore.storageWarning() })
})

app.get('/api/custom-nodes', requireAdmin, (_req, res) => {
  res.json({ ok: true, nodes: visualCommandStore.listCustomNodes() })
})
app.post('/api/custom-nodes', requireAdmin, async (req, res) => {
  try {
    const node = await visualCommandStore.saveCustomNode(req.body?.node || req.body || {})
    res.status(201).json({ ok: true, node, library: currentVisualNodeLibrary() })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || error) })
  }
})
app.delete('/api/custom-nodes/:id', requireAdmin, async (req, res) => {
  try {
    if (req.body?.confirm !== true) return res.status(400).json({ ok: false, error: 'Confirm custom node deletion.' })
    const removed = await visualCommandStore.removeCustomNode(req.params.id)
    if (!removed) return res.status(404).json({ ok: false, error: 'Custom node not found.' })
    res.json({ ok: true })
  } catch (error) {
    res.status(409).json({ ok: false, error: String(error?.message || error) })
  }
})

app.post('/api/visual-commands', requireAdmin, async (req, res) => {
  try {
    assertSupportedWorkflowSchema(req.body?.workflow || req.body || {})
    const workflow = normalizeWorkflow(req.body?.workflow || req.body || {})
    const conflict = visualWorkflowCommandConflict(workflow)
    if (conflict) return res.status(409).json({ ok: false, error: 'The command name or alias "' + conflict + '" is already registered in this account.' })
    const saved = await visualCommandStore.save(workflow)
    res.status(201).json({ ok: true, workflow: saved.workflow, validation: saved.validation })
  } catch (error) {
    res.status(error.validation ? 422 : 400).json({ ok: false, error: error.message, validation: error.validation })
  }
})

app.put('/api/visual-commands/:id', requireAdmin, async (req, res) => {
  try {
    const current = visualCommandStore.get(req.params.id)
    if (!current) return res.status(404).json({ ok: false, error: 'Workflow not found.' })
    assertSupportedWorkflowSchema(req.body?.workflow || req.body || {})
    const workflow = normalizeWorkflow({ ...(req.body?.workflow || req.body || {}), id: current.id, createdAt: current.createdAt })
    const conflict = visualWorkflowCommandConflict(workflow)
    if (conflict) return res.status(409).json({ ok: false, error: 'The command name or alias "' + conflict + '" is already registered in this account.' })
    // expectedRevision is optional so older clients keep working; when sent, a stale value is rejected.
    const expectedRevision = req.body?.expectedRevision ?? req.body?.workflow?.expectedRevision
    const saved = await visualCommandStore.save(workflow, { expectedRevision })
    res.json({ ok: true, workflow: saved.workflow, validation: saved.validation })
  } catch (error) {
    if (error.conflict) return res.status(409).json({ ok: false, error: error.message, conflict: true, currentRevision: error.currentRevision })
    res.status(error.validation ? 422 : 400).json({ ok: false, error: error.message, validation: error.validation })
  }
})

app.delete('/api/visual-commands/:id', requireAdmin, async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ ok: false, error: 'Confirm workflow deletion.' })
  const removed = await visualCommandStore.remove(req.params.id)
  if (!removed) return res.status(404).json({ ok: false, error: 'Workflow not found.' })
  res.json({ ok: true })
})

app.get('/api/visual-commands/:id/revisions', requireAdmin, (req, res) => {
  if (!visualCommandStore.get(req.params.id)) return res.status(404).json({ ok: false, error: 'Workflow not found.' })
  res.json({ ok: true, revisions: visualCommandStore.listRevisions(req.params.id) })
})

app.get('/api/visual-commands/:id/revisions/:revision', requireAdmin, (req, res) => {
  const snapshot = visualCommandStore.getRevision(req.params.id, req.params.revision)
  if (!snapshot) return res.status(404).json({ ok: false, error: 'Workflow revision not found.' })
  res.json({ ok: true, workflow: snapshot, validation: validateWorkflow(snapshot) })
})

app.get('/api/visual-commands/:id/export', requireAdmin, (req, res) => {
  const workflow = visualCommandStore.get(req.params.id)
  if (!workflow) return res.status(404).json({ ok: false, error: 'Workflow not found.' })
  res.json({ ok: true, export: exportWorkflow(workflow) })
})

app.post('/api/visual-commands/import', requireAdmin, async (req, res) => {
  try {
    const imported = importWorkflow(req.body?.export ?? req.body, { account: req.body?.account })
    const saved = await visualCommandStore.save(imported.workflow)
    res.status(201).json({ ok: true, workflow: saved.workflow, validation: saved.validation })
  } catch (error) {
    res.status(error.validation ? 422 : 400).json({ ok: false, error: error.message, validation: error.validation })
  }
})

app.post('/api/visual-commands/:id/test', requireAdmin, async (req, res) => {
  // Tests always run a SAVED revision (default: the latest); an unsaved graph is never executed.
  const latest = visualCommandStore.get(req.params.id)
  if (!latest) return res.status(404).json({ ok: false, error: 'Workflow not found.' })
  const requestedRevision = req.body?.revision
  const workflow = requestedRevision == null ? latest : visualCommandStore.getRevision(req.params.id, requestedRevision)
  if (!workflow) return res.status(404).json({ ok: false, error: 'Workflow revision not found.' })
  const trigger = workflow.nodes.find(node => node.type === 'trigger.command' || node.type === 'trigger.message')
  const prefix = workflow.account === 'private' ? PRIVATE_COMMAND_PREFIX : PUBLIC_COMMAND_PREFIX
  const configuredName = String(trigger?.config?.command || 'hello')
  const messageText = String(req.body?.messageText || (trigger?.type === 'trigger.command'
    ? prefix + configuredName + ' sample'
    : 'Aharane sample message')).slice(0, 4000)
  const groupTest = workflow.account === 'public' &&
    ['groups', 'both'].includes(String(trigger?.config?.chatScope || 'direct'))
  const jid = workflow.account === 'private'
    ? '2348012345678@s.whatsapp.net'
    : groupTest ? '120363012345678901-1234567890@g.us' : '2348098765432@s.whatsapp.net'
  const senderJid = workflow.account === 'private' ? jid : '2348012345678@s.whatsapp.net'
  const message = {
    key: {
      id: 'aharane-safe-test-message',
      remoteJid: jid,
      fromMe: workflow.account === 'private',
      ...(groupTest ? { participant: senderJid } : {}),
    },
    message: {
      extendedTextMessage: {
        text: messageText,
        contextInfo: {
          stanzaId: 'aharane-safe-test-quoted-message',
          quotedMessage: { conversation: 'Aharane safe test quoted message' },
        },
      },
    },
  }
  // The dry-run is an authenticated admin preview with stubbed sends; its
  // privileges still come from the evaluator and the configured owners.
  const previewPrivileges = resolveExecutionAuthorization({
    source: 'admin-preview', sessionId: workflow.account, ownerConfig,
  })
  try {
    const result = await executeVisualWorkflow(workflow, {
      store: visualCommandStore,
      dryRun: true,
      runEngine: runStoredEngine,
      context: {
        sessionId: workflow.account,
        privateControl: previewPrivileges.privateControl,
        isPublicOwner: previewPrivileges.isPublicOwner,
        allowedPublicSender: previewPrivileges.allowedPublicSender,
        message,
        messageText,
        sender: senderJid,
        senderJid,
        isGroupChat: groupTest,
        remoteJid: jid,
        commandName: configuredName,
        rawArgs: messageText.trim().split(/\s+/).slice(1).join(' '),
        args: messageText.trim().split(/\s+/).slice(1),
        socket: {
          sendMessage: async () => { throw new Error('Live sends are disabled during tests.') },
          groupMetadata: async () => ({ subject: 'Preview group', participants: [{ id: senderJid, admin: 'admin' }, { id: '2348098765432@s.whatsapp.net', admin: null }] }),
          groupUpdateSubject: async () => { throw new Error('Live group changes are disabled during tests.') },
          groupUpdateDescription: async () => { throw new Error('Live group changes are disabled during tests.') },
          groupParticipantsUpdate: async () => { throw new Error('Live participant changes are disabled during tests.') },
          groupSettingUpdate: async () => { throw new Error('Live group settings are disabled during tests.') },
          updateBlockStatus: async () => { throw new Error('Live contact moderation is disabled during tests.') },
          updateProfileName: async () => { throw new Error('Live profile changes are disabled during tests.') },
          updateProfileStatus: async () => { throw new Error('Live profile changes are disabled during tests.') },
          newsletterCreate: async () => { throw new Error('Live newsletter creation is disabled during tests.') },
          newsletterFollow: async () => { throw new Error('Live newsletter actions are disabled during tests.') },
          newsletterUnfollow: async () => { throw new Error('Live newsletter actions are disabled during tests.') },
        },
      },
    })
    res.json({ ok: result.ok, dryRun: true, result })
  } catch (error) {
    res.status(400).json({ ok: false, dryRun: true, error: String(error?.message || error) })
  }
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
    processStartedAt: new Date(PROCESS_STARTED_AT).toISOString(),
    uptimeSeconds: Math.max(0, Math.floor((Date.now() - PROCESS_STARTED_AT) / 1000)),
  })
})
app.get('/api/accounts', requireAdmin, (_req, res) => {
  res.json({ ok: true, ...studioRuntimeSnapshot() })
})
app.get('/api/owners', requireAdmin, (_req, res) => {
  res.json({ ok: true, owners: ownerConfig })
})
app.put('/api/owners', requireAdmin, async (req, res) => {
  try {
    const next = normalizeOwnerConfig({
      privateOwnerNumber: req.body?.privateOwnerNumber ?? req.body?.ownerNumber ?? ownerConfig.privateOwnerNumber,
      publicOwnerNumber: req.body?.publicOwnerNumber ?? ownerConfig.publicOwnerNumber,
      publicBotNumber: req.body?.publicBotNumber ?? ownerConfig.publicBotNumber,
    })
    // Only the Private Owner must match the paired Private identity.
    // Public Owner is independently configurable and may equal its bot identity.
    const privateSession = accountRuntime.get('private')
    const publicSession = accountRuntime.get('public')
    const privateOwnNumber = senderNumberFromJid(
      privateSession.socket?.user?.id || privateSession.auth?.state?.creds?.me?.id || ''
    )
    const publicBotNumber = senderNumberFromJid(
      publicSession.socket?.user?.id || publicSession.auth?.state?.creds?.me?.id || ''
    )
    if (next.privateOwnerNumber && privateOwnNumber && next.privateOwnerNumber !== privateOwnNumber) {
      return res.status(409).json({ ok: false, error: 'Owner number must match the phone number paired to the Private WhatsApp session.' })
    }
    if (next.publicBotNumber && publicBotNumber && next.publicBotNumber !== publicBotNumber) {
      return res.status(409).json({ ok: false, error: 'Public bot WhatsApp number must match the number already paired to the Public session.' })
    }
    ownerConfig = await saveOwnerConfig(OWNER_CONFIG_FILE, next)
    publishStudioEvent('owners.updated', {
      ownerConfigured: Boolean(ownerConfig.privateOwnerNumber && ownerConfig.publicOwnerNumber),
      privateOwnerConfigured: Boolean(ownerConfig.privateOwnerNumber),
      publicOwnerConfigured: Boolean(ownerConfig.publicOwnerNumber),
    })
    res.json({ ok: true, owners: ownerConfig })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || 'Could not save owner settings.') })
  }
})

app.post('/api/accounts/:accountId/cancel-pairing', requireAdmin, async (req, res) => {
  try {
    const accountId = String(req.params.accountId || '').toLowerCase()
    if (!['private', 'public'].includes(accountId)) return res.status(404).json({ ok: false, error: 'Unknown WhatsApp account.' })
    const account = await accountRuntime.cancelPairing(accountId)
    res.json({ ok: true, account, accounts: accountRuntime.snapshot().accounts })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not cancel the replacement WhatsApp pairing attempt.') })
  }
})
app.post('/api/accounts/:accountId/pair-code', requireAdmin, async (req, res) => {
  try {
    const accountId = String(req.params.accountId || '').toLowerCase()
    if (!['private', 'public'].includes(accountId)) return res.status(404).json({ ok: false, error: 'Unknown WhatsApp account.' })
    const session = accountRuntime.get(accountId)
    const phoneNumber = accountId === 'private' ? ownerConfig.privateOwnerNumber : ownerConfig.publicBotNumber
    if (!phoneNumber) {
      return res.status(409).json({
        ok: false,
        error: accountId === 'private'
          ? 'Save the Private Owner number in Configuration before requesting a pairing code.'
          : 'Save the Public bot WhatsApp number in Public Configuration before requesting a pairing code.',
      })
    }
    const pairingCode = await accountRuntime.requestPairingCode(accountId, phoneNumber)
    res.json({ ok: true, accountId, pairingCode, phoneNumber })
  } catch (error) {
    res.status(error?.status || 503).json({ ok: false, error: String(error?.message || 'Pairing code could not be generated. Check the server connection and retry shortly.') })
  }
})
app.get('/api/accounts/:accountId/qr', requireAdmin, async (req, res) => {
  try {
    const accountId = String(req.params.accountId || '').toLowerCase()
    if (!['private', 'public'].includes(accountId)) return res.status(404).json({ ok: false, error: 'Unknown WhatsApp account.' })
    const session = accountRuntime.snapshot().accounts[accountId]
    res.json({
      ok: true,
      accountId,
      qr: accountRuntime.pairingQr(accountId),
      state: session.state,
      pairingInProgress: session.pairingInProgress,
      pairingSucceeded: session.pairingSucceeded,
      pairingError: session.pairingError,
    })
  } catch (error) {
    res.status(503).json({ ok: false, error: String(error?.message || 'Could not read the WhatsApp pairing QR.') })
  }
})
app.post('/api/accounts/:accountId/qr', requireAdmin, async (req, res) => {
  try {
    const accountId = String(req.params.accountId || '').toLowerCase()
    if (!['private', 'public'].includes(accountId)) return res.status(404).json({ ok: false, error: 'Unknown WhatsApp account.' })
    const result = await accountRuntime.startPairing(accountId)
    res.json({ ok: true, accountId, qr: accountRuntime.pairingQr(accountId), state: result.state, pairingInProgress: result.pairingInProgress })
  } catch (error) {
    res.status(error?.status || 503).json({ ok: false, error: String(error?.message || 'Could not request the WhatsApp pairing QR.') })
  }
})
app.post('/api/accounts/:accountId/reconnect', requireAdmin, async (req, res) => {
  try {
    const result = await accountRuntime.reconnect(req.params.accountId)
    res.json({ ok: true, account: result, accounts: accountRuntime.snapshot().accounts })
  } catch (error) {
    res.status(error?.status || 503).json({ ok: false, error: String(error?.message || 'Could not reconnect this WhatsApp account.') })
  }
})
app.post('/api/accounts/:accountId/restart', requireAdmin, async (req, res) => {
  try {
    const result = await accountRuntime.restart(req.params.accountId)
    res.json({ ok: true, account: result, accounts: accountRuntime.snapshot().accounts })
  } catch (error) {
    res.status(error?.status || 503).json({ ok: false, error: String(error?.message || 'Could not restart this WhatsApp account.') })
  }
})
app.post('/api/accounts/:accountId/stop', requireAdmin, async (req, res) => {
  try {
    const result = await accountRuntime.stop(req.params.accountId)
    res.json({ ok: true, account: result, accounts: accountRuntime.snapshot().accounts })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not stop this WhatsApp account.') })
  }
})
app.post('/api/accounts/:accountId/repair', requireAdmin, async (req, res) => {
  try {
    const result = await accountRuntime.repair(
      req.params.accountId,
      join(DATA_DIR, 'whatsapp-auth-backups'),
    )
    res.json({ ok: true, account: result, accounts: accountRuntime.snapshot().accounts })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not safely prepare this account for re-pairing.') })
  }
})
// Backwards-compatible pairing endpoint defaults to the existing public session.
app.post('/api/pair-code', requireAdmin, async (req, res) => {
  try {
    const phoneNumber = normalizePhone(req.body?.phoneNumber)
    if (!phoneNumber) return res.status(400).json({ ok: false, error: 'Enter a valid international phone number using 7 to 15 digits.' })
    if (!ownerConfig.privateOwnerNumber || !ownerConfig.publicOwnerNumber || !ownerConfig.publicBotNumber) {
      return res.status(409).json({ ok: false, error: 'Save the Private Owner, Public Owner and Public bot numbers before pairing.' })
    }
    if (phoneNumber !== ownerConfig.publicBotNumber) {
      return res.status(409).json({ ok: false, error: 'The supplied number does not match the saved Public bot WhatsApp number. Update Configuration first.' })
    }
    const pairingCode = await accountRuntime.requestPairingCode('public', ownerConfig.publicBotNumber)
    res.json({ ok: true, accountId: 'public', pairingCode })
  } catch (error) {
    res.status(error?.status || 503).json({ ok: false, error: String(error?.message || 'Pairing code could not be generated.') })
  }
})
app.get('/api/update/status', requireAdmin, async (_req, res) => {
  const manual = await readJsonFile(MANUAL_EDIT_STATE_FILE)
  res.json({
    ok: true,
    currentVersion: await currentBotVersion(),
    update: await currentUpdateState(),
    manualEdits: {
      pending: manual?.status === 'pending',
      changedCount: manual?.modifiedPaths?.length || 0,
      stale: manual?.status === 'pending' && manual.currentRelease !== await currentReleaseDirectory(),
    },
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


app.post('/api/update/upload/abort', requireAdmin, async (req, res) => {
  try {
    const updateId = String(req.body?.updateId || '')
    if (!validUpdateId(updateId)) {
      return res.status(400).json({ ok: false, error: 'Invalid ZIP upload ID.' })
    }
    if (updateInProgress) {
      return res.status(409).json({ ok: false, error: 'An update is being deployed; the upload cannot be aborted now.' })
    }
    const directory = uploadDirectory(updateId)
    const metadata = await readJsonFile(join(directory, 'upload.json'))
    if (!metadata) return res.status(404).json({ ok: false, error: 'The ZIP upload was not found.' })
    if (metadata.status === 'validated') {
      return res.status(409).json({ ok: false, error: 'This ZIP has already been validated. Remove it from Update packages instead.' })
    }
    if (metadata.status !== 'uploading') {
      return res.status(409).json({ ok: false, error: 'This ZIP upload cannot be aborted in its current state.' })
    }
    await rm(directory, { recursive: true, force: true })
    res.json({ ok: true, updateId, removed: true })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not abort the ZIP upload.') })
  }
})

function chatAccount(value) {
  const accountId = String(value || '').toLowerCase()
  if (!['private', 'public'].includes(accountId)) throw Object.assign(new Error('Unknown WhatsApp account.'), { status: 404 })
  return accountId
}
function authorizedChat(accountId, jid) {
  if (!isPrivateVisibleChatJid(jid)) return false
  if (accountId === 'private') {
    const session = accountRuntime.get('private')
    const ownJid = session.socket?.user?.id || session.auth?.state?.creds?.me?.id || ''
    const own = senderNumberFromJid(ownJid)
    return Boolean(ownerConfig.privateOwnerNumber && own === ownerConfig.privateOwnerNumber)
  }
  return true
}
app.get('/api/env', requireAdmin, (_req, res) => {
  res.json({ ok: true, env: [...envView(studioSettings), ...aiReplyService.environmentRows()], owners: {
    privateOwnerNumber: ownerConfig.privateOwnerNumber,
    publicOwnerNumber: ownerConfig.publicOwnerNumber,
    allowedPublicSenders: ownerConfig.allowedPublicSenders,
  } })
})
app.put('/api/env', requireAdmin, async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.env) ? req.body.env : []
    const next = structuredClone(studioSettings)
    for (const row of rows) {
      const key = String(row?.key || '')
      const match = key.match(/^(PRIVATE|PUBLIC)_(BOT_NAME|AUTO_READ|SHOW_TYPING|REJECT_CALLS|ALWAYS_ONLINE|COMMAND_COOLDOWN|WELCOME_MESSAGE)$/)
      if (!match) continue
      const scope = match[1].toLowerCase()
      const setting = {
        BOT_NAME: 'botName', AUTO_READ: 'autoRead', SHOW_TYPING: 'showTyping',
        REJECT_CALLS: 'rejectCalls', ALWAYS_ONLINE: 'alwaysOnline',
        COMMAND_COOLDOWN: 'commandCooldown', WELCOME_MESSAGE: 'welcomeMessage',
      }[match[2]]
      let value = row.value
      if (['autoRead','showTyping','rejectCalls','alwaysOnline'].includes(setting)) value = String(value).toLowerCase() === 'true'
      if (setting === 'commandCooldown') value = Number(value)
      next[scope][setting] = value
    }
    studioSettings = await saveStudioSettings(SETTINGS_FILE, normalizeStudioSettings(next))
    for (const accountId of ['private', 'public']) {
      const socket = accountRuntime.get(accountId).socket
      if (socket?.sendPresenceUpdate) await socket.sendPresenceUpdate(studioSettings[accountId].alwaysOnline ? 'available' : 'unavailable').catch(() => {})
    }
    publishStudioEvent('settings.updated', { private: true, public: true })
    res.json({ ok: true, env: [...envView(studioSettings), ...aiReplyService.environmentRows()], settings: studioSettings })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || 'Could not save the managed environment settings.') })
  }
})
app.get('/api/ai/availability', requireAdmin, (_req, res) => {
  // Capability metadata only. Never return the configured API key.
  res.json({ ok: true, ...aiReplyService.availability() })
})
app.post('/api/ai/reply', requireAdmin, async (req, res) => {
  try {
    if (!aiReplyService.availability().enabled) {
      return res.status(409).json({ ok: false, error: 'AI Reply is unavailable because no Groq AI key is configured in Aharane’s ENV.' })
    }
    const reply = await aiReplyService.generate({
      message: req.body?.message,
      quotedMessage: req.body?.quotedMessage,
      tone: req.body?.tone,
      instruction: req.body?.instruction,
    })
    res.json({
      ok: true,
      reply,
      provider: aiReplyService.availability().provider,
      model: aiReplyService.availability().model,
    })
  } catch (error) {
    res.status(error?.status || 503).json({
      ok: false,
      error: String(error?.message || 'The AI reply could not be generated. Try again shortly.').slice(0, 260),
    })
  }
})
app.get('/api/settings', requireAdmin, (_req, res) => res.json({ ok: true, settings: studioSettings }))
app.get('/api/chat-appearance', requireAdmin, (_req, res) => res.json({ ok: true, appearance: studioSettings.chatAppearance }))
app.put('/api/chat-appearance', requireAdmin, async (req, res) => {
  try {
    const next = structuredClone(studioSettings)
    next.chatAppearance = normalizeChatAppearance(req.body?.appearance || {})
    studioSettings = await saveStudioSettings(SETTINGS_FILE, normalizeStudioSettings(next))
    publishStudioEvent('chat.appearance.updated', {})
    res.json({ ok: true, appearance: studioSettings.chatAppearance })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || 'Could not save chat appearance.') })
  }
})
app.get('/api/chat-appearance/wallpaper', requireAdmin, async (_req, res) => {
  try {
    const buffer = await readFile(CHAT_WALLPAPER_FILE)
    res.set('Content-Type', studioSettings.chatAppearance.customWallpaperMime || 'image/png')
    res.set('Cache-Control', 'private, max-age=3600')
    res.send(buffer)
  } catch {
    res.status(404).json({ ok: false, error: 'No custom chat wallpaper is saved.' })
  }
})
app.post('/api/chat-appearance/wallpaper', requireAdmin, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '2mb' }), async (req, res) => {
  try {
    const mime = String(req.get('content-type') || '').split(';')[0].toLowerCase()
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime) || !Buffer.isBuffer(req.body) || !req.body.length || req.body.length > 2 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: 'Choose a JPG, PNG or WebP image up to 2 MB.' })
    }
    await writeFile(CHAT_WALLPAPER_FILE, req.body, { mode: 0o600 })
    const next = structuredClone(studioSettings)
    next.chatAppearance = normalizeChatAppearance({ ...next.chatAppearance, wallpaper: 'custom', customWallpaperMime: mime })
    studioSettings = await saveStudioSettings(SETTINGS_FILE, normalizeStudioSettings(next))
    res.json({ ok: true, appearance: studioSettings.chatAppearance })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || 'Could not save the wallpaper.') })
  }
})
app.delete('/api/chat-appearance/wallpaper', requireAdmin, async (_req, res) => {
  try {
    await rm(CHAT_WALLPAPER_FILE, { force: true })
    const next = structuredClone(studioSettings)
    next.chatAppearance = normalizeChatAppearance({ ...next.chatAppearance, wallpaper: 'default', customWallpaperMime: '' })
    studioSettings = await saveStudioSettings(SETTINGS_FILE, normalizeStudioSettings(next))
    res.json({ ok: true, appearance: studioSettings.chatAppearance })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || 'Could not remove the wallpaper.') })
  }
})
app.put('/api/settings', requireAdmin, async (req, res) => {
  try {
    studioSettings = await saveStudioSettings(SETTINGS_FILE, normalizeStudioSettings(req.body?.settings || {}))
    for (const accountId of ['private', 'public']) {
      const socket = accountRuntime.get(accountId).socket
      if (socket?.sendPresenceUpdate) await socket.sendPresenceUpdate(studioSettings[accountId].alwaysOnline ? 'available' : 'unavailable').catch(() => {})
    }
    publishStudioEvent('settings.updated', { private: true, public: true })
    res.json({ ok: true, settings: studioSettings })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || 'Could not save settings.') })
  }
})
app.get('/api/chats/:accountId/visibility', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const chats = await chatStore.listChats(accountId, { limit: 500 })
    res.json({
      ok: true,
      visibility: studioSettings[accountId].chatVisibility,
      chats: chats.filter(chat => authorizedChat(accountId, chat.jid)).map(chat => ({
        ...chat, kind: String(chat.jid).endsWith('@g.us') ? 'groups' : 'individuals',
        visible: isChatVisible(studioSettings[accountId], chat.jid),
      })),
    })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not read inbox visibility.') })
  }
})
app.put('/api/chats/:accountId/visibility', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const next = structuredClone(studioSettings)
    next[accountId].chatVisibility = normalizeChatVisibility(req.body?.visibility || {})
    studioSettings = await saveStudioSettings(SETTINGS_FILE, normalizeStudioSettings(next))
    publishStudioEvent('settings.updated', { [accountId]: true })
    res.json({ ok: true, visibility: studioSettings[accountId].chatVisibility })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not save inbox visibility.') })
  }
})
app.put('/api/chats/:accountId/preferences', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const jid = String(req.body?.jid || '')
    if (!authorizedChat(accountId, jid) || !isChatVisible(studioSettings[accountId], jid) || !await chatStore.hasConversation(accountId, jid)) {
      return res.status(404).json({ ok: false, error: 'Conversation not found.' })
    }
    const next = structuredClone(studioSettings)
    const preferences = next[accountId].chatPreferences || { pinned: [], muted: [] }
    const session = accountRuntime.get(accountId), socket = session.socket
    if (!socket || session.state !== 'connected' || typeof socket.chatModify !== 'function') {
      return res.status(503).json({ ok: false, error: 'Connect this WhatsApp account before changing chat settings.' })
    }
    if (typeof req.body?.pinned === 'boolean') {
      await socket.chatModify({ pin: req.body.pinned }, jid)
      preferences.pinned = (preferences.pinned || []).filter(value => value !== jid)
      if (req.body.pinned) preferences.pinned.push(jid)
    }
    if (typeof req.body?.muted === 'boolean') {
      await socket.chatModify({ mute: req.body.muted ? 7 * 24 * 60 * 60 * 1000 : null }, jid)
      preferences.muted = (preferences.muted || []).filter(value => value !== jid)
      if (req.body.muted) preferences.muted.push(jid)
    }
    next[accountId].chatPreferences = preferences
    studioSettings = await saveStudioSettings(SETTINGS_FILE, normalizeStudioSettings(next))
    publishStudioEvent('settings.updated', { [accountId]: true })
    res.json({ ok: true, preferences: studioSettings[accountId].chatPreferences })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not save chat preferences.') })
  }
})
app.get('/api/chats/:accountId', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const chats = await chatStore.listChats(accountId, { limit: req.query.limit, query: req.query.q })
    res.json({ ok: true, preferences: studioSettings[accountId].chatPreferences, chats: chats.filter(chat => authorizedChat(accountId, chat.jid) && isChatVisible(studioSettings[accountId], chat.jid)) })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not read conversations.') })
  }
})
app.get('/api/chats/:accountId/starred', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const starred = await chatStore.listStarredMessages(accountId, { limit: req.query.limit || 200 })
    res.json({ ok: true, messages: starred.filter(row => authorizedChat(accountId, row.jid) && isChatVisible(studioSettings[accountId], row.jid)) })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not read starred messages.') })
  }
})
app.get('/api/chats/:accountId/search', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const query = String(req.query.q || '').trim()
    if (query.length < 2) return res.json({ ok: true, results: [] })
    if (query.length > 100) return res.status(400).json({ ok: false, error: 'Search text must be 100 characters or fewer.' })
    const results = await chatStore.searchMessages(accountId, { query, limit: req.query.limit || 60 })
    res.json({ ok: true, results: results.filter(row => authorizedChat(accountId, row.jid) && isChatVisible(studioSettings[accountId], row.jid)) })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not search stored messages.') })
  }
})
app.get('/api/chats/:accountId/:jid/search', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const jid = decodeURIComponent(String(req.params.jid || ''))
    const query = String(req.query.q || '').trim()
    if ((!authorizedChat(accountId, jid) || !isChatVisible(studioSettings[accountId], jid)) || !await chatStore.hasConversation(accountId, jid)) return res.status(404).json({ ok: false, error: 'Conversation not found.' })
    if (query.length < 2) return res.json({ ok: true, results: [] })
    if (query.length > 100) return res.status(400).json({ ok: false, error: 'Search text must be 100 characters or fewer.' })
    const results = await chatStore.searchMessages(accountId, { query, jid, limit: req.query.limit || 100 })
    res.json({ ok: true, results })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not search this conversation.') })
  }
})
async function lastChatMessageForModify(accountId, jid) {
  const [last] = await chatStore.getMessages(accountId, jid, { limit: 1 })
  if (!last) throw Object.assign(new Error('This conversation has no saved message to anchor the WhatsApp update.'), { status: 410 })
  const original = await chatStore.getMessage(accountId, jid, last.id)
  if (!original?.key) throw Object.assign(new Error('The latest WhatsApp message is not available.'), { status: 410 })
  return { key: original.key, messageTimestamp: String(Math.floor(Number(last.timestamp || 0) / 1000)) }
}
app.post('/api/chats/:accountId/:jid/archive', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId), jid = decodeURIComponent(String(req.params.jid || ''))
    const archived = req.body?.archived === true
    if (!authorizedChat(accountId, jid) || !isChatVisible(studioSettings[accountId], jid) || !await chatStore.hasConversation(accountId, jid)) return res.status(404).json({ ok: false, error: 'Conversation not found.' })
    const session = accountRuntime.get(accountId), socket = session.socket
    if (!socket || session.state !== 'connected' || typeof socket.chatModify !== 'function') return res.status(503).json({ ok: false, error: 'Connect this WhatsApp account before archiving chats.' })
    const lastMessage = await lastChatMessageForModify(accountId, jid)
    await socket.chatModify({ archive: archived, lastMessages: [lastMessage] }, jid)
    const next = structuredClone(studioSettings), preferences = next[accountId].chatPreferences || { pinned: [], muted: [], archived: [] }
    preferences.archived = (preferences.archived || []).filter(value => value !== jid)
    if (archived) preferences.archived.push(jid)
    next[accountId].chatPreferences = preferences
    studioSettings = await saveStudioSettings(SETTINGS_FILE, normalizeStudioSettings(next))
    publishStudioEvent('whatsapp.chat.archived', { accountId, jid, archived })
    res.json({ ok: true, preferences: studioSettings[accountId].chatPreferences })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not archive this chat.') })
  }
})
app.post('/api/chats/:accountId/:jid/mark-unread', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId), jid = decodeURIComponent(String(req.params.jid || ''))
    if (!authorizedChat(accountId, jid) || !isChatVisible(studioSettings[accountId], jid) || !await chatStore.hasConversation(accountId, jid)) return res.status(404).json({ ok: false, error: 'Conversation not found.' })
    const session = accountRuntime.get(accountId), socket = session.socket
    if (!socket || session.state !== 'connected' || typeof socket.chatModify !== 'function') return res.status(503).json({ ok: false, error: 'Connect this WhatsApp account before marking unread.' })
    const lastMessage = await lastChatMessageForModify(accountId, jid)
    await socket.chatModify({ markRead: false, lastMessages: [lastMessage] }, jid)
    const state = await chatStore.markUnread(accountId, jid)
    publishStudioEvent('whatsapp.chat.unread', { accountId, jid })
    res.json({ ok: true, ...state })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not mark this chat unread.') })
  }
})
// Account-scoped, real WhatsApp profile pictures. A missing/private picture is
// never substituted with a fabricated image. Short-lived caching prevents
// repeated profile lookups while scrolling a long conversation list.
const whatsappAvatarCache = new Map()
app.get('/api/whatsapp/:accountId/capabilities', requireAdmin, (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const session = accountRuntime.get(accountId)
    res.json({
      ok: true,
      accountId,
      contractVersion: WHATSAPP_TRANSPORT_CONTRACT_VERSION,
      library: WHATSAPP_LIBRARY,
      connected: session.state === 'connected',
      capabilities: inspectWhatsAppCapabilities(session.socket, {
        mediaDownloadAvailable: typeof downloadMediaMessage === 'function',
      }),
    })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || error) })
  }
})
app.get('/api/whatsapp/:accountId/channels', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const session = accountRuntime.get(accountId)
    if (session.state !== 'connected') return res.status(503).json({ ok: false, error: 'Connect this WhatsApp session before loading Channels.' })
    const result = await whatsappDiscovery.listChannels(accountId, session.socket)
    res.json({ ok: true, accountId, ...result })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || error) })
  }
})
app.get('/api/whatsapp/:accountId/channels/:jid/updates', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const session = accountRuntime.get(accountId)
    if (session.state !== 'connected') return res.status(503).json({ ok: false, error: 'Connect this WhatsApp session before reading Channel updates.' })
    const result = await whatsappDiscovery.channelUpdates(accountId, session.socket, decodeURIComponent(String(req.params.jid || '')), req.query.limit)
    res.json({ ok: true, accountId, ...result })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || error) })
  }
})

app.get('/api/chats/:accountId/:jid/avatar', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const jid = decodeURIComponent(String(req.params.jid || ''))
    if (!authorizedChat(accountId, jid) ||
        !isChatVisible(studioSettings[accountId], jid) ||
        !await chatStore.hasConversation(accountId, jid)) {
      return res.status(404).json({ ok: false, error: 'Conversation not found.' })
    }
    const session = accountRuntime.get(accountId), socket = session.socket
    if (!socket || session.state !== 'connected') {
      return res.status(503).json({ ok: false, error: 'Connect this WhatsApp account to load its profile pictures.' })
    }
    if (typeof socket.profilePictureUrl !== 'function') {
      return res.status(501).json({ ok: false, error: 'Profile-picture lookup is unavailable in this WhatsApp session.' })
    }
    const ownJid = String(socket.user?.id || session.auth?.state?.creds?.me?.id || '')
    const key = accountId + ':' + ownJid + ':' + jid
    const now = Date.now()
    const cached = whatsappAvatarCache.get(key)
    if (cached && cached.expiresAt > now && req.query.refresh !== '1') {
      res.set('Cache-Control', 'private, max-age=300')
      return res.json({ ok: true, jid, sourceSession: ownJid, pictureUrl: cached.url, available: Boolean(cached.url) })
    }
    let pictureUrl = ''
    try {
      pictureUrl = String(await socket.profilePictureUrl(jid, 'preview') || '')
    } catch {
      // Privacy, no picture, or inaccessible picture are legitimate states.
    }
    whatsappAvatarCache.set(key, { url: pictureUrl, expiresAt: now + (pictureUrl ? 600_000 : 60_000) })
    if (whatsappAvatarCache.size > 600) {
      for (const [key, item] of whatsappAvatarCache) {
        if (item.expiresAt <= now || whatsappAvatarCache.size > 500) whatsappAvatarCache.delete(key)
      }
    }
    res.set('Cache-Control', 'private, max-age=300')
    res.json({ ok: true, jid, sourceSession: ownJid, pictureUrl, available: Boolean(pictureUrl) })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not read WhatsApp profile picture.') })
  }
})

app.get('/api/chats/:accountId/:jid/info', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId), jid = decodeURIComponent(String(req.params.jid || ''))
    if (!authorizedChat(accountId, jid) || !isChatVisible(studioSettings[accountId], jid) || !await chatStore.hasConversation(accountId, jid)) return res.status(404).json({ ok: false, error: 'Conversation not found.' })
    const session = accountRuntime.get(accountId), socket = session.socket
    if (!socket || session.state !== 'connected') return res.status(503).json({ ok: false, error: 'Connect this WhatsApp account to load contact or group details.' })
    const group = jid.endsWith('@g.us')
    let metadata = null, pictureUrl = ''
    if (group) metadata = await socket.groupMetadata(jid).catch(() => null)
    try { pictureUrl = await socket.profilePictureUrl(jid, 'preview') || '' } catch {}
    const recent = await chatStore.getMessages(accountId, jid, { limit: 500 })
    const latest = recent[recent.length - 1] || {}
    res.json({ ok: true, info: {
      jid, group, name: group ? String(metadata?.subject || '') : String(latest.pushName || jid.replace(/@.*$/, '')),
      pictureUrl, description: String(metadata?.desc || ''),
      createdAt: metadata?.creation ? Number(metadata.creation) * 1000 : 0,
      owner: String(metadata?.owner || ''), participantCount: Number(metadata?.participants?.length || 0),
      participants: Array.isArray(metadata?.participants) ? metadata.participants.slice(0, 300).map(item => ({
        id: String(item.id || ''), admin: Boolean(item.admin || item.isAdmin || item.isSuperAdmin),
        superAdmin: Boolean(item.isSuperAdmin),
      })) : [],
    } })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not load chat information.') })
  }
})
app.get('/api/chats/:accountId/:jid/gallery', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId), jid = decodeURIComponent(String(req.params.jid || ''))
    if (!authorizedChat(accountId, jid) || !isChatVisible(studioSettings[accountId], jid) || !await chatStore.hasConversation(accountId, jid)) return res.status(404).json({ ok: false, error: 'Conversation not found.' })
    const items = await chatStore.getMediaGallery(accountId, jid, { limit: req.query.limit || 300 })
    res.json({ ok: true, items })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not load shared media.') })
  }
})
app.get('/api/chats/:accountId/:jid/export', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId), jid = decodeURIComponent(String(req.params.jid || ''))
    if (!authorizedChat(accountId, jid) || !isChatVisible(studioSettings[accountId], jid) || !await chatStore.hasConversation(accountId, jid)) return res.status(404).json({ ok: false, error: 'Conversation not found.' })
    const messages = await chatStore.exportConversation(accountId, jid, { limit: req.query.limit || 5000 })
    const missingMedia = messages.filter(message => message.mediaAvailable && !message.mediaUrl).map(message => ({ id: message.id, type: message.type, fileName: message.fileName }))
    res.json({ ok: true, accountId, jid, exportedAt: new Date().toISOString(), messages, missingMedia })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not export this chat.') })
  }
})
app.post('/api/chats/:accountId/:jid/star', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId), jid = decodeURIComponent(String(req.params.jid || ''))
    const messageId = String(req.body?.messageId || ''), starred = req.body?.starred === true
    if (!authorizedChat(accountId, jid) || !isChatVisible(studioSettings[accountId], jid) || !await chatStore.hasConversation(accountId, jid)) return res.status(404).json({ ok: false, error: 'Conversation not found.' })
    const original = await chatStore.getMessage(accountId, jid, messageId)
    if (!original) return res.status(404).json({ ok: false, error: 'Message not found.' })
    const session = accountRuntime.get(accountId), socket = session.socket
    if (!socket || session.state !== 'connected' || typeof socket.chatModify !== 'function') return res.status(503).json({ ok: false, error: 'Connect this WhatsApp account before starring messages.' })
    await socket.chatModify({ star: { messages: [{ id: original.id, fromMe: original.fromMe === true }], star: starred } }, jid)
    const result = await chatStore.setStarred(accountId, jid, original.id, starred)
    publishStudioEvent('whatsapp.message.starred', { accountId, jid, messageId: original.id, starred })
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not update starred message.') })
  }
})
app.get('/api/chats/:accountId/:jid/sync', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const jid = decodeURIComponent(String(req.params.jid || ''))
    if (!authorizedChat(accountId, jid) || !isChatVisible(studioSettings[accountId], jid) || !await chatStore.hasConversation(accountId, jid)) {
      return res.status(404).json({ ok: false, error: 'Conversation not found.' })
    }
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 200))
    const after = Math.max(0, Number(req.query.after) || 0)
    const before = Math.max(0, Number(req.query.before) || 0)
    const afterId = String(req.query.afterId || '').slice(0, 256)
    const beforeId = String(req.query.beforeId || '').slice(0, 256)
    if (after > 0 && before > 0) return res.status(400).json({ ok: false, error: 'Use either an after or before cursor, not both.' })
    if (afterId && !after) return res.status(400).json({ ok: false, error: 'An after message id requires an after timestamp.' })
    if (beforeId && !before) return res.status(400).json({ ok: false, error: 'A before message id requires a before timestamp.' })
    const messages = await chatStore.getMessages(accountId, jid, {
      limit, after, before, afterId, beforeId,
      pollActorKey: currentPollActorKey(accountId),
    })
    const deletedMessageIds = before > 0 ? [] : await chatStore.listDeletedMessageIds(accountId, jid)
    const remoteDeletedMessages = await chatStore.listRemoteDeletedMessages(accountId, jid)
    const pollUpdates = (await chatStore.getMessages(accountId, jid, {
      limit: 500,
      pollActorKey: currentPollActorKey(accountId),
    })).filter(message => message.type === 'poll').slice(-100)
    const timestamps = messages.map(message => Number(message.timestamp) || 0).filter(value => value > 0)
    res.json({
      ok: true,
      messages,
      pollUpdates,
      deletedMessageIds,
      remoteDeletedMessages,
      hasOlder: before > 0 ? messages.length >= limit : after === 0 && messages.length >= limit,
      hasNewer: after > 0 && messages.length >= limit,
      oldestTimestamp: timestamps.length ? Math.min(...timestamps) : 0,
      newestTimestamp: timestamps.length ? Math.max(...timestamps) : 0,
      syncedAt: Date.now(),
      cursor: {
        after, before, afterId, beforeId, limit,
        nextAfter: messages.length ? Number(messages[messages.length - 1].timestamp) : after,
        nextAfterId: messages.length ? String(messages[messages.length - 1].id) : afterId,
        nextBefore: messages.length ? Number(messages[0].timestamp) : before,
        nextBeforeId: messages.length ? String(messages[0].id) : beforeId,
      },
    })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not sync conversation messages.') })
  }
})

app.get('/api/chats/:accountId/:jid/messages', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const jid = decodeURIComponent(String(req.params.jid || ''))
    if ((!authorizedChat(accountId, jid) || !isChatVisible(studioSettings[accountId], jid)) || !await chatStore.hasConversation(accountId, jid)) return res.status(404).json({ ok: false, error: 'Conversation not found.' })
    const messages = await chatStore.getMessages(accountId, jid, {
      limit: req.query.limit, before: req.query.before,
      pollActorKey: currentPollActorKey(accountId),
    })
    await chatStore.markRead(accountId, jid)
    res.json({ ok: true, messages })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not read messages.') })
  }
})
app.post('/api/chats/:accountId/:jid/media/:messageId/download', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const jid = decodeURIComponent(String(req.params.jid || ''))
    if (!authorizedChat(accountId, jid) || !isChatVisible(studioSettings[accountId], jid)) return res.status(404).json({ ok: false, error: 'Conversation not found.' })
    const session = accountRuntime.get(accountId), socket = session.socket
    if (!socket || session.state !== 'connected') return res.status(503).json({ ok: false, error: 'Connect this WhatsApp account before downloading media.' })
    const downloaded = await chatStore.downloadMessageMedia(accountId, jid, req.params.messageId,
      (message, currentSocket) => downloadMediaMessage(message, 'buffer', {}, { logger, reuploadRequest: currentSocket.updateMediaMessage }), socket)
    if (!downloaded) return res.status(410).json({ ok: false, error: 'This media is no longer available to download.' })
    res.json({ ok: true, message: downloaded })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not download this media.') })
  }
})
app.post('/api/chats/:accountId/:jid/reaction', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const jid = decodeURIComponent(String(req.params.jid || ''))
    const messageId = String(req.body?.messageId || '')
    const emoji = String(req.body?.emoji || '')
    if (!authorizedChat(accountId, jid) || !isChatVisible(studioSettings[accountId], jid) || !await chatStore.hasConversation(accountId, jid)) return res.status(404).json({ ok: false, error: 'Conversation not found.' })
    if (!/^[\p{Extended_Pictographic}\uFE0F\u200D\u{1F1E6}-\u{1F1FF}]{1,16}$/u.test(emoji)) return res.status(400).json({ ok: false, error: 'Choose a valid emoji reaction.' })
    const original = await chatStore.getMessage(accountId, jid, messageId)
    if (!original) return res.status(404).json({ ok: false, error: 'Message not found.' })
    const session = accountRuntime.get(accountId), socket = session.socket
    if (!socket || session.state !== 'connected') return res.status(503).json({ ok: false, error: 'This WhatsApp account is not connected.' })
    await socket.sendMessage(jid, { react: { key: original.key, text: emoji } })
    const reactions = await chatStore.applyReaction(accountId, jid, messageId, emoji, 'You')
    publishStudioEvent('whatsapp.message.reaction', { accountId, jid, messageId })
    res.json({ ok: true, reactions })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not react to this message.') })
  }
})
app.post('/api/chats/:accountId/:jid/forward', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const jid = decodeURIComponent(String(req.params.jid || ''))
    const targetJid = String(req.body?.targetJid || '')
    if (!authorizedChat(accountId, jid) || !isChatVisible(studioSettings[accountId], jid) ||
        !authorizedChat(accountId, targetJid) || !isChatVisible(studioSettings[accountId], targetJid) ||
        !await chatStore.hasConversation(accountId, targetJid)) return res.status(404).json({ ok: false, error: 'Source or destination conversation is not available.' })
    const original = await chatStore.getMessage(accountId, jid, String(req.body?.messageId || ''))
    if (!original?.sourceMessage) return res.status(410).json({ ok: false, error: 'This message is too old to forward from the stored inbox.' })
    const session = accountRuntime.get(accountId), socket = session.socket
    if (!socket || session.state !== 'connected') return res.status(503).json({ ok: false, error: 'This WhatsApp account is not connected.' })
    const sent = await socket.sendMessage(targetJid, { forward: original.sourceMessage })
    await chatStore.recordMessage({ sessionId: accountId, message: sent, socket })
    publishStudioEvent('whatsapp.message.forwarded', { accountId, jid: targetJid })
    res.json({ ok: true })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not forward this message.') })
  }
})
app.post('/api/chats/:accountId/:jid/delete', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const jid = decodeURIComponent(String(req.params.jid || ''))
    if (!authorizedChat(accountId, jid) || !isChatVisible(studioSettings[accountId], jid)) return res.status(404).json({ ok: false, error: 'Conversation not found.' })
    const original = await chatStore.getMessage(accountId, jid, String(req.body?.messageId || ''))
    if (!original) return res.status(404).json({ ok: false, error: 'Message not found.' })
    const session = accountRuntime.get(accountId), socket = session.socket
    if (!socket || session.state !== 'connected') return res.status(503).json({ ok: false, error: 'Connect this WhatsApp account before deleting a message.' })
    if (original.fromMe) {
      await socket.sendMessage(jid, { delete: original.key })
    } else {
      if (typeof socket.chatModify !== 'function') return res.status(501).json({ ok: false, error: 'This WhatsApp connection does not support deleting incoming messages for this account.' })
      await socket.chatModify({ clear: { messages: [{
        id: original.id, fromMe: false, timestamp: String(Math.floor(Number(original.timestamp || 0) / 1000)),
      }] } }, jid)
    }
    await chatStore.deleteMessage(accountId, jid, original.id)
    publishStudioEvent('whatsapp.message.deleted', { accountId, jid, messageId: original.id })
    res.json({ ok: true })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not delete this message.') })
  }
})
app.post('/api/chats/:accountId/:jid/polls', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const jid = decodeURIComponent(String(req.params.jid || ''))
    if (!authorizedChat(accountId, jid) || !isChatVisible(studioSettings[accountId], jid) ||
        !await chatStore.hasConversation(accountId, jid)) {
      return res.status(404).json({ ok: false, error: 'Conversation not found or not authorized.' })
    }
    const name = String(req.body?.name || '').trim()
    const options = Array.isArray(req.body?.options)
      ? req.body.options.map(value => String(value || '').trim()) : []
    const selectableCount = Number(req.body?.selectableCount || 1)
    if (!name || name.length > 120) {
      return res.status(400).json({ ok: false, error: 'Enter a poll question up to 120 characters.' })
    }
    if (options.length < 2 || options.length > 12 ||
        options.some(value => !value || value.length > 100) ||
        new Set(options.map(value => value.toLocaleLowerCase())).size !== options.length) {
      return res.status(400).json({ ok: false, error: 'A poll needs 2–12 unique options, each up to 100 characters.' })
    }
    if (!Number.isInteger(selectableCount) || selectableCount < 1 || selectableCount > options.length) {
      return res.status(400).json({ ok: false, error: 'The maximum number of choices must be between 1 and the number of options.' })
    }
    const session = accountRuntime.get(accountId), socket = session.socket
    if (!socket || session.state !== 'connected') {
      return res.status(503).json({ ok: false, error: 'Connect this WhatsApp account before creating a poll.' })
    }
    const sent = await socket.sendMessage(jid, {
      poll: {
        name,
        values: options,
        selectableCount,
        toAnnouncementGroup: false,
        hideVoter: false,
        canAddOption: false,
      },
    })
    await chatStore.recordMessage({ sessionId: accountId, message: sent, socket })
    publishStudioEvent('whatsapp.poll.created', { accountId, jid, messageId: String(sent?.key?.id || '') })
    res.json({ ok: true, message: String(sent?.key?.id || '') })
  } catch (error) {
    res.status(error?.status || 503).json({ ok: false, error: String(error?.message || 'Could not create this poll.') })
  }
})

app.post('/api/chats/:accountId/:jid/:messageId/poll-vote', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const jid = decodeURIComponent(String(req.params.jid || ''))
    const messageId = String(req.params.messageId || '')
    if (!authorizedChat(accountId, jid) || !isChatVisible(studioSettings[accountId], jid) ||
        !await chatStore.hasConversation(accountId, jid)) {
      return res.status(404).json({ ok: false, error: 'Conversation not found or not authorized.' })
    }
    const selectedOptions = Array.isArray(req.body?.selectedOptions)
      ? req.body.selectedOptions.map(value => String(value || '').trim()) : []
    const pollMessage = await chatStore.getMessage(accountId, jid, messageId)
    if (!pollMessage || pollMessage.type !== 'poll' || !pollMessage.sourceMessage) {
      return res.status(404).json({ ok: false, error: 'The original poll is not available in this conversation.' })
    }
    const session = accountRuntime.get(accountId), socket = session.socket
    if (!socket || session.state !== 'connected') {
      return res.status(503).json({ ok: false, error: 'Connect this WhatsApp account before voting.' })
    }
    const voterJid = jidNormalizedUser(String(socket.user?.id || ''))
    const encrypted = createPollVoteEnvelope({ pollMessage, selectedOptions, voterJid })
    await socket.sendMessage(jid, {
      pollUpdate: {
        metadata: {},
        key: pollMessage.sourceMessage.key,
        vote: encrypted.vote,
      },
    }, { quoted: pollMessage.sourceMessage })
    const actorKey = createHash('sha256').update(encrypted.voterJid, 'utf8').digest('hex')
    const updated = await chatStore.applyPollVote(
      accountId, jid, messageId, actorKey, encrypted.selectedOptionHashes
    )
    publishStudioEvent('whatsapp.poll.updated', { accountId, jid, pollMessageId: messageId })
    res.json({ ok: true, messageId, selectedOptions: encrypted.selectedOptionNames, poll: updated })
  } catch (error) {
    res.status(error?.status || 503).json({ ok: false, error: String(error?.message || 'Could not submit this poll vote.') })
  }
})

app.post('/api/chats/:accountId/:jid/send', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const jid = decodeURIComponent(String(req.params.jid || ''))
    const text = String(req.body?.text || '').trim()
    if (!text || Buffer.byteLength(text, 'utf8') > 12000) return res.status(400).json({ ok: false, error: 'Enter a message up to 12 KB.' })
    if ((!authorizedChat(accountId, jid) || !isChatVisible(studioSettings[accountId], jid)) || !await chatStore.hasConversation(accountId, jid)) return res.status(404).json({ ok: false, error: 'Conversation not found or not authorized.' })
    const session = accountRuntime.get(accountId), socket = session.socket
    if (!socket || session.state !== 'connected') return res.status(503).json({ ok: false, error: 'This WhatsApp account is not connected.' })
    const quotedMessageId = String(req.body?.quotedMessageId || '')
    const quoted = quotedMessageId ? await chatStore.getMessage(accountId, jid, quotedMessageId) : null
    if (quotedMessageId && !quoted?.sourceMessage) return res.status(410).json({ ok: false, error: 'The original message is not available to quote.' })
    const clientMessageId = String(req.body?.clientMessageId || '')
    if (clientMessageId) {
      const intent = await chatStore.beginIdempotentSend(accountId, { clientMessageId, jid, text, quotedMessageId })
      if (intent.state === 'sent') return res.json({ ok: true, message: intent.messageId, clientMessageId, idempotentReplay: true })
      if (intent.state === 'uncertain') {
        return res.status(409).json({
          ok: false, state: 'uncertain', clientMessageId,
          error: 'This send was already started but its final WhatsApp result was not recorded. It was not sent again to avoid a duplicate.',
        })
      }
    }
    const sent = await socket.sendMessage(jid, { text }, quoted?.sourceMessage ? { quoted: quoted.sourceMessage } : undefined)
    await chatStore.recordMessage({ sessionId: accountId, message: sent, socket })
    const messageId = sent?.key?.id || ''
    if (clientMessageId) await chatStore.completeIdempotentSend(accountId, clientMessageId, messageId)
    publishStudioEvent('whatsapp.message.sent', { accountId, jid, type: 'text' })
    res.json({ ok: true, message: messageId, clientMessageId })
  } catch (error) {
    res.status(error?.status || 503).json({ ok: false, error: String(error?.message || 'Could not send the message.') })
  }
})
app.post('/api/chats/:accountId/:jid/media', requireAdmin, express.raw({ type: '*/*', limit: '24mb' }), async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const jid = decodeURIComponent(String(req.params.jid || ''))
    if (!authorizedChat(accountId, jid) || !isChatVisible(studioSettings[accountId], jid) || !await chatStore.hasConversation(accountId, jid)) return res.status(404).json({ ok: false, error: 'Conversation not found or not authorized.' })
    const session = accountRuntime.get(accountId), socket = session.socket
    if (!socket || session.state !== 'connected') return res.status(503).json({ ok: false, error: 'This WhatsApp account is not connected.' })
    if (!Buffer.isBuffer(req.body) || !req.body.length || req.body.length > 24 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'Choose a file up to 24 MB.' })
    const mime = String(req.get('x-media-type') || 'application/octet-stream').split(';')[0].toLowerCase()
    const filename = String(req.get('x-file-name') || 'attachment').slice(0, 100).replace(/[\u0000-\u001f/\\]/g, '_')
    const caption = String(req.get('x-caption') || '').slice(0, 1000)
    const isVoiceNote = req.get('x-voice-note') === 'true'
    const durationSeconds = Math.max(0, Math.min(3600, Number(req.get('x-duration-seconds')) || 0))
    const clientMessageId = String(req.get('x-client-message-id') || '')
    const mediaDigest = createHash('sha256').update(req.body).digest('hex')
    if (clientMessageId) {
      const intent = await chatStore.beginIdempotentMediaSend(accountId, {
        clientMessageId, jid, mimeType: mime, fileName: filename, caption,
        sha256: mediaDigest, sizeBytes: req.body.length, isVoiceNote, durationSeconds,
      })
      if (intent.state === 'sent') {
        return res.json({ ok: true, message: intent.messageId, clientMessageId, idempotentReplay: true })
      }
      if (intent.state === 'uncertain') {
        return res.status(409).json({
          ok: false, state: 'uncertain', clientMessageId,
          error: 'This attachment send already started but its final WhatsApp result was not recorded. It was not sent again to avoid a duplicate.',
        })
      }
    }
    let content
    if (mime.startsWith('image/') && mime !== 'image/webp') content = { image: req.body, caption }
    else if (mime.startsWith('video/')) content = { video: req.body, caption }
    else if (mime.startsWith('audio/')) content = { audio: req.body, mimetype: mime, ptt: req.get('x-voice-note') === 'true' }
    else if (mime === 'image/webp') content = { sticker: req.body }
    else content = { document: req.body, mimetype: mime, fileName: filename, caption }
    const sent = await socket.sendMessage(jid, content)
    await chatStore.recordOutgoingMedia({ sessionId: accountId, jid, buffer: req.body, mimeType: mime, fileName: filename, sendResult: sent, text: caption, ptt: isVoiceNote, duration: durationSeconds })
    const messageId = sent?.key?.id || ''
    if (clientMessageId) await chatStore.completeIdempotentSend(accountId, clientMessageId, messageId)
    publishStudioEvent('whatsapp.message.sent', { accountId, jid, type: 'media' })
    res.json({ ok: true, message: messageId, clientMessageId })
  } catch (error) {
    res.status(error?.status || 503).json({ ok: false, error: String(error?.message || 'Could not send the attachment.') })
  }
})
app.get('/api/chats/:accountId/media/:messageId', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const media = await chatStore.getMedia(accountId, req.params.messageId)
    if (!media || !authorizedChat(accountId, media.jid) || !isChatVisible(studioSettings[accountId], media.jid)) return res.status(404).json({ ok: false, error: 'Attachment not found.' })
    res.set('Content-Type', media.mimeType)
    res.set('Content-Length', String(media.size))
    const inlineMedia = ['image/', 'video/', 'audio/'].some(prefix => String(media.mimeType || '').startsWith(prefix))
    res.set('Content-Disposition', inlineMedia ? 'inline' : `attachment; filename*=UTF-8''${encodeURIComponent(media.fileName)}`)
    res.set('X-Content-Type-Options', 'nosniff')
    res.sendFile(media.path)
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not open the attachment.') })
  }
})
app.post('/api/chats/:accountId/media/:messageId/view-once', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const info = await chatStore.getViewOnceInfo(accountId, req.params.messageId)
    if (!info || !authorizedChat(accountId, info.jid) || !isChatVisible(studioSettings[accountId], info.jid)) {
      return res.status(404).json({ ok: false, error: 'View-once media not found.' })
    }
    if (info.viewed) return res.status(410).json({ ok: false, error: 'This view-once media has already been opened.' })
    if (!['image/', 'video/'].some(prefix => String(info.mimeType).startsWith(prefix))) {
      return res.status(415).json({ ok: false, error: 'This view-once media type is not supported.' })
    }
    if (!info.viewed) {
      const session = accountRuntime.get(accountId), socket = session.socket
      if (!socket || session.state !== 'connected') return res.status(503).json({ ok: false, error: 'Connect this WhatsApp account before opening view-once media.' })
      await chatStore.downloadMessageMedia(accountId, info.jid, req.params.messageId,
        (message, currentSocket) => downloadMediaMessage(message, 'buffer', {}, { logger, reuploadRequest: currentSocket.updateMediaMessage }), socket)
    }
    const media = await chatStore.consumeViewOnceMedia(accountId, req.params.messageId)
    if (!media) return res.status(410).json({ ok: false, error: 'This view-once media is no longer available.' })
    if (!authorizedChat(accountId, media.jid) || !isChatVisible(studioSettings[accountId], media.jid)) {
      return res.status(404).json({ ok: false, error: 'View-once media not found.' })
    }
    res.set('Content-Type', media.mimeType)
    res.set('Content-Length', String(media.size))
    res.set('Content-Disposition', 'inline')
    res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0')
    res.set('Pragma', 'no-cache')
    res.set('Expires', '0')
    res.set('X-Content-Type-Options', 'nosniff')
    res.status(200).end(media.buffer)
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not open view-once media.') })
  }
})
app.get('/api/metrics', requireAdmin, async (_req, res) => {
  res.json({ ok: true, ...(await chatStore.metrics()) })
})
app.get('/api/activity', requireAdmin, async (req, res) => {
  const entries = await activityStore.list({ limit: req.query.limit, level: req.query.level, query: req.query.q })
  res.json({ ok: true, entries })
})
app.delete('/api/activity', requireAdmin, async (_req, res) => {
  await activityStore.clear()
  res.json({ ok: true })
})
app.get('/api/storage', requireAdmin, async (_req, res) => {
  try {
    const disk = await statfs(DATA_DIR)
    const media = await chatStore.mediaUsage()
    const diskTotal = Number(disk.blocks) * Number(disk.bsize)
    const diskFree = Number(disk.bavail) * Number(disk.bsize)
    res.json({ ok: true, disk: { totalBytes: diskTotal, freeBytes: diskFree, usedBytes: Math.max(0, diskTotal - diskFree) }, media })
  } catch {
    res.status(500).json({ ok: false, error: 'Could not read server storage usage.' })
  }
})

function serializeSourceMutations(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next()
  const previous = sourceMutationTail
  let release
  sourceMutationTail = new Promise(resolve => { release = resolve })
  previous.then(async () => {
    let finished = false
    let lockAcquired = false
    const unlock = async () => {
      if (finished) return
      finished = true
      if (lockAcquired && !req.keepDeployLock) await releaseDeployLock().catch(() => {})
      release()
    }
    res.once('finish', () => { void unlock() })
    res.once('close', () => { void unlock() })
    if (updateInProgress) {
      res.status(409).json({ ok: false, error: 'Aharane is applying or deploying source changes. Try again when it is healthy.' })
      await unlock()
      return
    }
    try {
      lockAcquired = await acquireDeployLock('source-mutation')
      if (!lockAcquired) {
        res.status(409).json({ ok: false, error: 'Another Aharane deployment is in progress. Wait for its health check to finish.' })
        await unlock()
        return
      }
      req.deployLockAcquired = true
      next()
    } catch (error) {
      await unlock()
      next(error)
    }
  }).catch(error => {
    release()
    next(error)
  })
}

app.use('/api/files', serializeSourceMutations)

app.get('/api/files/export', requireAdmin, async (_req, res) => {
  try {
    const files = []
    let totalBytes = 0
    async function walk(directory = '') {
      const listing = await listSourceFiles(directory)
      for (const child of listing.children) {
        const path = child.path
        if (child.type === 'folder') {
          await walk(path)
          continue
        }
        const target = await safeSourceTarget(path)
        if (!target.info?.isFile() || target.info.isSymbolicLink()) continue
        if (target.info.size > 8 * 1024 * 1024) {
          sourcePathError(413, 'EXPORT_FILE_TOO_LARGE', 'A source file is too large to include in the ZIP: ' + path)
        }
        const handle = await open(target.full, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0))
        try {
          const info = await handle.stat()
          if (!info.isFile() || info.size > 8 * 1024 * 1024) continue
          const content = await handle.readFile()
          totalBytes += content.length
          if (totalBytes > 45 * 1024 * 1024 || files.length >= 2000) {
            sourcePathError(413, 'EXPORT_TOO_LARGE', 'The source export exceeds the safe 45 MB or 2,000-file limit.')
          }
          files.push({ path, content })
        } finally {
          await handle.close().catch(() => {})
        }
      }
    }
    await walk('')
    if (!files.length) return res.status(404).json({ ok: false, error: 'No source files were found to export.' })
    const archive = createSourceZip(files)
    res.status(200)
      .set('Content-Type', 'application/zip')
      .set('Content-Disposition', 'attachment; filename="aharane-source.zip"')
      .set('Cache-Control', 'private, no-store, no-cache, must-revalidate')
      .set('Pragma', 'no-cache')
      .set('X-Content-Type-Options', 'nosniff')
      .set('Content-Length', String(archive.length))
      .send(archive)
  } catch (error) {
    res.status(error?.status || 500).json({ ok: false, error: String(error?.message || 'Could not export the Aharane source code.') })
  }
})

app.post('/api/files/export-selection', requireAdmin, async (req, res) => {
  try {
    const paths = Array.isArray(req.body?.paths) ? req.body.paths : []
    if (!paths.length || paths.length > 100) {
      return res.status(400).json({ ok: false, error: 'Select between 1 and 100 files or folders to export.' })
    }
    const files = [], seen = new Set()
    let totalBytes = 0
    async function addFile(path) {
      if (seen.has(path)) return
      const target = await safeSourceTarget(path)
      if (!target.info?.isFile() || target.info.isSymbolicLink()) return
      if (!SOURCE_EXTENSIONS.has(extname(path).toLowerCase()) && !SOURCE_ROOT_FILES.has(target.parts[0])) {
        sourcePathError(403, 'EXPORT_TYPE_BLOCKED', 'This file type is not available for export: ' + path)
      }
      if (target.info.size > 8 * 1024 * 1024) sourcePathError(413, 'EXPORT_FILE_TOO_LARGE', 'A selected file is too large: ' + path)
      const handle = await open(target.full, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0))
      try {
        const info = await handle.stat()
        if (!info.isFile() || info.size > 8 * 1024 * 1024) return
        const content = await handle.readFile()
        totalBytes += content.length
        if (totalBytes > 45 * 1024 * 1024 || files.length >= 2000) {
          sourcePathError(413, 'EXPORT_TOO_LARGE', 'The selected source exceeds the safe 45 MB or 2,000-file limit.')
        }
        seen.add(path);files.push({ path, content })
      } finally { await handle.close().catch(() => {}) }
    }
    async function walk(path) {
      const listing = await listSourceFiles(path)
      for (const child of listing.children) {
        if (child.type === 'folder') await walk(child.path)
        else await addFile(child.path)
      }
    }
    for (const raw of paths) {
      const path = String(raw || '')
      const target = await safeSourceTarget(path)
      if (target.info?.isDirectory()) await walk(path)
      else if (target.info?.isFile()) await addFile(path)
    }
    if (!files.length) return res.status(404).json({ ok: false, error: 'No eligible source files were found in that selection.' })
    const archive = createSourceZip(files)
    res.status(200)
      .set('Content-Type', 'application/zip')
      .set('Content-Disposition', 'attachment; filename="aharane-selection.zip"')
      .set('Cache-Control', 'private, no-store, no-cache, must-revalidate')
      .set('X-Content-Type-Options', 'nosniff')
      .set('Content-Length', String(archive.length))
      .send(archive)
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not export the selected source files.') })
  }
})

app.get('/api/files/tree', requireAdmin, async (req, res) => {
  try {
    const result = await listSourceFiles(String(req.query.item || ''))
    const manual = await readJsonFile(MANUAL_EDIT_STATE_FILE)
    res.json({
      ok: true,
      ...result,
      pending: manual?.status === 'pending',
      changedCount: manual?.modifiedPaths?.length || 0,
      stale: manual?.status === 'pending' && manual.currentRelease !== await currentReleaseDirectory(),
    })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not list Aharane source files.') })
  }
})

app.get('/api/files/download', requireAdmin, async (req, res) => {
  try {
    const target = await safeSourceTarget(req.query.item)
    if (!target.info?.isFile()) return res.status(400).json({ ok: false, error: 'Choose a source file to download.' })
    const extension = extname(target.path).toLowerCase()
    const isUpdateArchive = extension === '.zip'
    if (!SOURCE_EXTENSIONS.has(extension) && !SOURCE_ROOT_FILES.has(target.parts[0]) && !isUpdateArchive) {
      return res.status(403).json({ ok: false, error: 'This file type is not available for download.' })
    }
    const MAX_DOWNLOAD_BYTES = isUpdateArchive ? 50 * 1024 * 1024 : 25 * 1024 * 1024
    if (target.info.size > MAX_DOWNLOAD_BYTES) {
      return res.status(413).json({
        ok: false,
        error: isUpdateArchive
          ? 'This ZIP exceeds the 50 MB update-package limit.'
          : 'This source file exceeds the 25 MB browser download limit.'
      })
    }
    const info = await stat(target.full)
    if (!info.isFile() || info.size > MAX_DOWNLOAD_BYTES) return res.status(413).json({ ok: false, error: 'The source file changed or exceeds the download limit.' })
    res.set('Content-Type', 'application/octet-stream')
    res.set('Content-Length', String(info.size))
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(target.parts.at(-1))}`)
    res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate')
    res.set('X-Content-Type-Options', 'nosniff')
    createReadStream(target.full).on('error', () => {
      if (!res.headersSent) res.status(500).json({ ok: false, error: 'Could not stream this source file.' })
      else res.destroy()
    }).pipe(res)
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not download this source file.') })
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

app.post('/api/files/diagnostics', requireAdmin, async (req, res) => {
  let temporary = ''
  try {
    const requestedPath = String(req.body?.path || '').trim()
    const target = await safeSourceTarget(requestedPath, { allowMissing: true })
    const extension = extname(target.path).toLowerCase()
    const content = String(req.body?.content ?? '')
    if (Buffer.byteLength(content, 'utf8') > MAX_SOURCE_FILE_BYTES) {
      return res.status(413).json({ ok: false, error: 'The editor buffer exceeds the 512 KB diagnostics limit.' })
    }
    if (extension === '.json') {
      try {
        JSON.parse(content)
        return res.json({ ok: true, supported: true, diagnostics: [] })
      } catch (error) {
        const message = String(error?.message || 'Invalid JSON')
        const position = Number(message.match(/position\s+(\d+)/i)?.[1] || 0)
        const before = content.slice(0, position)
        return res.json({
          ok: true,
          supported: true,
          diagnostics: [{
            severity: 'error',
            message: message.slice(0, 240),
            line: before.split('\n').length,
            column: before.length - before.lastIndexOf('\n'),
          }],
        })
      }
    }
    if (!['.js', '.mjs', '.cjs'].includes(extension)) {
      return res.json({
        ok: true,
        supported: false,
        reason: 'This file type does not have a syntax checker configured on the Aharane server.',
        diagnostics: [],
      })
    }
    const checkExtension = extension === '.cjs' ? '.cjs' : '.mjs'
    temporary = join(UPDATE_DIR, 'editor-diagnostic-' + randomUUID() + checkExtension)
    await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    try {
      await execFileAsync(process.execPath, ['--check', temporary], {
        cwd: await currentReleaseDirectory(),
        timeout: 10_000,
        maxBuffer: 64 * 1024,
      })
      return res.json({ ok: true, supported: true, diagnostics: [] })
    } catch (error) {
      const output = String(error?.stderr || error?.stdout || error?.message || 'JavaScript syntax check failed.')
      const location = output.match(/editor-diagnostic-[^:\s]+:(\d+)(?::(\d+))?/)
      const errorLine = output.split('\n').find(line => /SyntaxError:|Error:/.test(line))
      return res.json({
        ok: true,
        supported: true,
        diagnostics: [{
          severity: 'error',
          message: String(errorLine || output).replaceAll(temporary, target.path).trim().slice(0, 300),
          line: location ? Number(location[1]) : null,
          column: location?.[2] ? Number(location[2]) : null,
        }],
      })
    }
  } catch (error) {
    res.status(error?.status || 400).json({
      ok: false,
      error: String(error?.message || 'Could not run source diagnostics.'),
    })
  } finally {
    if (temporary) await rm(temporary, { force: true }).catch(() => {})
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
      try { await recordManualEdit(target.path, 'created-folder') }
      catch (error) { await rm(target.full, { recursive: true, force: true }).catch(() => {}); throw error }
      return res.status(201).json({ ok: true, path: target.path, type: 'folder' })
    }

    const content = String(req.body?.content ?? '')
    await validateSourceContent(target.path, content)
    await writeFile(target.full, content, { encoding: 'utf8', mode: 0o640, flag: 'wx' })
    try {
      const savedContent = await readFile(target.full, 'utf8')
      if (savedContent !== content) throw new Error('The new file did not pass its on-disk save check. Refresh Files and try again.')
      await recordManualEdit(target.path, 'created-file')
    } catch (error) {
      await rm(target.full, { force: true }).catch(() => {})
      throw error
    }
    res.status(201).json({ ok: true, path: target.path, type: 'file', size: Buffer.byteLength(content) })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not create the source file or folder.') })
  }
})

app.put('/api/files/content', requireAdmin, async (req, res) => {
  let handle, manual
  try {
    if (updateInProgress) return res.status(409).json({ ok: false, error: 'Aharane is currently deploying. File changes are disabled.' })
    let target = await safeSourceTarget(req.body?.path)
    if (!target.info?.isFile()) return res.status(400).json({ ok: false, error: 'Choose an existing source file.' })
    const content = String(req.body?.content ?? '')
    // Autosave must preserve temporarily incomplete JS/JSON drafts while the user types.
    // Full syntax checks run when staged changes are applied.
    await validateSourceContent(target.path, content, { syntax: false })
    handle = await open(target.full, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0))
    const original = await handle.readFile()
    const currentHash = createHash('sha256').update(original).digest('hex')
    await handle.close()
    handle = null
    const expectedSha256 = String(req.body?.expectedSha256 || '')
    if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
      return res.status(400).json({ ok: false, error: 'The editor is missing its file-version check. Reload the file before saving.' })
    }
    if (expectedSha256 !== currentHash) {
      return res.status(409).json({ ok: false, error: 'This file changed after you opened it. Reload it before saving to avoid overwriting newer content.' })
    }

    await ensureManualEditBackup()
    target = await safeSourceTarget(target.path)
    if (!target.info?.isFile()) return res.status(409).json({ ok: false, error: 'The source file changed. Reload the Files Manager.' })
    const temporary = target.full + '.aharane-edit-' + randomUUID()
    const originalBytes = Buffer.from(original)
    let replaced = false
    try {
      await writeFile(temporary, content, { encoding: 'utf8', mode: 0o640, flag: 'wx' })
      const stagedContent = await readFile(temporary, 'utf8')
      if (stagedContent !== content) throw new Error('The temporary file failed verification. The existing file was not changed.')
      await rename(temporary, target.full)
      replaced = true
      const savedContent = await readFile(target.full, 'utf8')
      if (savedContent !== content) {
        const restore = target.full + '.aharane-restore-' + randomUUID()
        await writeFile(restore, originalBytes, { mode: 0o640, flag: 'wx' })
        await rename(restore, target.full)
        replaced = false
        throw new Error('The saved file failed verification. The previous content was restored.')
      }
      manual = await recordManualEdit(target.path, 'modified-file')
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {})
      if (replaced) {
        const restore = target.full + '.aharane-restore-' + randomUUID()
        await writeFile(restore, originalBytes, { mode: 0o640, flag: 'wx' }).then(() => rename(restore, target.full)).catch(() => {})
        await rm(restore, { force: true }).catch(() => {})
      }
      throw error
    }
    res.json({
      ok: true,
      path: target.path,
      size: Buffer.byteLength(content),
      sha256: createHash('sha256').update(content).digest('hex'),
      pending: true,
      changedCount: manual.modifiedPaths.length,
    })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not save the source file.') })
  } finally {
    await handle?.close().catch(() => {})
  }
})


app.post('/api/files/rename', requireAdmin, async (req, res) => {
  let renamed = null
  try {
    if (updateInProgress) return res.status(409).json({ ok: false, error: 'Aharane is currently deploying. File changes are disabled.' })
    const sourcePath = String(req.body?.path || '')
    const name = String(req.body?.name || '').trim()
    const source = await safeSourceTarget(sourcePath)
    if (source.parts.length < 2) return res.status(403).json({ ok: false, error: 'Root project folders and protected root files cannot be renamed.' })
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(name) || name.startsWith('.')) return res.status(400).json({ ok: false, error: 'Use a simple file or folder name.' })
    const parentPath = source.parts.slice(0, -1).join('/')
    const parent = await safeSourceTarget(parentPath)
    const destinationPath = parent.path + '/' + name
    if (destinationPath === source.path) return res.json({ ok: true, path: source.path, pending: false })
    const existing = await safeSourceTarget(destinationPath, { allowMissing: true })
    if (existing.info) return res.status(409).json({ ok: false, error: 'A file or folder with that name already exists.' })
    await ensureManualEditBackup()
    const currentSource = await safeSourceTarget(source.path)
    const currentDestination = await safeSourceTarget(destinationPath, { allowMissing: true })
    await rename(currentSource.full, currentDestination.full)
    renamed = { source: currentSource.full, destination: currentDestination.full }
    await recordManualEdits([
      { path: currentSource.path, action: 'renamed-from' },
      { path: destinationPath, action: 'renamed-to' },
    ])
    res.json({ ok: true, path: destinationPath, pending: true })
  } catch (error) {
    if (renamed) await rename(renamed.destination, renamed.source).catch(() => {})
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not rename the selected source item.') })
  }
})
app.post('/api/files/move', requireAdmin, async (req, res) => {
  const moved = []
  try {
    if (updateInProgress) return res.status(409).json({ ok: false, error: 'Aharane is currently deploying. File changes are disabled.' })
    const rawPaths = Array.isArray(req.body?.paths) ? req.body.paths : [req.body?.path]
    const paths = [...new Set(rawPaths.map(value => String(value || '')).filter(Boolean))]
    if (!paths.length || paths.length > 50) return res.status(400).json({ ok: false, error: 'Choose between 1 and 50 source items to move.' })
    const initialSources = []
    for (const sourcePath of paths) {
      const source = await safeSourceTarget(sourcePath)
      if (source.parts.length < 2) return res.status(403).json({ ok: false, error: 'Root project folders and protected root files cannot be moved.' })
      initialSources.push(source)
    }
    for (let i = 0; i < initialSources.length; i += 1) {
      for (let j = i + 1; j < initialSources.length; j += 1) {
        const a = initialSources[i].path, b = initialSources[j].path
        if (a.startsWith(b + '/') || b.startsWith(a + '/')) {
          return res.status(400).json({ ok: false, error: 'Do not select both a folder and one of its contents.' })
        }
      }
    }
    const destinationValue = String(req.body?.destination || '').trim()
    const initialRoot = destinationValue ? null : await sourceWorkspaceDirectory()
    const initialParent = destinationValue
      ? await safeSourceTarget(destinationValue)
      : { path: '', full: initialRoot, info: await stat(initialRoot) }
    if (!initialParent.info?.isDirectory()) return res.status(400).json({ ok: false, error: 'Choose an existing destination folder.' })
    const plans = [], plannedDestinations = new Set()
    for (const source of initialSources) {
      if (initialParent.full === source.full || initialParent.full.startsWith(source.full + sep)) {
        return res.status(400).json({ ok: false, error: 'A folder cannot be moved inside itself.' })
      }
      const destinationPath = initialParent.path ? initialParent.path + '/' + source.parts.at(-1) : source.parts.at(-1)
      if (destinationPath === source.path) return res.status(400).json({ ok: false, error: 'The item is already in that folder.' })
      if (plannedDestinations.has(destinationPath)) {
        return res.status(409).json({ ok: false, error: 'Two selected items have the same name. Move them separately or rename one first.' })
      }
      plannedDestinations.add(destinationPath)
      const target = await safeSourceTarget(destinationPath, { allowMissing: true })
      if (target.info) return res.status(409).json({ ok: false, error: 'The destination already contains an item named ' + source.parts.at(-1) + '.' })
      plans.push({ sourcePath: source.path, destinationPath })
    }
    await ensureManualEditBackup()
    const finalRoot = destinationValue ? null : await sourceWorkspaceDirectory()
    const finalParent = destinationValue
      ? await safeSourceTarget(destinationValue)
      : { path: '', full: finalRoot, info: await stat(finalRoot) }
    if (!finalParent.info?.isDirectory()) return res.status(409).json({ ok: false, error: 'The destination folder changed. Refresh the Files Manager.' })
    const finalPlans = []
    for (const plan of plans) {
      const source = await safeSourceTarget(plan.sourcePath)
      const destination = await safeSourceTarget(plan.destinationPath, { allowMissing: true })
      if (!source.info || destination.info || finalParent.full === source.full || finalParent.full.startsWith(source.full + sep)) {
        return res.status(409).json({ ok: false, error: 'A selected item or its destination changed. Refresh the Files Manager.' })
      }
      finalPlans.push({ source, destination })
    }
    for (const plan of finalPlans) {
      await rename(plan.source.full, plan.destination.full)
      moved.push(plan)
    }
    const journal = []
    for (const { source, destination } of moved) {
      journal.push(
        { path: source.path, action: 'moved-from' },
        { path: destination.path, action: 'moved-to' },
      )
    }
    await recordManualEdits(journal)
    res.json({ ok: true, moved: moved.map(item => ({ from: item.source.path, to: item.destination.path })), pending: true })
  } catch (error) {
    for (const item of [...moved].reverse()) {
      await rename(item.destination.full, item.source.full).catch(() => {})
    }
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not move the selected source items.') })
  }
})

app.post('/api/files/delete', requireAdmin, async (req, res) => {
  const deleted = []
  try {
    if (updateInProgress) return res.status(409).json({ ok: false, error: 'Aharane is currently deploying. File changes are disabled.' })
    const paths = Array.isArray(req.body?.paths) ? [...new Set(req.body.paths.map(String))] : []
    if (!paths.length || paths.length > 50) return res.status(400).json({ ok: false, error: 'Choose between 1 and 50 source items.' })
    const initialTargets = []
    for (const sourcePath of paths) {
      const target = await safeSourceTarget(sourcePath)
      if (!target.info?.isFile() && !target.info?.isDirectory()) {
        return res.status(400).json({ ok: false, error: 'Choose an existing source file or folder.' })
      }
      if (target.parts.length === 1 && (target.info.isDirectory() || SOURCE_ROOT_FILES.has(target.parts[0]))) {
        return res.status(403).json({ ok: false, error: 'Root project folders and protected root files cannot be deleted.' })
      }
      initialTargets.push({ path: target.path, isDirectory: target.info.isDirectory() })
    }
    const selectedPaths = initialTargets.map(item => item.path)
    for (let i = 0; i < selectedPaths.length; i += 1) {
      for (let j = i + 1; j < selectedPaths.length; j += 1) {
        if (selectedPaths[i].startsWith(selectedPaths[j] + '/') || selectedPaths[j].startsWith(selectedPaths[i] + '/')) {
          return res.status(400).json({ ok: false, error: 'Do not select both a folder and one of its contents.' })
        }
      }
    }
    await ensureManualEditBackup()
    const targets = []
    for (const item of initialTargets) {
      const target = await safeSourceTarget(item.path)
      if ((!target.info?.isFile() && !target.info?.isDirectory()) || target.info.isDirectory() !== item.isDirectory) {
        return res.status(409).json({ ok: false, error: 'A selected source item changed. Refresh the Files Manager.' })
      }
      targets.push(target)
    }
    const stagedTombstones = []
    try {
      for (const target of targets) {
        const tombstone = join(dirname(target.full), '.aharane-delete-' + randomUUID())
        await rename(target.full, tombstone)
        stagedTombstones.push({ target, tombstone })
      }
      await recordManualEdits(stagedTombstones.map(({ target }) => ({
        path: target.path,
        action: target.info.isDirectory() ? 'deleted-folder' : 'deleted-file',
      })))
    } catch (error) {
      for (const item of [...stagedTombstones].reverse()) {
        await rename(item.tombstone, item.target.full).catch(rollbackError => {
          logger.error({ event: 'files.delete-rollback-failed', path: item.target.path, error: String(rollbackError?.message || rollbackError) })
        })
      }
      throw error
    }
    const cleanupPending = []
    for (const item of stagedTombstones) {
      try { await rm(item.tombstone, { recursive: item.target.info.isDirectory(), force: true }) }
      catch (error) {
        cleanupPending.push(item.target.path)
        logger.warn({ event: 'files.delete-tombstone-cleanup-pending', path: item.target.path, error: String(error?.message || error) })
      }
      deleted.push(item.target)
    }
    res.json({ ok: true, deleted: deleted.map(target => target.path), cleanupPending, pending: true })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not delete the selected source items.') })
  }
})

app.post('/api/files/apply', requireAdmin, async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ ok: false, error: 'Explicit confirmation is required to apply saved file edits.' })
  if (updateInProgress) return res.status(409).json({ ok: false, error: 'Another Aharane deployment is already running.' })
  const manual = await readJsonFile(MANUAL_EDIT_STATE_FILE)
  if (!manual || manual.status !== 'pending' || !Array.isArray(manual.modifiedPaths) || !manual.modifiedPaths.length) {
    return res.status(409).json({ ok: false, error: 'There are no saved manual file edits to apply.' })
  }
  if (!req.deployLockAcquired) return res.status(409).json({ ok: false, error: 'Could not acquire the Aharane deployment lock. Retry when no other operation is running.' })
  updateInProgress = true
  try {
    await setDeployLockSource('manual-files')
    const current = await currentReleaseDirectory()
    const workspace = String(manual.workspaceRelease || '')
    if (current !== manual.currentRelease || !workspace.startsWith(RELEASES_DIR + sep)) {
      updateInProgress = false
      return res.status(409).json({ ok: false, error: 'The active release or edit workspace changed. Recover the Files Manager draft before applying these edits.' })
    }
    const actualWorkspace = await realpath(workspace)
    if (!actualWorkspace.startsWith(RELEASES_DIR + sep) || actualWorkspace === current) {
      updateInProgress = false
      return res.status(409).json({ ok: false, error: 'The saved edit workspace is not a separate Aharane release.' })
    }
    await validateManualEditWorkspaceFiles(actualWorkspace, manual.modifiedPaths)
    await execFileAsync(process.execPath, ['--check', join(actualWorkspace, 'src/index.js')], { cwd: actualWorkspace, timeout: 15_000, maxBuffer: 1024 * 1024 })
    await execFileAsync('npm', ['run', 'check'], {
      cwd: actualWorkspace,
      timeout: 2 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
      env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: DATA_DIR, NODE_ENV: 'test', NPM_CONFIG_CACHE: join(UPDATE_DIR, 'npm-cache'), NPM_CONFIG_IGNORE_SCRIPTS: 'true', NPM_CONFIG_FUND: 'false', NPM_CONFIG_AUDIT: 'false' },
    })
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
    req.keepDeployLock = true
    res.status(202).json({ ok: true, status: 'awaiting-healthcheck', updateId, message: 'Saved file changes passed validation. Aharane is switching to the prepared release and restarting.' })
    setTimeout(() => process.exit(1), 350)
  } catch (error) {
    updateInProgress = false
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
    if (!workspace.startsWith(RELEASES_DIR + sep)) {
      return res.status(409).json({ ok: false, error: 'The saved edit workspace is outside Aharane releases.' })
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

app.post('/api/files/recover', requireAdmin, async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ ok: false, error: 'Explicit confirmation is required to recover the saved draft.' })
  if (updateInProgress) return res.status(409).json({ ok: false, error: 'Another Aharane deployment is already running.' })
  try {
    const recovered = await recoverStaleManualEditWorkspace()
    res.json({
      ok: true,
      pending: true,
      stale: false,
      recovered: Boolean(recovered.recovered),
      changedCount: recovered.modifiedPaths?.length || 0,
      message: recovered.recovered
        ? 'The staged draft was recovered onto the current Aharane release. The running bot was not changed.'
        : 'The staged draft already belongs to the current Aharane release.',
    })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not recover the saved Files Manager draft.') })
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
    const failedUploadId = String(req.body?.updateId || '')
    if (validUpdateId(failedUploadId)) {
      await rm(uploadDirectory(failedUploadId), { recursive: true, force: true }).catch(() => {})
    }
    res.status(400).json({ ok: false, error: String(error?.message || 'ZIP validation failed.') })
  }
})

app.use('/api/update/deploy', serializeSourceMutations)
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
  if (!req.deployLockAcquired) return res.status(409).json({ ok: false, error: 'Could not acquire the Aharane deployment lock. Retry when no other operation is running.' })
  updateInProgress = true
  try {
    await setDeployLockSource('zip-update')
    await writeJsonAtomic(UPDATE_STATE_FILE, {
      status: 'preparing',
      updateId,
      version: metadata.inspection.manifest.bot_version,
      startedAt: new Date().toISOString(),
    })
  } catch (error) {
    updateInProgress = false
    return res.status(500).json({ ok: false, error: 'Could not record the ZIP deployment state.' })
  }
  req.keepDeployLock = true
  res.status(202).json({ ok: true, status: 'preparing', updateId, message: 'Aharane is preparing the new release. Keep this page open to follow its status.' })
  setImmediate(() => { void prepareAndActivateUpdate(updateId) })
})

app.use('/studio/api',(_req,res)=>res.status(404).end())
app.use('/studio',(req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');next()},express.static(fileURLToPath(new URL('../control-centre/',import.meta.url)),{index:'index.html',fallthrough:true,etag:false,maxAge:0}))
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

server.on('upgrade', async (req, transport, head) => {
  let pathname = ''
  try { pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname } catch {}
  if (pathname !== '/ws') {
    transport.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
    transport.destroy()
    return
  }
  try {
    const authorization = String(req.headers.authorization || '')
    const match = authorization.match(/^Bearer\s+(.+)$/i)
    const bearer = match?.[1] || ''
    const cookie = requestCookie(req, ADMIN_SESSION_COOKIE)
    const auth = await readJsonFile(ADMIN_AUTH_FILE)
    // Match HTTP authentication: the permanent install token is invalid
    // after password setup; signed sessions remain valid until password rotation.
    const ok = (!auth?.passwordHash && tokenMatches(bearer)) || adminSessionMatches(bearer, auth) ||
      (sameOriginRequest(req) && adminSessionMatches(cookie, auth))
    if (!ok) {
      transport.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      transport.destroy()
      return
    }
    studioWss.handleUpgrade(req, transport, head, client => studioWss.emit('connection', client, req))
  } catch {
    transport.write('HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\n')
    transport.destroy()
  }
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

// Start both sessions independently. A problem with one account must not
// prevent the other account from connecting or accepting commands.
await Promise.all(['private', 'public'].map(async accountId => {
  try {
    await accountRuntime.start(accountId, { deferUnregistered: true })
  } catch (error) {
    logger.error({ event: 'whatsapp.initial-start-failed', accountId, error: String(error?.message || error) })
  }
}))

const schedulerRunner = createSchedulerRunner({
  store: schedulerStore,
  execute: executeScheduledWorkflow,
  logger,
  onResult: ({ schedule, ok, summary, error }) => {
    publishStudioEvent(ok ? 'scheduler.completed' : 'scheduler.failed', {
      scheduleId: schedule.id,
      workflowId: schedule.workflowId,
      account: schedule.account,
      summary: summary || '',
      error: error || '',
    })
  },
})


async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  for (const client of studioClients) client.close(1001, 'Aharane is shutting down')
  await schedulerRunner.close()
  await accountRuntime.shutdown()
  await new Promise(resolveClose => server.close(() => resolveClose()))
  logger.info({ event: 'process.stopped', signal })
}

process.once('SIGTERM', () => { void shutdown('SIGTERM') })
process.once('SIGINT', () => { void shutdown('SIGINT') })

if (!ownerConfig.privateOwnerNumber) {
  logger.warn({ event: 'security.private-owner-unconfigured', reason: 'Private self-chat commands remain disabled until the Private Owner number is configured' })
}
if (!ownerConfig.publicOwnerNumber) {
  logger.warn({ event: 'security.public-owner-unconfigured', reason: 'Public owner-only commands remain disabled until the Public Owner number is configured' })
}
