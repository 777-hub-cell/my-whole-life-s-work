export default {
  name: 'activity',
  aliases: ['logs'],
  description: 'Show recent sanitized MSCC control/activity events.',
  usage: '.activity [10-50]',
  async run(ctx) {
    const limit = Math.max(10, Math.min(50, Number.parseInt(ctx.args[0] || '15', 10) || 15))
    const rows = await ctx.activity(limit)
    if (!rows.length) return ctx.reply('No MSCC activity has been recorded yet.')
    const lines = rows.map(row => {
      const at = String(row.at || '').replace('T',' ').replace(/\.\d+Z$/,'Z')
      const detail = JSON.stringify(row.detail || {})
      return `\${at} • \${row.action} • \${detail.length > 180 ? detail.slice(0,177) + '...' : detail}`
    })
    await ctx.reply(['📜 MSCC activity','',...lines].join('\n'))
  },
}
