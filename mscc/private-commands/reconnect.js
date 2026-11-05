export default {
  name: 'reconnect',
  aliases: ['connect'],
  description: 'Reconnect an existing session using saved auth.',
  usage: '.reconnect <account-id>',
  async run(ctx) {
    const id = ctx.resolveAccountId(ctx.args[0])
    if (!id) return ctx.reply('Usage: .reconnect <account-id>')
    await ctx.reconnectAccount(id)
    await ctx.reply(`🔄 Reconnect requested for \${id}.`)
  },
}
