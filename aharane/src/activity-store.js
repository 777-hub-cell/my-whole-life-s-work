import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export function createActivityStore({ dataDir, maxEntries = 20000 } = {}) {
  if (!dataDir) throw new TypeError('Activity store requires a persistent data directory.')
  const file = join(dataDir, 'activity.jsonl')
  const limit = Math.max(1, Math.floor(Number(maxEntries) || 20000))
  const compactAt = limit + Math.max(1, Math.min(1000, Math.ceil(limit * 0.1)))
  const newline = String.fromCharCode(10)
  let queue = Promise.resolve()
  let entryCount = 0
  let initPromise = null

  async function compact(rows) {
    const retained = rows.slice(-limit)
    const temporary = file + '.' + randomUUID() + '.tmp'
    const content = retained.length ? retained.map(row => JSON.stringify(row)).join(newline) + newline : ''
    await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    try {
      await rename(temporary, file)
      entryCount = retained.length
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {})
      throw error
    }
  }

  async function init() {
    if (!initPromise) {
      initPromise = (async () => {
        await mkdir(dataDir, { recursive: true, mode: 0o700 })
        const text = await readFile(file, 'utf8').catch(error =>
          error?.code === 'ENOENT' ? '' : Promise.reject(error)
        )
        const rows = text.split(newline).filter(Boolean).flatMap(line => {
          try { return [JSON.parse(line)] } catch { return [] }
        })
        entryCount = rows.length
        if (entryCount > limit) await compact(rows)
      })().catch(error => {
        initPromise = null
        throw error
      })
    }
    return initPromise
  }

  async function append(entry = {}) {
    await init()
    const record = {
      id: randomUUID(), at: new Date().toISOString(),
      level: ['info','warn','error'].includes(entry.level) ? entry.level : 'info',
      source: String(entry.source || 'runtime').slice(0, 40),
      message: String(entry.message || 'Activity').replace(/[\r\n\t]+/g, ' ').slice(0, 240),
      details: entry.details && typeof entry.details === 'object' ? entry.details : {},
    }
    const line = JSON.stringify(record) + newline
    const next = queue.catch(() => {}).then(async () => {
      await appendFile(file, line, { encoding: 'utf8', mode: 0o600 })
      entryCount += 1
      if (entryCount > compactAt) {
        const text = await readFile(file, 'utf8')
        const rows = text.split(newline).filter(Boolean).flatMap(value => {
          try { return [JSON.parse(value)] } catch { return [] }
        })
        await compact(rows)
      }
    })
    queue = next
    return next.then(() => record)
  }

  async function list({ limit: requestedLimit = 200, level = 'all', query = '' } = {}) {
    await queue.catch(() => {})
    await init()
    const text = await readFile(file, 'utf8').catch(error =>
      error?.code === 'ENOENT' ? '' : Promise.reject(error)
    )
    const rows = text.split(newline).filter(Boolean).flatMap(line => {
      try { return [JSON.parse(line)] } catch { return [] }
    })
    const q = String(query || '').toLowerCase()
    return rows.filter(row =>
      (level === 'all' || row.level === level) &&
      (!q || (row.message + ' ' + row.source).toLowerCase().includes(q))
    ).slice(-Math.max(1, Math.min(1000, Number(requestedLimit) || 200))).reverse()
  }

  async function clear() {
    await init()
    const next = queue.catch(() => {}).then(async () => {
      const tmp = file + '.' + randomUUID() + '.tmp'
      await writeFile(tmp, '', { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      await rename(tmp, file).catch(async error => {
        await rm(tmp, { force: true })
        throw error
      })
      entryCount = 0
    })
    queue = next
    return next
  }

  return { init, append, list, clear }
}
