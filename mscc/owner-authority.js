/**
 * The primary MSCC owner, legacy CONTROL_NUMBERS and delegated public sudo
 * are different principals. Only OWNER_NUMBER is supreme. CONTROL_NUMBERS
 * remain compatible with public owner-command access, not private control.
 *
 * Inputs must already be resolved through verified PN/LID identity handling.
 * Opaque LID digits and display names are never accepted as phone numbers.
 */
const phone = value => /^\d{7,15}$/.test(String(value || '')) ? String(value) : ''

export function resolveOwnerAuthority({
  senderNumber = '',
  primaryOwnerNumber = '',
  controlNumbers = [],
  sudo = false,
  sessionNumber = '',
} = {}) {
  const sender = phone(senderNumber)
  const primary = phone(primaryOwnerNumber)
  const session = phone(sessionNumber)
  const controls = controlNumbers instanceof Set ? controlNumbers : new Set(controlNumbers)
  const isSupremeOwner = Boolean(sender && primary && sender === primary)
  const isLegacyControl = Boolean(sender && controls.has(sender))
  const isSudo = Boolean(sender && sudo === true)
  return {
    isSupremeOwner,
    isSudo,
    isPublicOwner: isSupremeOwner || isLegacyControl || isSudo,
    // Retain the existing public owner-command semantics for linked sessions.
    // Neither this property nor a legacy control number confers private access.
    isSessionOwner: isSupremeOwner || isLegacyControl || Boolean(sender && session && sender === session),
  }
}
