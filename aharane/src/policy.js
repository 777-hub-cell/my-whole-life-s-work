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

export function isAllowedInbound({ remoteJid, fromMe = false, allowedSenders = new Set(), groupsEnabled = false } = {}) {
  if (fromMe === true) return false
  const jid = String(remoteJid ?? '')
  if (!jid || jid === 'status@broadcast' || jid.endsWith('@broadcast')) return false
  if (jid.endsWith('@g.us')) return groupsEnabled === true
  const sender = senderNumberFromJid(jid)
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
