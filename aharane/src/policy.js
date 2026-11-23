const DIGITS = /\D/g

export function normalizePhone(value) {
  const number = String(value ?? '').replace(DIGITS, '')
  return /^\d{7,15}$/.test(number) ? number : ''
}

export function parseAllowedSenders(value) {
  // Retained only as a compatibility utility for old data readers. Public
  // access no longer uses or persists a sender allow-list.
  const result = new Set()
  for (const entry of String(value ?? '').split(',')) {
    const number = normalizePhone(entry)
    if (number) result.add(number)
  }
  return result
}

export function senderNumberFromJid(jid) {
  const value = String(jid ?? '')
  if (!value.endsWith('@s.whatsapp.net')) return ''
  const local = value.slice(0, -'@s.whatsapp.net'.length).split(':', 1)[0]
  return normalizePhone(local)
}

function isNumericLid(value) {
  const jid = String(value ?? '').trim()
  return /^\d{5,25}(?:@lid)$/.test(jid)
}

function isPublicSenderIdentity(value) {
  return Boolean(senderNumberFromJid(value) || isNumericLid(value))
}

export function isPrivateVisibleChatJid(value) {
  const jid = String(value ?? '').trim()
  return /^\d{7,15}@s\.whatsapp\.net$/.test(jid)
    || /^\d{5,25}-\d{5,25}@g\.us$/.test(jid)
    || /^\d{5,25}@lid$/.test(jid)
}

/**
 * Public access is intentionally open to ordinary WhatsApp senders. The
 * primary and Baileys-paired alternate JIDs are both trusted message metadata;
 * LIDs are accepted as opaque identities and are never converted to guessed
 * phone numbers. Groups are eligible only when the caller explicitly enables
 * them for the workflow being evaluated.
 */
export function isAllowedInbound({
  remoteJid,
  remoteJidAlt,
  participantJid,
  participantAltJid,
  allowGroups = false,
  fromMe = false,
} = {}) {
  if (fromMe === true) return false
  const jid = String(remoteJid ?? '').trim()
  if (!jid || jid === 'status@broadcast' || jid.endsWith('@broadcast') ||
      jid.endsWith('@newsletter')) return false

  if (jid.endsWith('@g.us')) {
    if (!allowGroups || !/^\d{5,25}-\d{5,25}@g\.us$/.test(jid)) return false
    const participant = String(participantJid ?? '').trim()
    const alternate = String(participantAltJid ?? '').trim()
    return isPublicSenderIdentity(participant) || isPublicSenderIdentity(alternate)
  }

  if (isPublicSenderIdentity(jid)) return true
  return isPublicSenderIdentity(remoteJidAlt)
}

export function commandResponse(rawText) {
  const text = String(rawText ?? '').trim()
  if (!text.startsWith('!')) return null
  const [command] = text.slice(1).trim().toLowerCase().split(/\s+/, 1)
  if (command === 'ping') return 'Aharane is online.'
  if (command === 'help') return 'Aharane commands:\n!ping — check whether I am online\n!help — show this message'
  return null
}

export function isSafeMessageUpsert(event) {
  return Boolean(event && !event.requestId && event.type === 'notify' && Array.isArray(event.messages))
}
