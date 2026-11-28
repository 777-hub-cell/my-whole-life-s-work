import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSchedulerStore } from '../src/scheduler-store.js'

const destination = '2348012345678@s.whatsapp.net'

test('interval schedules persist, claim once and record a result', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-scheduler-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  let now = Date.parse('2026-11-23T08:00:00.000Z')
  const file = join(dir, 'scheduler.json')
  const store = createSchedulerStore(file, { now: () => now })
  await store.init()
  const created = await store.create({
    workflowId: 'workflow-1', account: 'private', destinationJid: destination,
    type: 'interval', intervalMinutes: 5, timeZone: 'Africa/Lagos',
  })
  assert.equal(Date.parse(created.nextRunAt), now + 5 * 60000)

  now += 5 * 60000
  const due = await store.claimDue(now)
  assert.equal(due.length, 1)
  assert.equal(due[0].claimedRunId, due[0].lastRunId)
  assert.equal(due[0].lastRunStatus, 'running')
  assert.equal((await store.claimDue(now)).length, 0, 'a claimed occurrence must not be claimed twice')

  assert.equal(await store.finish(created.id, due[0].claimedRunId, { ok: true, summary: 'Sent 3 messages.' }), true)
  const saved = await store.get(created.id)
  assert.equal(saved.lastRunStatus, 'success')
  assert.equal(saved.lastSummary, 'Sent 3 messages.')
  assert.equal(Date.parse(saved.nextRunAt), now + 5 * 60000)
})

test('a claimed job is marked interrupted and is not replayed after a restart', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-scheduler-restart-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  let now = Date.parse('2026-11-23T08:00:00.000Z')
  const file = join(dir, 'scheduler.json')
  const first = createSchedulerStore(file, { now: () => now })
  await first.init()
  const created = await first.create({
    workflowId: 'workflow-2', account: 'public', destinationJid: destination,
    type: 'once', runAt: new Date(now + 60000).toISOString(), timeZone: 'Africa/Lagos',
  })
  now += 60000
  assert.equal((await first.claimDue(now)).length, 1)

  const restarted = createSchedulerStore(file, { now: () => now + 1000 })
  await restarted.init()
  const recovered = await restarted.get(created.id)
  assert.equal(recovered.lastRunStatus, 'interrupted')
  assert.equal(recovered.enabled, false)
  assert.equal((await restarted.claimDue(now + 1000)).length, 0)
})

test('daily schedules calculate the next occurrence in the selected time zone', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-scheduler-zone-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const now = Date.parse('2026-11-23T08:00:00.000Z') // 09:00 in Africa/Lagos
  const store = createSchedulerStore(join(dir, 'scheduler.json'), { now: () => now })
  await store.init()
  const created = await store.create({
    workflowId: 'workflow-3', account: 'private', destinationJid: destination,
    type: 'daily', time: '10:00', timeZone: 'Africa/Lagos',
  })
  assert.equal(created.nextRunAt, '2026-11-23T09:00:00.000Z')
})
