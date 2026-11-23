import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { validateEngineManifest, compareEngineInterfaces } from './engine-contract.js'

const MAX_CODE_BYTES = 64 * 1024
const EDITOR_SOURCE = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*export\s+(?:async\s+)?function\s+run\s*\(/
const LIMIT = 100

/**
 * Durable Engine source library. Engines are deliberately *not executable* here.
 * Store user code outside the release tree and outside both WhatsApp auth trees.
 * A secure, isolated executor and command dependency resolver are release gates.
 */
export function createEngineStore({ dataDir }) {
  if (!dataDir) throw new TypeError('An Engine store requires a persistent data directory.')
  const root = join(dataDir, 'engines')
  let tail = Promise.resolve()
  const file = id => join(root, id + '.json')

  const serial = operation => {
    const pending = tail.catch(() => {}).then(operation)
    tail = pending.catch(() => {})
    return pending
  }

  async function init() {
    await mkdir(root, { recursive: true, mode: 0o700 })
  }

  async function readOne(id) {
    if (!/^[a-z][a-z0-9_-]{0,47}$/.test(String(id))) throw new Error('Invalid Engine ID.')
    await init()
    const text = await readFile(file(id), 'utf8').catch(error => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (text === null) return null
    const parsed = JSON.parse(text)
    const manifest = validateEngineManifest(parsed.manifest)
    return {
      manifest,
      code: String(parsed.code || ''),
      createdAt: String(parsed.createdAt || ''),
      updatedAt: String(parsed.updatedAt || ''),
    }
  }

  async function list() {
    await tail
    await init()
    const names = await readdir(root)
    const result = []
    for (const name of names.filter(n => /^[a-z][a-z0-9_-]{0,47}\.json$/.test(n)).slice(0, LIMIT + 1)) {
      const engine = await readOne(name.slice(0, -5))
      if (engine) result.push({
        ...engine.manifest,
        createdAt: engine.createdAt,
        updatedAt: engine.updatedAt,
      })
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }

  async function get(id) {
    await tail
    return readOne(id)
  }

  async function save(manifestInput, source, expectedVersion = null) {
    return serial(async () => {
      const manifest = validateEngineManifest(manifestInput)
      if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > MAX_CODE_BYTES ||
          !EDITOR_SOURCE.test(source)) {
        throw new Error('Engine code must declare export function run or export async function run and fit within 64 KiB.')
      }
      const existing = await readOne(manifest.id)
      if (existing) {
        if (!Number.isSafeInteger(expectedVersion) || expectedVersion !== existing.manifest.version) {
          throw new Error('Engine changed since it was opened. Reload before editing.')
        }
        if (manifest.version < existing.manifest.version) throw new Error('Engine version cannot decrease.')
        const changes = compareEngineInterfaces(existing.manifest, manifest)
        if (!changes.compatible && manifest.version <= existing.manifest.version) {
          throw new Error('Breaking Engine port changes require a newer version.')
        }
      } else {
        const files = await readdir(root)
        if (files.filter(name => name.endsWith('.json')).length >= LIMIT) throw new Error('Engine library limit reached.')
      }
      const now = new Date().toISOString()
      const payload = { manifest, code: source, createdAt: existing?.createdAt || now, updatedAt: now }
      const tmp = file(manifest.id) + '.' + randomUUID() + '.tmp'
      try {
        await writeFile(tmp, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
        await rename(tmp, file(manifest.id))
      } finally {
        await rm(tmp, { force: true }).catch(() => {})
      }
      return payload
    })
  }

  async function remove(id, { confirm = false, usedBy = [] } = {}) {
    return serial(async () => {
      if (confirm !== true) throw new Error('Confirm Engine deletion.')
      if (Array.isArray(usedBy) && usedBy.length) throw new Error('Engine is referenced by a saved command.')
      const existing = await readOne(id)
      if (!existing) return false
      await rm(file(id))
      return true
    })
  }

  return { init, list, get, save, remove }
}
