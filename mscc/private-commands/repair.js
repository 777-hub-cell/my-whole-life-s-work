export default {
  name: 'repair',
  aliases: ['repairaccount', 'repaircode'],
  description: 'Back up invalid auth and re-pair an existing session with a phone-number code.',
  usage: '.repair <account-id>',
  async run(ctx) {
    const id = ctx.resolveAccountId(ctx.args[0])
    if (!id) return ctx.reply('Usage: .repair <account-id>')
    await ctx.repairAccount(id, 'code')
    const pairing = await ctx.waitForPairing(id)
    if (pairing.error) return ctx.reply(`Repair failed for \${id}: \${pairing.error}`)
    if (pairing.code) return ctx.reply(`🔧 Re-pair code for \${pairing.displayName} [\${id}]: \${pairing.code}`)
    await ctx.reply(`Repair started for \${pairing.displayName} [\${id}].`)
  },
}
