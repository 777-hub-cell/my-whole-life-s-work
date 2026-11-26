import {
  downloadCommandMedia,
  mediaToSoundSticker,
  mediaToSticker,
} from '../../utils/media-conversion.js'
import { sendSoundSticker } from '../../utils/sound-sticker-protocol.js'
import {
  DEFAULT_STICKER_PUBLISHER,
  stickerPackNameForCommand,
} from '../../utils/sticker-metadata.js'

export default {
  name: 'sticker',
  aliases: ['s'],
  description: 'Turn a replied image or video into a static, animated, or sound sticker.',
  usage: '.sticker',
  async run(ctx) {
    const prefix = String(ctx.publicPrefix || '.')
    try {
      const source = await downloadCommandMedia(ctx, ['image', 'video'])
      if (!source) {
        await ctx.reply(`Reply to an image or video with ${prefix}sticker, or send one with ${prefix}sticker as its caption.`)
        return
      }

      const chat = ctx.message?.key?.remoteJid
      const sock = ctx.account?.sock
      if (!chat || !sock) throw new Error('WhatsApp connection is unavailable.')

      const packName = stickerPackNameForCommand(ctx)
      if (source.kind === 'video') {
        const soundSticker = await mediaToSoundSticker(source.buffer, {
          packName,
          publisher: DEFAULT_STICKER_PUBLISHER,
          maxDurationSeconds: 6,
          emojis: ['🔊'],
        })

        if (soundSticker) {
          await sendSoundSticker(sock, chat, {
            ...soundSticker,
            quoted: ctx.message,
            emojis: '🔊',
          })
          return
        }
        // No audio stream: proceed as a regular animated sticker. If an audio
        // stream was detected but encoding/sending failed, the error is surfaced
        // above; NIGHT never converts a sound-bearing source to a silent sticker.
      }

      const sticker = await mediaToSticker(source.buffer, {
        animated: source.kind === 'video' ? true : source.animated,
        packName,
      })
      await sock.sendMessage(chat, { sticker }, { quoted: ctx.message })
    } catch (error) {
      console.error('MSCC sticker conversion failed:', error)
      await ctx.reply(error?.message || 'I could not create that sticker.')
    }
  },
}
