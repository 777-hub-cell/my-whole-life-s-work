/**
 * Privacy-limited per-account session diagnostics.
 *
 * Read only explicit lifecycle actions. Never forward message text, contact
 * identifiers, JIDs, phone numbers, credential blobs, or pairing codes.
 */
const SESSION_ACTIONS = new Set([
  'account.connected',
  'account.disconnected',
  'account.disconnected-manually',
  'account.reconnect-requested',
  'account.reconnect-scheduled',
  'account.reconnect-failed',
  'account.identity-mismatch',
  'account.profile-changed',
  'account.renamed',
  'account.created',
  'account.removed',
  'pairing.requested',
  'pairing.repair-requested',
])

const ALLOWED_DETAIL_FIELDS = new Set([
  'mode', 'reasonCode', 'profile', 'previousProfile', 'authPreserved', 'attempt', 'delayMs', 'origin', 'protocolDetail',
])

export function sessionEventsFromJsonl(text, accountId, limit = 40) {
  const id = String(accountId)
  const count = Math.max(1, Math.min(100, Number(limit) || 40))
  const lines = String(text || '').split(/\r?\n/).filter(Boolean)
  const found = []
  for (let i = lines.length - 1; i >= 0 && found.length < count; i--) {
    let row
    try { row = JSON.parse(lines[i]) } catch { continue }
    if (!row || !SESSION_ACTIONS.has(row.action) || String(row.detail?.account || '') !== id) continue
    const detail = {}
    for (const key of ALLOWED_DETAIL_FIELDS) {
      const value = row.detail?.[key]
      if (typeof value === 'boolean') detail[key] = value
      else if (['reasonCode', 'attempt', 'delayMs'].includes(key) && Number.isFinite(value)) detail[key] = value
      else if (key === 'origin' && ['intentional-logout', 'stream-error', 'server-failure', 'connection-replaced', 'transport-close', 'other'].includes(value)) detail[key] = value
      else if (key === 'protocolDetail' && ['device-removed', 'connection-replaced', 'other-conflict', 'not-authorized', 'bad-session', 'policy-violation', 'unclassified'].includes(value)) detail[key] = value
      else if (key !== 'origin' && key !== 'protocolDetail' && typeof value === 'string' && /^[a-zA-Z0-9._-]{1,64}$/.test(value)) detail[key] = value
    }
    found.push({
      id: String(row.id || '').slice(0, 80),
      at: typeof row.at === 'string' ? row.at.slice(0, 48) : '',
      action: row.action,
      detail,
    })
  }
  return found
}

export function sessionSnapshot(account, nowMs = Date.now()) {
  const nextAt = Number(account?.nextReconnectAt) || 0
  return {
    id: String(account.id),
    slot: String(account.slot || account.id),
    displayName: String(account.displayName || '').slice(0, 48),
    role: account.role === 'owner' ? 'owner' : 'linked',
    profile: String(account.profile || 'unassigned').slice(0, 64),
    numberMasked: String(account.numberMasked || '').slice(0, 35),
    status: String(account.status || 'offline').slice(0, 40),
    connected: account.connected === true,
    paused: account.paused === true,
    registered: account.registered === true,
    reconnectAttempts: Math.max(0, Number(account.reconnectAttempts) || 0),
    nextReconnectAt: nextAt > nowMs ? nextAt : 0,
    lastConnectedAt: Math.max(0, Number(account.lastConnectedAt) || 0),
    lastDisconnectedAt: Math.max(0, Number(account.lastDisconnectedAt) || 0),
    lastDisconnectCode: Number.isFinite(account.lastDisconnectCode) ? account.lastDisconnectCode : null,
    // Server-origin error may contain a JID, token or phone number: redact it.
    disconnectReason: sanitizeSessionReason(account.disconnectReason),
  }
}

export function sanitizeSessionReason(reason) {
  return String(reason || '')
    .replace(/(?:\+?\d[\d ()-]{6,}\d)/g, '[redacted-number]')
    .replace(/[\w.+-]+@[\w.-]+/g, '[redacted-address]')
    .replace(/(pair(?:ing)?[ _-]?(?:code|qr)|bearer|token|secret|password)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 240)
}
