export default {
  name: 'setprefix',
  aliases: ['publicprefix'],
  description: 'Change the prefix used by normal/public commands.',
  usage: '.setprefix <prefix>',
  async run(ctx) {
    const value = String(ctx.args[0] || '')
    if (!value) return ctx.reply(`Public prefix: \${ctx.settings.publicPrefix || '.'}\nUsage: .setprefix <prefix>`)
    const prefix = await ctx.setPublicPrefix(value)
    await ctx.reply(`✅ Public command prefix is now: \${prefix}\nPrivate control commands still use .`)
  },
}
