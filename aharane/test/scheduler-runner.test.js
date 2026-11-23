import test from 'node:test'
import assert from 'node:assert/strict'
import { createSchedulerRunner } from '../src/scheduler-runner.js'

test('claims due jobs once, runs them sequentially and records their outcomes', async () => {
  const finished = []
  const started = []
  let claimCount = 0
  const store = {
    async claimDue() {
      claimCount += 1
      if (claimCount === 1) return [
        { id: 'a', claimedRunId: 'a:1' },
        { id: 'b', claimedRunId: 'b:1' },
      ]
      return []
    },
    async finish(id, runId, outcome) { finished.push({ id, runId, outcome }) },
  }
  const runner = createSchedulerRunner({
    store,
    intervalMs: 60000,
    logger: { warn() {}, error() {} },
    execute: async schedule => {
      started.push(schedule.id)
      return { ok: true, summary: 'sent one message' }
    },
  })
  const result = await runner.tick()
  assert.deepEqual(started, ['a', 'b'])
  assert.equal(result.claimed, 2) // eager startup and the manual tick share one in-flight claim
  await runner.close()
  assert.deepEqual(finished.map(item => item.id), ['a', 'b'])
  assert.ok(finished.every(item => item.outcome.ok))
})

test('does not overlap a second tick while a schedule is executing', async () => {
  let release
  let executions = 0
  let claims = 0
  const store = {
    async claimDue() {
      claims += 1
      return claims === 1 ? [{ id: 'slow', claimedRunId: 'slow:1' }] : []
    },
    async finish() {},
  }
  const runner = createSchedulerRunner({
    store,
    intervalMs: 60000,
    logger: { warn() {}, error() {} },
    execute: async () => {
      executions += 1
      await new Promise(resolve => { release = resolve })
      return { ok: true }
    },
  })
  while (!release) await new Promise(resolve => setImmediate(resolve))
  const secondTick = runner.tick()
  release()
  const [first, second] = await Promise.all([runner.tick(), secondTick])
  assert.deepEqual(first, second)
  await runner.close()
  assert.equal(executions, 1)
})

test('records a failed execution without preventing later claimed jobs from running', async () => {
  const finished = []
  const ran = []
  const store = {
    async claimDue() {
      return [{ id: 'bad', claimedRunId: 'bad:1' }, { id: 'good', claimedRunId: 'good:1' }]
    },
    async finish(id, runId, outcome) { finished.push({ id, outcome }) },
  }
  const runner = createSchedulerRunner({
    store,
    intervalMs: 60000,
    logger: { warn() {}, error() {} },
    execute: async schedule => {
      ran.push(schedule.id)
      if (schedule.id === 'bad') throw new Error('WhatsApp offline')
      return { ok: true }
    },
  })
  // The eager first poll already claimed the rows.
  while (finished.length < 2) await new Promise(resolve => setImmediate(resolve))
  await runner.close()
  assert.deepEqual(ran, ['bad', 'good'])
  assert.equal(finished.find(item => item.id === 'bad').outcome.ok, false)
  assert.equal(finished.find(item => item.id === 'good').outcome.ok, true)
})
