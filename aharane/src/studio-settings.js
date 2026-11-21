import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

const DEFAULT_PROFILE = Object.freeze({
  botName: 'Aharane', prefix: '', autoRead: false, showTyping: false,
  rejectCalls: false, alwaysOnline: false, commandCooldown: 3, welcomeMessage: '',
})
const booleanKeys = ['autoRead', 'showTyping', 'rejectCalls', 'alwaysOnline']
const DEFAULT_AI_REPLY = Object.freeze({ apiBaseUrl: '', model: '', apiKey: '', disableEnvironmentKey: false })
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
function normalizeChatPreferences(value = {}) {
  const normalize = entries => {
    const result = [], seen = new Set()
    for (const raw of Array.isArray(entries) ? entries.slice(0, 1000) : []) {
      const jid = String(raw || '').trim()
      if (!CHAT_JID_PATTERNS.some(pattern => pattern.test(jid))) throw new Error('Chat preferences contain an invalid chat identifier.')
      if (seen.has(jid)) continue
      seen.add(jid); result.push(jid)
    }
    return result
  }
  return { pinned: normalize(value.pinned), muted: normalize(value.muted), archived: normalize(value.archived) }
}
const APPEARANCE_DEFAULTS = Object.freeze({
  theme: 'system', wallpaper: 'default', incomingBubble: '#ffffff', outgoingBubble: '#d9f4e5',
  textScale: 100, bubbleRadius: 18, messageSpacing: 'comfortable', chatDensity: 'comfortable',
  showTimestamps: true, showPreviews: true, showAvatars: true, reduceMotion: false, largerText: false,
  customWallpaperMime: '',
})
const COLOR = /^#[0-9a-f]{6}$/i
export function normalizeChatAppearance(value = {}) {
  const allowed = (candidate, choices, fallback) => choices.includes(candidate) ? candidate : fallback
  const number = (candidate, min, max, fallback) => {
    const n = Number(candidate)
    return Number.isFinite(n) ? Math.round(Math.max(min, Math.min(max, n))) : fallback
  }
  return {
    theme: allowed(value.theme, ['system', 'light', 'dark'], APPEARANCE_DEFAULTS.theme),
    wallpaper: allowed(value.wallpaper, ['default', 'sage', 'sand', 'slate', 'lavender', 'dots', 'grid', 'custom'], APPEARANCE_DEFAULTS.wallpaper),
    incomingBubble: COLOR.test(String(value.incomingBubble || '')) ? String(value.incomingBubble) : APPEARANCE_DEFAULTS.incomingBubble,
    outgoingBubble: COLOR.test(String(value.outgoingBubble || '')) ? String(value.outgoingBubble) : APPEARANCE_DEFAULTS.outgoingBubble,
    textScale: number(value.textScale, 80, 130, APPEARANCE_DEFAULTS.textScale),
    bubbleRadius: number(value.bubbleRadius, 8, 28, APPEARANCE_DEFAULTS.bubbleRadius),
    messageSpacing: allowed(value.messageSpacing, ['compact', 'comfortable', 'spacious'], APPEARANCE_DEFAULTS.messageSpacing),
    chatDensity: allowed(value.chatDensity, ['compact', 'comfortable'], APPEARANCE_DEFAULTS.chatDensity),
    showTimestamps: value.showTimestamps !== false,
    showPreviews: value.showPreviews !== false,
    showAvatars: value.showAvatars !== false,
    reduceMotion: value.reduceMotion === true,
    largerText: value.largerText === true,
    customWallpaperMime: ['image/jpeg', 'image/png', 'image/webp'].includes(value.customWallpaperMime) ? value.customWallpaperMime : '',
  }
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
    chatPreferences: normalizeChatPreferences(value.chatPreferences || {}),
  }
  for (const key of booleanKeys) profile[key] = value[key] === true
  // Private and Public profiles share the same supported behavior controls.
  // Command authorization remains account-specific in the message dispatcher.
  return profile
}
function normalizeAiReply(value = {}) {
  return {
    apiBaseUrl: String(value.apiBaseUrl ?? DEFAULT_AI_REPLY.apiBaseUrl).trim().slice(0, 500) || DEFAULT_AI_REPLY.apiBaseUrl,
    model: String(value.model ?? DEFAULT_AI_REPLY.model).trim().slice(0, 160),
    apiKey: String(value.apiKey ?? DEFAULT_AI_REPLY.apiKey).trim().slice(0, 4096),
    disableEnvironmentKey: value.disableEnvironmentKey === true,
  }
}
export function normalizeStudioSettings(value = {}) {
  return {
    version: 2,
    chatAppearance: normalizeChatAppearance(value.chatAppearance),
    aiReply: normalizeAiReply(value.aiReply),
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
export function envView(settings, aiReplyConfig = null) {
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
  const ai = aiReplyConfig || settings.aiReply || DEFAULT_AI_REPLY
  const keyConfigured = Boolean(ai.apiKey)
  rows.push(
    { key: 'AI_API_BASE_URL', value: ai.apiBaseUrl || DEFAULT_AI_REPLY.apiBaseUrl, secret: false, scope: 'shared' },
    { key: 'AI_MODEL', value: ai.model || '', secret: false, scope: 'shared' },
    { key: 'AI_API_KEY', value: '', secret: true, configured: keyConfigured, scope: 'shared' },
    { key: 'AI_CLEAR_API_KEY', value: 'false', secret: false, type: 'boolean', scope: 'shared' },
    { key: 'AI_REPLY_STATUS', value: ai.configured ? 'Ready' : 'Not configured', secret: false, readOnly: true, scope: 'shared' },
  )
  return rows
}
