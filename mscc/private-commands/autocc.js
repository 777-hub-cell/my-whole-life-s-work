export default {
  name: 'autocc',
  description: 'Automatically copy incoming view-once media to the fixed Account A inbox.',
  setting: { key:'autoCc', default:false, label:'Auto CC', description:'Copy incoming view-once media immediately.' },
  async run(ctx) {
    const mode = String(ctx.args[0] || '').toLowerCase()
    if (!['on','off'].includes(mode)) return ctx.reply(`Usage: .autocc on|off\nCurrent: \${ctx.settings.autoCc ? 'ON' : 'OFF'}`)
    const enabled = mode === 'on'
    await ctx.setSetting('autoCc', enabled)
    await ctx.reply(`✅ Auto CC: \${enabled ? 'ON' : 'OFF'}`)
  },
}
