import { normalizePhone, senderNumberFromJid } from './policy.js'
import { parseCommand } from './command-registry.js'

/** Private chats are limited to the Private Owner's own direct self-chat. */
export function isPrivateSelfChat({ sessionId, remoteJid, ownJid, privateOwnerNumber } = {}) {
  if (sessionId !== 'private') return false
  const expected = normalizePhone(privateOwnerNumber)
  const chat = String(remoteJid || '').trim()
  if (!expected || !chat || chat.endsWith('@g.us') || chat.endsWith('@broadcast')) return false
  const selfNumber = senderNumberFromJid(ownJid)
  const chatNumber = senderNumberFromJid(chat)
  return Boolean(selfNumber && chatNumber && selfNumber === expected && chatNumber === expected)
}

/**
 * Account A-style private control: accept only fromMe commands in the exact
 * phone-number self-chat of the separately authenticated private session.
 * LID-only, group, incoming, or unregistered commands fail closed.
 */
export function isPrivateSelfCommand({
  sessionId,
  message,
  remoteJid,
  ownJid,
  privateOwnerNumber,
  text,
  privateRegistry,
  visualCommandNames = new Set(),
  prefix = '.',
} = {}) {
  if (sessionId !== 'private' || message?.key?.fromMe !== true ||
      !message?.key?.id || !message?.message) return false

  if (!isPrivateSelfChat({
    sessionId, remoteJid: remoteJid || message.key.remoteJid, ownJid, privateOwnerNumber,
  })) return false

  const parsed = parseCommand(text, prefix)
  return Boolean(parsed && privateRegistry?.scope === 'private' &&
    (privateRegistry.commands?.has(parsed.name) || visualCommandNames?.has?.(parsed.name)))
}

/** Public Owner is a separate identity; Private Owner never inherits this role. */
export function isPublicOwnerSender({ sessionId, remoteJid, publicOwnerNumber } = {}) {
  if (sessionId !== 'public') return false
  const expected = normalizePhone(publicOwnerNumber)
  const sender = senderNumberFromJid(remoteJid)
  return Boolean(expected && sender && sender === expected)
}
