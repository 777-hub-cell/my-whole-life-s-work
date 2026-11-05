export default {
  name: 'replycc',
  description: 'Recover indexed view-once media when a reply references it.',
  setting: { key:'replyCc', default:true, label:'Reply CC', description:'Recover view-once media when a reply references it.' },
  async run(ctx) {
    const mode = String(ctx.args[0] || '').toLowerCase()
    if (!['on','off'].includes(mode)) return ctx.reply(`Usage: .replycc on|off\nCurrent: \${ctx.settings.replyCc ? 'ON' : 'OFF'}`)
    const enabled = mode === 'on'
    await ctx.setSetting('replyCc', enabled)
    await ctx.reply(`✅ Reply CC: \${enabled ? 'ON' : 'OFF'}`)
  },
}
