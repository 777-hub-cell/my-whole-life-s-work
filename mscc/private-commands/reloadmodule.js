export default {
  name: 'reloadmodule',
  description: 'Reload only the private or public command namespace.',
  usage: '.reloadmodule private|public',
  async run(ctx) {
    const which = String(ctx.args[0] || '').toLowerCase()
    const id = which === 'private' ? 'mscc-private-commands' : which === 'public' ? 'mscc-public-commands' : ''
    if (!id) return ctx.reply('Usage: .reloadmodule private|public')
    const result = await ctx.reloadModule(id)
    await ctx.reply(`♻️ Reloaded \${which} commands: \${result.commands.length}`)
  },
}
