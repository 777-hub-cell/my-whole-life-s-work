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
import makeWASocket, { Browsers, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys'
import {
  isAllowedInbound,
  isPrivateVisibleChatJid,
  isSafeMessageUpsert,
  normalizePhone,
  parseAllowedSenders,
  senderNumberFromJid,
} from './policy.js'
import { createAccountRuntime } from './account-runtime.js'
import { loadCommandRegistry, dispatchCommand, parseCommand } from './command-registry.js'
import { isPrivateSelfChat, isPrivateSelfCommand, isPublicOwnerSender } from './authorization.js'
import { loadOwnerConfig, normalizeOwnerConfig, saveOwnerConfig } from './owner-config.js'
import { compareUpdateContents, extractUpdateArchive, inspectUpdateArchive, MAX_ARCHIVE_BYTES, normalizeUpdatePath } from './update-manager.js'
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import { createChatStore } from './chat-store.js'
import { loadStudioSettings, saveStudioSettings, normalizeStudioSettings, normalizeChatVisibility, isChatVisible, envView } from './studio-settings.js'
import { createActivityStore } from './activity-store.js'

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
const LEGACY_PUBLIC_ALLOWED_SENDERS = String(process.env.AHARANE_ALLOWED_PUBLIC_SENDERS || process.env.AHARANE_ALLOWED_SENDERS || '')
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
  allowedPublicSenders: LEGACY_PUBLIC_ALLOWED_SENDERS,
})
const chatStore = createChatStore({ dataDir: DATA_DIR, logger })
const activityStore = createActivityStore({ dataDir: DATA_DIR })
await Promise.all([chatStore.init(), activityStore.init()])
const SETTINGS_FILE = join(DATA_DIR, 'studio-settings.json')
let studioSettings = await loadStudioSettings(SETTINGS_FILE)
let accountRuntime = null
let publicCommandRegistry = null
let privateCommandRegistry = null
let updateInProgress = false
let shuttingDown = false
let sourceMutationTail = Promise.resolve()

const seenMessageIds = new Map()
const commandTimes = new Map()
const pairAttempts = new Map()
const studioClients = new Set()
let studioEventSequence = 0

function publicAllowedSenders() {
  return parseAllowedSenders([
    ...(ownerConfig?.allowedPublicSenders || []),
    ownerConfig?.publicOwnerNumber || '',
  ].filter(Boolean).join(','))
}

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
    allowlistedSenderCount: publicAllowedSenders().size,
    groupsEnabled: false,
    ownerIdentities: {
      privateOwnerConfigured: Boolean(ownerConfig?.privateOwnerNumber),
      publicOwnerConfigured: Boolean(ownerConfig?.publicOwnerNumber),
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
    const adminBearer = tokenMatches(bearer)
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
  try {
    await mkdir(DEPLOY_LOCK_DIR, { mode: 0o700 })
  } catch (error) {
    if (error?.code === 'EEXIST') return false
    throw error
  }
  try {
    await writeJsonAtomic(join(DEPLOY_LOCK_DIR, 'owner.json'), {
      source: String(source || 'source-mutation'),
      pid: process.pid,
      startedAt: new Date().toISOString(),
    })
    return true
  } catch (error) {
    await rm(DEPLOY_LOCK_DIR, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

async function setDeployLockSource(source) {
  await writeJsonAtomic(join(DEPLOY_LOCK_DIR, 'owner.json'), {
    source: String(source || 'deployment'),
    pid: process.pid,
    startedAt: new Date().toISOString(),
  })
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

async function handleMessages(sessionId, currentSocket, event) {
  if (!isSafeMessageUpsert(event)) return
  for (const message of event.messages) {
    if (!message?.message || !message.key?.id) continue
    if (markMessageSeen(sessionId + ':' + message.key.id)) continue

    const remoteJid = String(message.key?.remoteJid || '')
    const text = textFromMessage(message)
    let registry
    let isPublicOwner = false
    let privateControl = false

    if (sessionId === 'private') {
      // Record new live messages from supported direct, group and LID chats.
      // Inbox visibility is a separate user setting; command execution is
      // still restricted to the exact verified Private Owner self-chat.
      if (!isPrivateVisibleChatJid(remoteJid)) continue
      const privateSelfChat = isPrivateSelfChat({
        sessionId, remoteJid, ownJid: currentSocket.user?.id || '',
        privateOwnerNumber: ownerConfig.privateOwnerNumber,
      })
      await chatStore.recordMessage({ sessionId, message, socket: currentSocket })
      if (message.key.fromMe !== true && studioSettings.private.autoRead) await currentSocket.readMessages([message.key]).catch(() => {})
      if (message.key.fromMe !== true || !privateSelfChat) continue
      privateControl = isPrivateSelfCommand({
        sessionId,
        message,
        remoteJid,
        ownJid: currentSocket.user?.id || '',
        privateOwnerNumber: ownerConfig.privateOwnerNumber,
        text,
        privateRegistry: privateCommandRegistry,
        prefix: PRIVATE_COMMAND_PREFIX,
      })
      if (!privateControl) continue
      registry = privateCommandRegistry
    } else if (sessionId === 'public') {
      // Capture supported new direct/group/LID conversations for the inbox.
      // The sender allowlist remains a separate gate for bot command handling.
      if (message.key.fromMe === true || !isPrivateVisibleChatJid(remoteJid)) continue
      const allowedToUseCommands = isAllowedInbound({
        remoteJid,
        fromMe: false,
        allowedSenders: publicAllowedSenders(),
      })
      const firstConversationMessage = allowedToUseCommands && !await chatStore.hasConversation(sessionId, remoteJid)
      await chatStore.recordMessage({ sessionId, message, socket: currentSocket })
      if (studioSettings.public.autoRead) await currentSocket.readMessages([message.key]).catch(() => {})
      if (!allowedToUseCommands) continue
      if (firstConversationMessage && studioSettings.public.welcomeMessage) {
        const welcome = await currentSocket.sendMessage(remoteJid, { text: studioSettings.public.welcomeMessage })
        await chatStore.recordMessage({ sessionId, message: welcome, socket: currentSocket })
      }
      registry = publicCommandRegistry
      isPublicOwner = isPublicOwnerSender({
        sessionId,
        remoteJid,
        publicOwnerNumber: ownerConfig.publicOwnerNumber,
      })
    } else {
      continue
    }

    if (!text) continue
    const prefix = sessionId === 'private' ? PRIVATE_COMMAND_PREFIX : PUBLIC_COMMAND_PREFIX
    const parsedCommand = parseCommand(text, prefix)
    if (!parsedCommand || !registry?.commands?.has(parsedCommand.name)) continue
    if (!allowCommand(sessionId + ':' + (sessionId === 'private'
      ? ownerConfig.privateOwnerNumber
      : senderNumberFromJid(remoteJid)))) continue

    const command = parsedCommand.name.slice(0, 40)
    try {
      const handled = await dispatchCommand({
        registry,
        rawText: text,
        prefix: sessionId === 'private' ? PRIVATE_COMMAND_PREFIX : PUBLIC_COMMAND_PREFIX,
        context: {
          sessionId,
          privateControl,
          isPrivateOwner: privateControl,
          isPublicOwner,
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
  makeSocket: ({ auth }) => makeWASocket({
    auth,
    logger,
    browser: Browsers.macOS('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    generateHighQualityLinkPreview: false,
  }),
  loggedOutCode: DisconnectReason.loggedOut,
  onMessages: ({ sessionId, socket: currentSocket, event }) =>
    handleMessages(sessionId, currentSocket, event),
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
// Nginx is the only supported public entry point and proxies from loopback.
// Trust only that proxy so req.ip uses the real forwarded client address.
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
      privateOwnerNumber: req.body?.privateOwnerNumber,
      publicOwnerNumber: req.body?.publicOwnerNumber,
      publicBotNumber: req.body?.publicBotNumber,
      allowedPublicSenders: req.body?.allowedPublicSenders,
    })
    // A configured private owner must match the WhatsApp identity paired to
    // the private session. Never silently change either role during pairing.
    const privateSession = accountRuntime.get('private')
    const publicSession = accountRuntime.get('public')
    const privateOwnNumber = senderNumberFromJid(
      privateSession.socket?.user?.id || privateSession.auth?.state?.creds?.me?.id || ''
    )
    const publicBotNumber = senderNumberFromJid(
      publicSession.socket?.user?.id || publicSession.auth?.state?.creds?.me?.id || ''
    )
    if (next.privateOwnerNumber && privateOwnNumber && next.privateOwnerNumber !== privateOwnNumber) {
      return res.status(409).json({ ok: false, error: 'Private Owner must match the phone number paired to the private WhatsApp session.' })
    }
    if (next.publicOwnerNumber && publicBotNumber && next.publicOwnerNumber === publicBotNumber) {
      return res.status(409).json({ ok: false, error: 'Public Owner must be the sender number you use to message the public bot, not the public bot account itself.' })
    }
    if (next.publicBotNumber && publicBotNumber && next.publicBotNumber !== publicBotNumber) {
      return res.status(409).json({ ok: false, error: 'Public bot WhatsApp number must match the number already paired to the Public session.' })
    }
    ownerConfig = await saveOwnerConfig(OWNER_CONFIG_FILE, next)
    publishStudioEvent('owners.updated', {
      privateOwnerConfigured: Boolean(ownerConfig.privateOwnerNumber),
      publicOwnerConfigured: Boolean(ownerConfig.publicOwnerNumber),
    })
    res.json({ ok: true, owners: ownerConfig })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || 'Could not save owner settings.') })
  }
})

app.post('/api/accounts/:accountId/pair-code', requireAdmin, async (req, res) => {
  try {
    const accountId = String(req.params.accountId || '').toLowerCase()
    if (!['private', 'public'].includes(accountId)) return res.status(404).json({ ok: false, error: 'Unknown WhatsApp account.' })
    const session = accountRuntime.get(accountId)
    if (session.registered || session.state === 'connected') {
      return res.status(409).json({ ok: false, error: 'This WhatsApp account is already paired. Reconnect it instead of requesting another pairing code.' })
    }
    if (session.state === 'needs-pairing') {
      return res.status(409).json({ ok: false, error: 'WhatsApp rejected the saved session. Choose Re-pair first; Aharane will back it up before creating a new link.' })
    }
    const ip = String(req.ip || 'local') + ':' + accountId
    if (!allowPairAttempt(ip)) return res.status(429).json({ ok: false, error: 'Pairing rate limit reached for this account; try again later.' })
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
    const session = accountRuntime.get(accountId)
    if (session.registered || session.state === 'connected') {
      return res.status(409).json({ ok: false, error: 'This WhatsApp account is already paired. Reconnect it instead of requesting a QR code.' })
    }
    if (session.state === 'needs-pairing') {
      return res.status(409).json({ ok: false, error: 'Choose Re-pair before requesting a new QR code.' })
    }
    res.json({ ok: true, accountId, qr: accountRuntime.pairingQr(accountId), state: session.state })
  } catch (error) {
    res.status(503).json({ ok: false, error: String(error?.message || 'Could not read the WhatsApp pairing QR.') })
  }
})
app.post('/api/accounts/:accountId/qr', requireAdmin, async (req, res) => {
  try {
    const accountId = String(req.params.accountId || '').toLowerCase()
    if (!['private', 'public'].includes(accountId)) return res.status(404).json({ ok: false, error: 'Unknown WhatsApp account.' })
    const session = accountRuntime.get(accountId)
    if (session.registered || session.state === 'connected') {
      return res.status(409).json({ ok: false, error: 'This WhatsApp account is already paired. Reconnect it instead of requesting a QR code.' })
    }
    if (session.state === 'needs-pairing') {
      return res.status(409).json({ ok: false, error: 'Choose Re-pair before requesting a new QR code.' })
    }
    await accountRuntime.start(accountId)
    res.json({ ok: true, accountId, qr: accountRuntime.pairingQr(accountId), state: accountRuntime.get(accountId).state })
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
    const ip = String(req.ip || 'local') + ':public'
    if (!allowPairAttempt(ip)) return res.status(429).json({ ok: false, error: 'Pairing rate limit reached for the public account; try again later.' })
    const phoneNumber = normalizePhone(req.body?.phoneNumber)
    if (!phoneNumber) return res.status(400).json({ ok: false, error: 'Enter a valid international phone number using 7 to 15 digits.' })
    if (!ownerConfig.privateOwnerNumber || !ownerConfig.publicOwnerNumber || !ownerConfig.publicBotNumber) {
      return res.status(409).json({ ok: false, error: 'Save the Private Owner, Public Owner and Public bot numbers before pairing.' })
    }
    if (phoneNumber !== ownerConfig.publicBotNumber) {
      return res.status(409).json({ ok: false, error: 'The supplied number does not match the saved Public bot WhatsApp number. Update Configuration first.' })
    }
    if ([ownerConfig.privateOwnerNumber, ownerConfig.publicOwnerNumber].includes(phoneNumber)) {
      return res.status(400).json({ ok: false, error: 'The public bot must use its own WhatsApp number, separate from both owner identities.' })
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
  res.json({ ok: true, env: envView(studioSettings), owners: {
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
    res.json({ ok: true, env: envView(studioSettings), settings: studioSettings })
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || 'Could not save the managed environment settings.') })
  }
})
app.get('/api/settings', requireAdmin, (_req, res) => res.json({ ok: true, settings: studioSettings }))
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
    for (const key of ['pinned', 'muted']) {
      if (typeof req.body?.[key] !== 'boolean') continue
      preferences[key] = (preferences[key] || []).filter(value => value !== jid)
      if (req.body[key]) preferences[key].push(jid)
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
app.get('/api/chats/:accountId/:jid/messages', requireAdmin, async (req, res) => {
  try {
    const accountId = chatAccount(req.params.accountId)
    const jid = decodeURIComponent(String(req.params.jid || ''))
    if ((!authorizedChat(accountId, jid) || !isChatVisible(studioSettings[accountId], jid)) || !await chatStore.hasConversation(accountId, jid)) return res.status(404).json({ ok: false, error: 'Conversation not found.' })
    const messages = await chatStore.getMessages(accountId, jid, { limit: req.query.limit, before: req.query.before })
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
    if (original.fromMe) {
      const session = accountRuntime.get(accountId), socket = session.socket
      if (!socket || session.state !== 'connected') return res.status(503).json({ ok: false, error: 'This WhatsApp account is not connected.' })
      await socket.sendMessage(jid, { delete: original.key })
    }
    await chatStore.deleteMessage(accountId, jid, original.id)
    publishStudioEvent('whatsapp.message.deleted', { accountId, jid, messageId: original.id })
    res.json({ ok: true })
  } catch (error) {
    res.status(error?.status || 400).json({ ok: false, error: String(error?.message || 'Could not delete this message.') })
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
    const sent = await socket.sendMessage(jid, { text }, quoted?.sourceMessage ? { quoted: quoted.sourceMessage } : undefined)
    await chatStore.recordMessage({ sessionId: accountId, message: sent, socket })
    publishStudioEvent('whatsapp.message.sent', { accountId, jid, type: 'text' })
    res.json({ ok: true, message: sent?.key?.id || '' })
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
    let content
    if (mime.startsWith('image/') && mime !== 'image/webp') content = { image: req.body, caption }
    else if (mime.startsWith('video/')) content = { video: req.body, caption }
    else if (mime.startsWith('audio/')) content = { audio: req.body, mimetype: mime, ptt: req.get('x-voice-note') === 'true' }
    else if (mime === 'image/webp') content = { sticker: req.body }
    else content = { document: req.body, mimetype: mime, fileName: filename, caption }
    const sent = await socket.sendMessage(jid, content)
    await chatStore.recordOutgoingMedia({ sessionId: accountId, jid, buffer: req.body, mimeType: mime, fileName: filename, sendResult: sent, text: caption, ptt: req.get('x-voice-note') === 'true', duration: req.get('x-duration-seconds') })
    publishStudioEvent('whatsapp.message.sent', { accountId, jid, type: 'media' })
    res.json({ ok: true, message: sent?.key?.id || '' })
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
    if (!SOURCE_EXTENSIONS.has(extname(target.path).toLowerCase()) && !SOURCE_ROOT_FILES.has(target.parts[0])) {
      return res.status(403).json({ ok: false, error: 'This file type is not available for download.' })
    }
    const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024
    if (target.info.size > MAX_DOWNLOAD_BYTES) return res.status(413).json({ ok: false, error: 'This source file exceeds the 25 MB browser download limit.' })
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
      // First hide every selected item under a unique tombstone. No journal
      // entries are committed until the entire selection has been staged.
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
      try {
        await rm(item.tombstone, { recursive: item.target.info.isDirectory(), force: true })
      } catch (error) {
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
  // The Files mutation middleware owns the cross-process deployment lock.
  if (!req.deployLockAcquired) return res.status(409).json({ ok: false, error: 'Could not acquire the Aharane deployment lock. Retry when no other operation is running.' })
  await setDeployLockSource('manual-files')
  updateInProgress = true
  try {
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
  await setDeployLockSource('zip-update')
  updateInProgress = true
  try {
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
    const ok = tokenMatches(bearer) || adminSessionMatches(bearer, auth) ||
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

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  for (const client of studioClients) client.close(1001, 'Aharane is shutting down')
  await accountRuntime.shutdown()
  await new Promise(resolveClose => server.close(() => resolveClose()))
  logger.info({ event: 'process.stopped', signal })
}

process.once('SIGTERM', () => { void shutdown('SIGTERM') })
process.once('SIGINT', () => { void shutdown('SIGINT') })

if (publicAllowedSenders().size === 0) {
  logger.warn({ event: 'security.inbound-deny-all', reason: 'No public WhatsApp sender allowlist is configured' })
}
if (!ownerConfig.privateOwnerNumber) {
  logger.warn({ event: 'security.private-owner-unconfigured', reason: 'Private self-chat commands remain disabled until the Private Owner number is configured' })
}
if (!ownerConfig.publicOwnerNumber) {
  logger.warn({ event: 'security.public-owner-unconfigured', reason: 'Public owner-only commands remain disabled until the Public Owner number is configured' })
}
