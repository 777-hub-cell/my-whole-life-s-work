import { readFile, mkdir, open, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { normalizePhone } from './policy.js'

/**
 * Private and Public sessions are separate WhatsApp connections, but they
 * share one human Owner identity. The Public bot's own WhatsApp number is
 * separate because it identifies the bot account, not its owner.
 *
 * Older v2 files are migrated deterministically: prefer the old Private
 * Owner field, then the old Public Owner field. The legacy sender allow-list
 * is intentionally discarded; Public commands are open to valid senders.
 */
export function normalizeOwnerConfig(value = {}) {
  const ownerNumber = normalizePhone(value.ownerNumber)
    || normalizePhone(value.privateOwnerNumber)
    || normalizePhone(value.publicOwnerNumber)
  const publicBotNumber = normalizePhone(value.publicBotNumber)
  if (ownerNumber && publicBotNumber && ownerNumber === publicBotNumber) {
    throw new Error('The Owner number and Public bot WhatsApp number must be different.')
  }
  return {
    version: 3,
    ownerNumber,
    // Keep mirrored keys for older clients while maintaining one identity.
    privateOwnerNumber: ownerNumber,
    publicOwnerNumber: ownerNumber,
    publicBotNumber,
    allowedPublicSenders: [],
    updatedAt: String(value.updatedAt || ''),
  }
}

export async function loadOwnerConfig(file, legacy = {}) {
  const fallback = normalizeOwnerConfig({
    ownerNumber: legacy.ownerNumber || legacy.privateOwnerNumber || legacy.publicOwnerNumber || '',
    publicBotNumber: legacy.publicBotNumber || '',
  })
  let raw
  try {
    raw = JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw new Error('Aharane owner configuration could not be read; refusing to guess owner identities.')
  }
  return normalizeOwnerConfig({
    ownerNumber: raw?.ownerNumber || raw?.privateOwnerNumber || raw?.publicOwnerNumber || fallback.ownerNumber,
    publicBotNumber: raw?.publicBotNumber ?? fallback.publicBotNumber,
    updatedAt: raw?.updatedAt,
  })
}

export async function saveOwnerConfig(file, value) {
  const normalized = normalizeOwnerConfig({ ...value, updatedAt: new Date().toISOString() })
  const directory = dirname(file)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temporary = file + '.' + randomUUID() + '.tmp'
  let handle
  try {
    handle = await open(temporary, 'wx', 0o600)
    await handle.writeFile(JSON.stringify(normalized, null, 2), 'utf8')
    await handle.sync()
    await handle.close()
    handle = null
    await rename(temporary, file)
  } finally {
    if (handle) await handle.close().catch(() => {})
    await rm(temporary, { force: true }).catch(() => {})
  }
  return normalized
}
