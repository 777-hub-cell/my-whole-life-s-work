export default {
  name: 'settings',
  aliases: ['config'],
  description: 'Show private control settings and the current public prefix.',
  async run(ctx) {
    const onOff = value => value ? 'ON' : 'OFF'
    const rows = ctx.commandList().filter(command => command.setting?.key).sort((a,b) => String(a.setting.label || a.name).localeCompare(String(b.setting.label || b.name))).map(command => `\${command.setting.label || command.name}: \${onOff(ctx.settings[command.setting.key])}`)
    await ctx.reply(['⚙️ MSCC settings',`Public prefix: \${ctx.settings.publicPrefix || '.'}`,'',...rows].join('\n'))
  },
}
