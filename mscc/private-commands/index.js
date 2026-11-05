export default {
  name: 'index',
  aliases: ['cache'],
  description: 'Show persistent message-index counts and retention.',
  async run(ctx) {
    const d = ctx.diagnostics()
    const total = d.accounts.reduce((sum,account) => sum + account.indexCount, 0)
    const rows = d.accounts.map(account => `\${account.id}: \${account.indexCount}/\${d.indexLimit}`)
    await ctx.reply(['🗂️ MSCC message index','',...rows,`Total: \${total}`,`Retention: \${d.retentionHours}h`].join('\n'))
  },
}
