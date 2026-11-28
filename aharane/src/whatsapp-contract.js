export const WHATSAPP_TRANSPORT_CONTRACT_VERSION = 1

export const WHATSAPP_LIBRARY = Object.freeze({
  packageName: '@itsliaaa/baileys',
  version: '0.5.6',
})

export function normalizeConnectionUpdate(update) {
  const connection = String(update?.connection || '')
  const state = connection === 'open' ? 'connected'
    : connection === 'connecting' ? 'connecting'
      : connection === 'close' ? 'disconnected'
        : 'unknown'
  return { contractVersion: WHATSAPP_TRANSPORT_CONTRACT_VERSION, state, qrAvailable: Boolean(update?.qr) }
}

export function normalizeReceiptStatus(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw <= 0) return 'failed'
    if (raw === 1) return 'pending'
    if (raw === 2) return 'sent'
    if (raw === 3) return 'delivered'
    if (raw >= 4) return 'read'
    return null
  }
  const value = String(raw || '').toLowerCase()
  return ['pending', 'sent', 'delivered', 'read', 'failed'].includes(value) ? value : null
}

function hasMethod(socket, method) {
  return typeof socket?.[method] === 'function'
}

export function inspectWhatsAppCapabilities(socket, { mediaDownloadAvailable = false } = {}) {
  const canListen = typeof socket?.ev?.on === 'function'
  const canSend = hasMethod(socket, 'sendMessage')
  return {
    contractVersion: WHATSAPP_TRANSPORT_CONTRACT_VERSION,
    events: { subscribe: canListen },
    messages: { send: canSend, updates: canListen },
    receipts: { updateEvents: canListen },
    media: { download: mediaDownloadAvailable === true, send: canSend },
    groups: {
      readMetadata: hasMethod(socket, 'groupMetadata'),
      updateParticipants: hasMethod(socket, 'groupParticipantsUpdate'),
      updateSubject: hasMethod(socket, 'groupUpdateSubject'),
      updateDescription: hasMethod(socket, 'groupUpdateDescription'),
    },
    channels: {
      listSubscribed: hasMethod(socket, 'newsletterSubscribed'),
      readUpdates: hasMethod(socket, 'newsletterFetchMessages'),
    },
    status: { supported: false },
  }
}
