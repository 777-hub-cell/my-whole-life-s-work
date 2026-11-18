import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export function createActivityStore({ dataDir, maxEntries = 20000 } = {}) {
  if (!dataDir) throw new TypeError('Activity store requires a persistent data directory.')
  const file = join(dataDir, 'activity.jsonl')
  let queue = Promise.resolve()
  async function init() { await mkdir(dataDir, { recursive: true, mode: 0o700 }) }
  async function append(entry = {}) {
    await init()
    const record = {
      id: randomUUID(), at: new Date().toISOString(),
      level: ['info','warn','error'].includes(entry.level) ? entry.level : 'info',
      source: String(entry.source || 'runtime').slice(0, 40),
      message: String(entry.message || 'Activity').replace(/[\r\n\t]+/g, ' ').slice(0, 240),
      details: entry.details && typeof entry.details === 'object' ? entry.details : {},
    }
    const line = JSON.stringify(record) + '\n'
    const next = queue.catch(() => {}).then(async () => { await appendFile(file, line, { encoding: 'utf8', mode: 0o600 }) })
    queue = next
    return next.then(() => record)
  }
  async function list({ limit = 200, level = 'all', query = '' } = {}) {
    await queue.catch(() => {})
    const text = await readFile(file, 'utf8').catch(error => error?.code === 'ENOENT' ? '' : Promise.reject(error))
    const rows = text.split('\n').filter(Boolean).slice(-maxEntries).flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
    const q = String(query || '').toLowerCase()
    return rows.filter(row => (level === 'all' || row.level === level) && (!q || (row.message + ' ' + row.source).toLowerCase().includes(q)))
      .slice(-Math.max(1, Math.min(1000, Number(limit) || 200))).reverse()
  }
  async function clear() {
    await queue.catch(() => {})
    const tmp = file + '.' + randomUUID() + '.tmp'
    await writeFile(tmp, '', { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await rename(tmp, file).catch(async error => { await rm(tmp, { force: true }); throw error })
    queue = Promise.resolve()
  }
  return { init, append, list, clear }
}
