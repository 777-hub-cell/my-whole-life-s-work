export default {
  name: 'pair',
  description: 'Generate a phone-number pairing code for an existing or new session.',
  usage: '.pair <account-id|number|mention|reply> [friendly name]',
  async run(ctx) {
    const target = await ctx.preparePairTarget(ctx.args)
    const started = await ctx.pairAccount(target.id, 'code')
    const pairing = await ctx.waitForPairing(target.id)
    if (pairing.connected) return ctx.reply(`✅ \${pairing.displayName} [\${target.id}] is already connected.`)
    if (pairing.error) return ctx.reply(`Pairing failed for \${pairing.displayName} [\${target.id}]: \${pairing.error}`)
    if (!pairing.code) return ctx.reply(`\${started.message}\nThe pairing request is still starting. Check .accounts or run .pair \${target.id} again.`)
    await ctx.reply(['🔗 Pairing code ready',`Account: \${pairing.displayName} [\${target.id}]`,`Code: \${pairing.code}`,'','On that phone: WhatsApp → Linked devices → Link with phone number.'].join('\n'))
  },
}
