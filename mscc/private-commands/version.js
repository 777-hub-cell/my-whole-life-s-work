export default {
  name: 'version',
  aliases: ['ver'],
  description: 'Show MSCC, Node.js, Baileys and WhatsApp Web versions.',
  async run(ctx) {
    const d=ctx.diagnostics()
    await ctx.reply([`MSCC v\${d.version}`,`Node \${process.version}`,'Baileys: @itsliaaa/baileys 0.3.18-final',`WhatsApp Web: \${d.waVersion || 'not resolved yet'}`].join('\n'))
  },
}
