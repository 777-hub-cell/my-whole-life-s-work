import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { validateEngineManifest, compareEngineInterfaces } from './engine-contract.js'

const MAX_CODE_BYTES = 64 * 1024
const EDITOR_SOURCE = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*export\s+(?:async\s+)?function\s+run\s*\(/
const LIMIT = 100
const MAX_HISTORY = 20
const ENGINE_FILE = /^[a-z][a-z0-9_-]{0,47}\.json$/
const contentHash = (manifest, code) => createHash('sha256').update(JSON.stringify({ manifest, code: String(code || '') })).digest('hex')

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
  const historyFile = id => join(root, id + '.history.json')

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
    const code = String(parsed.code || '')
    return {
      manifest,
      code,
      // Files saved before revisions existed are treated as revision 1 of their current content.
      revision: Number.isSafeInteger(parsed.revision) && parsed.revision >= 1 ? parsed.revision : 1,
      sha256: contentHash(manifest, code),
      createdAt: String(parsed.createdAt || ''),
      updatedAt: String(parsed.updatedAt || ''),
    }
  }

  async function readHistory(id) {
    const text = await readFile(historyFile(id), 'utf8').catch(error => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (text === null) return []
    try {
      const rows = JSON.parse(text)
      return Array.isArray(rows) ? rows.filter(row => row && Number.isSafeInteger(row.revision) && row.manifest && typeof row.code === 'string') : []
    } catch { return [] }
  }

  async function writeAtomic(path, text) {
    const tmp = path + '.' + randomUUID() + '.tmp'
    try {
      await writeFile(tmp, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      await rename(tmp, path)
    } finally {
      await rm(tmp, { force: true }).catch(() => {})
    }
  }

  async function list() {
    await tail
    await init()
    const names = await readdir(root)
    const result = []
    for (const name of names.filter(n => ENGINE_FILE.test(n)).slice(0, LIMIT + 1)) {
      const engine = await readOne(name.slice(0, -5))
      if (engine) result.push({
        ...engine.manifest,
        revision: engine.revision,
        sha256: engine.sha256,
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

  async function save(manifestInput, source, expectedVersion = null, options = {}) {
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
        // Version alone cannot detect two editors saving different code at the same version.
        if (options.expectedRevision != null && Number(options.expectedRevision) !== existing.revision) {
          const error = new Error('Engine changed since it was opened (saved revision ' + existing.revision + '). Reload before editing so no work is overwritten.')
          error.conflict = true
          error.currentRevision = existing.revision
          throw error
        }
        if (manifest.version < existing.manifest.version) throw new Error('Engine version cannot decrease.')
        const changes = compareEngineInterfaces(existing.manifest, manifest)
        if (!changes.compatible && manifest.version <= existing.manifest.version) {
          throw new Error('Breaking Engine port changes require a newer version.')
        }
      } else {
        const files = await readdir(root)
        if (files.filter(name => ENGINE_FILE.test(name)).length >= LIMIT) throw new Error('Engine library limit reached.')
      }
      const now = new Date().toISOString()
      const revision = existing ? existing.revision + 1 : 1
      const sha256 = contentHash(manifest, source)
      const payload = { manifest, code: source, revision, sha256, createdAt: existing?.createdAt || now, updatedAt: now }
      // Immutable history first, then the current file: a crash in between never loses a revision.
      const history = (await readHistory(manifest.id)).filter(row => row.revision !== revision)
      if (existing && !history.some(row => row.revision === existing.revision)) {
        history.push({ revision: existing.revision, sha256: existing.sha256, version: existing.manifest.version, savedAt: existing.updatedAt, manifest: existing.manifest, code: existing.code })
      }
      history.push({ revision, sha256, version: manifest.version, savedAt: now, manifest, code: source })
      await writeAtomic(historyFile(manifest.id), JSON.stringify(history.slice(-MAX_HISTORY)))
      await writeAtomic(file(manifest.id), JSON.stringify(payload))
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
      await rm(historyFile(id), { force: true })
      return true
    })
  }

  /** An exact saved revision (code, manifest, sha256), or null. Snapshots are never modified. */
  async function getRevision(id, revision) {
    await tail
    const current = await readOne(id)
    if (!current) return null
    const wanted = Number(revision)
    if (!Number.isSafeInteger(wanted) || wanted < 1) return null
    if (wanted === current.revision) return current
    const row = (await readHistory(id)).find(item => item.revision === wanted)
    if (!row) return null
    const manifest = validateEngineManifest(row.manifest)
    return { manifest, code: row.code, revision: row.revision, sha256: contentHash(manifest, row.code), createdAt: current.createdAt, updatedAt: String(row.savedAt || '') }
  }

  async function listRevisions(id) {
    await tail
    const current = await readOne(id)
    if (!current) return []
    const rows = (await readHistory(id)).map(row => ({ revision: row.revision, sha256: row.sha256, version: row.version, savedAt: row.savedAt }))
    if (!rows.some(row => row.revision === current.revision)) rows.push({ revision: current.revision, sha256: current.sha256, version: current.manifest.version, savedAt: current.updatedAt })
    return rows.sort((a, b) => a.revision - b.revision)
  }

  return { init, list, get, save, remove, getRevision, listRevisions }
}
