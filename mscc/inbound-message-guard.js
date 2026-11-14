/**
 * Reject bot-authored messages before command dispatch. A plain-text choice
 * prompt must never treat the bot's own "invalid choice" reply as user input:
 * otherwise each sent warning generates another warning indefinitely.
 *
 * In addition, Baileys can deliver the same upsert more than once (e.g.
 * notify/append or after a reconnect). De-duplicate by account/chat/message ID
 * before any command or selection side effects.
 */
/**
 * Permit one narrowly scoped use of WhatsApp's own-chat feature as a private
 * owner console. The message must be from permanent Account A, addressed to
 * Account A's exact phone-number JID, and name a command in the private
 * command registry. All other fromMe traffic remains non-executable.
 */
export function isOwnerSelfControlCommand({
  account,
  mainAccountId,
  message,
  chatJid,
  ownJid,
  verifiedSelfChat = false,
  text,
  privateCommands,
} = {}) {
  const key = message?.key
  if (key?.fromMe !== true || !key?.id || !message?.message) return false
  if (account?.id !== 'A' || account?.role !== 'owner' || mainAccountId !== 'A') return false
  if (account.id !== mainAccountId) return false

  const chat = String(chatJid || key.remoteJid || '').trim()
  const self = String(ownJid || '').trim()
  // Require an exact PN self-chat match, or a LID that the caller has
  // already verified against this account's PN using non-conflicting auth data.
  // Never infer a phone number from the numeric portion of an opaque LID.
  if (!self.endsWith('@s.whatsapp.net')) return false
  const phoneSelfChat = chat === self && chat.endsWith('@s.whatsapp.net')
  const mappedLidSelfChat = verifiedSelfChat === true &&
    (chat.endsWith('@lid') || chat.endsWith('@hosted.lid'))
  if (!phoneSelfChat && !mappedLidSelfChat) return false

  const commandText = String(text || '').trim()
  if (!commandText.startsWith('.')) return false
  const name = commandText.slice(1).split(/\s+/, 1)[0].toLowerCase()
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name)) return false
  return Boolean(privateCommands && typeof privateCommands.has === 'function' && privateCommands.has(name))
}

/**
 * Account A is the private control identity, not a public responder. It may
 * process only the verified registered self-chat command admitted above.
 * Linked specialist accounts retain normal inbound handling.
 */
export function isMainAccountInboundAllowed(account, ownerSelfControl = false) {
  if (account?.id !== 'A') return true
  // Even a malformed registry that assigns Account A a linked role must
  // never turn the permanent control identity into a public responder.
  return account.role === 'owner' && ownerSelfControl === true
}

export function createInboundMessageGuard({
  maxEntries = 8192,
  ttlMs = 30 * 60_000,
  claim = null,
  allowSelf = null,
} = {}) {
  const seen = new Map()
  const cap = Math.max(1, Number(maxEntries) || 8192)
  const ttl = Math.max(1000, Number(ttlMs) || 30 * 60_000)

  return function acceptInbound(accountId, msg, now = Date.now()) {
    const key = msg?.key
    if (!msg?.message || !key?.id) return false
    if (key.fromMe === true) {
      let allowed = false
      try { allowed = typeof allowSelf === 'function' && allowSelf(accountId, msg) === true } catch {}
      if (!allowed) return false
    }
    const chat = String(key.remoteJid || '')
    if (!chat) return false
    // Message IDs are scoped to their chat. Avoid duplicate dispatch when the
    // same author is represented by a phone JID and later by a LID.
    const identity = [accountId, chat, key.id].join('|')
    const existing = seen.get(identity)
    if (existing !== undefined && now - existing >= 0 && now - existing < ttl) return false
    // An optional durable, atomic claim makes the guard survive deployment
    // restarts. In-memory de-duplication alone is reset with the Node process.
    if (typeof claim === 'function' && !claim(accountId, msg, now)) return false
    seen.delete(identity)
    seen.set(identity, now)

    if (seen.size > cap) {
      for (const [id, at] of seen) {
        if (now - at >= ttl) seen.delete(id)
      }
      while (seen.size > cap) seen.delete(seen.keys().next().value)
    }
    return true
  }
}

/**
 * A pending menu should consume ONLY a displayed number/option name.
 * Never convert arbitrary conversation, another command or a previous bot
 * reply into a synthetic .manga ~choice command.
 */
export function matchesDisplayedChoice(input, entries = []) {
  const text = String(input || '').trim()
  if (!text || text.length > 120 || !Array.isArray(entries) || !entries.length) return false
  if (/^\d{1,3}$/.test(text)) {
    const choice = Number(text)
    return choice >= 1 && choice <= entries.length
  }
  const wanted = text.toLocaleLowerCase()
  return entries.some(entry =>
    String(entry?.title || '').trim().toLocaleLowerCase() === wanted ||
    String(entry?.id || '').trim().toLocaleLowerCase() === wanted
  )
}
