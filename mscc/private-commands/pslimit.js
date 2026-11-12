import { runStickerPackLimitCommand } from '../sticker-pack-limit-command.js'

export default {
  name:'pslimit',
  description:'Test a single WhatsApp sticker pack from the Account A private owner console.',
  usage:'.pslimit <3-200> | .pslimit <search terms> <3-150>',
  async run(ctx) {
    return runStickerPackLimitCommand(ctx)
  },
}
