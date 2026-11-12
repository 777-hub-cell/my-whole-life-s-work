import {
  parseStickerPackProbeCount,
  sendStickerPackProbe,
  STICKER_PACK_PROBE_LIMIT,
  STICKER_PACK_PROBE_MIN,
} from '../../utils/sticker-pack-probe.js'

function privateChat(jid) {
  const value = String(jid || '')
  return value.endsWith('@s.whatsapp.net') || value.endsWith('@lid')
}

function shortError(error) {
  return String(error?.message || error || 'Unknown error').replace(/\s+/g, ' ').trim().slice(0, 220)
}

export default {
  name:'pslimit',
  description:'Probe one native WhatsApp sticker pack size. Owner-only and private-chat only.',
  usage:'.pslimit <3-200>',
  ownerOnly:true,
  async run(ctx) {
    const prefix = String(ctx.publicPrefix || '.')
    const count = parseStickerPackProbeCount(ctx.args?.[0])
    if (count == null || ctx.args?.length !== 1) {
      await ctx.reply(
        \`Use \${prefix}pslimit <\${STICKER_PACK_PROBE_MIN}-\${STICKER_PACK_PROBE_LIMIT}> in a private chat. \` +
        \`Example: \${prefix}pslimit 80. It sends one numbered test pack of exactly that size.\`
      )
      return
    }

    const chat = String(ctx.message?.key?.remoteJid || '')
    if (!privateChat(chat)) {
      await ctx.reply('For safety, .pslimit only runs in a private one-to-one chat, never in a group or channel.')
      return
    }
    if (!ctx.account?.sock) {
      await ctx.reply('WhatsApp connection is unavailable.')
      return
    }

    await ctx.reply(\`Testing one native sticker pack with \${count} numbered stickers. This creates a visible test pack in this chat.\`)

    try {
      const result = await sendStickerPackProbe({
        sock:ctx.account.sock,
        chat,
        count,
        quoted:ctx.message,
      })
      const next = count + 20
      await ctx.reply(
        \`Accepted: \${result.count} stickers were sent together in ONE pack. \` +
        \`This confirms WhatsApp accepts at least \${result.count}; it does not claim this is the maximum. \` +
        (next <= STICKER_PACK_PROBE_LIMIT
          ? \`Next test: \${prefix}pslimit \${next}.\`
          : \`The current diagnostic ceiling is \${STICKER_PACK_PROBE_LIMIT}; increase it if this size also succeeds.\`)
      )
    } catch (error) {
      const detail = shortError(error)
      if (/temporary probe ceiling|maximum test limit/i.test(detail)) {
        await ctx.reply(
          \`The local Baileys diagnostic ceiling stopped the test before WhatsApp could evaluate \${count}. \` +
          \`The release's sticker-probe patch may not be installed. Details: \${detail}\`
        )
        return
      }
      await ctx.reply(
        \`The \${count}-sticker probe did not complete. This is not automatically proof of a sticker-count limit; \` +
        \`it could also be a conversion, upload, or connection failure. Details: \${detail}\`
      )
    }
  },
}
