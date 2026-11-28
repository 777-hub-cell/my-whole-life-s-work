/**
 * Single-flight server-side runner for durable Visual Command schedules.
 * The store must claim and persist each due occurrence before this runner
 * invokes the workflow. A claimed occurrence is never automatically replayed.
 */
export function createSchedulerRunner({
  store,
  execute,
  onResult = () => {},
  logger = console,
  intervalMs = 5000,
  now = () => Date.now(),
} = {}) {
  if (!store || typeof store.claimDue !== 'function' || typeof store.finish !== 'function') {
    throw new TypeError('Scheduler runner requires a persistent schedule store.')
  }
  if (typeof execute !== 'function') throw new TypeError('Scheduler runner requires an execution function.')
  const pollMs = Math.max(1000, Math.min(60000, Number(intervalMs) || 5000))
  let closed = false
  let inFlight = null
  let timer = null

  async function tick() {
    if (closed) return { skipped: true, reason: 'closed' }
    if (inFlight) return inFlight
    inFlight = (async () => {
      const due = await store.claimDue(now())
      const outcomes = []
      for (const schedule of due) {
        if (closed) {
          // The due occurrence has already been claimed. Do not replay it on
          // restart because its delivery state is unknown.
          await store.finish(schedule.id, schedule.claimedRunId, {
            ok: false,
            error: 'Scheduler is shutting down after this occurrence was claimed; it was not replayed.',
          }).catch(() => {})
          continue
        }
        let outcome
        try {
          outcome = await execute(schedule)
          const result = {
            ok: outcome?.ok !== false,
            summary: String(outcome?.summary || outcome?.message || 'Scheduled workflow completed.'),
          }
          await store.finish(schedule.id, schedule.claimedRunId, result)
          outcomes.push({ scheduleId: schedule.id, ...result })
          try { onResult({ schedule, ...result }) } catch {}
          if (!result.ok) logger.warn?.({ event: 'scheduler.execution-failed', scheduleId: schedule.id, error: result.summary })
        } catch (error) {
          const message = String(error?.message || error).slice(0, 500)
          await store.finish(schedule.id, schedule.claimedRunId, { ok: false, error: message }).catch(finishError => {
            logger.error?.({ event: 'scheduler.finish-failed', scheduleId: schedule.id, error: String(finishError?.message || finishError) })
          })
          outcomes.push({ scheduleId: schedule.id, ok: false, error: message })
          try { onResult({ schedule, ok: false, error: message }) } catch {}
          logger.warn?.({ event: 'scheduler.execution-failed', scheduleId: schedule.id, error: message })
        }
      }
      return { claimed: due.length, outcomes }
    })()
    try {
      return await inFlight
    } finally {
      inFlight = null
    }
  }

  timer = setInterval(() => { void tick().catch(error => {
    logger.error?.({ event: 'scheduler.poll-failed', error: String(error?.message || error) })
  }) }, pollMs)
  timer.unref?.()
  void tick().catch(error => logger.error?.({ event: 'scheduler.initial-poll-failed', error: String(error?.message || error) }))

  return {
    tick,
    async close() {
      if (closed) return
      closed = true
      if (timer) clearInterval(timer)
      if (inFlight) await inFlight.catch(() => {})
    },
  }
}
