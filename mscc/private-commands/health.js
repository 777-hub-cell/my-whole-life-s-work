export default {
  name: 'health',
  description: 'Show control-plane health, command counts and session state.',
  async run(ctx) {
    const d = ctx.diagnostics()
    const connected = d.accounts.filter(account => account.connected).length
    const invalid = d.accounts.filter(account => account.status === 'auth-invalid').length
    const storage = ctx.storageStats?.() || { messages:0, routes:0 }
    await ctx.reply(['🩺 MSCC health',`Accounts: \${connected}/\${d.accounts.length} connected`,`Auth-invalid: \${invalid}`,`Private commands: \${d.privateCommandCount}`,`Public commands: \${d.publicCommandCount}`,`Public prefix: \${d.publicPrefix}`,`Public commands: \${d.publicCommandsEnabled ? 'ON' : 'LOCKED DOWN'}`,`WhatsApp Web: \${d.waVersion || 'not resolved yet'}`].join('\n'))
  },
}
