import { statfs } from 'node:fs/promises'
function size(bytes) {
  const gib = bytes / 1073741824
  if (gib >= 1) return `\${gib.toFixed(2)} GiB`
  return `\${(bytes / 1048576).toFixed(1)} MiB`
}
export default {
  name: 'disk',
  aliases: ['storage'],
  description: 'Show filesystem usage for the MSCC installation.',
  async run(ctx) {
    const fs = await statfs(process.cwd())
    const block = Number(fs.bsize), total = Number(fs.blocks)*block, free = Number(fs.bavail)*block, used = Math.max(0,total-free)
    const percent = total > 0 ? ((used/total)*100).toFixed(1) : '0.0'
    await ctx.reply(['MSCC disk',`Used: \${size(used)} / \${size(total)} (\${percent}%)`,`Free: \${size(free)}`].join('\n'))
  },
}
