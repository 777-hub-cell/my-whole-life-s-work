import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

const MAX_SCHEDULES = 200
const MIN_INTERVAL_MINUTES = 1
const MAX_INTERVAL_MINUTES = 10080
const DESTINATION = /^(?:\d{7,15}@s\.whatsapp\.net|\d{5,25}@lid|\d{10,20}-\d{7,20}@g\.us)$/
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const WEEKDAYS = new Set([0, 1, 2, 3, 4, 5, 6])
const clone = value => structuredClone(value)

function zonedParts(date, timeZone) {
  const values = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const part = type => Number(values.find(item => item.type === type)?.value || 0)
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute') }
}

function localDateToUtc(parts, timeZone) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
  let guess = target
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const actual = zonedParts(new Date(guess), timeZone)
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute)
    const difference = target - represented
    if (difference === 0) return guess
    guess += difference
  }
  // A local time can be skipped during a daylight-saving transition. In that
  // case choose the first valid local minute after the requested wall time.
  const targetDay = Date.UTC(parts.year, parts.month - 1, parts.day)
  const targetMinutes = parts.hour * 60 + parts.minute
  for (let minute = 0; minute <= 360; minute += 1) {
    const candidate = guess + minute * 60000
    const actual = zonedParts(new Date(candidate), timeZone)
    if (Date.UTC(actual.year, actual.month - 1, actual.day) !== targetDay) continue
    if (actual.hour * 60 + actual.minute >= targetMinutes) return candidate
  }
  throw new Error('Could not resolve this local scheduled time in the selected time zone.')
}

function nextCalendarOccurrence(schedule, afterMs) {
  const timeZone = schedule.timeZone
  const [hour, minute] = schedule.time.split(':').map(Number)
  const current = zonedParts(new Date(afterMs), timeZone)
  const baseDay = Date.UTC(current.year, current.month - 1, current.day)
  for (let offset = 0; offset <= 8; offset += 1) {
    const day = new Date(baseDay + offset * 86400000)
    const weekday = day.getUTCDay()
    if (schedule.type === 'weekly' && !schedule.weekdays.includes(weekday)) continue
    const candidate = localDateToUtc({
      year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(), hour, minute,
    }, timeZone)
    if (candidate > afterMs + 500) return new Date(candidate).toISOString()
  }
  throw new Error('Could not calculate the next scheduled occurrence.')
}

function normalizeSchedule(input, nowMs, existing = null) {
  const type = String(input.type ?? existing?.type ?? '')
  if (!['once', 'interval', 'daily', 'weekly'].includes(type)) throw new Error('Schedule type must be once, interval, daily or weekly.')
  const destinationJid = String(input.destinationJid ?? existing?.destinationJid ?? '').trim()
  if (!DESTINATION.test(destinationJid) || destinationJid === 'status@broadcast') throw new Error('Choose a valid direct WhatsApp or group destination.')
  const timeZone = String(input.timeZone ?? existing?.timeZone ?? 'Africa/Lagos').trim()
  try { new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(nowMs)) }
  catch { throw new Error('The selected time zone is not valid.') }

  const result = { type, destinationJid, timeZone }
  if (type === 'once') {
    const runAt = String(input.runAt ?? existing?.runAt ?? '')
    const time = Date.parse(runAt)
    if (!Number.isFinite(time) || time <= nowMs) throw new Error('A one-time schedule must be in the future and include a valid ISO date/time.')
    result.runAt = new Date(time).toISOString()
    result.nextRunAt = result.runAt
  } else if (type === 'interval') {
    const intervalMinutes = Number(input.intervalMinutes ?? existing?.intervalMinutes)
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < MIN_INTERVAL_MINUTES || intervalMinutes > MAX_INTERVAL_MINUTES) {
      throw new Error('Repeat interval must be from 1 minute to 7 days.')
    }
    result.intervalMinutes = intervalMinutes
    result.nextRunAt = new Date(nowMs + intervalMinutes * 60000).toISOString()
  } else {
    const time = String(input.time ?? existing?.time ?? '')
    if (!TIME.test(time)) throw new Error('Daily/weekly schedules require a 24-hour time in HH:mm format.')
    result.time = time
    if (type === 'weekly') {
      const days = Array.isArray(input.weekdays) ? input.weekdays : existing?.weekdays
      const weekdays = [...new Set((days || []).map(Number))]
      if (!weekdays.length || weekdays.some(day => !WEEKDAYS.has(day))) throw new Error('Choose at least one valid weekday for a weekly schedule.')
      result.weekdays = weekdays.sort((a, b) => a - b)
    }
    result.nextRunAt = nextCalendarOccurrence({ ...result, type }, nowMs)
  }
  return result
}

export function createSchedulerStore(filePath, { now = () => Date.now() } = {}) {
  if (!filePath) throw new TypeError('A scheduler data file path is required.')
  let data = { version: 1, schedules: [] }
  let tail = Promise.resolve()
  let storageError = ''

  async function persist() {
    await mkdir(dirname(filePath), { recursive: true, mode: 0o700 })
    const temporary = filePath + '.' + process.pid + '.' + randomUUID() + '.tmp'
    try {
      await writeFile(temporary, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, filePath)
    } finally {
      await rm(temporary, { force: true }).catch(() => {})
    }
  }

  function mutate(operation) {
    const pending = tail.then(async () => {
      if (storageError) throw new Error(storageError)
      const result = await operation()
      await persist()
      return result
    })
    tail = pending.catch(() => {})
    return pending
  }

  async function init() {
    await mkdir(dirname(filePath), { recursive: true, mode: 0o700 })
    try {
      const loaded = JSON.parse(await readFile(filePath, 'utf8'))
      if (loaded?.version !== 1 || !Array.isArray(loaded.schedules)) throw new Error('Unsupported schedule store format.')
      data = { version: 1, schedules: loaded.schedules }
      // A claimed job is never replayed after a process crash: it may already
      // have sent some WhatsApp messages. Mark it interrupted and preserve the
      // pre-advanced nextRunAt to favour at-most-once over duplicate sends.
      for (const schedule of data.schedules) {
        if (schedule.lastRunStatus === 'running') {
          schedule.lastRunStatus = 'interrupted'
          schedule.lastError = 'The server stopped during this execution. It was not replayed to avoid duplicate messages.'
          schedule.lastFinishedAt = new Date(now()).toISOString()
        }
      }
      await persist()
    } catch (error) {
      if (error.code === 'ENOENT') return
      storageError = 'Scheduler storage is invalid or unreadable; existing data was preserved. ' + String(error.message || error)
      throw new Error(storageError)
    }
  }

  async function list() {
    await tail
    if (storageError) throw new Error(storageError)
    return clone(data.schedules.sort((a, b) => String(a.nextRunAt || '').localeCompare(String(b.nextRunAt || ''))))
  }

  async function get(id) {
    await tail
    if (storageError) throw new Error(storageError)
    const item = data.schedules.find(row => row.id === id)
    return item ? clone(item) : null
  }

  async function create(input) {
    return mutate(async () => {
      if (data.schedules.length >= MAX_SCHEDULES) throw new Error('The schedule limit has been reached.')
      const timestamp = now()
      const normalized = normalizeSchedule(input, timestamp)
      const item = {
        id: randomUUID(), workflowId: String(input.workflowId || ''), account: String(input.account || ''),
        ...normalized, enabled: true, createdAt: new Date(timestamp).toISOString(),
        updatedAt: new Date(timestamp).toISOString(), lastRunAt: null, lastFinishedAt: null,
        lastRunId: null, lastRunStatus: 'never', lastError: '', lastSummary: '',
      }
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(item.workflowId) || !['private', 'public'].includes(item.account)) {
        throw new Error('A valid saved workflow and WhatsApp account are required.')
      }
      data.schedules.push(item)
      return clone(item)
    })
  }

  async function update(id, patch) {
    return mutate(async () => {
      const item = data.schedules.find(row => row.id === id)
      if (!item) return null
      if (item.lastRunStatus === 'running') throw new Error('A running schedule cannot be edited.')
      const normalized = normalizeSchedule({ ...item, ...patch }, now(), item)
      Object.assign(item, normalized, {
        enabled: patch.enabled === undefined ? item.enabled : patch.enabled === true,
        updatedAt: new Date(now()).toISOString(),
      })
      if (item.enabled && item.type === 'once' && !item.nextRunAt) throw new Error('A completed one-time schedule cannot be re-enabled.')
      return clone(item)
    })
  }

  async function setEnabled(id, enabled) {
    return mutate(async () => {
      const item = data.schedules.find(row => row.id === id)
      if (!item) return null
      if (item.lastRunStatus === 'running') throw new Error('A running schedule cannot be paused.')
      if (enabled && item.type === 'once' && !item.nextRunAt) throw new Error('A completed one-time schedule cannot be re-enabled.')
      item.enabled = enabled === true
      if (item.enabled) {
        if (item.type === 'once') item.nextRunAt = item.runAt
        else item.nextRunAt = normalizeSchedule(item, now(), item).nextRunAt
      }
      item.updatedAt = new Date(now()).toISOString()
      return clone(item)
    })
  }

  async function remove(id) {
    return mutate(async () => {
      const index = data.schedules.findIndex(row => row.id === id)
      if (index < 0) return false
      if (data.schedules[index].lastRunStatus === 'running') throw new Error('A running schedule cannot be deleted.')
      data.schedules.splice(index, 1)
      return true
    })
  }

  async function claimDue(nowMs = now()) {
    return mutate(async () => {
      const due = []
      for (const item of data.schedules) {
        if (!item.enabled || !item.nextRunAt || Date.parse(item.nextRunAt) > nowMs || item.lastRunStatus === 'running') continue
        const dueAt = item.nextRunAt
        const runId = item.id + ':' + dueAt
        item.lastRunId = runId
        item.lastRunAt = new Date(nowMs).toISOString()
        item.lastRunStatus = 'running'
        item.lastError = ''
        item.lastSummary = ''
        if (item.type === 'once') {
          item.enabled = false
          item.nextRunAt = null
        } else if (item.type === 'interval') {
          item.nextRunAt = new Date(nowMs + item.intervalMinutes * 60000).toISOString()
        } else {
          item.nextRunAt = nextCalendarOccurrence(item, nowMs)
        }
        item.updatedAt = new Date(nowMs).toISOString()
        due.push(clone(item))
      }
      return due.map(item => ({ ...item, claimedRunId: item.lastRunId }))
    })
  }

  async function finish(id, runId, outcome = {}) {
    return mutate(async () => {
      const item = data.schedules.find(row => row.id === id)
      if (!item || item.lastRunId !== runId || item.lastRunStatus !== 'running') return false
      item.lastRunStatus = outcome.ok === true ? 'success' : 'failed'
      item.lastError = outcome.ok === true ? '' : String(outcome.error || 'Scheduled execution failed.').slice(0, 500)
      item.lastSummary = String(outcome.summary || '').slice(0, 500)
      item.lastFinishedAt = new Date(now()).toISOString()
      item.updatedAt = item.lastFinishedAt
      return true
    })
  }

  return { init, list, get, create, update, setEnabled, remove, claimDue, finish }
}
