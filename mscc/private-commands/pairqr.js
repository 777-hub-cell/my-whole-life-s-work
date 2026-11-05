export default {
  name: 'pairqr',
  description: 'Generate the explicit QR alternative for an existing or new session.',
  usage: '.pairqr <account-id|number|mention|reply> [friendly name]',
  async run(ctx) {
    const target = await ctx.preparePairTarget(ctx.args)
    const started = await ctx.pairAccount(target.id, 'qr')
    const pairing = await ctx.waitForPairing(target.id)
    if (pairing.connected) return ctx.reply(`✅ \${pairing.displayName} [\${target.id}] is already connected.`)
    if (pairing.error) return ctx.reply(`QR pairing failed for \${pairing.displayName} [\${target.id}]: \${pairing.error}`)
    if (!pairing.qr) return ctx.reply(`\${started.message}\nThe QR is still starting. Check Cortex or run .pairqr \${target.id} again.`)
    await ctx.sendImageDataUrl(pairing.qr, `QR pairing • \${pairing.displayName} [\${target.id}]`)
  },
}
