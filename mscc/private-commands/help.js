export default {
  name: 'help',
  aliases: ['privatehelp', 'control', 'commands', 'menu'],
  description: 'List MSCC private control commands or show one command.',
  async run(ctx) {
    const commands = ctx.commandList()
      .filter(command => command.hidden !== true)
      .sort((a, b) => a.name.localeCompare(b.name))
    const wanted = String(ctx.args[0] || '').replace(/^\./, '').toLowerCase()

    if (wanted) {
      const command = commands.find(item =>
        item.name.toLowerCase() === wanted ||
        (item.aliases || []).some(alias => String(alias).toLowerCase() === wanted)
      )
      if (!command) return ctx.reply(`Unknown private command: .${wanted}\nTry .help`)

      const rows = [`.${command.name}`, command.description || 'No description']
      if (command.aliases?.length) rows.push(`Aliases: ${command.aliases.map(alias => '.' + alias).join(', ')}`)
      if (command.usage) rows.push(`Usage: ${command.usage}`)
      return ctx.reply(rows.join('\n'))
    }

    const rows = commands.map(command =>
      `.${command.name} — ${command.description || 'No description'}`
    )
    await ctx.reply([
      '🔐 MSCC private control',
      '',
      'Shortcuts: .menu, .commands, .privatehelp, .control',
      '',
      ...rows,
      '',
      'These commands only work in Account A's verified WhatsApp self-chat.',
      'Owner-only normal bot commands remain public commands.',
    ].join('\n'))
  },
}
