/**
 * Account-scoped WhatsApp Channel discovery. Only data returned by the selected
 * authenticated Baileys session is exposed; no synthetic updates or implicit
 * follows are created here.
 */
const ACCOUNT_IDS = new Set(['private', 'public'])

function assertAccountId(value) {
  const id = String(value || '').trim().toLowerCase()
  if (!ACCOUNT_IDS.has(id)) throw new Error('Unknown WhatsApp session.')
  return id
}

function timestampMs(input, now) {
  const number = Number(typeof input === 'object' && input !== null ? input.low ?? input.value ?? 0 : input)
  return Number.isFinite(number) && number > 0
    ? (number < 100_000_000_000 ? number * 1000 : number)
    : now()
}

function visibleContent(payload) {
  const message = payload?.ephemeralMessage?.message
    || payload?.viewOnceMessageV2?.message
    || payload
    || {}
  return {
    text: String(message.conversation || message.extendedTextMessage?.text ||
      message.imageMessage?.caption || message.videoMessage?.caption || '').slice(0, 3000),
    mediaKind: message.imageMessage ? 'image' : message.videoMessage ? 'video' :
      message.audioMessage ? 'audio' : message.stickerMessage ? 'sticker' : 'text',
  }
}

export function createWhatsAppDiscovery({ now = () => Date.now() } = {}) {
  async function listChannels(sessionId, socket) {
    const accountId = assertAccountId(sessionId)
    if (!socket || typeof socket.newsletterSubscribed !== 'function') {
      return {
        supported: false,
        reason: 'This authenticated WhatsApp session does not expose subscribed Channels.',
        channels: [],
      }
    }
    const raw = await socket.newsletterSubscribed()
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.newsletters) ? raw.newsletters : []
    const channels = list.slice(0, 100).map(row => {
      const metadata = row?.metadata || row?.channel || row || {}
      return {
        jid: String(metadata.id || metadata.jid || row?.jid || ''),
        name: String(metadata.name || row?.name || 'Unnamed channel').slice(0, 140),
        description: String(metadata.description || metadata.state?.description || '').slice(0, 400),
      }
    }).filter(item => /^\d{5,30}@newsletter$/.test(item.jid))
    return { supported: true, accountId, channels }
  }

  async function channelUpdates(sessionId, socket, jid, count = 20) {
    assertAccountId(sessionId)
    const channelJid = String(jid || '')
    if (!/^\d{5,30}@newsletter$/.test(channelJid)) throw new Error('Invalid Channel JID.')
    if (typeof socket?.newsletterFetchMessages !== 'function') {
      return {
        supported: false,
        reason: 'Channel updates are unavailable through this WhatsApp session.',
        updates: [],
      }
    }
    const subscribed = await listChannels(sessionId, socket)
    if (!subscribed.supported || !subscribed.channels.some(item => item.jid === channelJid)) {
      throw new Error('This Channel is not subscribed by the selected WhatsApp account.')
    }
    const requestedCount = Number(count)
    const limit = Math.min(50, Math.max(1,
      Number.isFinite(requestedCount) && requestedCount > 0 ? Math.floor(requestedCount) : 20
    ))
    const raw = await socket.newsletterFetchMessages('jid', channelJid, limit, 0, 0)
    const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.messages) ? raw.messages : []
    return {
      supported: true,
      updates: rows.slice(0, 50).map(row => ({
        id: String(row?.key?.id || row?.serverId || row?.id || '').slice(0, 256),
        timestampMillis: timestampMs(row?.messageTimestamp || row?.timestamp, now),
        ...visibleContent(row?.message || row?.content || row?.messageContent || {}),
      })),
    }
  }

  return { listChannels, channelUpdates }
}
