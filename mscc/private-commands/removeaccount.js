export default {
  name: 'removeaccount',
  aliases: ['removesession'],
  description: 'Remove a linked session from the registry while preserving auth.',
  usage: '.removeaccount <account-id> confirm',
  async run(ctx) {
    const id = ctx.resolveAccountId(ctx.args[0])
    if (!id || String(ctx.args[1] || '').toLowerCase() !== 'confirm') return ctx.reply('Usage: .removeaccount <account-id> confirm')
    const result = await ctx.removeAccount(id)
    await ctx.reply(`🗑️ Removed \${result.account}. Auth preserved: \${result.authPreserved ? 'yes' : 'no'}.`)
  },
}
