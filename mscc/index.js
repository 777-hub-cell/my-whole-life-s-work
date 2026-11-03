import { appendFile, cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestWaWebVersion,
  WAMessageStubType,
  makeCacheableSignalKeyStore
} from '@itsliaaa/baileys'
import pino from 'pino'
import QRCode from 'qrcode'
import { startWebPanel } from './web-panel.js'
import { NightPlay, createNightPlayHandler } from './night-play.js'
import { createNightPlayAvatarSync } from './night-play-avatar.js'
import { recordPendingChannelLink, pendingChannelLink } from './night-channel-links.js'
import { megaStorageDashboard, megaAvailableMounts, megaVerifyFolder } from './mega-storage.js'
import { dispatchNamespacedCommand, loadCommands } from './command-registry.js'
import { AccountRegistry, legacyAccountRecords } from './account-registry.js'
import { selectCcDestination } from './cc-routing.js'
import { isPrivateOwnerDm } from './control-context.js'
import { canStartScheduledReconnect, classifyDisconnect, disconnectOrigin, disconnectProtocolDetail, jidPhoneNumber, reconnectDelay, serializeSessionOperation, sessionStatus } from './session-policy.js'
import { createAccountSocketOptions } from './account-socket-options.js'
import { assertSeparateAuthDirectories, useDurableMultiFileAuthState } from './account-auth-state.js'
import { sessionEventsFromJsonl, sessionSnapshot } from './session-diagnostics.js'
import { openSharedStorage } from './shared-storage.js'
import { activityReport, activitySenderKey } from './group-activity.js'
import { chooseGroupExecutor, canExecuteDirect } from './bot-routing.js'
import { SourceRegistry } from './source-registry.js'
import { createSmartAI } from './smart-ai.js'
import { isChannelJid, channelAiAllowed, channelAiSetting, setChannelAiSetting } from './channel-ai-policy.js'
import { createReactionSounds, parseReactionSoundDirective } from './reaction-sounds.js'
import { createAniListResolver } from './anilist-resolver.js'
import { createTmdbResolver } from './tmdb-resolver.js'
import { createAdaptationResolver } from './adaptation-resolver.js'
import { createReleaseWatcher } from './release-watcher.js'
import {
  addScheduledTask,
  completeScheduledTask,
  dueScheduledTasks,
  formatDue,
  listScheduledTasks,
  parseDuration,
  removeScheduledTask,
} from './scheduled-tasks.js'
import {
  dueGroupSchedules,
  finishGroupSchedule,
  isGroupScheduleHeld,
  setGroupScheduleHold,
} from './group-schedules.js'
import { mangaDexLatest } from './utility-services.js'
import {
  addAfkEvent,
  clearAfk,
  getAfk,
  messageMentionJids,
  quotedParticipantJid,
  reconcileVerifiedAfk,
  setAfk,
} from './afk-state.js'
import {
  addWarning,
  clearWarnings,
  enforceGroupMessage,
  reconcileVerifiedWarnings,
  groupPolicy,
  groupMessageNeedsModeration,
  renderGroupTemplate,
  setGroupPolicy,
  setUserMentionMute,
  warningState,
} from './group-policy.js'
import { looksLikeNumberSelection } from './number-selection.js'
import { musicFollowupReply } from './music-chat-context.js'
import { createInboundMessageGuard, matchesDisplayedChoice } from './inbound-message-guard.js'
import { createCommandTiming } from './command-performance.js'
import { createMessageScheduler } from './command-scheduler.js'
import { createSquidGame } from './squid-game.js'
import { resolveIdentityWithDeadline } from './identity-resolution.js'
import {
  canonicalUserKey, hasConflictingLidMapping, isOpaqueLid, readAuthLidPhone,
  recordVerifiedLidPhone, storedLidPhone, verifiedIdentityKeys,
} from './user-identity.js'
import { userForStoredGame } from './utils/game-session.js'
import { chessRecordAcceptsInput } from './utils/chess-game.js'
import { ticTacToeRecordAcceptsInput } from './utils/tictactoe-game.js'
import { checkersRecordAcceptsInput } from './utils/checkers-game.js'
import { ludoRecordAcceptsInput } from './utils/ludo-game.js'
import { partyInputDestination } from './utils/party-games.js'
import { wordChainInputDestination } from './utils/word-chain.js'
import { createJosiahAssistant } from './josiah-assistant.js'
import { assistantInputPolicy } from './assistant-media-policy.js'
import { createAssistantTyping } from './assistant-typing.js'
import { createNamiAssistant } from './nami-assistant.js'
import { createMiMiAssistant } from './mimi-assistant.js'
import { chooseProfileAsset, groupIntro, presentationFor, profileHeader, readProfileAsset } from './profile-presentation.js'
import {
  digits,
  normalizeJid,
  jidUser,
  selfJid,
  isGroupJid,
  isTrackableJid,
  maskedPhone,
} from './utils/whatsapp/jid.js'
import {
  commandText,
  contextInfo,
  quotedMessage,
  findViewOnceMedia,
  unlockViewOnce,
  encodeMessage,
  decodeMessage,
  normalizedContent,
  messageMedia,
} from './utils/whatsapp/messages.js'
import { createWhatsAppUi } from './utils/whatsapp/ui.js'
import { deleteQuotedGroupMessage } from './group-delete.js'
import { sendText, sendImageDataUrl, startProgress } from './utils/whatsapp/replies.js'
import { prepareCommandMediaPayload } from './utils/whatsapp/prepare-command-media-payload.js'
import { findGroupParticipant, groupMemberLabel, groupTargetJid, memberIdentityKey, participantIds, updateSucceeded, verifiedPhoneNumber } from './group-member-identity.js'

// Shared WhatsApp nativeFlow implementation lives in utils/whatsapp/native-flow.js.
// The max-row invariant is enforced there (legacy CI marker: remaining = 1000).

const PRIVATE_COMMANDS_URL = new URL('./private-commands/', import.meta.url)
const PUBLIC_COMMANDS_URL = new URL('./commands/', import.meta.url)
const SOURCES_URL = new URL('./sources/', import.meta.url)
let privateCommandRegistry = await loadCommands(PRIVATE_COMMANDS_URL)
let publicCommandRegistry = await loadCommands(PUBLIC_COMMANDS_URL, { allowMissing: true, capabilityFromDirectory: true })

const num = (name, fallback, min, max) => {
  const n = Number.parseInt(process.env[name] || '', 10)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

const LEGACY_ACCOUNT_A_NUMBER = digits(process.env.ACCOUNT_A_NUMBER || process.env.BOT_NUMBER)
const LEGACY_ACCOUNT_B_NUMBER = digits(process.env.ACCOUNT_B_NUMBER)
const OWNER_NUMBER = digits(process.env.OWNER_NUMBER || LEGACY_ACCOUNT_A_NUMBER)
const LEGACY_ACCOUNT_A_AUTH_DIR = process.env.ACCOUNT_A_AUTH_DIR || '/var/lib/mscc/auth'
const LEGACY_ACCOUNT_B_AUTH_DIR = process.env.ACCOUNT_B_AUTH_DIR || '/var/lib/mscc/auth-b'
const INDEX_FILE = process.env.MESSAGE_INDEX_FILE || '/var/lib/mscc/data/mscc-message-index.json'
const SETTINGS_FILE = process.env.SETTINGS_FILE || '/var/lib/mscc/data/mscc-settings.json'
const SHARED_DB_FILE = process.env.MSCC_SHARED_DB_FILE || join(dirname(SETTINGS_FILE), 'mscc-shared.sqlite')
const ACCOUNT_REGISTRY_FILE = process.env.ACCOUNT_REGISTRY_FILE || join(dirname(SETTINGS_FILE), 'mscc-accounts.json')
const ACCOUNT_AUTH_ROOT = process.env.ACCOUNT_AUTH_ROOT || '/var/lib/mscc/accounts'
const CORTEX_SETTINGS_SCHEMA_FILE = process.env.CORTEX_SETTINGS_SCHEMA_FILE || join(dirname(SETTINGS_FILE), 'cortex-settings-schema.json')
const CORTEX_RUNTIME_REGISTRY_FILE = process.env.CORTEX_RUNTIME_REGISTRY_FILE || join(dirname(SETTINGS_FILE), 'cortex-runtime-registry.json')
const ACTIVITY_FILE = process.env.MSCC_ACTIVITY_FILE || join(dirname(SETTINGS_FILE), 'mscc-activity.jsonl')
const AUTH_BACKUP_DIR = process.env.AUTH_BACKUP_DIR || '/var/backups/mscc'
const TTL_MS = num('MESSAGE_TTL_HOURS', 24, 1, 168) * 3600000
const MAX_CACHE = num('MAX_MESSAGE_CACHE', 5000, 100, 20000)
const MAX_ACCOUNTS = num('MAX_ACCOUNTS', 4, 1, 50)
const GROUP_META_TTL_MS = num('GROUP_META_TTL_SECONDS', 60, 10, 600) * 1000
const GROUP_META_CACHE_MAX = num('GROUP_META_CACHE_MAX', 128, 16, 1024)
const AI_HISTORY_DAYS = num('AI_HISTORY_DAYS', 30, 1, 365)
const AI_HISTORY_MAX_PER_CHAT = num('AI_HISTORY_MAX_PER_CHAT', 25000, 1000, 100000)
const RELEASE_WATCH_INTERVAL_MS = num('RELEASE_WATCH_INTERVAL_MINUTES', 5, 1, 1440) * 60000
const WEB_PORT = process.env.SERVER_PORT
  ? num('SERVER_PORT', 8787, 1, 65535)
  : num('MSCC_WEB_PORT', num('PORT', 8787, 1, 65535), 1, 65535)
const WEB_HOST = process.env.MSCC_WEB_HOST || '127.0.0.1'
const WEB_PASSWORD = process.env.WEB_PASSWORD || ''
const WEB_SESSION_SECRET = process.env.WEB_SESSION_SECRET || ''
const LOCAL_CONTROL_PORT = 8788
const logger = pino({ level: process.env.LOG_LEVEL || 'silent' })
const startedAt = Date.now()
const APP_VERSION = '2.3.1'
const smartAI = createSmartAI()
const reactionSounds = createReactionSounds({
  // Shared group settings load lazily so they survive service restarts and do not
  // depend on editing production environment variables or knowing group JIDs.
  groupState: jid => sharedStorage?.sharedGet('reaction-sound-groups', jid) || null,
})
const aniListResolver = createAniListResolver()
const tmdbResolver = createTmdbResolver()
const adaptationResolver = createAdaptationResolver()

const controlNumbers = new Set(
  String(process.env.CONTROL_NUMBERS || OWNER_NUMBER)
    .split(',')
    .map(digits)
    .filter(v => /^\d{7,15}$/.test(v))
)

const accountRegistry = new AccountRegistry({
  file: ACCOUNT_REGISTRY_FILE,
  authRoot: ACCOUNT_AUTH_ROOT,
  maxAccounts: MAX_ACCOUNTS,
  legacy: legacyAccountRecords({
    accountA: LEGACY_ACCOUNT_A_NUMBER,
    accountB: LEGACY_ACCOUNT_B_NUMBER,
    authA: LEGACY_ACCOUNT_A_AUTH_DIR,
    authB: LEGACY_ACCOUNT_B_AUTH_DIR,
  }),
})

const accounts = new Map()
const squidGame = createSquidGame({
  storage:() => sharedStorage,
  accountFor:id => accounts.get(id),
  resolvePhoneJid:(account, id) => resolvePhoneJid(account, id),
  observedNameFor:(group, id) => sharedStorage?.latestConversationSpeaker(group, id) || '',
})
let squidGameTimer = null
const makeAccount = record => ({
  id: record.id,
  number: record.phoneNumber,
  authDir: record.authDir,
  displayName: record.displayName || '',
  role: record.role || 'linked',
  createdAt: record.createdAt || Date.now(),
  enabled: Boolean(record.phoneNumber),
  paused: record.paused === true,
  sock: null, connected: false, registered: false, invalid: false,
  generation: 0, reconnectTimer: null, reconnectAttempts: 0, ambiguous500Attempts: 0, nextReconnectAt: 0,
  lastConnectedAt: 0, lastDisconnectedAt: 0, lastDisconnectCode: null, disconnectReason: '',
  credSave: Promise.resolve(), authFlush: null, authKeys: null,
  pairingMode: '', pairingCode: '', pairingQr: '', pairingError: '',
  lastQr: '', lastCodeAt: 0, pairingRequested: false,
  op: Promise.resolve()
})

async function loadAccounts() {
  const records = await accountRegistry.load()
  // Resolve symlink aliases before opening sockets: distinct names must never
  // resolve to the same Signal key store, even in another account directory.
  await assertSeparateAuthDirectories(records)
  accounts.clear()
  for (const record of records) accounts.set(record.id, makeAccount(record))
  if (!records.length) {
    console.log('No WhatsApp accounts configured yet; waiting for Cortex pairing.')
    return
  }
  if (!controlNumbers.size) {
    const owner = records.find(row => row.role === 'owner') || records[0]
    if (owner?.phoneNumber) controlNumbers.add(owner.phoneNumber)
  }
}

function resolveAccountId(value) {
  const registryId = accountRegistry.resolveId(value)
  if (registryId && accounts.has(registryId)) return registryId
  const raw = String(value || '').trim()
  if (accounts.has(raw)) return raw
  const lower = raw.toLowerCase()
  for (const id of accounts.keys()) if (id.toLowerCase() === lower) return id
  return ''
}

async function createAccount(input = {}) {
  const record = await accountRegistry.create(input)
  const account = makeAccount(record)
  accounts.set(account.id, account)
  if (account.id === 'A') sharedStorage?.assignProfile('A', 'control')
  destination = destinationIdFor()
  if (record.role === 'owner' && record.phoneNumber) controlNumbers.add(record.phoneNumber)
  await recordActivity('account.created', {
    account: account.id,
    displayName: account.displayName,
    numberMasked: masked(account.number),
  })
  return {
    ok: true,
    account: {
      id: account.id,
      displayName: account.displayName,
      role: account.role,
      profile: sharedStorage?.profileForAccount(account.id)?.id || 'unassigned',
      enabled: account.enabled,
      connected: false,
      status: statusOf(account),
      numberMasked: masked(account.number),
      indexCount: 0,
      indexLimit: MAX_CACHE,
      pairingMode: '',
      pairingCode: '',
      pairingQr: '',
      pairingError: '',
    },
  }
}

async function renameAccount(id, displayName) {
  const resolved = resolveAccountId(id)
  if (!resolved) throw new Error(`Unknown account: ${id}`)
  const record = await accountRegistry.rename(resolved, displayName)
  const account = accounts.get(resolved)
  if (account) account.displayName = record.displayName
  await recordActivity('account.renamed', {
    account: resolved,
    displayName: record.displayName,
  })
  return {
    ok: true,
    account: resolved,
    displayName: record.displayName,
  }
}

async function assignAccountProfile(id, profileId) {
  const resolved = resolveAccountId(id)
  if (!resolved) throw new Error(`Unknown account: ${id}`)
  if (!sharedStorage) throw new Error('Bot profile storage is not available')
  const requested = String(profileId || '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(requested)) {
    throw new Error('Invalid bot profile ID')
  }
  // Only the permanent main control account can hold the control profile.
  if (resolved === 'A' && requested !== 'control') {
    throw new Error('Account A must retain the control profile')
  }
  if (resolved !== 'A' && requested === 'control') {
    throw new Error('Only Account A can use the control profile')
  }
  if (!sharedStorage.getProfile(requested)) throw new Error(`Unknown bot profile: ${requested}`)
  const previous = sharedStorage.profileForAccount(resolved)
  if (previous.id === requested) {
    return { ok: true, account: resolved, profile: previous.id, displayName: previous.displayName, unchanged: true }
  }
  const next = sharedStorage.assignProfile(resolved, requested)
  // A sticky group executor chosen for an earlier profile is no longer valid.
  sharedStorage.clearGroupRoutes()
  await recordActivity('account.profile-changed', {
    account: resolved,
    previousProfile: previous.id,
    profile: next.id,
  })
  return { ok: true, account: resolved, profile: next.id, displayName: next.displayName }
}

async function recordActivity(action, detail = {}) {
  try {
    await mkdir(dirname(ACTIVITY_FILE), { recursive: true })
    const row = JSON.stringify({
      id: randomUUID(),
      at: new Date().toISOString(),
      action,
      detail,
    })
    await appendFile(ACTIVITY_FILE, row + '\n', 'utf8')
    try {
      const info = await stat(ACTIVITY_FILE)
      if (info.size > 2 * 1024 * 1024) {
        const text = await readFile(ACTIVITY_FILE, 'utf8')
        const lines = text.trim().split(/\r?\n/).filter(Boolean).slice(-2500)
        await writeFile(ACTIVITY_FILE, lines.join('\n') + '\n', 'utf8')
      }
    } catch {}
  } catch (error) {
    console.warn('Activity write failed:', error?.message || error)
  }
}

async function getAccountDiagnostics(value, limit = 40) {
  const resolved = resolveAccountId(value)
  const account = resolved ? accounts.get(resolved) : null
  if (!account) return null

  const snapshot = sessionSnapshot({
    ...account,
    profile: sharedStorage?.profileForAccount(account.id)?.id || 'unassigned',
    numberMasked: masked(account.number),
    status: statusOf(account),
  })
  let events = []
  try {
    // The bounded activity file contains a maximum of 2MB of recent entries.
    // Filter all available entries so quieter sessions remain visible.
    const text = await readFile(ACTIVITY_FILE, 'utf8')
    events = sessionEventsFromJsonl(text, account.id, limit)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  return { snapshot, events }
}

async function activity(limit = 100) {
  const safeLimit = Math.max(10, Math.min(500, Number(limit) || 100))
  try {
    const text = await readFile(ACTIVITY_FILE, 'utf8')
    return text.trim().split(/\r?\n/).filter(Boolean).slice(-safeLimit).reverse().flatMap(line => {
      try { return [JSON.parse(line)] } catch { return [] }
    })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

const DEFAULT_PUBLIC_PREFIX = '.'

function validatePublicPrefix(value) {
  const prefix = String(value ?? '').trim()
  if (!prefix) throw new Error('Public prefix cannot be empty')
  if (/\s/.test(prefix)) throw new Error('Public prefix cannot contain whitespace')
  if ([...prefix].length > 8) throw new Error('Public prefix must be 1 to 8 characters')
  return prefix
}

function commandSettingDefaults(registry = privateCommandRegistry) {
  const defaults = {}
  for (const command of registry.canonical) {
    const key = String(command.setting?.key || '').trim()
    if (!key) continue
    defaults[key] = command.setting?.default === true
  }
  return defaults
}

function mergeCommandSettings(raw, registry = privateCommandRegistry) {
  const defaults = commandSettingDefaults(registry)
  const merged = { ...defaults }
  for (const key of Object.keys(defaults)) {
    if (typeof raw?.[key] === 'boolean') merged[key] = raw[key]
  }
  try { merged.publicPrefix = validatePublicPrefix(raw?.publicPrefix || DEFAULT_PUBLIC_PREFIX) }
  catch { merged.publicPrefix = DEFAULT_PUBLIC_PREFIX }
  return merged
}

let settings = { ...commandSettingDefaults(), publicPrefix: DEFAULT_PUBLIC_PREFIX }
let destination = ''
let waVersion = null
let webServer = null
let sharedStorage = null
let nightPlay = null
let sourceRegistry = null
let josiahAssistant = null
let namiAssistant = null
let mimiAssistant = null
let releaseWatcher = null
let releaseWatchTimer = null
let releaseWatchRunning = false
let scheduledTaskTimer = null
let scheduledTaskRunning = false
let persistedMessageWrites = 0
let settingsMtimeMs = 0
let settingsPollTimer = null

const handledReply = new Map()
const handledDelete = new Map()
const handledAuto = new Map()
const groupNames = new Map()
const groupMetaCache = new Map()
const routeLocks = new Map()
const senderResolutionCache = new Map()
const SENDER_CACHE_TTL_MS = 10 * 60 * 1000
const LID_LOOKUP_TIMEOUT_MS = num('MSCC_LID_LOOKUP_TIMEOUT_MS', 2500, 200, 10000)
const SENDER_CACHE_MAX = 4096

const isGroup = isGroupJid
const trackable = isTrackableJid
const masked = maskedPhone
const destinationIdFor = () => selectCcDestination({ accounts })
const destinationAccount = () => accounts.get(destinationIdFor())

const futureproof = findViewOnceMedia
const unlocked = unlockViewOnce

function cacheKey(accountId, msg) {
  const k = msg?.key || {}
  return `${accountId}|${normalizeJid(k.remoteJid)}|${k.id || ''}|${normalizeJid(k.participant)}`
}

function countFor(id) {
  return sharedStorage?.countMessages(id) || 0
}

function trimTimedMap(map, max, ttlMs) {
  const now = Date.now()
  for (const [key, value] of map) {
    const at = typeof value === 'number' ? value : Number(value?.at || 0)
    if (at && now - at > ttlMs) map.delete(key)
  }
  while (map.size > max) map.delete(map.keys().next().value)
}

function prune() {
  for (const map of [handledReply, handledDelete, handledAuto]) {
    trimTimedMap(map, 512, 6 * 3600000)
  }
  trimTimedMap(groupNames, 128, 3600000)
  trimTimedMap(groupMetaCache, GROUP_META_CACHE_MAX, GROUP_META_TTL_MS)

  if (sharedStorage && persistedMessageWrites >= 100) {
    sharedStorage.pruneMessages([...accounts.keys()])
    sharedStorage.pruneConversationMessages({
      days:AI_HISTORY_DAYS,
      maxPerChat:AI_HISTORY_MAX_PER_CHAT,
    })
    persistedMessageWrites = 0
  }
}

function remember(account, msg) {
  if (!sharedStorage || !msg?.message || !msg?.key?.id || !trackable(msg.key.remoteJid)) return false
  const n = normalizedContent(msg.message)
  if (n?.protocolMessage || n?.reactionMessage) return false

  sharedStorage.putMessage({
    accountId: account.id,
    chatJid: normalizeJid(msg.key.remoteJid),
    messageId: msg.key.id,
    participantJid: normalizeJid(msg.key.participant),
    atMs: Date.now(),
    data: encodeMessage(msg),
  })
  persistedMessageWrites += 1
  prune()
  return true
}

function conversationMediaType(message) {
  const found = messageMedia(message)
  if (!found?.key) return ''
  return String(found.key).replace(/Message$/, '').replace(/^./, value => value.toLowerCase())
}

function rememberConversation(account, msg, authority = {}) {
  if (!sharedStorage || !msg?.message || !msg?.key?.id) return false
  const chat = normalizeJid(msg.key.remoteJid)
  if (!chat || !trackable(chat)) return false

  const normalized = normalizedContent(msg.message)
  if (normalized?.protocolMessage || normalized?.reactionMessage) return false

  const profile = sharedStorage.profileForAccount(account.id)
  const fromBot = msg.key.fromMe === true
  const speaker = fromBot
    ? (profile?.displayName || account.displayName || 'Bot')
    : (String(msg.pushName || '').trim() || authority.senderNumber || jidUser(msg.key.participant) || 'User')
  const timestamp = Number(msg.messageTimestamp)
  const atMs = Number.isFinite(timestamp) && timestamp > 1000000000
    ? timestamp * 1000
    : Date.now()

  sharedStorage.putConversationMessage({
    chatJid:chat,
    messageId:msg.key.id,
    accountId:account.id,
    participantJid:normalizeJid(msg.key.participant),
    senderKey:fromBot ? '' : activitySenderKey(authority.senderJid || msg.key.participant),
    speaker,
    fromBot,
    text:commandText(msg.message),
    mediaType:conversationMediaType(msg.message),
    atMs,
  })
  return true
}

function findCached(accountId, key, fallbackChat) {
  if (!sharedStorage || !key?.id) return null
  const data = sharedStorage.findMessage({
    accountId,
    messageId: key.id,
    chatJid: normalizeJid(key?.remoteJid || fallbackChat),
    participantJid: normalizeJid(key?.participant),
  })
  if (!data) return null
  try { return decodeMessage(data) } catch { return null }
}

function cachedMessageAcrossAccounts(preferredAccountId, messageId, chat) {
  const ids = [preferredAccountId, ...accounts.keys()].filter((value, index, list) =>
    value && list.indexOf(value) === index
  )
  for (const accountId of ids) {
    const cached = findCached(accountId, { id:messageId, remoteJid:chat }, chat)
    if (cached?.key?.id) return { accountId, message:cached }
  }
  return null
}

function suppressAntiDelete(chat, messageId) {
  for (const accountId of accounts.keys()) {
    handledDelete.set(`${accountId}|${chat}|${messageId}`, Date.now())
  }
}

async function deleteRepliedMessage(account, msg) {
  const chat = normalizeJid(msg?.key?.remoteJid)
  if (!chat || !isGroup(chat) || !account?.sock) {
    return { deleted:0, error:'This one is for groups.' }
  }

  const quote = contextInfo(msg.message)
  if (!quote?.stanzaId) {
    return { deleted:0, error:'🗑️ Reply to a message or use .delete <count>.' }
  }
  if (!(await isBotGroupAdminContext(account, msg))) {
    return { deleted:0, error:'Night needs to be a group admin to delete messages.' }
  }

  const cached = cachedMessageAcrossAccounts(account.id, quote.stanzaId, chat)
  const result = await deleteQuotedGroupMessage({
    chat,
    commandKey:msg.key,
    quote,
    cached,
    accountId:account.id,
    isOwnParticipant:jid => jidBelongsToAccount(account, jid),
    sendDelete:key => account.sock.sendMessage(chat, { delete:key }),
    suppressDelete:suppressAntiDelete,
  })
  if (result.cause) {
    console.warn('[delete] reply revoke:', result.cause?.message || result.cause)
  }
  return result
}

async function deleteRecentMessages(account, msg, requestedCount = 1) {
  const chat = normalizeJid(msg?.key?.remoteJid)
  if (!chat || !isGroup(chat) || !account?.sock || !sharedStorage) return { deleted:0, requested:0 }

  const safeCount = Math.max(1, Math.min(100, Number.parseInt(requestedCount, 10) || 1))
  if (!(await isBotGroupAdminContext(account, msg))) {
    return { deleted:0, requested:safeCount, botAdmin:false }
  }

  const rows = sharedStorage.listConversationMessages({
    chatJid:chat,
    limit:Math.min(25000, safeCount + 64),
    ascending:false,
  })

  const currentId = String(msg?.key?.id || '')
  const targets = []
  for (const row of rows) {
    if (!row?.messageId || row.messageId === currentId) continue
    const cached = cachedMessageAcrossAccounts(account.id, row.messageId, chat)
    if (!cached?.message?.key?.id) continue
    targets.push(cached)
    if (targets.length >= safeCount) break
  }

  let deleted = 0
  for (const target of targets) {
    const key = target.message.key
    const deleteKey = {
      remoteJid:chat,
      id:key.id,
      fromMe:target.accountId === account.id ? Boolean(key.fromMe) : false,
      ...(key.participant ? { participant:key.participant } : {}),
    }
    try {
      suppressAntiDelete(chat, key.id)
      await account.sock.sendMessage(chat, { delete:deleteKey })
      deleted += 1
    } catch {}
  }

  // The delete command is deliberately revoked last. Successful usage leaves
  // no confirmation message and no visible command behind.
  if (currentId) {
    try {
      suppressAntiDelete(chat, currentId)
      await account.sock.sendMessage(chat, { delete:msg.key })
    } catch {}
  }

  return { deleted, requested:safeCount, botAdmin:true }
}

async function migrateLegacyIndex() {
  if (!sharedStorage || sharedStorage.totalMessageCount() > 0) return
  try {
    const raw = JSON.parse(await readFile(INDEX_FILE, 'utf8'))
    let imported = 0
    for (const item of raw?.messages || []) {
      if (!item?.data || !item?.at || Date.now() - item.at > TTL_MS) continue
      try {
        const accountId = resolveAccountId(item.account) || resolveAccountId('A') || accounts.keys().next().value
        if (!accountId) continue
        const msg = decodeMessage(item.data)
        sharedStorage.putMessage({
          accountId,
          chatJid: normalizeJid(msg.key.remoteJid),
          messageId: msg.key.id,
          participantJid: normalizeJid(msg.key.participant),
          atMs: item.at,
          data: item.data,
        })
        imported += 1
      } catch {}
    }
    if (imported || Array.isArray(raw?.messages)) {
      try { await rm(INDEX_FILE + '.migrated', { force: true }) } catch {}
      try { await rename(INDEX_FILE, INDEX_FILE + '.migrated') } catch {}
      await recordActivity('storage.message-index-migrated', { imported })
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn('Legacy index migration failed:', error?.message || error)
  }
}

async function loadState() {
  await migrateLegacyIndex()
  sharedStorage?.pruneMessages([...accounts.keys()])
  await reloadSettings(true)
  prune()
}

async function writeState() {
  sharedStorage?.checkpoint()
}

async function reloadSettings(silent = false) {
  let raw = {}
  let exists = true
  try {
    raw = JSON.parse(await readFile(SETTINGS_FILE, 'utf8'))
  } catch (e) {
    if (e?.code !== 'ENOENT') {
      console.warn('Settings load failed:', e?.message || e)
      return
    }
    exists = false
  }

  settings = mergeCommandSettings(raw)
  destination = destinationIdFor()

  const storedDestination = raw?.cc?.fixedDestinationAccountId || raw?.cc?.defaultDestinationAccountId || raw?.destination || ''
  const hadOverrides = Object.keys(raw?.cc?.overrides || {}).length > 0
  if (!exists || storedDestination !== destination || hadOverrides || raw?.cc?.policy !== 'main-control-account') {
    await saveSettings()
  } else {
    settingsMtimeMs = (await stat(SETTINGS_FILE)).mtimeMs
  }

  if (!silent) {
    console.log('Night settings reloaded from disk')
    await recordActivity('configuration.reloaded', {})
  }
}

async function saveSettings() {
  await mkdir(dirname(SETTINGS_FILE), { recursive: true })
  destination = destinationIdFor()
  await writeFile(SETTINGS_FILE + '.tmp', JSON.stringify({
    version: 3,
    ...settings,
    destination,
    cc: {
      policy: 'main-control-account',
      fixedDestinationAccountId: destination,
    },
    savedAt: Date.now(),
  }, null, 2))
  await rename(SETTINGS_FILE + '.tmp', SETTINGS_FILE)
  settingsMtimeMs = (await stat(SETTINGS_FILE)).mtimeMs
}

async function writeCommandSettingsSchema() {
  const entries = privateCommandRegistry.canonical
    .filter(command => command.setting?.key)
    .map(command => ({
      key: command.setting.key,
      label: command.setting.label || command.name,
      description: command.setting.description || command.description || '',
      command: command.name,
      type: 'boolean',
      default: command.setting.default === true,
    }))
  await mkdir(dirname(CORTEX_SETTINGS_SCHEMA_FILE), { recursive: true })
  await writeFile(CORTEX_SETTINGS_SCHEMA_FILE + '.tmp', JSON.stringify({
    version: 1,
    service: 'mscc',
    entries,
  }, null, 2))
  await rename(CORTEX_SETTINGS_SCHEMA_FILE + '.tmp', CORTEX_SETTINGS_SCHEMA_FILE)
}

function runtimeCommand(command, scope) {
  let permission = 'all'
  if (scope === 'private') permission = 'supreme-owner-account-a-private-dm'
  else if (command.ownerOnly === true && command.adminOnly === true) permission = 'session-owner-or-supreme+group-admin'
  else if (command.ownerOnly === true) permission = 'session-owner-or-supreme'
  else if (command.adminOnly === true) permission = 'group-admin'

  return {
    name: command.name,
    moduleId: scope === 'private' ? 'mscc-private-commands' : 'mscc-public-commands',
    scope,
    capability: String(command.capability || 'general'),
    description: command.description || '',
    aliases: Array.isArray(command.aliases) ? command.aliases : [],
    enabled: true,
    permission,
    usage: command.usage || '',
    error: '',
  }
}

async function writeRuntimeRegistry() {
  const privateCommands = privateCommandRegistry.canonical
    .map(command => runtimeCommand(command, 'private'))
    .sort((a, b) => a.name.localeCompare(b.name))
  const publicCommands = publicCommandRegistry.canonical
    .map(command => runtimeCommand(command, 'public'))
    .sort((a, b) => a.name.localeCompare(b.name))
  const commands = [...privateCommands, ...publicCommands]

  const configEntries = privateCommandRegistry.canonical
    .filter(command => command.setting?.key)
    .map(command => ({
      key: command.setting.key,
      label: command.setting.label || command.name,
      type: 'boolean',
      description: command.setting.description || command.description || '',
    }))

  const modules = [
    {
      id: 'mscc-private-commands',
      legacyIds: ['mscc-core-commands'],
      displayName: 'Night Private Commands',
      version: APP_VERSION,
      status: 'loaded',
      enabled: true,
      commands: privateCommands.map(command => command.name),
      configuration: configEntries,
      loadError: '',
      lastReload: new Date().toISOString(),
      moduleDirectory: 'private-commands',
      dependencies: [],
      permissions: ['supreme-owner-account-a-private-dm', 'settings'],
    },
    {
      id: 'mscc-public-commands',
      displayName: 'Night Public Commands',
      version: APP_VERSION,
      status: 'loaded',
      enabled: true,
      commands: publicCommands.map(command => command.name),
      configuration: [],
      loadError: '',
      lastReload: new Date().toISOString(),
      moduleDirectory: 'commands',
      dependencies: [],
      permissions: ['commands', 'session-owner', 'group-admin', 'capability-routing'],
    },
  ]

  await mkdir(dirname(CORTEX_RUNTIME_REGISTRY_FILE), { recursive: true })
  await writeFile(CORTEX_RUNTIME_REGISTRY_FILE + '.tmp', JSON.stringify({
    version: 3,
    generatedAt: new Date().toISOString(),
    modules,
    commands,
  }, null, 2))
  await rename(CORTEX_RUNTIME_REGISTRY_FILE + '.tmp', CORTEX_RUNTIME_REGISTRY_FILE)
}

async function reloadModule(id) {
  const requestedId = String(id)
  const moduleId = requestedId === 'mscc-core-commands' ? 'mscc-private-commands' : requestedId
  if (!['mscc-private-commands', 'mscc-public-commands'].includes(moduleId)) throw new Error(`Unknown module: ${id}`)
  await reloadCommands()
  const registry = moduleId === 'mscc-private-commands' ? privateCommandRegistry : publicCommandRegistry
  const commands = registry.canonical.map(command => command.name).sort()
  await recordActivity('module.reloaded', { module: moduleId, commandCount: commands.length })
  return { ok:true, module:moduleId, commands }
}

function releaseProfileFor(item = {}) {
  return ['anime','manga'].includes(String(item?.mediaType || '')) ? 'nami' : 'mimi'
}

function releaseAccountCandidates(item = {}) {
  const preferred = releaseProfileFor(item)
  return [...accounts.values()]
    .filter(account => account?.enabled && account?.connected && account?.sock)
    .sort((a,b) => {
      const aProfile = sharedStorage?.profileForAccount(a.id)?.id || ''
      const bProfile = sharedStorage?.profileForAccount(b.id)?.id || ''
      const aScore = aProfile === preferred ? 0 : aProfile === 'control' ? 2 : 1
      const bScore = bProfile === preferred ? 0 : bProfile === 'control' ? 2 : 1
      return aScore - bScore
    })
}

async function resolveLibraryReleaseState(item = {}) {
  const id = Number(item?.externalId)
  if (!Number.isInteger(id) || id <= 0) return null

  if (item.mediaType === 'anime') return aniListResolver.releaseState(id)
  if (item.mediaType === 'tv') return tmdbResolver.releaseState(id, 'tv')
  if (item.mediaType === 'movie') return tmdbResolver.releaseState(id, 'movie')
  if (item.mediaType === 'manga') {
    try {
      const latest = await mangaDexLatest(item.title, item?.metadata?.aliases || [])
      return {
        kind:'chapter',
        number:Number(latest.chapter || 0) || 0,
        season:0,
        releasedAtMs:Date.parse(String(latest.publishedAt || '')) || 0,
        source:'mangadex',
        mangaDexId:latest.mangaId,
      }
    } catch {
      return null
    }
  }
  return null
}

async function sendLibraryReleaseDm(item, text) {
  const phone = String(item?.userKey || '')
  if (!/^\d{7,15}$/.test(phone) || !String(text || '').trim()) return false
  const jid = normalizeJid(phone + '@s.whatsapp.net')

  for (const account of releaseAccountCandidates(item)) {
    try {
      await sendText(account.sock, jid, String(text).trim())
      await recordActivity('library.release-notified', {
        account:account.id,
        profile:sharedStorage?.profileForAccount(account.id)?.id || '',
        mediaType:item.mediaType,
        itemKey:item.itemKey,
      })
      return true
    } catch {}
  }
  return false
}

function scheduledTaskAccountCandidates() {
  return [...accounts.values()]
    .filter(account => account?.enabled && account?.connected && account?.sock)
    .sort((a,b) => {
      const ap = sharedStorage?.profileForAccount(a.id)?.id || ''
      const bp = sharedStorage?.profileForAccount(b.id)?.id || ''
      const score = value => value === 'josiah' ? 0 : value === 'control' ? 2 : 1
      return score(ap) - score(bp)
    })
}

async function sendScheduledTaskDm(task) {
  const phone = String(task?.userKey || '')
  if (!/^\d{7,15}$/.test(phone)) return false
  const jid = normalizeJid(phone + '@s.whatsapp.net')
  let text = ''
  if (task.kind === 'reply-reminder') {
    const meta = task?.meta || {}
    text = [
      '⏰ *Reply reminder*',
      meta.senderName ? 'From: ' + meta.senderName : '',
      meta.chatLabel ? 'Chat: ' + meta.chatLabel : '',
      '',
      String(meta.messageText || task.text || '').trim(),
    ].filter(Boolean).join('\n')
  } else {
    const label = task.kind === 'timer' ? '⏱️ Timer finished' : '⏰ Reminder'
    const body = String(task.text || '').trim()
    text = body ? label + ': ' + body : label
  }

  for (const account of scheduledTaskAccountCandidates()) {
    try {
      await sendText(account.sock, jid, text)
      await recordActivity('schedule.delivered', {
        account:account.id,
        kind:task.kind,
        taskId:task.id,
      })
      return true
    } catch {}
  }
  return false
}

function startScheduledTaskRunner() {
  clearInterval(scheduledTaskTimer)

  const run = async () => {
    if (!sharedStorage || scheduledTaskRunning || shuttingDown) return
    scheduledTaskRunning = true
    try {
      const due = dueScheduledTasks(sharedStorage)
      for (const task of due) {
        if (await sendScheduledTaskDm(task)) completeScheduledTask(sharedStorage, task.id)
      }
      // Use the existing persistent scheduler; no separate polling loop or account-wide lock.
      for (const rule of dueGroupSchedules(sharedStorage)) {
        if (Date.now() - rule.nextAt > 10 * 60000) {
          // Never surprise a group by executing an old rule hours after downtime.
          finishGroupSchedule(sharedStorage, rule.group, rule.id)
          continue
        }
        if (rule.action === 'open' && isGroupScheduleHeld(sharedStorage, rule.group)) {
          // A manual Night lockdown overrides the next automatic opening.
          finishGroupSchedule(sharedStorage,rule.group,rule.id)
          continue
        }
        const account = accounts.get(rule.accountId)
        if (!account?.connected || !account.sock) continue
        try {
          if (!(await isBotGroupAdminContext(account, { key:{ remoteJid:rule.group } }))) continue
          await account.sock.groupSettingUpdate(rule.group,
            rule.action === 'close' ? 'announcement' : 'not_announcement')
          invalidateGroupMetadata(account.id, rule.group)
          finishGroupSchedule(sharedStorage, rule.group, rule.id)
          await recordActivity('group.schedule.executed', {
            account:account.id, group:rule.group, action:rule.action, scheduleId:rule.id,
          })
        } catch(error) {
          console.warn('Group schedule failed:', rule.group, error?.message || error)
        }
      }
    } catch (error) {
      console.warn('Scheduled task runner failed:', error?.message || error)
    } finally {
      scheduledTaskRunning = false
    }
  }

  scheduledTaskTimer = setInterval(run, 30000)
  scheduledTaskTimer.unref?.()
  setTimeout(run, 5000).unref?.()
}

async function resolveLatestRelease(query, type = '') {
  const term = String(query || '').trim()
  const kind = String(type || '').trim().toLowerCase()
  if (!term) return []

  if (kind === 'manga') {
    const latest = await mangaDexLatest(term)
    return [{
      type:'manga',
      title:latest.title,
      kind:'chapter',
      number:Number(latest.chapter || 0),
      source:'mangadex',
      publishedAt:latest.publishedAt,
    }]
  }

  const rows = []
  const wantAnime = !kind || kind === 'anime'
  const wantTv = !kind || kind === 'tv' || kind === 'series'
  const wantMovie = kind === 'movie' || kind === 'film'

  if (wantAnime) {
    try {
      const results = await aniListResolver.resolve(term, 'ANIME')
      const media = results?.[0]
      if (media?.anilistId) {
        const state = await aniListResolver.releaseState(media.anilistId)
        if (state) rows.push({
          type:'anime',
          title:media.title || term,
          ...state,
        })
      }
    } catch {}
  }

  if (wantTv) {
    try {
      const results = await tmdbResolver.search(term, 'tv')
      const media = results?.[0]
      if (media?.tmdbId) {
        const state = await tmdbResolver.releaseState(media.tmdbId, 'tv')
        if (state) rows.push({
          type:'tv',
          title:media.title || media.name || term,
          ...state,
        })
      }
    } catch {}
  }

  if (wantMovie) {
    try {
      const results = await tmdbResolver.search(term, 'movie')
      const media = results?.[0]
      if (media?.tmdbId) {
        const state = await tmdbResolver.releaseState(media.tmdbId, 'movie')
        if (state) rows.push({
          type:'movie',
          title:media.title || media.name || term,
          ...state,
        })
      }
    } catch {}
  }

  return rows
}

function startLibraryReleaseWatcher() {
  if (!releaseWatcher) return
  clearInterval(releaseWatchTimer)

  const run = async () => {
    if (releaseWatchRunning || shuttingDown) return
    releaseWatchRunning = true
    try {
      await releaseWatcher.checkOnce()
    } catch (error) {
      console.warn('Release watch failed:', error?.message || error)
    } finally {
      releaseWatchRunning = false
    }
  }

  releaseWatchTimer = setInterval(run, RELEASE_WATCH_INTERVAL_MS)
  releaseWatchTimer.unref?.()
  setTimeout(run, Math.min(60000, Math.max(5000, Math.floor(RELEASE_WATCH_INTERVAL_MS / 4)))).unref?.()
}

function startSettingsWatcher() {
  clearInterval(settingsPollTimer)
  settingsPollTimer = setInterval(async () => {
    try {
      const info = await stat(SETTINGS_FILE)
      if (info.mtimeMs > settingsMtimeMs + 1) await reloadSettings(false)
    } catch (e) {
      if (e?.code !== 'ENOENT') console.warn('Settings watch failed:', e?.message || e)
    }
  }, 1500)
  settingsPollTimer.unref?.()
}

async function pathExists(path) {
  try { await stat(path); return true } catch (e) { if (e?.code === 'ENOENT') return false; throw e }
}

async function backupAuth(account) {
  await mkdir(AUTH_BACKUP_DIR, { recursive: true })
  if (!(await pathExists(account.authDir))) {
    await mkdir(account.authDir, { recursive: true })
    return null
  }
  const stamp = new Date().toISOString().replace(/[:.]/g,'-')
  const target = join(AUTH_BACKUP_DIR, `account-${account.id}-${stamp}`)
  try {
    await rename(account.authDir, target)
  } catch (e) {
    if (e?.code !== 'EXDEV') throw e
    await cp(account.authDir, target, { recursive: true })
    await rm(account.authDir, { recursive: true, force: true })
  }
  await mkdir(account.authDir, { recursive: true })
  return target
}

function runOp(account, fn) {
  return serializeSessionOperation(account, fn)
}

async function resolvePhoneJid(account, jid) {
  const normalized = normalizeJid(jid)
  if (!normalized) return ''
  if (verifiedPhoneNumber(normalized)) return normalized
  if (!isOpaqueLid(normalized)) return normalized
  if (hasConflictingLidMapping(sharedStorage, normalized)) return normalized

  // Look up only verified Baileys mappings. LID digits are NOT phone numbers.
  const saved = storedLidPhone(sharedStorage, normalized)
  if (saved) return saved
  const generation = account.generation
  const rememberMapping = candidate => {
    if (generation !== account.generation || !verifiedPhoneNumber(candidate)) return ''
    return recordVerifiedLidPhone(sharedStorage, normalized, candidate)
  }
  const fromAuth = await readAuthLidPhone(account.authKeys, normalized)
  if (fromAuth) return rememberMapping(fromAuth) || normalized

  const key = String(account?.id || '') + '|' + normalized
  const cached = senderResolutionCache.get(key)
  if (cached && Date.now() - cached.at < (cached.ttlMs || SENDER_CACHE_TTL_MS)) {
    return cached.phoneJid
  }
  const cacheIdentity = (candidate, ttlMs = SENDER_CACHE_TTL_MS) => {
    if (generation !== account.generation) return
    const verified = verifiedPhoneNumber(candidate) ? rememberMapping(candidate) : ''
    senderResolutionCache.set(key, {
      phoneJid:verified || normalized, at:Date.now(), ttlMs,
    })
    while (senderResolutionCache.size > SENDER_CACHE_MAX) {
      senderResolutionCache.delete(senderResolutionCache.keys().next().value)
    }
  }
  const candidate = await resolveIdentityWithDeadline({
    jid:normalized,
    lookup: id => account.sock?.findUserId?.(id),
    normalize:normalizeJid,
    timeoutMs:LID_LOOKUP_TIMEOUT_MS,
    onResolved:phone => cacheIdentity(phone),
  })
  const verified = verifiedPhoneNumber(candidate) ? rememberMapping(candidate) : ''
  cacheIdentity(verified || normalized, verified ? SENDER_CACHE_TTL_MS : 10000)
  return verified || normalized
}

async function resolveSender(account, msg) {
  if (msg?.key?.fromMe) return selfJid(account)
  const jid = isGroup(msg?.key?.remoteJid) ? normalizeJid(msg?.key?.participant || msg?.participant) : normalizeJid(msg?.key?.remoteJid)
  return resolvePhoneJid(account, jid)
}

async function resolveCommandTarget(account, msg, raw = '') {
  const token = String(raw || '').trim()
  const explicit = digits(token)
  if (explicit && /^\d{7,15}$/.test(explicit) && /^[+\d(). -]+$/.test(token)) return { phoneNumber: explicit, source: 'explicit' }

  const info = contextInfo(msg?.message)
  const mentions = Array.isArray(info?.mentionedJid) ? info.mentionedJid : []

  if (token.startsWith('@') && mentions.length) {
    const phoneJid = await resolvePhoneJid(account, mentions[0])
    const phoneNumber = verifiedPhoneNumber(phoneJid)
    if (phoneNumber) return { phoneNumber, source: 'mention' }
  }

  const quotedCandidate = info?.participant || (info?.remoteJid && !isGroup(info.remoteJid) ? info.remoteJid : '')
  if (info?.stanzaId && quotedCandidate) {
    const phoneJid = await resolvePhoneJid(account, quotedCandidate)
    const phoneNumber = verifiedPhoneNumber(phoneJid)
    if (phoneNumber) return { phoneNumber, source: 'reply' }
  }

  if (mentions.length) {
    const phoneJid = await resolvePhoneJid(account, mentions[0])
    const phoneNumber = verifiedPhoneNumber(phoneJid)
    if (phoneNumber) return { phoneNumber, source: 'mention' }
  }
  return { phoneNumber: '', source: '' }
}

async function jidBelongsToAccount(account, jid) {
  const normalized = normalizeJid(jid)
  if (!normalized) return false
  if (normalizeJid(account.sock?.user?.id) === normalized || normalizeJid(account.sock?.user?.lid) === normalized) return true
  const phoneJid = await resolvePhoneJid(account, normalized)
  return Boolean(account.number && verifiedPhoneNumber(phoneJid) === account.number)
}

function escapeAssistantRegExp(value) {
  return String(value || '').replace(/[.*+?^$()|[\]\\]/g, '\\$&')
}

function stripAssistantAddress(text, displayName = 'Josiah') {
  let value = String(text || '').trim()
  value = value.replace(/^@\d{5,20}\s*/u, '').trimStart()
  const escaped = escapeAssistantRegExp(displayName || 'Josiah')
  value = value.replace(new RegExp('^' + escaped + '\\s*[:,\\-]?\\s*', 'i'), '').trim()
  return value
}

function assistantForAccount(account) {
  const profile = sharedStorage?.profileForAccount(account.id)
  if (profile?.id === 'josiah') return josiahAssistant
  if (profile?.id === 'nami') return namiAssistant
  if (profile?.id === 'mimi') return mimiAssistant
  return null
}

async function assistantActivation(account, msg, text) {
  const profile = sharedStorage?.profileForAccount(account.id)
  if (!assistantForAccount(account) || msg?.key?.fromMe || settings.publicCommandsEnabled === false) {
    return { active:false, reason:'' }
  }

  const chat = normalizeJid(msg?.key?.remoteJid)
  // Channels must never inherit the direct-message AI switch.
  if (isChannelJid(chat)) {
    return channelAiAllowed(sharedStorage, chat, account.id)
      ? { active:true, reason:'channel-opt-in' }
      : { active:false, reason:'' }
  }
  if (!isGroup(chat)) {
    return settings.aiDirectMessages === true
      ? { active:true, reason:'dm' }
      : { active:false, reason:'' }
  }

  const info = contextInfo(msg?.message)
  for (const mentioned of info?.mentionedJid || []) {
    if (await jidBelongsToAccount(account, mentioned)) return { active:true, reason:'mention' }
  }

  if (info?.stanzaId) {
    const cached = findCached(account.id, {
      id:info.stanzaId,
      remoteJid:info.remoteJid || chat,
      participant:info.participant,
    }, chat)
    if (cached?.key?.fromMe) return { active:true, reason:'reply' }
    if (info?.participant && await jidBelongsToAccount(account, info.participant)) {
      return { active:true, reason:'reply' }
    }
  }

  const name = String(profile?.displayName || 'Assistant').trim()
  if (name && new RegExp('^' + escapeAssistantRegExp(name) + '\\b', 'i').test(String(text || '').trim())) {
    return { active:true, reason:'name' }
  }

  return { active:false, reason:'' }
}

async function assistantQuote(account, msg) {
  const info = contextInfo(msg?.message)
  if (!info?.stanzaId) return { text:'', speaker:'' }

  const directText = commandText(info.quotedMessage)
  const cached = findCached(account.id, {
    id:info.stanzaId,
    remoteJid:info.remoteJid || msg?.key?.remoteJid,
    participant:info.participant,
  }, msg?.key?.remoteJid)

  let text = directText || commandText(cached?.message)
  const media = conversationMediaType(info.quotedMessage || cached?.message)
  if (media) text = '[' + media + ']' + (text ? ' ' + text : '')

  const profile = sharedStorage?.profileForAccount(account.id)
  let speaker = ''
  if (cached?.key?.fromMe) {
    speaker = profile?.displayName || 'Assistant'
  } else if (cached?.pushName) {
    speaker = String(cached.pushName)
  } else if (info?.participant) {
    const phone = await resolvePhoneJid(account, info.participant)
    speaker = jidUser(phone) || jidUser(info.participant)
  }

  return { text:String(text || '').trim(), speaker:String(speaker || '').trim() }
}

async function assistantGroupName(account, chat) {
  if (!isGroup(chat)) return ''
  const metadata = await groupMetadataCached(account, chat)
  return String(metadata?.subject || '').trim()
}

const PUBLIC_PERSONALITY_IDS = new Set(['josiah', 'nami', 'mimi'])

async function groupPersonalityPresence(account, chat) {
  if (!isGroup(chat) || !sharedStorage) return []
  const metadata = await groupMetadataCached(account, chat)
  const participants = Array.isArray(metadata?.participants) ? metadata.participants : []
  const rows = []

  for (const candidate of accounts.values()) {
    const profile = sharedStorage.profileForAccount(candidate.id)
    if (!PUBLIC_PERSONALITY_IDS.has(profile?.id)) continue

    let present = false
    for (const participant of participants) {
      const jid = typeof participant === 'string'
        ? participant
        : participant?.id || participant?.jid || participant?.lid || ''
      if (jid && await jidBelongsToAccount(candidate, jid)) {
        present = true
        break
      }
    }
    if (!present) continue

    rows.push({
      profileId:profile.id,
      displayName:profile.displayName,
      accountId:candidate.id,
      mentionJid:selfJid(candidate),
      mentionToken:`[[mention:${profile.id}]]`,
    })
  }

  const order = new Map([['josiah', 0], ['nami', 1], ['mimi', 2]])
  rows.sort((a, b) =>
    (order.get(a.profileId) ?? 99) - (order.get(b.profileId) ?? 99) ||
    String(a.accountId).localeCompare(String(b.accountId))
  )
  return rows
}

function senderPersonalityFromPresence(authority, presence = []) {
  const sender = authority?.senderNumber || ''
  if (!sender) return ''
  const row = presence.find(item => digits(jidUser(item?.mentionJid)) === sender)
  return String(row?.profileId || '')
}

function renderAssistantMentions(value, presence = [], { allowMentions = true } = {}) {
  const rows = new Map(
    presence.map(row => [String(row?.profileId || '').trim().toLowerCase(), row])
  )
  const mentions = []
  const text = String(value || '').replace(/\[\[mention:([a-z0-9_-]+)\]\]/gi, (_match, rawId) => {
    const id = String(rawId || '').trim().toLowerCase()
    const row = rows.get(id)
    if (!row) return id
    if (!allowMentions || !row.mentionJid) return row.displayName || id
    const user = jidUser(row.mentionJid)
    if (!user) return row.displayName || id
    mentions.push(row.mentionJid)
    return '@' + user
  })
  return { text, mentions:[...new Set(mentions)] }
}

async function handleProfileGroupIntro(account, update) {
  const group = normalizeJid(update?.id)
  const profile = sharedStorage?.profileForAccount(account.id)
  const presentation = presentationFor(profile?.id)
  if (!group || !presentation || String(update?.action || '').toLowerCase() !== 'add') return false

  const participants = Array.isArray(update?.participants) ? update.participants : []
  let addedSelf = false
  for (const participant of participants) {
    const jid = typeof participant === 'string' ? participant : participant?.id
    if (jid && await jidBelongsToAccount(account, jid)) {
      addedSelf = true
      break
    }
  }
  if (!addedSelf) return false

  await new Promise(resolve => setTimeout(resolve, 1500))
  if (!account.connected || !account.sock) return false

  const key = profile.id + '|' + group
  const previous = sharedStorage?.sharedGet('profile-group-intro', key)
  const returning = Boolean(previous?.count)
  const groupName = await assistantGroupName(account, group)
  const body = groupIntro(profile.id, { returning, groupName })
  const caption = [profileHeader(profile.id), '', body].filter(Boolean).join('\n')
  if (!caption) return false

  const imagePath = await chooseProfileAsset(profile.id, 'intro', { returning })
  if (imagePath) {
    try {
      const image = await readProfileAsset(imagePath)
      await account.sock.sendMessage(group, { image, caption })
    } catch {
      await sendText(account.sock, group, caption)
    }
  } else {
    await sendText(account.sock, group, caption)
  }

  sharedStorage?.sharedSet('profile-group-intro', key, {
    count:Number(previous?.count || 0) + 1,
    firstAt:Number(previous?.firstAt || 0) || Date.now(),
    lastAt:Date.now(),
    profileId:profile.id,
  })
  await recordActivity('profile.group-introduced', {
    account:account.id,
    profile:profile.id,
    group,
    returning,
    usedImage:Boolean(imagePath),
  })
  return true
}

async function sendAssistantReply(account, msg, text, {
  presence = [],
  allowPersonalityMentions = true,
} = {}) {
  const chat = normalizeJid(msg?.key?.remoteJid)
  const rendered = renderAssistantMentions(text, presence, { allowMentions:allowPersonalityMentions })
  const value = String(rendered.text || '').trim()
  if (!chat || !value || !account?.sock) return null
  if (isChannelJid(chat) && !channelAiAllowed(sharedStorage, chat, account.id)) return null
  const sent = await sendText(account.sock, chat, value, {
    quoted:isChannelJid(chat) ? null : msg,
    mentions:isChannelJid(chat) ? [] : rendered.mentions,
  })

  if (sharedStorage && sent?.key?.id) {
    const profile = sharedStorage.profileForAccount(account.id)
    sharedStorage.putConversationMessage({
      chatJid:chat,
      messageId:sent.key.id,
      accountId:account.id,
      participantJid:normalizeJid(sent.key.participant),
      speaker:profile?.displayName || 'Personality',
      fromBot:true,
      text:value,
      atMs:Date.now(),
    })
  }
  return sent
}

async function handleProfileAssistant(account, msg, authority, rawText) {
  // Uncaptioned image/sticker/video/audio replies are not conversational
  // text. Do not feed their quoted bot message back as an empty AI request.
  // Explicit media commands have already been dispatched separately.
  const input = assistantInputPolicy({
    text:rawText,
    mediaType:conversationMediaType(msg?.message),
  })
  if (!input.respond) return false
  // Recheck at the AI entry point: there is no global channel override.
  const targetChat = normalizeJid(msg?.key?.remoteJid)
  if (isChannelJid(targetChat) && !channelAiAllowed(sharedStorage, targetChat, account.id)) return false
  // Passive mentions/replies must remain silent when no AI key is configured.
  // Other commands and personality routing continue to work normally.
  if (!smartAI.enabled) return false
  const assistant = assistantForAccount(account)
  if (!assistant) return false

  const activation = await assistantActivation(account, msg, rawText)
  if (!activation.active) return false

  const chat = normalizeJid(msg?.key?.remoteJid)
  const profile = sharedStorage?.profileForAccount(account.id)
  const quote = await assistantQuote(account, msg)
  const groupName = await assistantGroupName(account, chat)
  const presence = await groupPersonalityPresence(account, chat)
  const senderPersonality = senderPersonalityFromPresence(authority, presence)
  const text = stripAssistantAddress(input.text, profile?.displayName || assistant.displayName || 'Personality')
    || 'Someone addressed you by name.'
  const aiStartedAt = Date.now()
  const typingSocket = account.sock
  const typing = createAssistantTyping({
    sock:typingSocket,
    chat,
    canSignal:() => account.sock === typingSocket && account.connected === true,
  })
  typing.start()
  try {
    const result = await assistant.answer({
      chatJid:chat,
      text,
      senderName:String(msg.pushName || '').trim() || authority.senderNumber || 'User',
      quotedText:quote.text,
      quotedSpeaker:quote.speaker,
      attachmentType:input.attachmentType,
      groupName,
      isGroup:isGroup(chat),
      groupPersonalities:presence,
      senderPersonality,
      // No extra model call: this is a small optional instruction in the existing reply.
      reactionSoundPolicy:isGroup(chat) && !senderPersonality ? await reactionSounds.promptFor(chat) : '',
    })
    if (isChannelJid(chat) && !channelAiAllowed(sharedStorage, chat, account.id)) return true
    if (!result?.ok || !result.text) {
      // A provider failure is NOT a successful AI response. Cortex can now
      // distinguish rate limits, cooldowns, auth failures and timeouts without
      // recording prompt text, phone numbers, or private credentials.
      const reason = String(result?.reason || 'unavailable').slice(0, 64)
      await recordActivity('ai.failed', {
        account:account.id,
        profile:profile?.id || assistant.profileId || '',
        group:isGroup(chat),
        activation:activation.reason,
        reason,
        durationMs:Date.now() - aiStartedAt,
      })
      // Silent failure: retain only internal diagnostics for troubleshooting.
      return true
    }
    const reaction = parseReactionSoundDirective(result.text)
    if (!reaction.text) return false

    await typing.beforeSend(reaction.text)
    // An owner may switch the channel OFF while the model is still working.
    if (isChannelJid(chat) && !channelAiAllowed(sharedStorage, chat, account.id)) return true
    const delivered = await sendAssistantReply(account, msg, reaction.text, {
      presence,
      allowPersonalityMentions:!senderPersonality,
    })
    if (!delivered && isChannelJid(chat)) return true
    typing.stop() // WhatsApp must stop showing "typing..." once the text lands.
    // Only one sound after the normal text, never on AI-to-AI replies.
    if (reaction.id && isGroup(chat) && !senderPersonality) {
      await reactionSounds.play(account.sock, chat, reaction.id, { automatic:true })
    }
    await recordActivity('ai.responded', {
      account:account.id,
      profile:profile?.id || assistant.profileId || '',
      group:isGroup(chat),
      activation:activation.reason,
      usedWeb:result.usedWeb === true,
      durationMs:Date.now() - aiStartedAt,
    })
    return true
  } finally {
    typing.stop()
  }
}

function publicSudoNumbers() {
  const rows = sharedStorage?.sharedGet('public-sudo', 'numbers')
  return Array.isArray(rows)
    ? [...new Set(rows.map(digits).filter(value => /^\d{7,15}$/.test(value)))]
    : []
}

function isPublicSudoNumber(phoneNumber) {
  const phone = digits(phoneNumber)
  return Boolean(phone && publicSudoNumbers().includes(phone))
}

function setPublicSudoNumber(phoneNumber, enabled) {
  const phone = digits(phoneNumber)
  if (!/^\d{7,15}$/.test(phone)) throw new Error('That is not a valid WhatsApp number.')
  const current = new Set(publicSudoNumbers())
  if (enabled) current.add(phone)
  else current.delete(phone)
  const rows = [...current].sort()
  sharedStorage?.sharedSet('public-sudo', 'numbers', rows)
  return rows
}

async function authorityContext(account, msg) {
  const senderJid = await resolveSender(account, msg)
  const senderNumber = verifiedPhoneNumber(senderJid)
  const senderKey = canonicalUserKey(sharedStorage, senderJid)
  const senderIdentityKeys = verifiedIdentityKeys(sharedStorage, senderJid)
  const isSupremeOwner = Boolean(senderNumber && controlNumbers.has(senderNumber))
  const isSudo = isPublicSudoNumber(senderNumber)
  return {
    senderJid,
    senderNumber,
    senderKey,
    senderIdentityKeys,
    isSupremeOwner,
    isSudo,
    isPublicOwner:isSupremeOwner || isSudo,
    isSessionOwner: isSupremeOwner || Boolean(senderNumber && senderNumber === account.number),
  }
}

async function isController(account, msg) {
  return (await authorityContext(account, msg)).isSupremeOwner
}

async function broadcastNightGroups(sourceAccount, text) {
  const body = String(text || '').trim()
  if (!body) throw new Error('Broadcast text is empty.')

  const ordered = [
    sourceAccount,
    ...[...accounts.values()].filter(account => account?.id !== sourceAccount?.id),
  ].filter((account, index, rows) =>
    account?.enabled &&
    account?.connected &&
    account?.sock &&
    rows.findIndex(other => other?.id === account.id) === index
  )

  const targets = new Map()
  for (const account of ordered) {
    let groups = {}
    try { groups = await account.sock.groupFetchAllParticipating() || {} } catch { continue }
    for (const group of Object.keys(groups)) {
      const jid = normalizeJid(group)
      if (!isGroup(jid) || targets.has(jid)) continue
      targets.set(jid, account)
    }
  }

  let sent = 0
  let failed = 0
  for (const [group, account] of [...targets.entries()].slice(0, 500)) {
    try {
      await account.sock.sendMessage(group, { text:body })
      sent += 1
    } catch {
      failed += 1
    }
    await new Promise(resolve => setTimeout(resolve, 80))
  }

  await recordActivity('owner.broadcast', {
    sourceAccount:sourceAccount?.id || '',
    groups:targets.size,
    sent,
    failed,
  })
  return { total:targets.size, sent, failed }
}

async function setPublicSudoTarget(account, msg, raw, enabled) {
  const target = await resolveCommandTarget(account, msg, raw)
  const phone = digits(target?.phoneNumber)
  if (!phone) throw new Error('Mention somebody, reply to their message, or provide a phone number.')
  if (controlNumbers.has(phone)) throw new Error('That number is already a primary owner/control number.')
  setPublicSudoNumber(phone, enabled)
  return {
    phoneNumber:phone,
    enabled:Boolean(enabled),
  }
}

async function resolveDirectPeer(account, msg) {
  const jid = normalizeJid(msg?.key?.remoteJid)
  if (!jid || isGroup(jid)) return ''
  return resolvePhoneJid(account, jid)
}

async function isPrivateControlContext(account, msg, authority = null) {
  const chat = normalizeJid(msg?.key?.remoteJid)
  const sender = verifiedPhoneNumber(authority?.senderJid || await resolveSender(account, msg))
  const peer = verifiedPhoneNumber(await resolveDirectPeer(account, msg))
  return isPrivateOwnerDm({
    account,
    mainAccountId: destinationIdFor(),
    chat,
    group: isGroup(chat),
    senderNumber: sender,
    peerNumber: peer,
    controlNumbers,
  })
}

function invalidateGroupMetadata(accountId = '', groupJid = '') {
  for (const key of [...groupMetaCache.keys()]) {
    const [id, group] = key.split('|', 2)
    if (accountId && id !== accountId) continue
    if (groupJid && group !== normalizeJid(groupJid)) continue
    groupMetaCache.delete(key)
  }
}

async function groupMetadataCached(account, groupJid) {
  const group = normalizeJid(groupJid)
  const key = `${account.id}|${group}`
  const cached = groupMetaCache.get(key)
  if (cached && Date.now() - cached.at < GROUP_META_TTL_MS) return cached.value

  try {
    const value = await account.sock?.groupMetadata?.(group)
    if (!value) return null
    groupMetaCache.set(key, { at: Date.now(), value })
    trimTimedMap(groupMetaCache, GROUP_META_CACHE_MAX, GROUP_META_TTL_MS)
    return value
  } catch {
    groupMetaCache.delete(key)
    return null
  }
}

// The WhatsApp app paints contact labels over raw @LID tokens, but Baileys
// receives the opaque mention JID and its literal numeric token. For rendered
// screenshots look up a group member's observed/public name by JID, not LID digits.
async function resolveSocialMentionName(account, msg, mentionedJid) {
  const group = normalizeJid(msg?.key?.remoteJid)
  if (!isGroup(group)) return ''

  const jid = normalizeJid(mentionedJid)
  if (!jid) return ''
  const metadata = await groupMetadataCached(account, group)
  const found = await findGroupParticipant(
    metadata?.participants,
    jid,
    candidate => resolvePhoneJid(account, candidate),
  )
  const participant = found?.participant
  const aliases = [...new Set([jid, ...(participant ? participantIds(participant) : [])])]
  const sender = normalizeJid(msg?.key?.participant || msg?.participant)
  const senderName = aliases.includes(sender) ? msg?.pushName : ''
  const observedNames = aliases
    .map(candidate => sharedStorage?.latestConversationSpeaker(group, candidate))
    .filter(Boolean)

  const candidates = [
    senderName,
    participant?.notify,
    participant?.pushName,
    participant?.verifiedName,
    ...observedNames,
    participant?.displayName,
    participant?.name,
  ]
  return candidates.map(value => String(value || '').trim())
    .find(value => value && !/^(?:@?\d+|whatsapp user|unknown(?: user)?|member|user)$/i.test(value)) || ''
}

async function resolveGroupParticipant(account, msg, raw = '') {
  const chat = normalizeJid(msg?.key?.remoteJid)
  if (!isGroup(chat)) return null

  const requestedJid = groupTargetJid(raw, contextInfo(msg?.message))
  if (!requestedJid) return null

  const metadata = await groupMetadataCached(account, chat)
  const found = await findGroupParticipant(
    metadata?.participants,
    requestedJid,
    jid => resolvePhoneJid(account, jid),
  )
  if (!found) return null

  const { participant, jid } = found
  const aliases = participantIds(participant)
  const verifiedPhoneJid = aliases.find(alias => alias.endsWith('@s.whatsapp.net'))
    || await resolvePhoneJid(account, jid)
  const phoneNumber = verifiedPhoneNumber(verifiedPhoneJid)
  // A single group participant carrying both PN and LID is verified evidence.
  if (phoneNumber) {
    for (const alias of aliases.filter(isOpaqueLid)) {
      recordVerifiedLidPhone(sharedStorage, alias, verifiedPhoneJid)
    }
  }
  const memberKey = memberIdentityKey(verifiedPhoneJid, jid)
  const identityKeys = phoneNumber
    ? verifiedIdentityKeys(sharedStorage, verifiedPhoneJid)
    : [memberKey]

  // Push names are attached to messages, not necessarily to group metadata.
  // Use the current command sender's push name only when targeting that sender.
  const sender = normalizeJid(msg?.key?.participant || msg?.participant)
  const senderPhone = sender ? await resolvePhoneJid(account, sender) : ''
  const isSender = Boolean(
    aliases.includes(sender) ||
    (phoneNumber && senderPhone.endsWith('@s.whatsapp.net') && jidUser(senderPhone) === phoneNumber)
  )
  const historyNames = [...new Set([jid, ...aliases, verifiedPhoneJid])]
    .map(candidate => sharedStorage?.latestConversationSpeaker(chat, candidate))
    .filter(Boolean)
  const label = groupMemberLabel({
    participant,
    historyNames,
    pushName:isSender ? msg?.pushName : '',
    jid,
  })

  return {
    phoneNumber,
    memberKey,
    identityKeys,
    jid,
    phoneJid:verifiedPhoneJid || '',
    participant,
    ...label,
  }
}

function preferredJosiaAccount(fallback = null) {
  const josia = [...accounts.values()].find(candidate =>
    candidate?.enabled &&
    candidate?.connected &&
    candidate?.sock &&
    sharedStorage?.profileForAccount(candidate.id)?.id === 'josiah'
  )
  return josia || (fallback?.connected && fallback?.sock ? fallback : null)
}

function awayDuration(since) {
  const diff = Math.max(0, Date.now() - Number(since || Date.now()))
  if (diff < 60000) return Math.max(1, Math.floor(diff / 1000)) + 's'
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm'
  if (diff < 86400000) return (diff / 3600000).toFixed(diff < 10 * 3600000 ? 1 : 0).replace('.0','') + 'h'
  return (diff / 86400000).toFixed(diff < 10 * 86400000 ? 1 : 0).replace('.0','') + 'd'
}

async function afkIdentityFromJid(account, jid) {
  const raw = normalizeJid(jid)
  if (!raw) return { key:'', phone:'', jid:'' }
  const resolved = await resolvePhoneJid(account, raw)
  const key = canonicalUserKey(sharedStorage, resolved)
  return { key, phone:verifiedPhoneNumber(resolved), jid:raw, resolved }
}

function afkNameFor(group, jid, fallback = '') {
  return String(
    sharedStorage?.latestConversationSpeaker(group, normalizeJid(jid)) ||
    fallback ||
    jidUser(jid) ||
    'member'
  ).trim()
}

async function plainAfkMessage(account, group, message, text, protectedKey = '') {
  let value = String(text || '').trim()
  for (const jid of messageMentionJids(message)) {
    const target = await afkIdentityFromJid(account, jid)
    if (!target.key || target.key === protectedKey) continue
    const name = afkNameFor(group, jid, target.phone || 'member')
    const token = jidUser(jid)
    value = value.replace(new RegExp('@' + escapeAssistantRegExp(token) + '(?=\\b|\\s|$|[.,!?;:])', 'g'), name)
  }
  return value
}

async function handleAfkGroupMessage(account, msg, authority, text) {
  const group = normalizeJid(msg?.key?.remoteJid)
  if (!sharedStorage || !isGroup(group) || msg?.key?.fromMe || !authority?.senderKey) return false

  const senderKey = authority.senderKey
  const senderPhone = authority.senderNumber
  const rawSenderJid = normalizeJid(msg?.key?.participant || authority.senderJid)
  reconcileVerifiedAfk(sharedStorage, group, senderKey, authority.senderIdentityKeys)
  const senderAfk = getAfk(sharedStorage, group, senderKey)
  const prefix = settings.publicPrefix || DEFAULT_PUBLIC_PREFIX
  const isAfkCommand = String(text || '').trim().toLowerCase().startsWith((prefix + 'afk').toLowerCase())

  if (senderAfk && !isAfkCommand) {
    const state = clearAfk(sharedStorage, group, senderKey)
    const events = Array.isArray(state?.events) ? state.events : []
    const mentions = [rawSenderJid].filter(Boolean)
    const seen = new Set()
    const lines = []

    for (const event of events.slice(-12)) {
      const jid = normalizeJid(event?.senderJid)
      if (jid && !seen.has(jid)) { mentions.push(jid); seen.add(jid) }
      // Historical senderPhone was not always verified; never synthesize
      // a mention or DM address by appending @s.whatsapp.net to it.
      const label = jid ? '@' + jidUser(jid) : String(event?.senderName || 'Someone').slice(0,60)
      const body = String(event?.text || '').trim() ||
        (event?.kind === 'reply' ? 'replied to one of your messages' : 'mentioned you')
      lines.push('• ' + label + ': ' + body.slice(0,500))
    }

    const josia = preferredJosiaAccount(account)
    if (josia?.sock) {
      const senderLabel = senderPhone ? '@' + senderPhone
        : (String(msg?.pushName || '').trim() || 'You')
      const body = [
        '◇ *Josia*',
        senderLabel + ', you’re back. You were away for *' + awayDuration(state?.since) + '*.',
        events.length ? 'While you were away:' : 'Nobody called for you while you were away.',
        ...lines,
        events.length > 12 ? '• …and ' + (events.length - 12) + ' more.' : '',
      ].filter(Boolean).join('\n')
      await sendText(josia.sock, group, body, { mentions:[...new Set(mentions)] }).catch(() => {})
    }
    await recordActivity('group.afk-returned', { group, events:events.length })
  }

  const targets = new Map()
  async function recordTarget(jid,kind) {
    const target = await afkIdentityFromJid(account,jid)
    if (!target.key || target.key === senderKey) return
    reconcileVerifiedAfk(sharedStorage, group, target.key,
      verifiedIdentityKeys(sharedStorage, target.resolved))
    if (getAfk(sharedStorage, group, target.key) && !targets.has(target.key)) {
      targets.set(target.key, { ...target, kind })
    }
  }
  for (const jid of messageMentionJids(msg.message)) await recordTarget(jid, 'mention')
  const quotedJid = quotedParticipantJid(msg.message)
  if (quotedJid) await recordTarget(quotedJid,'reply')
  if (!targets.size) return Boolean(senderAfk && !isAfkCommand)

  const senderName = String(msg?.pushName || '').trim() ||
    afkNameFor(group, rawSenderJid, senderPhone || 'member')
  const josia = preferredJosiaAccount(account)
  for (const [key, target] of targets) {
    const state = getAfk(sharedStorage, group, key)
    if (!state) continue
    const safeText = await plainAfkMessage(account, group, msg.message, text, key)
    addAfkEvent(sharedStorage, group, key, {
      senderPhone, senderJid:rawSenderJid, senderName,
      text:safeText, kind:target.kind,
    })

    if (josia?.sock) {
      const label = target.phone ? '@' + target.phone
        : (String(state.displayName || '').trim() || '@' + jidUser(target.jid))
      const notice = [
        '◇ *Josia*',
        label + ' is away right now.',
        state.reason ? 'Reason: ' + state.reason : '',
        'Away for: ' + awayDuration(state.since),
        safeText ? 'Message: ' + safeText.slice(0,700) : '',
      ].filter(Boolean).join('\n')
      await sendText(josia.sock, group, notice, { mentions:[target.jid] }).catch(() => {})
    }
  }
  return false
}

async function groupParticipantAction(account, msg, raw, action) {
  const chat = normalizeJid(msg?.key?.remoteJid)
  if (!isGroup(chat)) throw new Error('This one is for groups.')
  if (!(await isBotGroupAdminContext(account, msg))) throw new Error('Night needs to be a group admin for that.')

  const target = await resolveGroupParticipant(account, msg, raw)
  if (!target) throw new Error('Mention somebody or reply to their message.')
  if (await jidBelongsToAccount(account, target.jid)) throw new Error('Night cannot apply that action to itself.')

  const operation = String(action || '')
  const status = updateSucceeded(await account.sock.groupParticipantsUpdate(chat, [target.jid], operation))
  if (status === false) throw new Error('WhatsApp rejected the group change.')

  // A successful server status is confirmation. If the library provides no
  // status, verify fresh metadata instead of claiming an unconfirmed change.
  if (status === null) {
    const updated = await account.sock.groupMetadata(chat).catch(() => null)
    const found = await findGroupParticipant(
      updated?.participants,
      target.jid,
      jid => resolvePhoneJid(account, jid),
    )
    const isAdmin = found?.participant?.admin === 'admin' || found?.participant?.admin === 'superadmin'
    const confirmed = operation === 'remove'
      ? Boolean(updated && !found)
      : operation === 'promote'
        ? Boolean(found && isAdmin)
        : operation === 'demote'
          ? Boolean(found && !isAdmin)
          : false
    if (!confirmed) throw new Error('WhatsApp has not confirmed the group change. Check the group and retry if needed.')
  }

  invalidateGroupMetadata(account.id, chat)
  return target
}

async function setGroupAnnouncement(account, msg, closed) {
  const chat = normalizeJid(msg?.key?.remoteJid)
  if (!isGroup(chat)) throw new Error('This one is for groups.')
  if (!(await isBotGroupAdminContext(account, msg))) throw new Error('Night needs to be a group admin for that.')
  await account.sock.groupSettingUpdate(chat, closed ? 'announcement' : 'not_announcement')
  setGroupScheduleHold(sharedStorage,chat,Boolean(closed))
  invalidateGroupMetadata(account.id, chat)
  return { closed:Boolean(closed) }
}

async function groupInviteLink(account, msg) {
  const chat = normalizeJid(msg?.key?.remoteJid)
  if (!isGroup(chat)) throw new Error('This one is for groups.')
  if (!(await isBotGroupAdminContext(account, msg))) throw new Error('Night needs to be a group admin to read the invite link.')
  const code = await account.sock.groupInviteCode(chat)
  if (!code) throw new Error('I could not get the group invite link.')
  return 'https://chat.whatsapp.com/' + code
}

async function hiddenTag(account, msg, text = '') {
  const chat = normalizeJid(msg?.key?.remoteJid)
  if (!isGroup(chat)) throw new Error('This one is for groups.')
  const metadata = await groupMetadataCached(account, chat)
  const mentions = (metadata?.participants || []).map(item => normalizeJid(
    typeof item === 'string' ? item : item?.id || item?.jid || item?.lid || ''
  )).filter(Boolean)
  return account.sock.sendMessage(chat, {
    text:String(text || '').trim() || '📢',
    mentions,
  }, { quoted:msg })
}

async function groupStatusSnapshot(account, msg) {
  const chat = normalizeJid(msg?.key?.remoteJid)
  if (!isGroup(chat)) return null
  const metadata = await groupMetadataCached(account, chat)
  if (!metadata) return null
  const participants = Array.isArray(metadata.participants) ? metadata.participants : []
  const admins = participants.filter(item => item?.admin === 'admin' || item?.admin === 'superadmin')
  const policy = groupPolicy(sharedStorage, chat)
  return {
    subject:String(metadata.subject || 'Group'),
    participants:participants.length,
    admins:admins.length,
    announcement:Boolean(metadata.announce),
    policy,
  }
}

async function deletePolicyMessage(account, msg) {
  const chat = normalizeJid(msg?.key?.remoteJid)
  if (!chat || !msg?.key?.id || !account?.sock) return false
  suppressAntiDelete(chat, msg.key.id)
  await account.sock.sendMessage(chat, { delete:msg.key })
  return true
}

async function enforceCurrentGroupPolicy(account, msg, authority) {
  const chat = normalizeJid(msg?.key?.remoteJid)
  if (!isGroup(chat) || msg?.key?.fromMe || !sharedStorage) return { handled:false }
  // With default moderation settings, group permissions don't need to be
  // fetched from WhatsApp for every ordinary command. A group mentioning a
  // member still goes through mention-mute checks.
  if (!groupMessageNeedsModeration(groupPolicy(sharedStorage, chat), msg)) {
    return { handled:false }
  }
  return enforceGroupMessage({
    storage:sharedStorage,
    msg,
    senderPhone:authority.senderNumber,
    senderIdentity:authority.senderKey,
    senderIsAdmin:await isGroupAdminContext(account, msg),
    botIsAdmin:await isBotGroupAdminContext(account, msg),
    resolvePhoneJid:jid => resolvePhoneJid(account, jid),
    deleteMessage:target => deletePolicyMessage(account, target),
    resendQuoted:(text, mentions, quoted) => sendText(account.sock, chat, text, { quoted, mentions }),
    replyMessage:text => sendText(account.sock, chat, text, { quoted:msg }),
    warnMember:trigger => addWarning(sharedStorage, chat, authority.senderKey, 'Filter: ' + trigger, 'Night'),
    record:recordActivity,
  })
}

async function handleGroupMemberPolicyEvent(account, update) {
  const group = normalizeJid(update?.id)
  const action = String(update?.action || '').toLowerCase()
  if (!group || !['add','remove'].includes(action) || !sharedStorage || !account?.sock) return false

  const policy = groupPolicy(sharedStorage, group)
  if (action === 'add' && !policy.welcome && !policy.aiGreet && !String(policy.rulesText || '').trim()) return false
  if (action === 'remove' && !policy.goodbye) return false

  const rawParticipants = Array.isArray(update?.participants) ? update.participants : []
  const mentions = []
  for (const participant of rawParticipants) {
    const rawJid = normalizeJid(typeof participant === 'string' ? participant : participant?.id || participant?.jid || participant?.lid || '')
    if (!rawJid) continue

    let nightAccount = false
    for (const candidate of accounts.values()) {
      if (await jidBelongsToAccount(candidate, rawJid)) {
        nightAccount = true
        break
      }
    }
    if (nightAccount) continue

    const phoneJid = await resolvePhoneJid(account, rawJid)
    mentions.push(phoneJid || rawJid)
  }
  if (!mentions.length) return false

  const dedupeKey = [group, action, ...mentions.map(normalizeJid).sort()].join('|')
  const prior = sharedStorage.sharedGet('group-member-event-dedupe', dedupeKey)
  if (prior?.at && Date.now() - Number(prior.at) < 15000) return false
  sharedStorage.sharedSet('group-member-event-dedupe', dedupeKey, { at:Date.now(), account:account.id })

  const metadata = await groupMetadataCached(account, group)
  const groupName = String(metadata?.subject || 'the group').trim()

  if (action === 'add') {
    const rulesText = String(policy.rulesText || '').trim()
    for (const memberJid of mentions) {
      let greeting = ''

      if (policy.aiGreet) {
        const assistant = assistantForAccount(account)
        if (assistant) {
          const mentionText = '@' + jidUser(memberJid)
          try {
            const result = await assistant.answer({
              chatJid:group,
              text:'Write one short, friendly welcome for ' + mentionText + ' joining "' + groupName + '". Keep that @mention exactly unchanged. Do not explain.',
              senderName:'Night',
              groupName,
              isGroup:true,
              groupPersonalities:await groupPersonalityPresence(account, group),
            })
            greeting = String(result?.text || '').trim()
          } catch {}
        }
      }

      if (!greeting && policy.welcome) {
        greeting = renderGroupTemplate(policy.welcomeText, { groupName, mentions:[memberJid] })
      }

      const rulesBlock = rulesText
        ? (greeting
          ? '📜 *Group Rules*\n' + rulesText
          : '@' + jidUser(memberJid) + ', these are the rules for *' + groupName + '*:\n\n' + rulesText)
        : ''

      const body = [greeting, rulesBlock].filter(Boolean).join('\n\n')
      if (body) await sendText(account.sock, group, body, { mentions:[memberJid] })
    }

    await recordActivity('group.member-welcomed', {
      account:account.id,
      group,
      count:mentions.length,
      ai:policy.aiGreet,
      rules:Boolean(rulesText),
    })
    return true
  }

  const text = renderGroupTemplate(policy.goodbyeText, { groupName, mentions })
  if (!text) return false
  await sendText(account.sock, group, text, { mentions })
  await recordActivity('group.member-goodbye', {
    account:account.id,
    group,
    count:mentions.length,
  })
  return true
}

async function publicUserProfile(account, msg, phoneNumber) {
  const phone = String(phoneNumber || '').trim()
  if (!/^[1-9]\d{6,14}$/.test(phone)) return null

  const chat = normalizeJid(msg?.key?.remoteJid)
  const senderNumber = verifiedPhoneNumber(await resolveSender(account, msg))
  let mentionJid = phone + '@s.whatsapp.net'
  let displayName = senderNumber === phone
    ? String(msg?.pushName || '').trim()
    : ''
  let role = ''
  let groupMember = false

  if (isGroup(chat)) {
    const metadata = await groupMetadataCached(account, chat)
    const participants = Array.isArray(metadata?.participants) ? metadata.participants : []

    for (const participant of participants) {
      const jid = normalizeJid(
        typeof participant === 'string'
          ? participant
          : participant?.id || participant?.jid || participant?.lid || ''
      )
      if (!jid) continue

      const phoneJid = (jid.endsWith('@lid') || jid.endsWith('@hosted.lid'))
        ? await resolvePhoneJid(account, jid)
        : jid
      const participantPhone = jidPhoneNumber(phoneJid)
      if (participantPhone !== phone) continue

      mentionJid = jid
      groupMember = true
      role = participant?.admin === 'superadmin'
        ? 'Group owner'
        : participant?.admin === 'admin'
          ? 'Admin'
          : 'Member'

      if (!displayName) {
        // notify/pushName and previously received message pushNames are the
        // WhatsApp identity, unlike an address-book contact alias.
        const liveNames = [...new Set([jid, mentionJid, phone + '@s.whatsapp.net'])]
          .map(candidate => sharedStorage?.latestConversationSpeaker(chat, candidate))
          .filter(Boolean)
        displayName = String(
          participant?.notify ||
          participant?.pushName ||
          participant?.verifiedName ||
          liveNames[0] ||
          participant?.displayName ||
          participant?.name ||
          ''
        ).trim()
      }
      break
    }
  }

  if (!displayName) displayName = 'WhatsApp user'

  let photoUrl = ''
  if (account?.sock?.profilePictureUrl) {
    const candidates = [...new Set([
      mentionJid,
      phone + '@s.whatsapp.net',
    ].filter(Boolean))]
    for (const jid of candidates) {
      try {
        photoUrl = String(await account.sock.profilePictureUrl(jid, 'image') || '').trim()
        if (photoUrl) break
      } catch {}
    }
  }

  const library = sharedStorage?.librarySummary(phone) || {
    total:0,
    anime:0,
    manga:0,
    movie:0,
    tv:0,
    watching:0,
  }

  return {
    phoneNumber:phone,
    displayName,
    mentionJid,
    groupMember,
    role,
    photoUrl,
    library,
  }
}

async function isGroupAdminContext(account, msg) {
  const chat = normalizeJid(msg?.key?.remoteJid)
  if (!isGroup(chat)) return false
  const sender = normalizeJid(msg?.key?.participant || msg?.participant)
  if (!sender) return false

  const metadata = await groupMetadataCached(account, chat)
  const found = await findGroupParticipant(
    metadata?.participants,
    sender,
    jid => resolvePhoneJid(account, jid),
  )
  return found?.participant?.admin === 'admin' || found?.participant?.admin === 'superadmin'
}

async function isBotGroupAdminContext(account, msg) {
  const chat = normalizeJid(msg?.key?.remoteJid)
  if (!isGroup(chat)) return false
  const metadata = await groupMetadataCached(account, chat)
  const participants = metadata?.participants || []

  for (const participant of participants) {
    const jid = typeof participant === 'string'
      ? participant
      : participant?.id || participant?.jid || participant?.lid || ''
    if (!jid || !(await jidBelongsToAccount(account, jid))) continue
    return participant?.admin === 'admin' || participant?.admin === 'superadmin'
  }
  return false
}

async function accountIsMemberOfGroup(account, groupJid) {
  if (!account?.connected || !account?.sock) return false
  const metadata = await groupMetadataCached(account, groupJid)
  return Boolean(metadata)
}

async function withRouteLock(key, fn) {
  const previous = routeLocks.get(key) || Promise.resolve()
  const current = previous.catch(() => {}).then(fn)
  routeLocks.set(key, current)
  try {
    return await current
  } finally {
    if (routeLocks.get(key) === current) routeLocks.delete(key)
  }
}

async function shouldExecutePublicCommand(account, msg, command) {
  if (!sharedStorage) return account.id === 'A'
  const capability = String(command?.capability || 'general').trim().toLowerCase() || 'general'
  const chat = normalizeJid(msg?.key?.remoteJid)

  // The emergency channel safety control must work from *any* bot DM,
  // including specialist profiles with no generic owner-command capability.
  // Permission to change it is still checked strictly by the command itself.
  if (command?.name === 'channelai') return !isGroup(chat) && !isChannelJid(chat)

  if (!isGroup(chat)) {
    return canExecuteDirect({
      accountId: account.id,
      capability,
      scoreFor: (id, cap) => sharedStorage.capabilityScore(id, cap),
    })
  }

  return withRouteLock(`${chat}|${capability}`, async () => {
    const selected = await chooseGroupExecutor({
      groupJid: chat,
      capability,
      accounts: [...accounts.values()],
      isMember: accountCandidate => accountIsMemberOfGroup(accountCandidate, chat),
      scoreFor: (id, cap) => sharedStorage.capabilityScore(id, cap),
      getSticky: (group, cap) => sharedStorage.getGroupRoute(group, cap),
      setSticky: (group, cap, id) => {
        const previous = sharedStorage.getGroupRoute(group, cap)
        sharedStorage.setGroupRoute(group, cap, id)
        if (previous !== id) {
          recordActivity('routing.group-selected', {
            group,
            capability: cap,
            account: id,
            previous: previous || null,
          }).catch(() => {})
        }
      },
    })
    return selected === account.id
  })
}

function commandReplySessionKey(account, msg, authority = {}) {
  const chat = normalizeJid(msg?.key?.remoteJid)
  const user = String(
    authority.senderKey ||
    canonicalUserKey(sharedStorage, msg?.key?.participant || chat) ||
    'unknown'
  )
  return [account?.id || '', chat, user].join('|')
}

function readCommandReplySession(account, msg, authority = {}) {
  if (!sharedStorage) return null
  const key = commandReplySessionKey(account, msg, authority)
  const session = sharedStorage.sharedGet('command-reply-session', key)
  if (!session) return null
  if (Number(session.expiresAt || 0) && Date.now() > Number(session.expiresAt)) {
    sharedStorage.sharedDelete('command-reply-session', key)
    return null
  }
  return session
}

function writeCommandReplySession(account, msg, authority = {}, session = null) {
  if (!sharedStorage) return null
  const key = commandReplySessionKey(account, msg, authority)
  if (!session) {
    sharedStorage.sharedDelete('command-reply-session', key)
    return null
  }
  return sharedStorage.sharedSet('command-reply-session', key, {
    ...session,
    updatedAt:Date.now(),
    expiresAt:Number(session.expiresAt || 0) || Date.now() + 30 * 60000,
  })
}

async function sendCommandReply(account, msg, value) {
  const chat = normalizeJid(msg?.key?.remoteJid)
  if (!chat || !account?.sock) throw new Error('Command reply target is unavailable')
  return sendText(account.sock, chat, value)
}

function commandUi(account, msg, prefix = settings.publicPrefix || DEFAULT_PUBLIC_PREFIX) {
  const chat = normalizeJid(msg?.key?.remoteJid)
  if (!chat || !account?.sock) throw new Error('Command UI target is unavailable')
  return createWhatsAppUi({
    sock:account.sock,
    chat,
    quoted:msg,
    prefix,
  })
}

async function sendCommandList(account, msg, options = {}) {
  return commandUi(account, msg).singleSelect(options)
}

async function sendCommandImageDataUrl(account, msg, dataUrl, caption = '') {
  const chat = normalizeJid(msg?.key?.remoteJid)
  if (!chat || !account?.sock) throw new Error('Command reply target is unavailable')
  return sendImageDataUrl(account.sock, chat, dataUrl, caption)
}

async function sendCommandImageFile(account, msg, file, caption = '') {
  const chat = normalizeJid(msg?.key?.remoteJid)
  if (!chat || !account?.sock) throw new Error('Command reply target is unavailable')
  const image = await readProfileAsset(String(file || ''))
  return account.sock.sendMessage(chat, {
    image,
    caption:String(caption || ''),
  }, { quoted:msg })
}

async function describe(account, msg) {
  const sender = jidUser(await resolveSender(account, msg)) || 'unknown'
  const chat = normalizeJid(msg?.key?.remoteJid)
  const accountLine = `Account: ${account.displayName || 'Account'} [${account.id}]\n`
  if (isGroup(chat)) {
    const gk = `${account.id}|${chat}`
    let name = groupNames.get(gk)?.name
    if (!name || Date.now() - (groupNames.get(gk)?.at || 0) > 3600000) {
      try { name = (await account.sock.groupMetadata(chat))?.subject || chat } catch { name = chat }
      groupNames.set(gk, { name, at: Date.now() })
    }
    return `${accountLine}Group: ${name}\nSender: ${sender}`
  }
  return `${accountLine}DM: ${sender}`
}

async function sendInbox(source, content) {
  const destinationId = destinationIdFor()
  const dest = destinationAccount()
  if (!dest?.enabled) throw new Error(`Destination Account ${destinationId} is not configured`)
  if (dest.connected && dest.sock) {
    try { return await dest.sock.sendMessage(selfJid(dest), content) }
    catch (e) {
      if (!source?.connected || !source.sock || source.id === dest.id) throw e
    }
  }
  if (source?.connected && source.sock) return source.sock.sendMessage(selfJid(dest), content)
  throw new Error('Destination is offline')
}

async function onDelete(account, updates) {
  if (!settings.antiDelete) return
  for (const u of updates || []) {
    if (u?.update?.messageStubType !== WAMessageStubType.REVOKE || u?.update?.message !== null) continue
    const original = findCached(account.id, u.key, u.key?.remoteJid)
    if (!original) continue
    const dk = `${account.id}|${u.key?.remoteJid}|${u.key?.id}`
    if (handledDelete.has(dk)) continue
    try {
      await sendInbox(account, { text: `🗑️ Deleted message recovered\n${await describe(account, original)}` })
      await sendInbox(account, { forward: unlocked(original) || original, force: true })
      handledDelete.set(dk, Date.now())
      await recordActivity('cc.deleted-recovery', {
        sourceAccount: account.id,
        destinationAccount: destinationIdFor(),
      })
    } catch (e) { console.error(`[${account.id}] delete recovery:`, e?.message || e) }
  }
}

const acceptInboundCommand = createInboundMessageGuard({
  claim:(accountId, msg, now) => !sharedStorage || sharedStorage.claimInboundMessage({
    accountId,
    chatJid:msg.key.remoteJid,
    messageId:msg.key.id,
    now,
  }),
})

const messageScheduler = createMessageScheduler({
  process:processInboundMessage,
  textOf:msg => commandText(msg?.message),
  prefix:() => settings.publicPrefix || DEFAULT_PUBLIC_PREFIX,
})

async function onMessages(account, { messages, type }) {
  // Baileys 'append' events are chat-history/reconnect replay, not fresh
  // commands. Processing them here can resend stickers or lyrics minutes
  // after an earlier reply, particularly after a deployment restart.
  if (type === 'append') return
  await messageScheduler.submitBatch(account, messages)
}

async function processInboundMessage(account, msg) {
    const probe = createCommandTiming({
      accountId:account.id,
      text:commandText(msg?.message),
      prefix:settings.publicPrefix || DEFAULT_PUBLIC_PREFIX,
      thresholdMs:Number(process.env.MSCC_SLOW_COMMAND_MS || 2000),
    })
    try {
      if (!msg?.message || !msg?.key?.id) return

      // Preserve bot-authored messages for quoting / chat context only.
      // NEVER interpret our own replies as commands or pending choices:
      // replying "I could not match that choice" used to feed itself
      // indefinitely until WhatsApp received hundreds of bot messages.
      if (msg.key.fromMe === true) {
        remember(account, msg)
        rememberConversation(account, msg)
        return
      }
      // Replayed/duplicated Baileys upserts must not execute a choice twice.
      const inboundChat = normalizeJid(msg.key.remoteJid)
      const channelPost = isChannelJid(inboundChat)
      // Channels must be rejected BEFORE identity resolution, command dispatch,
      // reactions, moderation and data retention. Missing DB/config = OFF.
      if (channelPost && !channelAiAllowed(sharedStorage, inboundChat, account.id)) return
      if (!acceptInboundCommand(account.id, msg)) return

      if (channelPost) {
        const channelText = commandText(msg.message)
        // Channel AI is conversation-only, never command execution.
        if (!channelText || channelText.trim().startsWith(settings.publicPrefix || DEFAULT_PUBLIC_PREFIX)) return
        await handleProfileAssistant(account, msg, { senderNumber:'', senderKey:'' }, channelText)
        return
      }

      // Handle reaction joins immediately, before any command/identity/network work.
      // Some Baileys forks deliver them as upserts instead of messages.reaction.
      const incomingReaction = normalizedContent(msg.message)?.reactionMessage
      if (incomingReaction) {
        await squidGame.onReaction(account, {
          key:incomingReaction.key,
          reaction:{ ...incomingReaction, key:msg.key },
        })
        return
      }

      const chat = normalizeJid(msg.key.remoteJid)
      const text = commandText(msg.message)
      const authority = await authorityContext(account, msg)
      const controller = authority.isSupremeOwner
      const privateControl = await isPrivateControlContext(account, msg, authority)
      probe?.mark('identity')

      remember(account, msg)
      rememberConversation(account, msg, authority)
      probe?.mark('storage')
      // A channel link sent privately is intentionally silent. The sender
      // must explicitly request .joinchannel and approve Yes before following.
      if (recordPendingChannelLink(sharedStorage, account.id, authority.senderKey, chat, text)) return

      // Squid Game uses ordinary WhatsApp messages and reaction registration,
      // not the public command namespace. Consume player messages before AI,
      // moderation replies or any other interactive game responds.
      if (await squidGame.onMessage(account, msg)) return

      const publicPrefix = settings.publicPrefix || DEFAULT_PUBLIC_PREFIX

      const moderation = await enforceCurrentGroupPolicy(account, msg, authority)
      if (moderation.handled) return

      await handleAfkGroupMessage(account, msg, authority, text)
      probe?.mark('moderation')

      const ui = commandUi(account, msg, publicPrefix)
      const trackSend = task => probe ? probe.send(task) : task()
      const pendingReply = readCommandReplySession(account, msg, authority)
      const isExplicitCommand = Boolean(publicPrefix && String(text || '').trim().startsWith(publicPrefix))
      const ludoRecord = sharedStorage?.sharedGet('ludo-game', chat) || null
      const consumeLudoInput = Boolean(
        !isExplicitCommand &&
        ludoRecordAcceptsInput(ludoRecord, userForStoredGame({ userKey:authority.senderKey, identityKeys:authority.senderIdentityKeys }, ludoRecord), text)
      )
      const checkersRecord = sharedStorage?.sharedGet('checkers-game', chat) || null
      const consumeCheckersInput = Boolean(
        !isExplicitCommand &&
        !consumeLudoInput &&
        checkersRecordAcceptsInput(checkersRecord, userForStoredGame({ userKey:authority.senderKey, identityKeys:authority.senderIdentityKeys }, checkersRecord), text)
      )
      const ticTacToeRecord = sharedStorage?.sharedGet('tictactoe-game', chat) || null
      const consumeTicTacToeInput = Boolean(
        !isExplicitCommand &&
        !consumeLudoInput &&
        !consumeCheckersInput &&
        ticTacToeRecordAcceptsInput(ticTacToeRecord, userForStoredGame({ userKey:authority.senderKey, identityKeys:authority.senderIdentityKeys }, ticTacToeRecord), text)
      )
      const chessRecord = sharedStorage?.sharedGet('chess-game', chat) || null
      const consumeChessInput = Boolean(
        !isExplicitCommand &&
        !consumeLudoInput &&
        !consumeCheckersInput &&
        !consumeTicTacToeInput &&
        chessRecordAcceptsInput(chessRecord, userForStoredGame({ userKey:authority.senderKey, identityKeys:authority.senderIdentityKeys }, chessRecord), text)
      )
      const consumeWordChainInput = Boolean(
        !isExplicitCommand && !consumeLudoInput && !consumeCheckersInput &&
        !consumeTicTacToeInput && !consumeChessInput &&
        wordChainInputDestination({
          shared: { get: (namespace, key) => sharedStorage?.sharedGet(namespace, key) },
          accountId: account.id, chat, text, userKey:authority.senderKey,
        })
      )
      const consumePartyInput = !isExplicitCommand && !consumeWordChainInput &&
        !consumeLudoInput && !consumeCheckersInput &&
        !consumeTicTacToeInput && !consumeChessInput &&
        partyInputDestination({
          shared: { get: (namespace, key) => sharedStorage?.sharedGet(namespace, key) },
          accountId: account.id, chat, text,
        })

      const consumePendingReply = Boolean(
        !isExplicitCommand &&
        !consumeLudoInput &&
        !consumeCheckersInput &&
        !consumeTicTacToeInput &&
        !consumeChessInput &&
        !consumePartyInput && !consumeWordChainInput &&
        pendingReply?.command &&
        (
          (pendingReply?.kind === 'number-selection' && looksLikeNumberSelection(text)) ||
          (pendingReply?.kind === 'album-selection' && (
            looksLikeNumberSelection(text) ||
            String(text || '').trim().toLowerCase() === 'all'
          )) ||
          (pendingReply?.kind === 'choice-selection' &&
             matchesDisplayedChoice(text, pendingReply.entries))
        )
      )

      const dispatchText = consumeLudoInput
        ? `${publicPrefix}ludo ~input`
        : consumeCheckersInput
          ? `${publicPrefix}checkers ~input`
          : consumeTicTacToeInput
            ? `${publicPrefix}ttt ~input`
            : consumeChessInput
              ? `${publicPrefix}chess ~input`
              : consumeWordChainInput
              ? `${publicPrefix}wordchain ~input`
              : consumePartyInput
                ? `${publicPrefix}${consumePartyInput} ~input`
                : consumePendingReply
                ? pendingReply.kind === 'album-selection'
                  ? `${publicPrefix}${pendingReply.command} ~selection`
                  : pendingReply.kind === 'choice-selection'
                    ? `${publicPrefix}${pendingReply.command} ~choice`
                    : `${publicPrefix}${pendingReply.command} ~numbers`
                : text

      const commandHandled = await dispatchNamespacedCommand({
        privateRegistry: privateCommandRegistry,
        publicRegistry: publicCommandRegistry,
        rawText: dispatchText,
        context: {
          account,
          squidGame,
          reactionSounds,
          message: msg,
          controller,
          privateControl,
          isSupremeOwner: authority.isSupremeOwner,
          isSudo: authority.isSudo,
          isPublicOwner: authority.isPublicOwner,
          isSessionOwner: authority.isSessionOwner,
          isGroupAdmin: () => isGroupAdminContext(account, msg),
          isBotGroupAdmin: () => isBotGroupAdminContext(account, msg),
          deleteRecentMessages: count => deleteRecentMessages(account, msg, count),
          deleteRepliedMessage: () => deleteRepliedMessage(account, msg),
          groupParticipantAction: (raw, action) => groupParticipantAction(account, msg, raw, action),
          groupSetAnnouncement: closed => setGroupAnnouncement(account, msg, closed),
          groupScheduleStorage: sharedStorage,
          groupInviteLink: () => groupInviteLink(account, msg),
          groupHiddenTag: text => hiddenTag(account, msg, text),
          groupStatusSnapshot: () => groupStatusSnapshot(account, msg),
          groupPolicyGet: () => groupPolicy(sharedStorage, chat),
          groupPolicySet: patch => setGroupPolicy(sharedStorage, chat, patch),
          afkSet: reason => setAfk(sharedStorage, chat, authority.senderKey, {
            reason,
            displayName:String(msg?.pushName || '').trim(),
          }),
          afkGet: () => getAfk(sharedStorage, chat, authority.senderKey),
          afkClear: () => clearAfk(sharedStorage, chat, authority.senderKey),
          groupWarn: async (raw, reason = '') => {
            const target = await resolveGroupParticipant(account, msg, raw)
            if (!target) throw new Error('Mention somebody or reply to their message.')
            reconcileVerifiedWarnings(sharedStorage, chat, target.memberKey, target.identityKeys)
            return { target, state:addWarning(sharedStorage, chat, target.memberKey, reason, authority.senderKey) }
          },
          groupWarnClear: async raw => {
            const target = await resolveGroupParticipant(account, msg, raw)
            if (!target) throw new Error('Mention somebody or reply to their message.')
            reconcileVerifiedWarnings(sharedStorage, chat, target.memberKey, target.identityKeys)
            return { target, cleared:clearWarnings(sharedStorage, chat, target.memberKey) }
          },
          groupWarningState: async raw => {
            const target = await resolveGroupParticipant(account, msg, raw)
            if (!target) throw new Error('Mention somebody or reply to their message.')
            reconcileVerifiedWarnings(sharedStorage, chat, target.memberKey, target.identityKeys)
            return { target, state:warningState(sharedStorage, chat, target.memberKey) }
          },
          setMentionMute: async (raw, enabled) => {
            const target = await resolveGroupParticipant(account, msg, raw)
            if (!target) throw new Error('Mention somebody or reply to their message.')
            if (!authority.senderNumber) throw new Error('WhatsApp has not verified your phone identity yet. Please retry.')
            if (target.phoneNumber === authority.senderNumber) throw new Error('Choose somebody else.')
            if (!target.phoneNumber) throw new Error('WhatsApp has not shared a phone identity for that member, so mention muting cannot be saved reliably.')
            setUserMentionMute(sharedStorage, chat, authority.senderNumber, target.phoneNumber, enabled)
            return target
          },
          shouldExecutePublicCommand: command => shouldExecutePublicCommand(account, msg, command),
          settings,
          publicPrefix,
          rawCommandText:text,
          commandReplyInput: (consumePendingReply || consumeLudoInput || consumeCheckersInput || consumeTicTacToeInput || consumeChessInput || consumePartyInput || consumeWordChainInput) ? String(text || '').trim() : '',
          getCommandReplySession: () => readCommandReplySession(account, msg, authority),
          setCommandReplySession: session => writeCommandReplySession(account, msg, authority, session),
          clearCommandReplySession: () => writeCommandReplySession(account, msg, authority, null),
          publicCommandsEnabled: settings.publicCommandsEnabled !== false,
          botProfile: sharedStorage?.profileForAccount(account.id) || { id:'unassigned', displayName:'Unassigned', universal:false, basePriority:0 },
          userKey: authority.senderKey || '',
          userPhone: authority.senderNumber || '',
          identityKeys: authority.senderIdentityKeys || [],
          nightPlayLink: code => nightPlay.linkFromWhatsApp({ code, userKey:authority.senderKey, identityKeys:authority.senderIdentityKeys, displayName:msg.pushName }),
          nightPlayProfile: () => nightPlay.linkedProfile({ userKey:authority.senderKey, identityKeys:authority.senderIdentityKeys }),
          nightPlayUnlink: () => nightPlay.disconnectWhatsApp({ userKey:authority.senderKey, identityKeys:authority.senderIdentityKeys }),
          // Channel onboarding is scoped to the WhatsApp sender's verified
          // NIGHT Play identity; no unverified channel is exposed to the site.
          channelRecentLink: () => pendingChannelLink(sharedStorage, account.id, authority.senderKey),
          channelBegin: link => nightPlay.channels.begin({ userKey:authority.senderKey, identityKeys:authority.senderIdentityKeys }, account, link),
          channelAccept: () => nightPlay.channels.accept({ userKey:authority.senderKey, identityKeys:authority.senderIdentityKeys }, account),
          channelCancel: () => nightPlay.channels.cancel({ userKey:authority.senderKey, identityKeys:authority.senderIdentityKeys }),
          channelVerify: () => nightPlay.channels.verify({ userKey:authority.senderKey, identityKeys:authority.senderIdentityKeys }, accounts),
          channelList: () => nightPlay.channels.list(nightPlay.channels.owner({ userKey:authority.senderKey, identityKeys:authority.senderIdentityKeys })),
          channelAiGet: jid => channelAiSetting(sharedStorage, jid),
          channelAiSet: (jid, enabled, accountId) => setChannelAiSetting(sharedStorage, jid, { enabled, accountId }),
          groupKey: isGroup(chat) ? chat : '',
          activityUserKey:activitySenderKey(authority.senderJid),
          getGroupActivity:period => isGroup(chat)
            ? activityReport(sharedStorage, chat, { period })
            : null,
          shared: {
            get: (namespace, key) => sharedStorage?.sharedGet(namespace, key) ?? null,
            set: (namespace, key, value) => sharedStorage?.sharedSet(namespace, key, value),
            delete: (namespace, key) => sharedStorage?.sharedDelete(namespace, key) || 0,
          },
          reply: value => trackSend(() => sendCommandReply(account, msg, value)),
          replyWithMentions: async (value, mentions = []) => account.sock.sendMessage(chat, {
            text:String(value ?? ''),
            mentions:[...new Set(mentions.map(normalizeJid).filter(Boolean))],
          }, { quoted:msg }),
          ui,
          replyList: options => trackSend(() => ui.singleSelect(options)),
          replySelectors: options => trackSend(() => ui.native(options)),
          replyInstant: options => trackSend(() => ui.instantReplies(options)),
          replyInteractive: options => trackSend(() => ui.interactive(options)),
          progress: initial => startProgress(account.sock, chat, initial, { quoted:msg }),
          scheduleAdd: ({ kind = 'reminder', text = '', dueAt, meta = {} }) => addScheduledTask(sharedStorage, {
            userKey:authority.senderNumber || (() => { throw new Error('Reminders require a verified WhatsApp phone identity.') })(),
            kind,
            text,
            dueAt,
            meta,
          }),
          scheduleList: () => listScheduledTasks(sharedStorage, authority.senderNumber),
          scheduleRemove: id => removeScheduledTask(sharedStorage, authority.senderNumber, id),
          parseDuration,
          formatDue,
          sendPoll: async ({ question, options, selectableCount = 1 }) => account.sock.sendMessage(chat, {
            poll:{
              name:String(question || '').trim(),
              values:(options || []).map(value => String(value || '').trim()).filter(Boolean).slice(0, 12),
              selectableCount:Math.max(1, Math.min(Number(selectableCount) || 1, (options || []).length || 1)),
            },
          }, { quoted:msg }),
          smartComplete: options => smartAI.complete(options),
          latestRelease: (query, type = '') => resolveLatestRelease(query, type),
          currentChatLabel: async () => {
            if (!isGroup(chat)) return 'DM'
            const metadata = await groupMetadataCached(account, chat)
            return String(metadata?.subject || 'Group')
          },
          summarizeGroup: async hours => {
            const assistant = assistantForAccount(account)
            if (!assistant || !isGroup(chat)) return { ok:false, text:'This one is for groups.' }
            return assistant.summarize({
              chatJid:chat,
              hours,
              groupName:await assistantGroupName(account, chat),
            })
          },
          sendImageDataUrl: async (dataUrl, caption) => sendCommandImageDataUrl(account, msg, dataUrl, caption),
          sendImageFile: (file, caption) => trackSend(() => sendCommandImageFile(account, msg, file, caption)),
          sendImageUrl: async (url, caption = '') => account.sock.sendMessage(chat, {
            image:{ url:String(url || '') },
            caption:String(caption || ''),
          }, { quoted:msg }),
          resolveCommandTarget: raw => resolveCommandTarget(account, msg, raw),
          resolveSocialMentionName: jid => resolveSocialMentionName(account, msg, jid),
          getPublicUserProfile: phoneNumber => publicUserProfile(account, msg, phoneNumber),
          resolveAccountId,
          createAccount,
          renameAccount,
          pairAccount,
          repairAccount,
          reconnectAccount,
          disconnectAccount,
          removeAccount,
          preparePairTarget: args => preparePairTarget(account, msg, args),
          waitForPairing,
          setSetting,
          setPublicPrefix,
          setDestination,
          reloadCommands,
          reloadCommandsDetailed,
          reloadModule,
          reloadSettings: () => reloadSettings(false),
          activity,
          botProfiles: () => sharedStorage?.listProfiles() || [],
          botAssignments: () => sharedStorage?.assignments() || [],
          createBotProfile: (id, name) => sharedStorage.createProfile(id, name),
          assignBotProfile: (accountId, profileId) => sharedStorage.assignProfile(accountId, profileId),
          setBotCapability: (profileId, capability, priority) => sharedStorage.setCapability(profileId, capability, priority),
          setBotSpecialty: (profileId, capability, enabled) => sharedStorage.setSpecialty(profileId, capability, enabled),
          setBotProfileMode: (profileId, universal) => sharedStorage.setProfileMode(profileId, universal),
          groupRoutes: group => sharedStorage?.listGroupRoutes(group) || [],
          resetGroupRoutes: group => sharedStorage?.clearGroupRoutes(group) || 0,
          storageStats: () => sharedStorage?.stats() || { messages:0, profiles:0, routes:0, sharedItems:0, sourceDefaults:0, deliveryDefaults:0 },
          listSources: capability => sourceRegistry?.list(capability) || [],
          sourceMode: capability => sourceRegistry?.mode(capability) || 'user-choice',
          getSourceDefault: capability => sourceRegistry?.getDefault(authority.senderKey, capability) || '',
          setSourceDefault: (capability, sourceId) => sourceRegistry.setDefault(authority.senderKey, capability, sourceId),
          clearSourceDefault: capability => sourceRegistry?.clearDefault(authority.senderKey, capability) || 0,
          getDeliveryDefault: capability => sharedStorage?.getDeliveryDefault(authority.senderKey, capability) || null,
          setDeliveryDefault: (capability, quality, delivery) => sharedStorage.setDeliveryDefault(authority.senderKey, capability, quality, delivery),
          clearDeliveryDefault: capability => sharedStorage?.clearDeliveryDefault(authority.senderKey, capability) || 0,
          sourceBrand: capability => sharedStorage?.brandForCapability(capability) || 'Main',
          appVersion:APP_VERSION,
          broadcastNight: text => broadcastNightGroups(account, text),
          sudoList: () => publicSudoNumbers(),
          sudoSet: (raw, enabled) => setPublicSudoTarget(account, msg, raw, enabled),
          ownerContact: () => {
            const main = accountRegistry.main()
            const phoneNumber = digits(main?.phoneNumber || OWNER_NUMBER)
            const displayName = String(
              process.env.OWNER_NAME ||
              process.env.BOT_OWNER ||
              main?.displayName ||
              'Owner'
            ).trim().slice(0, 64) || 'Owner'
            return { phoneNumber, displayName }
          },
          libraryGet: itemKey => sharedStorage?.getLibraryItem(authority.senderKey, itemKey) || null,
          libraryBySlot: slot => sharedStorage?.libraryItemBySlot(authority.senderKey, slot) || null,
          libraryList: mediaType => sharedStorage?.listLibraryItems(authority.senderKey, mediaType) || [],
          libraryPut: item => sharedStorage?.putLibraryItem(authority.senderKey, item) || null,
          libraryRemove: itemKey => sharedStorage?.removeLibraryItem(authority.senderKey, itemKey) || 0,
          librarySetWatch: (itemKey, enabled) => sharedStorage?.setLibraryWatch(authority.senderKey, itemKey, enabled) || null,
          libraryPrimeWatch: item => releaseWatcher?.prime(item) || Promise.resolve({ ok:false, reason:'unavailable' }),
          resolveAnimeTitles: query => aniListResolver.resolve(query, 'ANIME'),
          resolveAniListTitles: (query, type = 'ANIME') => aniListResolver.resolve(query, type),
          resolveAniListMedia: (id, type = 'ANIME') => aniListResolver.getMedia(id, type),
          resolveTmdbTitles: (query, type = 'movie') => tmdbResolver.search(query, type),
          browseTmdbMedia: (type = 'movie') => tmdbResolver.browse(type),
          resolveTmdbMedia: (id, type = 'movie') => tmdbResolver.details(id, type),
          resolveTmdbSeason: (id, seasonNumber) => tmdbResolver.seasonDetails(id, seasonNumber),
          resolveBookScreens: input => adaptationResolver.bookToScreen(input),
          resolveScreenBooks: input => adaptationResolver.screenToBooks(input),
          resolveScreenCounterparts: input => adaptationResolver.screenCounterparts(input),
          executeSource: ({ capability, explicitSource = '', pinnedSource = '', excludedSources = [], payload = {} }) => sourceRegistry.execute({
            capability,
            userKey: authority.senderKey,
          explicitSource,
            pinnedSource,
            excludedSources,
            payload,
            context: {
              accountId: account.id,
              chat,
              userKey: authority.senderKey,
              reply: value => sendCommandReply(account, msg, value),
              ui,
              replyList: options => trackSend(() => ui.singleSelect(options)),
              replySelectors: options => trackSend(() => ui.native(options)),
              resolveTmdbTitles: (query, type = 'movie') => tmdbResolver.search(query, type),
              browseTmdbMedia: (type = 'movie') => tmdbResolver.browse(type),
              resolveTmdbMedia: (id, type = 'movie') => tmdbResolver.details(id, type),
              resolveTmdbSeason: (id, seasonNumber) => tmdbResolver.seasonDetails(id, seasonNumber),
              progress: initial => startProgress(account.sock, chat, initial, { quoted:msg }),
              send: async payload => account.sock.sendMessage(
                chat,
                await prepareCommandMediaPayload(payload),
                { quoted:msg },
              ),
            },
          }),
          requestRestart,
          statusText,
          diagnostics: commandDiagnostics,
        },
      })
      probe?.mark('command')
      if (commandHandled) return

      // If the user is asking about a pending music choice, give grounded
      // command feedback. A personality must never claim that a non-existent
      // audio attachment was sent or invent a recording.
      const musicGuidance = musicFollowupReply(text, pendingReply, { prefix:publicPrefix })
      if (musicGuidance) {
        await sendCommandReply(account, msg, musicGuidance)
        return
      }

      if (await handleProfileAssistant(account, msg, authority, text)) return

      const vo = !msg.key.fromMe && futureproof(msg.message)

      if (settings.autoCc && vo) {
        const ak = cacheKey(account.id, msg)
        if (!handledAuto.has(ak)) {
          if (account.id !== destinationIdFor()) await sendInbox(account, { text: `📥 Auto CC\n${await describe(account, msg)}` })
          await sendInbox(account, { forward: unlocked(msg), force: true })
          handledAuto.set(ak, Date.now())
          await recordActivity('cc.forwarded', {
            sourceAccount: account.id,
            destinationAccount: destinationIdFor(),
            mode: 'auto',
          })
        }
      }

      if (!settings.replyCc) return
      const ctx = contextInfo(msg.message)
      if (!ctx?.stanzaId) return
      const rk = `${account.id}|${msg.key.id}`
      if (handledReply.has(rk)) return

      const quoted = quotedMessage(msg, ctx, chat)
      let source = quoted && futureproof(quoted.message) ? quoted : null
      if (!source) {
        const c = findCached(account.id, {
          id: ctx.stanzaId,
          remoteJid: ctx.remoteJid || chat,
          participant: ctx.participant
        }, chat)
        if (c && futureproof(c.message)) source = c
      }
      if (!source) return

      if (!controller || account.id !== destinationIdFor()) {
        await sendInbox(account, { text: `↩️ V1 reply detected\n${await describe(account, msg)}` })
      }
      await sendInbox(account, { forward: unlocked(source), force: true })
      handledReply.set(rk, Date.now())
      await recordActivity('cc.forwarded', {
        sourceAccount: account.id,
        destinationAccount: destinationIdFor(),
        mode: 'reply',
      })
    } catch (e) {
      console.error(`[${account.id}] message error:`, e?.message || e)
    } finally {
      probe?.finish()
    }
}

const statusOf = sessionStatus

async function closeAccount(a) {
  clearTimeout(a.reconnectTimer)
  a.reconnectTimer = null
  a.nextReconnectAt = 0
  a.pairingRequested = false
  a.generation++
  const old = a.sock
  a.sock = null
  a.connected = false
  try { old?.ws?.close?.() } catch {}
  await new Promise(r => setTimeout(r, 120))
  await a.credSave
  await a.authFlush?.()
  a.authFlush = null
  a.authKeys = null
}

async function makePairOutput(account) {
  if (!account.lastQr || !account.sock || account.connected || account.registered) return
  const generation = account.generation
  const socket = account.sock
  const stillCurrent = () => account.generation === generation && account.sock === socket && !account.connected
  if (account.pairingMode === 'qr') {
    try {
      const qr = await QRCode.toDataURL(account.lastQr, { width: 340, margin: 1 })
      if (!stillCurrent() || account.pairingMode !== 'qr') return
      account.pairingQr = qr
      account.pairingCode = ''
      account.pairingError = ''
    } catch (e) { if (stillCurrent()) account.pairingError = e?.message || String(e) }
    return
  }
  if (account.pairingMode !== 'code' || account.pairingRequested) return
  account.pairingRequested = true
  try {
    const code = await socket.requestPairingCode(account.number)
    if (!stillCurrent() || account.pairingMode !== 'code') return
    account.pairingCode = code?.match(/.{1,4}/g)?.join('-') || code || ''
    account.pairingQr = ''
    account.pairingError = ''
    account.lastCodeAt = Date.now()
    console.log(`[${account.id}] pairing code ready (code value withheld from logs)`)
  } catch (e) {
    if (stillCurrent()) account.pairingError = e?.message || String(e)
  } finally { if (stillCurrent()) account.pairingRequested = false }
}

function scheduleAccountReconnect(account, generation, delayMs) {
  if (!canStartScheduledReconnect(account, generation)) return
  clearTimeout(account.reconnectTimer)
  const wait = Math.max(0, Number(delayMs) || 0)
  account.nextReconnectAt = Date.now() + wait
  recordActivity('account.reconnect-scheduled', {
    account: account.id,
    attempt: account.reconnectAttempts,
    delayMs: wait,
  }).catch(() => {})
  const timer = setTimeout(() => {
    // Ignore a superseded timer and clear elapsed retry status before guards.
    if (account.reconnectTimer !== timer) return
    account.reconnectTimer = null
    account.nextReconnectAt = 0
    if (!canStartScheduledReconnect(account, generation)) return
    // Manual reconnect / repair / pause operations already use runOp.
    // A timer must join that queue or two sockets can load and mutate the
    // same Signal key store concurrently (causing replaced sessions / Bad MAC).
    runOp(account, async () => {
      if (!canStartScheduledReconnect(account, generation)) return
      await startAccountSafely(account, 'reconnect')
    }).catch(error => {
      console.error(`[${account.id}] reconnect recovery:`, error?.message || error)
    })
  }, wait)
  account.reconnectTimer = timer
  account.reconnectTimer.unref?.()
}

async function startAccountSafely(account, source = 'startup') {
  try {
    await startAccount(account)
  } catch (error) {
    if (account.paused || account.invalid) return
    account.disconnectReason = `${source} failed: ${error?.message || String(error)}`
    console.error(`[${account.id}] ${source}:`, error?.message || error)
    account.reconnectAttempts += 1
    recordActivity('account.reconnect-failed', {
      account: account.id,
      attempt: account.reconnectAttempts,
    }).catch(() => {})
    scheduleAccountReconnect(account, account.generation, reconnectDelay(account.reconnectAttempts))
  }
}

async function startAccount(account) {
  if (!account.enabled || account.invalid || account.paused || account.sock) return
  const generation = ++account.generation
  // A close can schedule a retry while the previous socket's creds.update
  // writes are still pending. Never reload partially saved auth state.
  await account.credSave
  await account.authFlush?.()
  if (generation !== account.generation || !account.enabled ||
      account.invalid || account.paused || account.sock) return
  const { state, saveCreds, flush } = await useDurableMultiFileAuthState(account.authDir)
  // A disconnect/remove request can happen while auth is loading.
  // Do not create a ghost socket for an obsolete generation.
  if (generation !== account.generation || !account.enabled ||
      account.invalid || account.paused || account.sock) return
  account.authFlush = flush
  account.authKeys = state.keys
  account.registered = Boolean(state.creds.registered)
  account.nextReconnectAt = 0

  const options = createAccountSocketOptions({
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    browser: Browsers.macOS('Chrome'),
    getMessage: async key => findCached(account.id, key, key?.remoteJid)?.message,
    version: waVersion,
  })

  const sock = makeWASocket(options)
  account.sock = sock
  account.connected = false

  sock.ev.on('creds.update', () => {
    if (generation !== account.generation) return
    account.credSave = account.credSave
      .catch(() => {})
      .then(saveCreds)
      .catch(error => console.error(`[${account.id}] credential save:`, error?.message || error))
  })
  sock.ev.on('messages.upsert', upsert => { if (generation === account.generation) onMessages(account, upsert) })
  sock.ev.on('messages.reaction', reactions => {
    if (generation !== account.generation) return
    for (const reaction of reactions || []) {
      squidGame.onReaction(account, reaction).catch(error =>
        console.error(`[${account.id}] Squid Game reaction:`, error?.message || error))
    }
  })
  sock.ev.on('messages.update', updates => { if (generation === account.generation) onDelete(account, updates) })
  sock.ev.on('groups.update', updates => {
    if (generation !== account.generation) return
    for (const update of updates || []) invalidateGroupMetadata(account.id, update?.id)
  })
  sock.ev.on('group-participants.update', update => {
    if (generation !== account.generation) return
    invalidateGroupMetadata(account.id, update?.id)
    handleProfileGroupIntro(account, update).catch(error => {
      console.error(`[${account.id}] group intro:`, error?.message || error)
    })
  })
  sock.ev.on('connection.update', async update => {
    if (generation !== account.generation || sock !== account.sock) return
    if (!state.creds.registered && update.qr) {
      account.lastQr = update.qr
      await makePairOutput(account)
      return
    }
    if (update.connection === 'open') {
      const authenticatedNumber = jidPhoneNumber(sock.user?.id)
      if (authenticatedNumber && account.number && authenticatedNumber !== account.number) {
        account.invalid = true
        account.pairingMode = ''
        account.pairingError = `Authenticated WhatsApp account ${masked(authenticatedNumber)} does not match configured ${masked(account.number)}. Use Re-pair.`
        await recordActivity('account.identity-mismatch', {
          account: account.id,
          displayName: account.displayName,
          expectedNumberMasked: masked(account.number),
          authenticatedNumberMasked: masked(authenticatedNumber),
        })
        await closeAccount(account)
        return
      }
      account.connected = true
      invalidateGroupMetadata(account.id)
      account.registered = true
      account.invalid = false
      account.reconnectAttempts = 0
      account.ambiguous500Attempts = 0
      account.lastConnectedAt = Date.now()
      account.lastDisconnectCode = null
      account.disconnectReason = ''
      account.nextReconnectAt = 0
      account.pairingMode = ''
      account.pairingCode = ''
      account.pairingQr = ''
      account.pairingError = ''
      account.lastQr = ''
      console.log(`[${account.id}] connected as ${sock.user?.id || account.number}`)
      await recordActivity('account.connected', {
        account: account.id,
        displayName: account.displayName,
      })
      return
    }
    if (update.connection !== 'close') return
    account.connected = false
    invalidateGroupMetadata(account.id)
    account.sock = null
    const error = update.lastDisconnect?.error
    const rawCode = error?.output?.statusCode
    const code = rawCode == null || !Number.isFinite(Number(rawCode)) ? null : Number(rawCode)
    // A 500 is Baileys' badSession code, but not always proof of revoked
    // credentials. Bound probes PER ACCOUNT and keep Main/Josia independent.
    const policy = classifyDisconnect(code, error, account.ambiguous500Attempts)
    if (code === DisconnectReason.badSession && policy.action === 'reconnect') {
      account.ambiguous500Attempts += 1
    } else if (code !== DisconnectReason.badSession) {
      account.ambiguous500Attempts = 0
    }
    account.lastDisconnectedAt = Date.now()
    account.lastDisconnectCode = code
    account.disconnectReason = policy.message || (policy.action === 'reconnect' ? 'Connection dropped. Retrying automatically.' : 'Connection closed.')
    account.pairingCode = ''
    account.pairingQr = ''
    account.lastQr = ''
    await recordActivity('account.disconnected', {
      account: account.id,
      displayName: account.displayName,
      reasonCode: code ?? null,
      origin: disconnectOrigin(update.lastDisconnect?.error),
      protocolDetail: disconnectProtocolDetail(update.lastDisconnect?.error),
    })
    if (policy.action === 'repair') {
      account.invalid = true
      account.pairingMode = ''
      account.pairingError = policy.message
      return
    }
    if (policy.action === 'halt') {
      account.pairingMode = ''
      account.pairingError = policy.message
      return
    }
    account.reconnectAttempts += 1
    const delayMs = policy.delayMs ?? reconnectDelay(account.reconnectAttempts)
    scheduleAccountReconnect(account, generation, delayMs)
  })
}

function requireAccount(id) {
  const resolved = resolveAccountId(id)
  const a = resolved ? accounts.get(resolved) : null
  if (!a?.enabled) throw new Error(`Account ${id} is not configured`)
  return a
}

function accountIdByPhone(phoneNumber) {
  const number = digits(phoneNumber)
  for (const account of accounts.values()) if (account.number === number) return account.id
  return ''
}

async function preparePairTarget(account, msg, args = []) {
  const first = String(args?.[0] || '').trim()
  const existingById = first ? resolveAccountId(first) : ''
  if (existingById) return { id: existingById, created: false }

  const target = await resolveCommandTarget(account, msg, first)
  if (!target.phoneNumber) throw new Error('Specify an account ID or phone number, mention somebody, or reply to their message.')
  const existingByPhone = accountIdByPhone(target.phoneNumber)
  if (existingByPhone) return { id: existingByPhone, created: false }

  const nameArgs = target.source === 'reply' ? args : args.slice(1)
  const created = await createAccount({ phoneNumber: target.phoneNumber, displayName: nameArgs.join(' ').trim() })
  return { id: created.account.id, created: true }
}

async function waitForPairing(id, timeoutMs = 15000) {
  const a = requireAccount(id)
  const deadline = Date.now() + Math.max(1000, Math.min(30000, Number(timeoutMs) || 15000))
  while (Date.now() < deadline) {
    if (a.connected || a.pairingError || a.pairingCode || a.pairingQr) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return { id:a.id, displayName:a.displayName || `Account ${a.id}`, connected:a.connected, mode:a.pairingMode, code:a.pairingCode, qr:a.pairingQr, error:a.pairingError }
}

async function pairAccount(id, mode) {
  const a = requireAccount(id)
  return runOp(a, async () => {
    if (a.connected) return { ok: true, message: `Account ${a.id} is already connected.` }
    if (a.registered || a.invalid) throw new Error(`Use Re-pair for Account ${a.id} because it already has saved auth.`)
    await accountRegistry.setPaused(a.id, false)
    a.paused = false
    await closeAccount(a)
    if (await pathExists(a.authDir)) await backupAuth(a)
    a.invalid = false
    a.registered = false
    a.reconnectAttempts = 0
    a.ambiguous500Attempts = 0
    a.pairingMode = mode === 'qr' ? 'qr' : 'code'
    a.pairingCode = ''
    a.pairingQr = ''
    a.pairingError = ''
    a.lastQr = ''
    await startAccount(a)
    await recordActivity('pairing.requested', { account: a.id, mode: a.pairingMode })
    return { ok: true, message: `Preparing ${a.pairingMode} pairing for Account ${a.id}.` }
  })
}

async function reconnectAccount(id) {
  const a = requireAccount(id)
  return runOp(a, async () => {
    if (a.invalid) throw new Error('Use Re-pair because the saved auth is invalid.')
    await accountRegistry.setPaused(a.id, false)
    a.paused = false
    await closeAccount(a)
    a.pairingMode = ''
    a.pairingCode = ''
    a.pairingQr = ''
    a.pairingError = ''
    a.reconnectAttempts = 0
    a.ambiguous500Attempts = 0
    await startAccount(a)
    await recordActivity('account.reconnect-requested', { account: a.id })
    return { ok: true }
  })
}

async function disconnectAccount(id) {
  const a = requireAccount(id)
  return runOp(a, async () => {
    await accountRegistry.setPaused(a.id, true)
    a.paused = true
    await closeAccount(a)
    a.pairingMode = ''
    a.pairingCode = ''
    a.pairingQr = ''
    a.pairingError = ''
    a.disconnectReason = 'Manually paused. Resume this account to reconnect.'
    a.lastDisconnectedAt = Date.now()
    await recordActivity('account.disconnected-manually', { account: a.id })
    return { ok: true, account: a.id, status: statusOf(a) }
  })
}

async function removeAccount(id) {
  const resolved = resolveAccountId(id)
  if (!resolved) throw new Error(`Unknown account: ${id}`)
  if (resolved === destination) throw new Error('Choose a different CC destination before removing this account')
  if (accounts.size <= 1) throw new Error('At least one WhatsApp account must remain')

  const a = accounts.get(resolved)
  if (a.role === 'owner') throw new Error('Account A is the permanent main control account and cannot be removed')
  await runOp(a, async () => closeAccount(a))
  const removed = await accountRegistry.remove(resolved)
  accounts.delete(resolved)
  sharedStorage?.clearAccount(resolved)
  invalidateGroupMetadata(resolved)

  destination = destinationIdFor()
  await saveSettings()
  await recordActivity('account.removed', {
    account: resolved,
    displayName: a.displayName,
    authPreserved: removed.authPreserved === true,
  })
  return { ok: true, account: resolved, authPreserved: removed.authPreserved === true }
}

async function repairAccount(id, mode = 'code') {
  const a = requireAccount(id)
  return runOp(a, async () => {
    await closeAccount(a)
    // Preserve old auth in a separate backup before creating a fresh pairing session.
    await backupAuth(a)
    await accountRegistry.setPaused(a.id, false)
    a.paused = false
    a.invalid = false
    a.registered = false
    a.reconnectAttempts = 0
    a.ambiguous500Attempts = 0
    a.pairingMode = mode === 'qr' ? 'qr' : 'code'
    a.pairingCode = ''
    a.pairingQr = ''
    a.pairingError = ''
    a.lastQr = ''
    await startAccount(a)
    await recordActivity('pairing.repair-requested', { account: a.id, mode: a.pairingMode })
    return { ok: true, message: `Account ${a.id} auth backed up. ${a.pairingMode === 'qr' ? 'QR' : 'Code'} pairing started.` }
  })
}

async function setSetting(key, value) {
  const defaults = commandSettingDefaults()
  if (!Object.prototype.hasOwnProperty.call(defaults, key)) {
    throw new Error(`Unknown command setting: ${key}`)
  }
  settings[key] = Boolean(value)
  await saveSettings()
  await recordActivity('configuration.changed', { key, value: Boolean(value) })
}

async function setPublicPrefix(value) {
  const prefix = validatePublicPrefix(value)
  settings.publicPrefix = prefix
  await saveSettings()
  await recordActivity('configuration.public-prefix-changed', { prefix })
  await writeRuntimeRegistry()
  return prefix
}

async function reloadCommandsDetailed() {
  const cacheBust = Date.now()
  const nextPrivate = await loadCommands(PRIVATE_COMMANDS_URL, { cacheBust })
  const nextPublic = await loadCommands(PUBLIC_COMMANDS_URL, { cacheBust, allowMissing: true, capabilityFromDirectory: true })
  const nextSources = sourceRegistry ? await sourceRegistry.load({ cacheBust }) : []
  privateCommandRegistry = nextPrivate
  publicCommandRegistry = nextPublic
  settings = mergeCommandSettings(settings, nextPrivate)
  await saveSettings()
  await writeCommandSettingsSchema()
  await writeRuntimeRegistry()
  const privateNames = nextPrivate.canonical.map(command => command.name).sort()
  const publicNames = nextPublic.canonical.map(command => command.name).sort()
  await recordActivity('command.registry-changed', { count:privateNames.length + publicNames.length, privateCount:privateNames.length, publicCount:publicNames.length })
  return { private:privateNames, public:publicNames, sources:nextSources.map(source => `${source.capability}:${source.id}`).sort() }
}

async function reloadCommands() {
  const result = await reloadCommandsDetailed()
  return [...result.private, ...result.public].sort()
}

async function setDestination(value) {
  const fixed = destinationIdFor()
  if (!fixed) throw new Error('Account A/main control account is not configured')
  const requested = resolveAccountId(value)
  if (requested && requested !== fixed) {
    throw new Error('CC destination is fixed to Account A/main control account')
  }
  destination = fixed
  await saveSettings()
  return destination
}

function uptime(ms) {
  const s = Math.floor(ms / 1000), d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60)
  return [d&&`${d}d`,(d||h)&&`${h}h`,(d||h||m)&&`${m}m`,`${s%60}s`].filter(Boolean).join(' ')
}

function commandDiagnostics() {
  return {
    version: APP_VERSION,
    destination: destinationIdFor(),
    indexLimit: MAX_CACHE,
    retentionHours: Math.round(TTL_MS / 3600000),
    waVersion: Array.isArray(waVersion) ? waVersion.join('.') : '',
    privateCommandCount: privateCommandRegistry.canonical.length,
    publicCommandCount: publicCommandRegistry.canonical.length,
    sourceCount: sourceRegistry?.listAll().length || 0,
    publicPrefix: settings.publicPrefix || DEFAULT_PUBLIC_PREFIX,
    publicCommandsEnabled: settings.publicCommandsEnabled !== false,
    accounts: [...accounts.values()].map(a => ({
      id: a.id,
      displayName: a.displayName,
      role: a.role,
      profile: sharedStorage?.profileForAccount(a.id)?.id || 'unassigned',
      enabled: a.enabled,
      connected: a.connected,
      paused: a.paused,
      registered: a.registered,
      status: statusOf(a),
      reconnectAttempts: a.reconnectAttempts,
      nextReconnectAt: a.nextReconnectAt || 0,
      lastConnectedAt: a.lastConnectedAt || 0,
      lastDisconnectedAt: a.lastDisconnectedAt || 0,
      lastDisconnectCode: a.lastDisconnectCode,
      disconnectReason: a.disconnectReason,
      numberMasked: masked(a.number),
      indexCount: countFor(a.id),
    })),
  }
}

async function statusText(ping = false) {
  const mem = process.memoryUsage()
  const fixedDestination = destinationIdFor()
  const accountLines = [...accounts.values()].map(account => {
    const name = account.displayName || `Account ${account.id}`
    const marker = account.id === fixedDestination ? ' • CC inbox' : ''
    const profile = sharedStorage?.profileForAccount(account.id)?.id || 'unassigned'
    return `${name} [${account.id}] • ${profile}: ${statusOf(account)} • ${countFor(account.id)}/${MAX_CACHE}${marker}`
  })
  return [
    ping ? '🏓 Night' : null,
    `Uptime: ${uptime(Date.now()-startedAt)}`,
    `CC inbox: ${accounts.get(fixedDestination)?.displayName || 'Account A'} [${fixedDestination || 'A'}]`,
    ...accountLines,
    `RAM RSS: ${(mem.rss/1048576).toFixed(1)} MB`,
    `Auto CC: ${settings.autoCc?'ON':'OFF'}`,
    `Reply CC: ${settings.replyCc?'ON':'OFF'}`,
    `Anti-delete: ${settings.antiDelete?'ON':'OFF'}`,
  ].filter(Boolean).join('\n')
}

async function webState() {
  const mem = process.memoryUsage()
  return {
    version: APP_VERSION,
    destination: destinationIdFor(),
    settings: { ...settings },
    capabilities: {
      addAccount: true,
      fixedCcDestination: true,
      changeCcDestination: false,
      perAccountCcOverride: false,
      botProfiles: true,
      specialistRouting: true,
      sharedDiskState: true,
    },
    botProfiles: sharedStorage?.listProfiles() || [],
    groupRoutes: sharedStorage?.listGroupRoutes() || [],
    sharedStorage: sharedStorage?.stats() || { messages:0, profiles:0, routes:0, sharedItems:0, sourceDefaults:0 },
    sources: sourceRegistry?.listAll().map(source => ({
      id: source.id,
      name: source.name,
      capability: source.capability,
      description: source.description,
    })) || [],
    entitlements: {
      maxAccounts: accountRegistry.maxAccounts,
    },
    accounts: [...accounts.values()].map(a => ({
      id: a.id,
      displayName: a.displayName,
      role: a.role,
      profile: sharedStorage?.profileForAccount(a.id)?.id || 'unassigned',
      enabled: a.enabled,
      connected: a.connected,
      paused: a.paused,
      registered: a.registered,
      status: statusOf(a),
      reconnectAttempts: a.reconnectAttempts,
      nextReconnectAt: a.nextReconnectAt || 0,
      lastConnectedAt: a.lastConnectedAt || 0,
      lastDisconnectedAt: a.lastDisconnectedAt || 0,
      lastDisconnectCode: a.lastDisconnectCode,
      disconnectReason: a.disconnectReason,
      numberMasked: masked(a.number),
      indexCount: countFor(a.id),
      indexLimit: MAX_CACHE,
      pairingMode: a.pairingMode,
      pairingCode: a.connected ? '' : a.pairingCode,
      pairingQr: a.connected ? '' : a.pairingQr,
      pairingError: a.connected ? '' : a.pairingError
    })),
    system: {
      uptime: uptime(Date.now()-startedAt),
      rssMb: Number((mem.rss/1048576).toFixed(1)),
      heapMb: Number((mem.heapUsed/1048576).toFixed(1)),
      port: WEB_PORT
    }
  }
}

async function requestRestart() {
  await recordActivity('service.restart-requested', { source:'private-command' })
  setTimeout(() => {
    shutdown('private-command', 1).catch(error => {
      console.error('Restart shutdown failed:', error?.message || error)
      process.exit(1)
    })
  }, 300).unref?.()
  return { ok:true }
}

async function init() {
  await loadAccounts()
  sharedStorage = await openSharedStorage({
    file: SHARED_DB_FILE,
    ttlMs: TTL_MS,
    maxMessagesPerAccount: MAX_CACHE,
  })
  sharedStorage.pruneInboundReceipts()
  nightPlay = new NightPlay(sharedStorage.db)
  if (accounts.has('A')) sharedStorage.assignProfile('A', 'control')
  const profileUpgrade = sharedStorage.migrateLegacyAccountProfiles([...accounts.values()])
  if (profileUpgrade.migrated) {
    console.log(`MSCC profile isolation upgrade: ${profileUpgrade.assigned.length} legacy assignment(s) retained; new sessions require explicit profiles.`)
  }
  sharedStorage.pruneConversationMessages({
    days:AI_HISTORY_DAYS,
    maxPerChat:AI_HISTORY_MAX_PER_CHAT,
  })
  josiahAssistant = createJosiahAssistant({
    ai:smartAI,
    storage:sharedStorage,
    getCommands:() => publicCommandRegistry.canonical,
  })
  namiAssistant = createNamiAssistant({
    ai:smartAI,
    storage:sharedStorage,
    getCommands:() => publicCommandRegistry.canonical,
  })
  mimiAssistant = createMiMiAssistant({
    ai:smartAI,
    storage:sharedStorage,
    getCommands:() => publicCommandRegistry.canonical,
  })
  sourceRegistry = new SourceRegistry({ rootUrl:SOURCES_URL, storage:sharedStorage })
  await sourceRegistry.load()
  releaseWatcher = createReleaseWatcher({
    storage:sharedStorage,
    resolveReleaseState:resolveLibraryReleaseState,
    sendDm:sendLibraryReleaseDm,
  })
  await loadState()
  await writeCommandSettingsSchema()
  await writeRuntimeRegistry()
  startSettingsWatcher()
  webServer = startWebPanel({
    nightPlayHandler: createNightPlayHandler(nightPlay, { refreshAvatar:createNightPlayAvatarSync(nightPlay, accounts), accounts }),
    port: WEB_PORT,
    host: WEB_HOST,
    password: WEB_PASSWORD,
    sessionSecret: WEB_SESSION_SECRET,
    localControlPort: LOCAL_CONTROL_PORT,
    getState: webState,
    getActivity: activity,
    getAccountDiagnostics,
    getCloudDashboard: () => megaStorageDashboard({ passive:true }),
    getCloudDashboardActive: () => megaStorageDashboard(),
    getCloudMounts: () => megaAvailableMounts(),
    verifyCloudFolder: ({ targetId }) => megaVerifyFolder({ targetId }),
    pairAccount,
    reconnectAccount,
    disconnectAccount,
    removeAccount,
    repairAccount,
    createAccount,
    renameAccount,
    assignAccountProfile,
    setSetting,
    setPublicPrefix,
    setDestination,
    reloadCommands,
    reloadModule
  })

  try {
    const latest = await fetchLatestWaWebVersion()
    waVersion = latest?.version
    if (Array.isArray(waVersion)) console.log('WhatsApp Web version:', waVersion.join('.'))
  } catch (e) {
    console.warn('Could not fetch latest WhatsApp Web version:', e?.message || e)
  }

  const enabledAccounts = [...accounts.values()].filter(account => account.enabled && !account.paused)
  // A broken auth store for one account must not prevent the other sessions
  // (or the Cortex management API) from starting.
  if (enabledAccounts[0]) await startAccountSafely(enabledAccounts[0])
  enabledAccounts.slice(1).forEach((account, index) => {
    setTimeout(
      () => startAccountSafely(account).catch(e => console.error(`[${account.id}] startup recovery:`, e?.message || e)),
      1200 * (index + 1),
    ).unref?.()
  })
  startLibraryReleaseWatcher()
  startScheduledTaskRunner()
  squidGameTimer = setInterval(() => {
    squidGame.tick().catch(error => console.error('Squid Game:', error?.message || error))
  }, 1000)
  squidGameTimer.unref?.()
}

let shuttingDown = false

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  try {
    console.log(`Shutting down Night (${signal})...`)
    webServer?.close?.()
    if (settingsPollTimer) clearInterval(settingsPollTimer)
    if (releaseWatchTimer) clearInterval(releaseWatchTimer)
    releaseWatchTimer = null
    if (scheduledTaskTimer) clearInterval(scheduledTaskTimer)
    scheduledTaskTimer = null
    if (squidGameTimer) clearInterval(squidGameTimer)
    squidGameTimer = null
    await Promise.allSettled([...accounts.values()].map(account => closeAccount(account)))
    await Promise.allSettled([...accounts.values()].map(account => account.credSave))
    await writeState()
    sharedStorage?.close()
    sharedStorage = null
    sourceRegistry = null
    josiahAssistant = null
    namiAssistant = null
    mimiAssistant = null
    releaseWatcher = null
  } finally {
    process.exit(exitCode)
  }
}

for (const signal of ['SIGINT','SIGTERM']) {
  process.once(signal, () => {
    shutdown(signal).catch(error => {
      console.error('Shutdown failed:', error?.message || error)
      process.exit(1)
    })
  })
}

init().catch(error => {
  console.error('Fatal:', error)
  process.exit(1)
})
