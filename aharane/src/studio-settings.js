import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

const DEFAULT_PROFILE = Object.freeze({
  botName: 'Aharane', prefix: '', autoRead: false, showTyping: false,
  rejectCalls: false, alwaysOnline: false, commandCooldown: 3, welcomeMessage: '',
})
const booleanKeys = ['autoRead', 'showTyping', 'rejectCalls', 'alwaysOnline']
const DEFAULT_CHAT_FILTER = Object.freeze({ mode: 'all', overrides: [] })
const CHAT_JID_PATTERNS = [
  /^\d{7,15}@s\.whatsapp\.net$/,
  /^\d{5,25}-\d{5,25}@g\.us$/,
  /^\d{5,25}@lid$/,
]
function normalizeChatFilter(value = {}, kind) {
  const mode = value.mode === 'selected' ? 'selected' : 'all'
  const overrides = []
  const seen = new Set()
  for (const entry of Array.isArray(value.overrides) ? value.overrides.slice(0, 1000) : []) {
    const jid = String(entry?.jid || '').trim()
    const valid = CHAT_JID_PATTERNS.some(pattern => pattern.test(jid))
    const isGroup = jid.endsWith('@g.us')
    if (!valid || (kind === 'groups') !== isGroup) throw new Error('Inbox visibility contains an invalid chat identifier.')
    if (seen.has(jid)) continue
    seen.add(jid)
    overrides.push({ jid, visible: entry?.visible === true })
  }
  return { mode, overrides }
}
export function normalizeChatVisibility(value = {}) {
  return {
    individuals: normalizeChatFilter(value.individuals, 'individuals'),
    groups: normalizeChatFilter(value.groups, 'groups'),
  }
}
export function isChatVisible(profile, jid) {
  const value = String(jid || '').trim()
  const kind = value.endsWith('@g.us') ? 'groups' : 'individuals'
  const filter = profile?.chatVisibility?.[kind] || DEFAULT_CHAT_FILTER
  const override = filter.overrides?.find(entry => entry.jid === value)
  return override ? override.visible === true : filter.mode !== 'selected'
}
function normalizeProfile(value = {}, scope) {
  const name = String(value.botName ?? DEFAULT_PROFILE.botName).trim().slice(0, 48) || 'Aharane'
  const cooldown = Number(value.commandCooldown ?? DEFAULT_PROFILE.commandCooldown)
  if (!Number.isFinite(cooldown) || cooldown < 0 || cooldown > 60) {
    throw new Error('Command cooldown must be between 0 and 60 seconds.')
  }
  const profile = {
    botName: name,
    prefix: scope === 'private' ? '.' : '!',
    commandCooldown: Math.round(cooldown * 10) / 10,
    welcomeMessage: String(value.welcomeMessage ?? '').slice(0, 1000),
    chatVisibility: normalizeChatVisibility(value.chatVisibility || {}),
  }
  for (const key of booleanKeys) profile[key] = value[key] === true
  if (scope === 'private') {
    profile.showTyping = false
    profile.rejectCalls = false
    profile.alwaysOnline = false
  }
  return profile
}
export function normalizeStudioSettings(value = {}) {
  return {
    version: 1,
    private: normalizeProfile(value.private, 'private'),
    public: normalizeProfile(value.public, 'public'),
    updatedAt: String(value.updatedAt || ''),
  }
}
export async function loadStudioSettings(file) {
  let value
  try { value = JSON.parse(await readFile(file, 'utf8')) }
  catch (error) {
    if (error?.code === 'ENOENT') return normalizeStudioSettings()
    throw new Error('Local Studio configuration could not be read; no defaults were written over it.')
  }
  return normalizeStudioSettings(value)
}
export async function saveStudioSettings(file, value) {
  const normalized = normalizeStudioSettings({ ...value, updatedAt: new Date().toISOString() })
  const directory = dirname(file)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temporary = file + '.' + randomUUID() + '.tmp'
  let handle
  try {
    handle = await open(temporary, 'wx', 0o600)
    await handle.writeFile(JSON.stringify(normalized, null, 2), 'utf8')
    await handle.sync()
    await handle.close()
    handle = null
    await rename(temporary, file)
  } finally {
    if (handle) await handle.close().catch(() => {})
    await rm(temporary, { force: true }).catch(() => {})
  }
  return normalized
}
export function envView(settings) {
  const rows = []
  for (const scope of ['private', 'public']) {
    const profile = settings[scope]
    const prefix = scope.toUpperCase() + '_'
    rows.push(
      { key: prefix + 'BOT_NAME', value: profile.botName, secret: false, scope },
      { key: prefix + 'COMMAND_PREFIX', value: profile.prefix, secret: false, scope, readOnly: true },
      { key: prefix + 'AUTO_READ', value: String(profile.autoRead), secret: false, scope, type: 'boolean' },
      { key: prefix + 'SHOW_TYPING', value: String(profile.showTyping), secret: false, scope, type: 'boolean' },
      { key: prefix + 'REJECT_CALLS', value: String(profile.rejectCalls), secret: false, scope, type: 'boolean' },
      { key: prefix + 'ALWAYS_ONLINE', value: String(profile.alwaysOnline), secret: false, scope, type: 'boolean' },
      { key: prefix + 'COMMAND_COOLDOWN', value: String(profile.commandCooldown), secret: false, scope, type: 'number' },
      { key: prefix + 'WELCOME_MESSAGE', value: profile.welcomeMessage, secret: false, scope },
    )
  }
  return rows
}
