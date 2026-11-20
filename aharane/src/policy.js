const DIGITS = /\D/g

export function normalizePhone(value) {
  const number = String(value ?? '').replace(DIGITS, '')
  return /^\d{7,15}$/.test(number) ? number : ''
}

export function parseAllowedSenders(value) {
  const result = new Set()
  for (const entry of String(value ?? '').split(',')) {
    const number = normalizePhone(entry)
    if (number) result.add(number)
  }
  return result
}

export function senderNumberFromJid(jid) {
  const value = String(jid ?? '')
  // Deliberately reject LID, group, broadcast and status JIDs. Do not guess
  // a phone number from opaque WhatsApp identifiers.
  if (!value.endsWith('@s.whatsapp.net')) return ''
  const local = value.slice(0, -'@s.whatsapp.net'.length).split(':', 1)[0]
  return normalizePhone(local)
}

export function isPrivateVisibleChatJid(value) {
  const jid = String(value ?? '').trim()
  // The signed-in Private WhatsApp account may display its own newly received
  // direct, group, and LID-addressed chats. Broadcast/status/newsletter feeds
  // are intentionally excluded.
  return /^\d{7,15}@s\.whatsapp\.net$/.test(jid)
    || /^\d{5,25}-\d{5,25}@g\.us$/.test(jid)
    || /^\d{5,25}@lid$/.test(jid)
}

export function isAllowedInbound({
  remoteJid,
  participantJid,
  allowGroups = false,
  fromMe = false,
  allowedSenders = new Set(),
} = {}) {
  if (fromMe === true) return false
  const jid = String(remoteJid ?? '')
  if (!jid || jid === 'status@broadcast' || jid.endsWith('@broadcast')) return false
  let senderJid = jid
  if (jid.endsWith('@g.us')) {
    if (!allowGroups || !/^\d{5,25}-\d{5,25}@g\.us$/.test(jid)) return false
    senderJid = String(participantJid ?? '')
  }
  const sender = senderNumberFromJid(senderJid)
  return Boolean(sender && allowedSenders instanceof Set && allowedSenders.has(sender))
}

export function commandResponse(rawText) {
  const text = String(rawText ?? '').trim()
  if (!text.startsWith('!')) return null
  const [command] = text.slice(1).trim().toLowerCase().split(/\s+/, 1)
  if (command === 'ping') return 'Aharane is online.'
  if (command === 'help') return 'Aharane commands:\n!ping — check whether I am online\n!help — show this message'
  return null
}

/**
 * Reject Baileys message-upsert events associated with placeholder-resend
 * spoofing attempts. The pinned upstream release is patched as well; this
 * additional guard is defense in depth.
 */
export function isSafeMessageUpsert(event) {
  return Boolean(
    event
    && !event.requestId
    && event.type === 'notify'
    && Array.isArray(event.messages)
  )
}
