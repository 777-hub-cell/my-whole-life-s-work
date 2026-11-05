export default {
  name: 'disconnect',
  description: 'Disconnect a linked session without deleting its saved auth.',
  usage: '.disconnect <account-id>',
  async run(ctx) {
    const id = ctx.resolveAccountId(ctx.args[0])
    if (!id) return ctx.reply('Usage: .disconnect <account-id>')
    if (id === 'A') return ctx.reply('Account A is the permanent control session. Use .restart for the MSCC process instead.')
    const result = await ctx.disconnectAccount(id)
    await ctx.reply(`⏹️ \${result.account} is now \${result.status}. Saved auth is preserved.`)
  },
}
