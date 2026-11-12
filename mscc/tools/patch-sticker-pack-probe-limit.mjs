import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const EXPECTED_BAILEYS_VERSION = '0.3.18-final'
export const STICKER_PACK_PROBE_LIMIT = 200

const ORIGINAL_GUARD = 'if (stickers.length > 60) {'
const PROBE_GUARD = `if (stickers.length > ${STICKER_PACK_PROBE_LIMIT}) {`
const ORIGINAL_ERROR = 'Sticker pack exceeds the maximum limit of 60 stickers'
const PROBE_ERROR = `Sticker pack exceeds the temporary probe ceiling of ${STICKER_PACK_PROBE_LIMIT} stickers`

export function patchStickerPackGuard(source) {
  const text = String(source ?? '')
  if (text.includes(PROBE_GUARD) && text.includes(PROBE_ERROR)) return text

  const guardCount = text.split(ORIGINAL_GUARD).length - 1
  const errorCount = text.split(ORIGINAL_ERROR).length - 1
  if (guardCount !== 1 || errorCount !== 1) {
    throw new Error('Unexpected @itsliaaa/baileys sticker-pack guard; refusing to patch an unverified source file.')
  }

  return text
    .replace(ORIGINAL_GUARD, PROBE_GUARD)
    .replace(ORIGINAL_ERROR, PROBE_ERROR)
}

export async function patchInstalledBaileys() {
  const require = createRequire(import.meta.url)
  const entry = require.resolve('@itsliaaa/baileys')
  const packageRoot = dirname(dirname(entry))
  const packageJsonPath = join(packageRoot, 'package.json')
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
  if (packageJson.version !== EXPECTED_BAILEYS_VERSION) {
    throw new Error(
      `Expected @itsliaaa/baileys ${EXPECTED_BAILEYS_VERSION}, found ${packageJson.version || 'unknown'}. ` +
      'Review the dependency before enabling sticker-pack probing.'
    )
  }

  const messagesPath = join(packageRoot, 'lib', 'Utils', 'messages.js')
  const source = await readFile(messagesPath, 'utf8')
  const patched = patchStickerPackGuard(source)
  if (patched !== source) await writeFile(messagesPath, patched, 'utf8')

  if (!patched.includes(PROBE_GUARD) || !patched.includes(PROBE_ERROR)) {
    throw new Error('The native sticker-pack probe guard could not be verified after patching.')
  }
  return { version:packageJson.version, limit:STICKER_PACK_PROBE_LIMIT, messagesPath }
}

const invokedPath = process.argv[1] ? fileURLToPath(pathToFileURL(process.argv[1])) : ''
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  const result = await patchInstalledBaileys()
  console.log(`Prepared @itsliaaa/baileys ${result.version} for owner-only sticker-pack probes up to ${result.limit}.`)
}
