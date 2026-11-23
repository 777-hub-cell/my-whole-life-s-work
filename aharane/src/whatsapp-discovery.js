/**
 * Account-scoped WhatsApp Status and Channel discovery. Only data received from
 * the authenticated Baileys session is presented; never synthesize updates.
 * Status entries expire after 24 hours and are not persisted to user storage.
 */
function timestampMs(input) {
  const number = Number(typeof input === 'object' && input !== null ? input.low ?? input.value ?? 0 : input)
  return Number.isFinite(number) && number > 0
    ? (number < 100_000_000_000 ? number * 1000 : number)
    : Date.now()
}
function visibleContent(payload) {
  const message = payload?.ephemeralMessage?.message
    || payload?.viewOnceMessageV2?.message || payload || {}
  return {
    text: String(message.conversation || message.extendedTextMessage?.text ||
      message.imageMessage?.caption || message.videoMessage?.caption || '').slice(0, 3000),
    mediaKind: message.imageMessage ? 'image' : message.videoMessage ? 'video' :
      message.audioMessage ? 'audio' : message.stickerMessage ? 'sticker' : 'text',
  }
}
export function createWhatsAppDiscovery({ now = () => Date.now() } = {}) {
  const statuses = new Map([['private', new Map()], ['public', new Map()]])
  const statusSources = new Map([['private', new Map()], ['public', new Map()]])
  function recordStatus(sessionId, message) {
    if (!statuses.has(sessionId) || message?.key?.remoteJid !== 'status@broadcast' ||
        !message?.key?.id || !message?.message) return false
    const timestamp = timestampMs(message.messageTimestamp)
    if (timestamp > now() + 180_000 || timestamp <= now() - 86_400_000) return false
    const originJid = String(message.key.participant || message.key.participantAlt || '')
    if (!originJid || originJid === 'status@broadcast') return false
    const item = { id: String(message.key.id).slice(0, 256), senderJid: originJid,
      timestampMillis: timestamp, ...visibleContent(message.message) }
    const store = statuses.get(sessionId)
    const key = originJid + ':' + item.id
    store.set(key, item)
    statusSources.get(sessionId).set(key, message)
    for (const [entryKey, entry] of store) {
      if (entry.timestampMillis <= now() - 86_400_000) {
        store.delete(entryKey)
        statusSources.get(sessionId).delete(entryKey)
      }
    }
    while (store.size > 250) {
      const oldest = store.keys().next().value
      store.delete(oldest)
      statusSources.get(sessionId).delete(oldest)
    }
    return true
  }
  function getStatusMedia(sessionId, senderJid, messageId) {
    const account = statuses.get(sessionId)
    if (!account) throw new Error('Unknown WhatsApp session.')
    const key = String(senderJid) + ':' + String(messageId)
    const item = account.get(key)
    if (!item || item.timestampMillis <= now() - 86_400_000 || item.mediaKind === 'text') return null
    return { kind: item.mediaKind, message: statusSources.get(sessionId).get(key) || null }
  }
  function listStatuses(sessionId) {
    const store = statuses.get(sessionId)
    if (!store) throw new Error('Unknown WhatsApp session.')
    const threshold = now() - 86_400_000
    return [...store.values()].filter(item => item.timestampMillis > threshold)
      .sort((a, b) => b.timestampMillis - a.timestampMillis)
  }
  async function listChannels(sessionId, socket) {
    if (!statuses.has(sessionId)) throw new Error('Unknown WhatsApp session.')
    if (!socket || typeof socket.newsletterSubscribed !== 'function') {
      return { supported: false, reason: 'This authenticated WhatsApp session does not expose subscribed Channels.', channels: [] }
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
    }).filter(item => item.jid.endsWith('@newsletter'))
    return { supported: true, channels }
  }
  async function channelUpdates(sessionId, socket, jid, count = 20) {
    if (!statuses.has(sessionId)) throw new Error('Unknown WhatsApp session.')
    if (!/^\d{5,30}@newsletter$/.test(String(jid))) throw new Error('Invalid Channel JID.')
    if (typeof socket?.newsletterFetchMessages !== 'function') {
      return { supported: false, reason: 'Channel updates are unavailable through this WhatsApp session.', updates: [] }
    }
    const subscribed = await listChannels(sessionId, socket)
    if (!subscribed.supported || !subscribed.channels.some(item => item.jid === jid)) {
      throw new Error('This Channel is not subscribed by the selected WhatsApp account.')
    }
    const raw = await socket.newsletterFetchMessages('jid', jid, Math.min(50, Math.max(1, Number(count) || 20)), 0, 0)
    const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.messages) ? raw.messages : []
    return {
      supported: true,
      updates: rows.slice(0, 50).map(row => {
        const content = visibleContent(row?.message || row?.content || row?.messageContent || {})
        return {
          id: String(row?.key?.id || row?.serverId || row?.id || ''),
          timestampMillis: timestampMs(row?.messageTimestamp || row?.timestamp),
          ...content,
        }
      }),
    }
  }
  return { recordStatus, listStatuses, getStatusMedia, listChannels, channelUpdates }
}
