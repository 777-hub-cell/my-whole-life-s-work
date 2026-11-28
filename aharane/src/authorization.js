import { normalizePhone, senderNumberFromJid, isAllowedInbound } from './policy.js'
import { parseCommand } from './command-parser.js'

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

export const AUTHORIZATION_POLICY_VERSION = 2

// Trusted internal triggers carry no sender. "api" is deliberately NOT here:
// an API caller is never trusted by name. "admin-preview" is the authenticated
// Studio dry-run, which the route may use only after requireAdmin.
const INTERNAL_SOURCES = new Set(['scheduler', 'admin-preview'])

function decision(allow, reason) {
  return { allow, reason, policyVersion: AUTHORIZATION_POLICY_VERSION }
}

/**
 * Canonical authorization decision. The only place privilege is decided.
 *
 * Privileges:
 * - "private-control": Private session only, verified Private Owner.
 * - "public-owner": Public session only, configured Public Owner.
 * - "public-command": Public session, a direct (non-group, non-self) message.
 * - "public-automation": Public session, an eligible sender (groups allowed
 *   only with a valid participant) for visual workflows.
 *
 * Sources:
 * - "direct": a live inbound message; identity proof must be supplied.
 * - "scheduler": trusted internal trigger; the live session must still be the
 *   configured Private Owner, and owner config is re-read each run.
 * - "admin-preview": authenticated Studio dry-run with stubbed sends; no live
 *   session proof exists, so only the configured owner is checked.
 * Anything else (including "api") is untrusted and denies.
 *
 * Missing, unknown or contradictory context denies. Reasons are stable codes
 * that are safe to log; they never contain message content.
 */
export function evaluateAuthorization({
  source,
  sessionId,
  privilege,
  ownerConfig = {},
  message,
  remoteJid,
  remoteJidAlt,
  senderJid,
  participantJid,
  participantAltJid,
  ownJid,
  ownLid,
} = {}) {
  if (sessionId !== 'private' && sessionId !== 'public') return decision(false, 'unknown-account')
  const direct = source === 'direct'
  if (!direct && !INTERNAL_SOURCES.has(source)) return decision(false, 'untrusted-source')

  if (privilege === 'private-control') {
    if (sessionId !== 'private') return decision(false, 'wrong-account')
    const owner = normalizePhone(ownerConfig.privateOwnerNumber)
    if (!owner) return decision(false, 'owner-not-configured')
    if (direct) {
      if (message?.key?.fromMe !== true) return decision(false, 'not-from-owner-session')
      const proven = isPrivateSelfChat({
        sessionId, remoteJid: remoteJid || message?.key?.remoteJid,
        remoteJidAlt: remoteJidAlt || message?.key?.remoteJidAlt,
        ownJid, ownLid, privateOwnerNumber: owner,
      })
      return proven ? decision(true, 'ok') : decision(false, 'not-private-self-chat')
    }
    if (source === 'scheduler') {
      // The linked Private session must still be the owner at run time.
      return senderNumberFromJid(ownJid) === owner
        ? decision(true, 'ok')
        : decision(false, 'session-owner-mismatch')
    }
    return decision(true, 'ok') // admin-preview
  }

  if (privilege === 'public-owner') {
    if (sessionId !== 'public') return decision(false, 'wrong-account')
    const owner = normalizePhone(ownerConfig.publicOwnerNumber)
    if (!owner) return decision(false, 'owner-not-configured')
    if (direct) {
      return isPublicOwnerSender({ sessionId, remoteJid, senderJid, publicOwnerNumber: owner })
        ? decision(true, 'ok')
        : decision(false, 'not-public-owner')
    }
    return decision(true, 'ok')
  }

  if (privilege === 'public-command' || privilege === 'public-automation') {
    if (sessionId !== 'public') return decision(false, 'wrong-account')
    if (!direct) return decision(true, 'ok')
    if (!message?.key) return decision(false, 'missing-message')
    if (message.key.fromMe === true) return decision(false, 'from-own-session')
    const chat = remoteJid || message.key.remoteJid
    const chatAlt = remoteJidAlt || message.key.remoteJidAlt
    if (privilege === 'public-command') {
      return isAllowedInbound({ remoteJid: chat, remoteJidAlt: chatAlt, fromMe: false })
        ? decision(true, 'ok')
        : decision(false, 'not-direct-chat')
    }
    return isAllowedInbound({
      remoteJid: chat, remoteJidAlt: chatAlt, participantJid, participantAltJid,
      allowGroups: true, fromMe: false,
    }) ? decision(true, 'ok') : decision(false, 'sender-not-eligible')
  }

  return decision(false, 'unknown-privilege')
}

/**
 * The single adapter every execution path uses to turn verified proof into the
 * privilege flags that commands and workflows consume. Callers never compute
 * these booleans themselves and never accept them from a request or UI.
 */
export function resolveExecutionAuthorization(input = {}) {
  const decisions = {
    privateControl: evaluateAuthorization({ ...input, privilege: 'private-control' }),
    publicOwner: evaluateAuthorization({ ...input, privilege: 'public-owner' }),
    publicCommand: evaluateAuthorization({ ...input, privilege: 'public-command' }),
    publicAutomation: evaluateAuthorization({ ...input, privilege: 'public-automation' }),
  }
  return {
    privateControl: decisions.privateControl.allow,
    isPublicOwner: decisions.publicOwner.allow,
    canRunPublicCommands: decisions.publicCommand.allow,
    allowedPublicSender: decisions.publicAutomation.allow,
    decisions,
  }
}
