import { normalizePhone, senderNumberFromJid } from './policy.js'
import { parseCommand } from './command-registry.js'

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
  prefix = '!',
} = {}) {
  if (sessionId !== 'private' || message?.key?.fromMe !== true ||
      !message?.key?.id || !message?.message) return false

  const expected = normalizePhone(privateOwnerNumber)
  if (!expected) return false
  const chat = String(remoteJid || message.key.remoteJid || '').trim()
  if (!chat || chat.endsWith('@g.us') || chat.endsWith('@broadcast')) return false

  const selfNumber = senderNumberFromJid(ownJid)
  const chatNumber = senderNumberFromJid(chat)
  if (!selfNumber || !chatNumber || selfNumber !== expected || chatNumber !== expected) return false

  const parsed = parseCommand(text, prefix)
  return Boolean(parsed && privateRegistry?.scope === 'private' &&
    privateRegistry.commands?.has(parsed.name))
}

/** Public Owner is a separate identity; Private Owner never inherits this role. */
export function isPublicOwnerSender({ sessionId, remoteJid, publicOwnerNumber } = {}) {
  if (sessionId !== 'public') return false
  const expected = normalizePhone(publicOwnerNumber)
  const sender = senderNumberFromJid(remoteJid)
  return Boolean(expected && sender && sender === expected)
}
