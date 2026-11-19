import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createActivityStore } from '../src/activity-store.js'

test('activity store persists, filters, bounds and clears entries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-activity-'))
  try {
    const store = createActivityStore({ dataDir: dir })
    await store.init()
    await store.append({ level: 'warn', source: 'whatsapp', message: 'Socket reconnecting' })
    await store.append({ level: 'info', source: 'runtime', message: 'Started' })
    assert.equal((await store.list({ level: 'warn' })).length, 1)
    assert.equal((await store.list({ query: 'started' })).length, 1)
    assert.equal((await store.list({ limit: 1 })).length, 1)
    await store.clear()
    assert.equal((await store.list()).length, 0)
  } finally { await rm(dir, { recursive: true, force: true }) }
})


test('activity history is physically capped instead of growing forever', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-activity-cap-'))
  try {
    const store = createActivityStore({ dataDir: dir, maxEntries: 2 })
    for (let index = 0; index < 8; index += 1) await store.append({ message: 'entry ' + index })
    const rows = await store.list({ limit: 20 })
    assert.equal(rows.length, 2)
    assert.equal(rows[0].message, 'entry 7')
    const { readFile } = await import('node:fs/promises')
    const diskRows = (await readFile(join(dir, 'activity.jsonl'), 'utf8')).trim().split(String.fromCharCode(10))
    assert.equal(diskRows.length, 2)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
