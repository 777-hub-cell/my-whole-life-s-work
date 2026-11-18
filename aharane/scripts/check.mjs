import { readFile } from 'node:fs/promises'

const files = [
  'src/index.js',
  'src/policy.js',
  'src/update-manager.js',
  'src/account-runtime.js',
  'src/command-registry.js',
  'src/authorization.js',
  'src/owner-config.js',
  '.env.example',
]
const forbidden = [
  '/opt/mscc',
  '/var/lib/mscc',
  '/etc/mscc.env',
  'ACCOUNT_AUTH_ROOT',
  'MSCC_SETTINGS_FILE',
]
for (const path of files) {
  const source = await readFile(new URL('../' + path, import.meta.url), 'utf8')
  for (const marker of forbidden) {
    if (source.includes(marker)) {
      throw new Error(`${path} contains a forbidden MSCC dependency: ${marker}`)
    }
  }
}

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
if (packageJson.name !== 'aharane-whatsapp-bot') throw new Error('Unexpected Aharane package identity')
if (packageJson.scripts?.start !== 'node src/index.js') throw new Error('Aharane must start its own entry point')
if (packageJson.dependencies?.['@whiskeysockets/baileys'] !== '7.0.0-rc14') throw new Error('Aharane must pin the patched upstream Baileys release')
if (packageJson.dependencies?.['@itsliaaa/baileys']) throw new Error('Aharane must not depend on the unverified Baileys fork')
if (packageJson.dependencies?.yauzl !== '3.4.0') throw new Error('Aharane ZIP validation must use the reviewed yauzl 3.4.0 release')
if (packageJson.dependencies?.ws !== '8.23.0') throw new Error('Aharane studio WebSocket support must use ws 8.23.0')

const runtime = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
for (const marker of [
  "join(DATA_DIR, 'whatsapp-auth')",
  "join(DATA_DIR, 'whatsapp-auth-private')",
  "new URL('../commands/'",
  "new URL('../private-commands/'",
  "isPrivateSelfCommand",
  "isPublicOwnerSender",
  "accountRuntime.start(accountId)",
  "app.post('/api/accounts/:accountId/pair-code'",
  "app.put('/api/owners'",
]) {
  if (!runtime.includes(marker)) throw new Error('Aharane private/public foundation is missing: ' + marker)
}
for (const marker of ['private-commands', 'commands', 'plugins', 'lib']) {
  if (!runtime.includes("'" + marker + "'")) throw new Error('Source editor does not expose shared/private project folder: ' + marker)
}

const installer = await readFile(new URL('../install-azure.sh', import.meta.url), 'utf8')
for (const path of ['/opt/aharane', '/var/lib/aharane', '/etc/aharane.env', 'aharane.service']) {
  if (!installer.includes(path)) throw new Error(`Installer is missing its private resource path: ${path}`)
}
for (const forbiddenPath of ['/opt/mscc', '/var/lib/mscc', '/etc/mscc.env', 'mscc.service']) {
  if (installer.includes(forbiddenPath)) throw new Error(`Aharane installer must not touch ${forbiddenPath}`)
}

console.log('Aharane isolation checks passed.')

const accountRuntime = await readFile(new URL('../src/account-runtime.js', import.meta.url), 'utf8')
if (!accountRuntime.includes("SESSION_IDS = Object.freeze(['private', 'public'])")) throw new Error('Both WhatsApp account sessions must be registered')
if (!accountRuntime.includes('must use separate authentication directories')) throw new Error('Separate WhatsApp auth isolation is required')
