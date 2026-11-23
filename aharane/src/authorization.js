import { normalizePhone, senderNumberFromJid } from './policy.js'
import { parseCommand } from './command-registry.js'

function normalizedLidJid(value) {
  const jid = String(value || '').trim()
  if (!jid.endsWith('@lid')) return ''
  const user = jid.slice(0, -'@lid'.length).split(':', 1)[0]
  return /^\d{5,25}$/.test(user) ? user + '@lid' : ''
}

/**
 * Private chats are limited to the Private Owner's own direct self-chat.
 *
 * Baileys 0.5.6 prefers LIDs for WhatsApp identities. For a direct chat it
 * supplies the alternate identity in remoteJidAlt when WhatsApp provides it;
 * the linked account's own LID is persisted as socket.user.lid. We accept a
 * LID only when it matches that exact linked-account LID, or when its paired
 * alternate phone JID proves it is the configured owner. We never infer a
 * phone number from an arbitrary LID.
 */
export function isPrivateSelfChat({
  sessionId,
  remoteJid,
  remoteJidAlt,
  ownJid,
  ownLid,
  privateOwnerNumber,
} = {}) {
  if (sessionId !== 'private') return false

  const expected = normalizePhone(privateOwnerNumber)
  const chat = String(remoteJid || '').trim()
  if (!expected || !chat || chat.endsWith('@g.us') || chat.endsWith('@broadcast') ||
      chat.endsWith('@newsletter') || chat === 'status@broadcast') return false

  // The authenticated Private session itself must still resolve to the
  // configured Private Owner phone number.
  const selfNumber = senderNumberFromJid(ownJid)
  if (!selfNumber || selfNumber !== expected) return false

  const chatNumber = senderNumberFromJid(chat)
  if (chatNumber) return chatNumber === expected

  const chatLid = normalizedLidJid(chat)
  if (!chatLid) return false

  const selfLid = normalizedLidJid(ownLid)
  const alternate = String(remoteJidAlt || '').trim()
  const alternateNumber = senderNumberFromJid(alternate)
  const alternateLid = normalizedLidJid(alternate)

  if (selfLid) {
    // A known own-LID must match exactly. If Baileys supplied an alternate
    // identity too, reject any contradictory phone/LID pair.
    if (chatLid !== selfLid) return false
    if (alternateNumber && alternateNumber !== expected) return false
    if (alternateLid && alternateLid !== selfLid) return false
    return true
  }

  // Some stored sessions may not yet expose creds.me.lid. In that case only
  // accept the LID chat when Baileys supplies its matching owner phone JID.
  return alternateNumber === expected
}

/**
 * Account A-style private control: accept only fromMe commands in the exact
 * self-chat of the separately authenticated private session. Groups,
 * incoming messages, unknown LIDs and other users fail closed.
 */
export function isPrivateSelfCommand({
  sessionId,
  message,
  remoteJid,
  remoteJidAlt,
  ownJid,
  ownLid,
  privateOwnerNumber,
  text,
  privateRegistry,
  visualCommandNames = new Set(),
  prefix = '.',
} = {}) {
  if (sessionId !== 'private' || message?.key?.fromMe !== true ||
      !message?.key?.id || !message?.message) return false

  if (!isPrivateSelfChat({
    sessionId,
    remoteJid: remoteJid || message.key.remoteJid,
    remoteJidAlt: remoteJidAlt || message.key.remoteJidAlt,
    ownJid,
    ownLid,
    privateOwnerNumber,
  })) return false

  const parsed = parseCommand(text, prefix)
  return Boolean(parsed && privateRegistry?.scope === 'private' &&
    (privateRegistry.commands?.has(parsed.name) || visualCommandNames?.has?.(parsed.name)))
}

/** Public Owner is a separate identity; Private Owner never inherits this role. */
export function isPublicOwnerSender({ sessionId, remoteJid, senderJid, publicOwnerNumber } = {}) {
  if (sessionId !== 'public') return false
  const expected = normalizePhone(publicOwnerNumber)
  const sender = senderNumberFromJid(senderJid || remoteJid)
  return Boolean(expected && sender && sender === expected)
}
