export default {
  name: 'uptime',
  description: 'Show how long the MSCC process has been running.',
  async run(ctx) {
    const total = Math.floor(process.uptime()), days=Math.floor(total/86400), hours=Math.floor((total%86400)/3600), minutes=Math.floor((total%3600)/60), seconds=total%60
    const parts=[days&&`\${days}d`,(days||hours)&&`\${hours}h`,(days||hours||minutes)&&`\${minutes}m`,`\${seconds}s`].filter(Boolean)
    await ctx.reply(`MSCC uptime: \${parts.join(' ')}`)
  },
}
