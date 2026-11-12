import { runStickerPackLimitCommand } from '../../sticker-pack-limit-command.js'

export default {
  name:'pslimit',
  description:'Test how many stickers fit in one native WhatsApp sticker pack.',
  usage:'.pslimit <3-200> | .pslimit <search terms> <3-150>',
  ownerOnly:true,
  notifyOnPermissionDenied:true,
  permissionDeniedMessage:'I received .pslimit, but could not verify this sender as an authorized NIGHT owner. No stickers were sent. Use the configured owner number in a private chat.',
  async run(ctx) {
    return runStickerPackLimitCommand(ctx)
  },
}
