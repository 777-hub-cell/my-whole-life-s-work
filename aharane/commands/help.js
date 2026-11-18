export default {
  name: 'help',
  description: 'Show the public commands available to this sender.',
  async run({ reply, commandList, isPublicOwner, prefix }) {
    const commands = commandList()
      .filter(command => command.hidden !== true)
      .filter(command => command.ownerOnly !== true || isPublicOwner === true)
      .sort((a, b) => a.name.localeCompare(b.name))
    const rows = commands.map(command =>
      prefix + command.name + (command.description ? ' — ' + command.description : '')
    )
    await reply(['Aharane commands:', ...rows].join('\n'))
  },
}
