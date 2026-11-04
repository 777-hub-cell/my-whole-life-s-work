import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const UA = 'Mozilla/5.0 (Linux; Android 16; SM-A165F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'
const DEFAULT_TIMEOUT_MS = 45 * 60_000
const MIN_TIMEOUT_MS = 60_000
const MAX_TIMEOUT_MS = 60 * 60_000

function normalizeTimeoutMs(value) {
  if (value === undefined || value === null || String(value).trim() === '') return DEFAULT_TIMEOUT_MS
  const configured = Number(value)
  if (!Number.isFinite(configured)) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(configured)))
}

// Let long streams finish, but cap a stuck ffmpeg/ffprobe child at one hour.
const STREAM_COPY_TIMEOUT_MS = normalizeTimeoutMs(process.env.MSCC_STREAM_COPY_TIMEOUT_MS)
let queue = Promise.resolve()

function headerBlob(headers = {}) {
  const normalized = {
    'User-Agent':UA,
    ...headers,
  }
  return Object.entries(normalized)
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
    .map(([key, value]) => key + ': ' + String(value) + '\r\n')
    .join('')
}

function run(command, args, timeoutMs = STREAM_COPY_TIMEOUT_MS, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio:['ignore','pipe','pipe'] })
    let stdout = ''
    let stderr = ''
    let progressBuffer = ''
    let progressFields = {}
    let progressPending = Promise.resolve()

    const emitProgress = () => {
      const snapshot = { ...progressFields }
      progressFields = {}
      if (typeof onProgress !== 'function') return
      progressPending = progressPending
        .then(() => onProgress(snapshot))
        .catch(() => {})
    }

    child.stdout.on('data', chunk => {
      const value = String(chunk)
      stdout += value
      if (typeof onProgress !== 'function') return
      progressBuffer += value
      const lines = progressBuffer.split(/\r?\n/)
      progressBuffer = lines.pop() || ''
      for (const line of lines) {
        const separator = line.indexOf('=')
        if (separator <= 0) continue
        const key = line.slice(0, separator).trim()
        progressFields[key] = line.slice(separator + 1).trim()
        if (key === 'progress') emitProgress()
      }
    })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(command + ' timed out.'))
    }, timeoutMs)
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', code => {
      clearTimeout(timer)
      progressPending.then(() => {
        if (code === 0) resolve({ stdout, stderr })
        else reject(new Error(command + ' failed (' + code + '): ' + stderr.slice(-1200)))
      })
    })
  })
}

function progressSnapshot(fields = {}, durationSeconds = 0) {
  let rawTime = Number(fields.out_time_us)
  if (!Number.isFinite(rawTime) || rawTime <= 0) rawTime = Number(fields.out_time_ms)
  const timeSeconds = Number.isFinite(rawTime) && rawTime > 0 ? rawTime / 1_000_000 : 0
  const duration = Number(durationSeconds) > 0 ? Number(durationSeconds) : 0
  const percent = duration > 0 && timeSeconds > 0
    ? Math.min(99, Math.max(0, (timeSeconds / duration) * 100))
    : null
  return {
    phase:'copy',
    ...(percent === null ? {} : { percent }),
    ...(timeSeconds > 0 ? { timeSeconds } : {}),
    ...(duration > 0 ? { durationSeconds:duration } : {}),
    ...(fields.speed ? { speed:String(fields.speed) } : {}),
  }
}

function numericHeight(stream) {
  return Number(stream?.height || 0) || 0
}

function programRows(probe) {
  const rows = []
  for (const program of probe?.programs || []) {
    const video = (program?.streams || []).find(stream => stream?.codec_type === 'video')
    const height = numericHeight(video)
    const id = Number(program?.program_id)
    if (!Number.isFinite(id) || height <= 0) continue
    rows.push({
      id,
      height,
      width:Number(video?.width || 0) || 0,
      bandwidth:Number(program?.tags?.variant_bitrate || program?.tags?.BANDWIDTH || 0) || 0,
    })
  }
  return rows.sort((a,b) => b.height - a.height || b.bandwidth - a.bandwidth)
}

function streamHeights(probe) {
  const values = new Set(programRows(probe).map(row => row.height))
  for (const stream of probe?.streams || []) {
    if (stream?.codec_type === 'video' && numericHeight(stream) > 0) values.add(numericHeight(stream))
  }
  return [...values].sort((a,b) => b - a)
}

function wantedHeight(quality) {
  const value = Number(String(quality || '').replace(/[^0-9]/g, ''))
  return Number.isFinite(value) && value > 0 ? value : 0
}

export async function inspectInput(url, headers = {}) {
  const result = await run('ffprobe', [
    '-v','error',
    '-headers',headerBlob(headers),
    '-show_programs',
    '-show_streams',
    '-show_format',
    '-of','json',
    String(url),
  ], 120_000)
  let probe
  try { probe = JSON.parse(result.stdout || '{}') } catch { probe = {} }
  const heights = streamHeights(probe)
  return {
    url:String(url),
    headers:{ ...headers },
    probe,
    programs:programRows(probe),
    heights,
    maxHeight:heights[0] || 0,
    durationSeconds:Number(probe?.format?.duration || 0) || 0,
    playable:(probe?.streams || []).some(stream => stream?.codec_type === 'video') || programRows(probe).length > 0,
  }
}

export async function inspectCandidates(candidates = []) {
  const rows = []
  for (const candidate of candidates) {
    const url = String(candidate?.url || candidate || '').trim()
    if (!url) continue
    try {
      const inspected = await inspectInput(url, candidate?.headers || {})
      if (inspected.playable) rows.push({ ...candidate, ...inspected })
    } catch {}
  }
  return rows
}

export function qualitiesFor(inspected = []) {
  const values = new Set()
  for (const row of inspected) {
    for (const height of row?.heights || []) if (height > 0) values.add(height)
  }
  const sorted = [...values].sort((a,b) => b - a)
  return ['source', ...sorted.map(String)]
}

function chooseProgram(row, quality) {
  const programs = row?.programs || []
  if (!programs.length) return null
  const target = wantedHeight(quality)
  if (!target) return programs[0]
  return programs.find(program => program.height === target)
    || programs.find(program => program.height < target)
    || programs.at(-1)
}

export function chooseCandidate(inspected = [], quality = 'source') {
  if (!inspected.length) return null
  const target = wantedHeight(quality)
  const scored = inspected.map((row, index) => {
    const program = chooseProgram(row, quality)
    const height = program?.height || row.maxHeight || 0
    const exact = target > 0 && height === target ? 1 : 0
    const under = target > 0 && height <= target ? 1 : 0
    const distance = target > 0 ? Math.abs(target - height) : 0
    return { row, program, index, height, exact, under, distance }
  }).sort((a,b) => {
    if (a.exact !== b.exact) return b.exact - a.exact
    if (a.under !== b.under) return b.under - a.under
    if (target > 0 && a.distance !== b.distance) return a.distance - b.distance
    if (a.height !== b.height) return b.height - a.height
    return a.index - b.index
  })
  return scored[0]
}

async function materialize({ inspected, quality, delivery, durationSeconds = 0, onProgress }) {
  const choice = chooseCandidate(inspected, quality)
  if (!choice) throw new Error('No playable stream candidate is available.')

  const root = await mkdtemp(join(tmpdir(), 'mscc-stream-copy-'))
  const asVideo = delivery === 'video'
  const output = join(root, asVideo ? 'media.mp4' : 'media.mkv')
  const args = [
    '-hide_banner','-loglevel','error',
    '-progress','pipe:1','-stats_period','1','-nostats',
    '-headers',headerBlob(choice.row.headers),
    '-i',choice.row.url,
  ]
  if (choice.program) args.push('-map','0:p:' + choice.program.id)
  if (asVideo) args.push('-sn')
  if (Number(durationSeconds) > 0) args.push('-t', String(Number(durationSeconds)))
  args.push('-c','copy')
  if (asVideo) args.push('-movflags','+faststart')
  args.push('-y',output)

  try {
    const totalDurationSeconds = Number(choice.row.durationSeconds || 0) || 0
    await run('ffmpeg', args, STREAM_COPY_TIMEOUT_MS, {
      onProgress:fields => {
        if (typeof onProgress !== 'function') return
        try {
          const result = onProgress(progressSnapshot(fields, totalDurationSeconds))
          if (result && typeof result.catch === 'function') result.catch(() => {})
        } catch {}
      },
    })
    if (typeof onProgress === 'function') {
      try { await onProgress({ phase:'validating' }) } catch {}
    }
    const probeRun = await run('ffprobe', [
      '-v','error',
      '-show_entries','format=duration,size:stream=codec_type,codec_name,width,height',
      '-of','json',
      output,
    ], 60_000)
    let probe
    try { probe = JSON.parse(probeRun.stdout || '{}') } catch { probe = {} }
    const duration = Number(probe?.format?.duration || 0)
    const size = Number(probe?.format?.size || 0)
    const video = (probe?.streams || []).find(stream => stream?.codec_type === 'video')
    if (!(duration > 0) || !(size > 0) || !video) {
      throw new Error('Copy-only media output was not playable.')
    }
    const target = wantedHeight(quality)
    if (target > 0 && choice.program?.height === target && Number(video.height) !== target) {
      throw new Error('Requested ' + target + 'p but copy output was ' + String(video.height || 0) + 'p.')
    }
    if (typeof onProgress === 'function') {
      try { await onProgress({ phase:'prepared' }) } catch {}
    }
    return {
      path:output,
      root,
      extension:asVideo ? '.mp4' : '.mkv',
      probe,
      selectedHeight:Number(video.height || 0) || choice.height || 0,
      cleanup:() => rm(root, { recursive:true, force:true }).catch(() => {}),
    }
  } catch (error) {
    await rm(root, { recursive:true, force:true }).catch(() => {})
    throw error
  }
}

export async function materializeCandidates(candidates, quality = 'source', delivery = 'document', options = {}) {
  const inspected = Array.isArray(options?.inspected) && options.inspected.length
    ? options.inspected
    : await inspectCandidates(candidates)
  if (!inspected.length) throw new Error('No playable stream candidates were resolved.')
  if (typeof options?.onProgress === 'function') {
    try { await options.onProgress({ phase:'waiting' }) } catch {}
  }
  const task = queue.then(
    () => materialize({
      inspected,
      quality,
      delivery,
      durationSeconds:options?.durationSeconds || 0,
      onProgress:options?.onProgress,
    }),
    () => materialize({
      inspected,
      quality,
      delivery,
      durationSeconds:options?.durationSeconds || 0,
      onProgress:options?.onProgress,
    }),
  )
  queue = task.catch(() => {})
  return task
}

export const _test = {
  normalizeTimeoutMs,
  programRows,
  streamHeights,
  wantedHeight,
  chooseCandidate,
  progressSnapshot,
}
