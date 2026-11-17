import { randomBytes } from 'node:crypto'
import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const dataDir = resolve(process.env.AHARANE_DATA_DIR || '/var/lib/aharane')
const authFile = join(dataDir, 'admin-auth.json')
const setupFile = join(dataDir, 'admin-setup-code')
const reset = process.argv.includes('--reset')

await mkdir(dataDir, { recursive: true, mode: 0o700 })
let configured = false
try { await access(authFile); configured = true } catch {}
if (configured && !reset) {
  console.error('A Studio password already exists. Use --reset only when you intentionally need to replace it.')
  process.exit(1)
}
if (reset) await rm(authFile, { force: true })
const code = randomBytes(24).toString('base64url')
await writeFile(setupFile, code + '\n', { encoding: 'utf8', mode: 0o600 })
console.log('AHARANE ONE-TIME STUDIO SETUP CODE')
console.log(code)
console.log('Enter this code in Local Studio to create your personal password. It is consumed after successful setup.')