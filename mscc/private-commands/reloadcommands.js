export default {
  name: 'reloadcommands',
  aliases: ['reloadcmds','cmdreload'],
  description: 'Reload private and normal/public command modules from disk.',
  async run(ctx) {
    const result = await ctx.reloadCommandsDetailed()
    await ctx.reply(['♻️ Commands reloaded',`Private: ${result.private.length}`,`Public: ${result.public.length}`,`Custom: ${(result.custom || []).length}`].join('\n'))
  },
}
