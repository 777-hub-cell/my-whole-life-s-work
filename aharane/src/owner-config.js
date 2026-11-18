import { readFile, mkdir, open, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { normalizePhone, parseAllowedSenders } from './policy.js'

function allowedList(value) {
  if (Array.isArray(value)) return [...parseAllowedSenders(value.join(','))].sort()
  return [...parseAllowedSenders(value)].sort()
}

export function normalizeOwnerConfig(value = {}) {
  const privateOwnerNumber = normalizePhone(value.privateOwnerNumber)
  const publicOwnerNumber = normalizePhone(value.publicOwnerNumber)
  if (privateOwnerNumber && publicOwnerNumber && privateOwnerNumber === publicOwnerNumber) {
    throw new Error('Private Owner and Public Owner must be two different WhatsApp numbers.')
  }
  const allowedPublicSenders = new Set(allowedList(value.allowedPublicSenders))
  if (publicOwnerNumber) allowedPublicSenders.add(publicOwnerNumber)
  return {
    version: 1,
    privateOwnerNumber,
    publicOwnerNumber,
    allowedPublicSenders: [...allowedPublicSenders].sort(),
    updatedAt: String(value.updatedAt || ''),
  }
}

export async function loadOwnerConfig(file, legacy = {}) {
  const fallback = normalizeOwnerConfig({
    privateOwnerNumber: legacy.privateOwnerNumber || '',
    publicOwnerNumber: legacy.publicOwnerNumber || '',
    allowedPublicSenders: legacy.allowedPublicSenders || '',
  })
  let raw
  try {
    raw = JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw new Error('Aharane owner configuration could not be read; refusing to guess owner identities.')
  }
  return normalizeOwnerConfig({
    privateOwnerNumber: raw?.privateOwnerNumber ?? fallback.privateOwnerNumber,
    publicOwnerNumber: raw?.publicOwnerNumber ?? fallback.publicOwnerNumber,
    allowedPublicSenders: raw?.allowedPublicSenders ?? fallback.allowedPublicSenders,
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
