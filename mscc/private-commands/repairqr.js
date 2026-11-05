export default {
  name: 'repairqr',
  description: 'Back up invalid auth and re-pair an existing session with QR.',
  usage: '.repairqr <account-id>',
  async run(ctx) {
    const id = ctx.resolveAccountId(ctx.args[0])
    if (!id) return ctx.reply('Usage: .repairqr <account-id>')
    await ctx.repairAccount(id, 'qr')
    const pairing = await ctx.waitForPairing(id)
    if (pairing.error) return ctx.reply(`QR repair failed for \${id}: \${pairing.error}`)
    if (pairing.qr) return ctx.sendImageDataUrl(pairing.qr, `Repair QR • \${pairing.displayName} [\${id}]`)
    await ctx.reply(`QR repair started for \${pairing.displayName} [\${id}].`)
  },
}
