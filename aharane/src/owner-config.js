import { readFile, mkdir, open, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { normalizePhone } from './policy.js'

/**
 * Owner identities belong to their sessions. Version 4 preserves distinct v2
 * identities; version 3 already collapsed them, so its last saved identity is
 * retained for both until a user explicitly changes either one.
 * The Public Owner may legitimately be the Public session's own number.
 */
export function normalizeOwnerConfig(value = {}) {
  const privateOwnerNumber = normalizePhone(value.privateOwnerNumber || value.ownerNumber)
  const publicOwnerNumber = normalizePhone(value.publicOwnerNumber || value.ownerNumber)
  const publicBotNumber = normalizePhone(value.publicBotNumber)
  return {
    version: 4,
    ownerNumber: privateOwnerNumber, // legacy read-only alias for older clients
    privateOwnerNumber,
    publicOwnerNumber,
    publicBotNumber,
    allowedPublicSenders: [], // Public access has no manual sender allow-list
    updatedAt: String(value.updatedAt || ''),
  }
}

export async function loadOwnerConfig(file, legacy = {}) {
  const fallback = normalizeOwnerConfig({
    privateOwnerNumber: legacy.privateOwnerNumber || legacy.ownerNumber,
    publicOwnerNumber: legacy.publicOwnerNumber || legacy.ownerNumber,
    publicBotNumber: legacy.publicBotNumber,
  })
  let raw
  try {
    raw = JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw new Error('Aharane owner configuration could not be read; refusing to guess owner identities.')
  }
  return normalizeOwnerConfig({
    privateOwnerNumber: raw?.privateOwnerNumber || raw?.ownerNumber || fallback.privateOwnerNumber,
    publicOwnerNumber: raw?.publicOwnerNumber || raw?.ownerNumber || fallback.publicOwnerNumber,
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
