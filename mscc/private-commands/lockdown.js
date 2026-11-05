export default {
  name: 'lockdown',
  description: 'Temporarily disable or re-enable all normal/public commands.',
  usage: '.lockdown on|off',
  setting: { key:'publicCommandsEnabled', default:true, label:'Public commands', description:'Allow normal/public commands to run.' },
  async run(ctx) {
    const mode = String(ctx.args[0] || '').toLowerCase()
    if (!['on','off'].includes(mode)) return ctx.reply(`Usage: .lockdown on|off\nCurrent: \${ctx.settings.publicCommandsEnabled === false ? 'ON' : 'OFF'}`)
    const lockdownOn = mode === 'on'
    await ctx.setSetting('publicCommandsEnabled', !lockdownOn)
    await ctx.reply(`🔒 Lockdown: \${lockdownOn ? 'ON — public commands disabled' : 'OFF — public commands enabled'}`)
  },
}
