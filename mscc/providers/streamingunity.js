import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load as loadHtml } from 'cheerio'

const UA = 'Mozilla/5.0 (Linux; Android 16; SM-A165F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'
const LANGUAGE = String(process.env.MSCC_STREAMINGUNITY_LANGUAGE || 'en').trim() || 'en'
const BASES = String(process.env.MSCC_STREAMINGUNITY_BASES || 'https://streamingunity.fun,https://streamingunity.win,https://streamingunity.vip')
  .split(',')
  .map(value => value.trim().replace(/\/$/, ''))
  .filter(Boolean)
const HTTP_TIMEOUT_MS = Math.max(5000, Number(process.env.MSCC_STREAMINGUNITY_HTTP_TIMEOUT_MS || 30000))
const REMUX_TIMEOUT_MS = Math.max(60000, Number(process.env.MSCC_STREAMINGUNITY_REMUX_TIMEOUT_MS || 14400000))
const CACHE_TTL_MS = Math.max(15000, Number(process.env.MSCC_STREAMINGUNITY_CACHE_TTL_MS || 300000))
const cache = new Map()
let remuxQueue = Promise.resolve()

function cacheGet(key) {
  const row = cache.get(key)
  return row && row.expiresAt > Date.now() ? row.value : null
}

function cacheSet(key, value) {
  cache.set(key, { value, expiresAt:Date.now() + CACHE_TTL_MS })
  return value
}

async function get(url, options = {}) {
  const headers = {
    'user-agent':UA,
    'accept-language':'en-US,en;q=0.9',
    accept:options.accept || '*/*',
  }
  if (options.referer) headers.referer = options.referer
  if (options.origin) headers.origin = options.origin
  const response = await fetch(url, {
    headers,
    redirect:'follow',
    signal:AbortSignal.timeout(HTTP_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error('StreamingUnity HTTP ' + response.status)
  return response
}

function parseDataPage(html) {
  const $ = loadHtml(String(html || ''))
  const raw = $('#app').attr('data-page') || $('[data-page]').first().attr('data-page') || ''
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

function walkTitles(value, out = []) {
  if (!value || typeof value !== 'object') return out
  if (Array.isArray(value)) {
    for (const row of value) walkTitles(row, out)
    return out
  }
  if (
    Number.isFinite(Number(value.id)) &&
    typeof value.name === 'string' &&
    typeof value.slug === 'string' &&
    ['movie','tv'].includes(String(value.type || '').toLowerCase())
  ) out.push(value)
  for (const nested of Object.values(value)) walkTitles(nested, out)
  return out
}

function normalizeTitle(row) {
  const id = Number(row && row.id)
  const slug = String(row && row.slug || '').trim()
  const type = String(row && row.type || '').trim().toLowerCase()
  if (!Number.isFinite(id) || !slug || !['movie','tv'].includes(type)) return null
  const date = String(row.release_date || row.last_air_date || row.first_air_date || '')
  return {
    id:String(id) + '-' + slug,
    title:String(row.name || row.title || slug).trim(),
    type,
    description:date.slice(0,4) || (type === 'movie' ? 'Movie' : 'TV series'),
    tmdbId:Number(row.tmdb_id || 0) || 0,
  }
}

function uniqueTitles(rows, type) {
  const map = new Map()
  for (const row of rows) {
    const item = normalizeTitle(row)
    if (!item || (type && item.type !== type)) continue
    if (!map.has(item.id)) map.set(item.id, item)
  }
  return [...map.values()]
}

function identity(item) {
  const raw = String(item && item.id || item || '').trim()
  const match = /^(\d+)-(.+)$/.exec(raw)
  if (!match) throw new Error('StreamingUnity title reference is invalid.')
  return { sourceId:Number(match[1]), slug:match[2], id:raw }
}

function rootOf(url) {
  const value = new URL(url)
  return value.protocol + '//' + value.host
}

async function searchResponse(url, type) {
  const response = await get(url, { accept:'application/json,text/html;q=0.9,*/*;q=0.1' })
  const body = await response.text()
  const contentType = String(response.headers.get('content-type') || '').toLowerCase()
  let rows = []
  if (contentType.includes('json') || /^[\\s]*[\\[{]/.test(body)) {
    try {
      const json = JSON.parse(body)
      rows = Array.isArray(json && json.data) ? json.data
        : Array.isArray(json && json.results) ? json.results
          : Array.isArray(json) ? json : []
    } catch {}
  }
  if (!rows.length) {
    const page = parseDataPage(body)
    rows = walkTitles(page)
  }
  return uniqueTitles(rows, type)
}

export async function searchTitles(query, type) {
  const clean = String(query || '').trim()
  if (!clean) return []
  const key = 'search|' + String(type || '') + '|' + clean.toLowerCase()
  const saved = cacheGet(key)
  if (saved) return saved
  const encoded = encodeURIComponent(clean)
  let lastError
  for (const base of BASES) {
    const urls = [
      base + '/api/search?q=' + encoded,
      base + '/' + LANGUAGE + '/api/search?q=' + encoded,
      base + '/' + LANGUAGE + '/search?q=' + encoded,
      base + '/' + LANGUAGE + '/search?query=' + encoded,
      base + '/search?q=' + encoded,
    ]
    for (const url of urls) {
      try {
        const items = await searchResponse(url, type)
        if (items.length) return cacheSet(key, items)
      } catch (error) {
        lastError = error
      }
    }
  }
  if (lastError) throw lastError
  return []
}

export async function browseTitles(type) {
  const key = 'browse|' + type
  const saved = cacheGet(key)
  if (saved) return saved
  const route = type === 'movie' ? 'movies' : 'tv-shows'
  let lastError
  for (const base of BASES) {
    try {
      const response = await get(base + '/' + LANGUAGE + '/' + route, { accept:'text/html,*/*' })
      const page = parseDataPage(await response.text())
      const items = uniqueTitles(walkTitles(page), type).slice(0,50)
      if (items.length) return cacheSet(key, items)
    } catch (error) {
      lastError = error
    }
  }
  if (lastError) throw lastError
  return []
}

async function titleAt(base, item) {
  const ref = identity(item)
  const response = await get(base + '/' + LANGUAGE + '/titles/' + ref.sourceId + '-' + ref.slug, { accept:'text/html,*/*' })
  const page = parseDataPage(await response.text())
  const title = page && page.props && page.props.title
  if (!title || Number(title.id) !== ref.sourceId) throw new Error('StreamingUnity title page was invalid.')
  return {
    base:rootOf(response.url),
    page,
    title,
    loadedSeason:page.props.loadedSeason || null,
  }
}

export async function loadTitle(item) {
  const ref = identity(item)
  const key = 'title|' + ref.id
  const saved = cacheGet(key)
  if (saved) return saved
  let lastError
  for (const base of BASES) {
    try { return cacheSet(key, await titleAt(base, item)) }
    catch (error) { lastError = error }
  }
  throw lastError || new Error('StreamingUnity title is unavailable.')
}

export async function listSeasons(item) {
  const loaded = await loadTitle(item)
  return (loaded.title.seasons || []).map(row => ({
    id:String(row.id != null ? row.id : row.number),
    number:Number(row.number),
    title:String(row.name || 'Season ' + row.number),
    episodeCount:Number(row.episodes_count || row.episode_count || 0) || 0,
  })).filter(row => Number.isFinite(row.number)).sort((a,b) => a.number - b.number)
}

function normalizeEpisode(row, seasonNumber) {
  const number = Number(row && row.number)
  if (!Number.isFinite(number)) return null
  return {
    id:String(row.id != null ? row.id : number),
    number:String(number),
    seasonNumber:Number(seasonNumber) || 1,
    title:String(row.name || 'Episode ' + number),
    duration:Number(row.duration || 0) || 0,
  }
}

export async function listEpisodes(item, seasonNumber) {
  const ref = identity(item)
  const season = Number(seasonNumber) || 1
  const key = 'episodes|' + ref.id + '|' + season
  const saved = cacheGet(key)
  if (saved) return saved

  const title = await loadTitle(item)
  if (Number(title.loadedSeason && title.loadedSeason.number) === season) {
    const immediate = (title.loadedSeason.episodes || []).map(row => normalizeEpisode(row, season)).filter(Boolean)
    if (immediate.length) return cacheSet(key, immediate)
  }

  let lastError
  for (const base of [title.base, ...BASES]) {
    try {
      const response = await get(base + '/' + LANGUAGE + '/titles/' + ref.sourceId + '-' + ref.slug + '/season-' + season, { accept:'text/html,*/*' })
      const page = parseDataPage(await response.text())
      const loaded = page && page.props && page.props.loadedSeason
      const episodes = (loaded && loaded.episodes || []).map(row => normalizeEpisode(row, season)).filter(Boolean)
      if (episodes.length) return cacheSet(key, episodes.sort((a,b) => Number(a.number) - Number(b.number)))
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('StreamingUnity episodes are unavailable.')
}

function field(script, name) {
  const patterns = name === 'url'
    ? [/["']url["']\s*:\s*["']([^"']+)["']/i, /\burl\s*:\s*["']([^"']+)["']/i]
    : name === 'token'
      ? [/["']token["']\s*:\s*["']([^"']+)["']/i, /\btoken\s*:\s*["']([^"']+)["']/i]
      : [/["']expires["']\s*:\s*["']([^"']+)["']/i, /\bexpires\s*:\s*["']([^"']+)["']/i]
  for (const pattern of patterns) {
    const match = pattern.exec(script)
    if (match) return match[1].replace(/\\\//g, '/')
  }
  return ''
}

function findVixCloudEmbed(html) {
  const match = /https?:\/\/vixcloud\.(?:co|cc)\/embed\/[^\s<>]+/i.exec(String(html || ''))
  return match ? match[0].replace(/&amp;/g, '&').replace(/["']+$/, '') : ''
}

function vixCloudOrigin(embedUrl) {
  try {
    const parsed = new URL(embedUrl)
    if (!/^(?:www\.)?vixcloud\.(?:co|cc)$/i.test(parsed.hostname)) throw new Error('Unsupported VixCloud host.')
    return parsed.origin
  } catch {
    throw new Error('StreamingUnity VixCloud embed URL was invalid.')
  }
}

function vixCloudHeaders(embedUrl) {
  const origin = vixCloudOrigin(embedUrl)
  return 'Referer: ' + origin + '/\r\nOrigin: ' + origin + '\r\nUser-Agent: ' + UA + '\r\n'
}

function parseMaster(text, masterUrl) {
  const lines = String(text || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean)
  const variants = []
  const media = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.startsWith('#EXT-X-MEDIA:')) {
      const uri = /URI="([^"]+)"/i.exec(line)
      media.push({
        type:String(/TYPE=([^,]+)/i.exec(line)?.[1] || '').toUpperCase(),
        language:String(/LANGUAGE="([^"]+)"/i.exec(line)?.[1] || ''),
        name:String(/NAME="([^"]+)"/i.exec(line)?.[1] || ''),
        url:uri ? new URL(uri[1], masterUrl).href : '',
      })
    }
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue
    const next = lines[i + 1]
    if (!next || next.startsWith('#')) continue
    const res = /RESOLUTION=(\d+)x(\d+)/i.exec(line)
    variants.push({
      width:Number(res && res[1] || 0),
      height:Number(res && res[2] || 0),
      bandwidth:Number(/BANDWIDTH=(\d+)/i.exec(line)?.[1] || 0),
      url:new URL(next, masterUrl).href,
    })
  }
  return { variants, media }
}

async function resolveAt(base, item, episodeId) {
  const ref = identity(item)
  const iframe = new URL(base + '/' + LANGUAGE + '/iframe/' + ref.sourceId)
  if (episodeId) {
    iframe.searchParams.set('episode_id', String(episodeId))
    iframe.searchParams.set('next_episode', '0')
  }
  const ir = await get(iframe.href, { accept:'text/html,*/*', referer:base + '/' })
  const iframeText = await ir.text()
  const embed = findVixCloudEmbed(iframeText)
  if (!embed) throw new Error('StreamingUnity did not expose a VixCloud embed.')
  const playerOrigin = vixCloudOrigin(embed)

  const er = await get(embed, { accept:'text/html,*/*', referer:base + '/' })
  const $ = loadHtml(await er.text())
  let script = ''
  $('script').each((_, node) => {
    const value = $(node).html() || ''
    if (!script && value.includes('masterPlaylist')) script = value
  })
  if (!script) throw new Error('StreamingUnity player config was missing.')

  const token = field(script, 'token')
  const expires = field(script, 'expires')
  const rawUrl = field(script, 'url')
  if (!token || !expires || !rawUrl) throw new Error('StreamingUnity player config was incomplete.')

  const master = new URL(rawUrl, embed)
  if (/canPlayFHD\s*=\s*true/i.test(script)) master.searchParams.set('h', '1')
  master.searchParams.set('token', token)
  master.searchParams.set('expires', expires)
  master.searchParams.set('lang', 'en')

  const mr = await get(master.href, {
    accept:'application/vnd.apple.mpegurl,application/x-mpegURL,*/*',
    referer:playerOrigin + '/',
    origin:playerOrigin,
  })
  const masterText = await mr.text()
  if (!masterText.includes('#EXTM3U')) throw new Error('StreamingUnity master playlist was invalid.')
  const parsed = parseMaster(masterText, master.href)
  if (!parsed.variants.length) throw new Error('StreamingUnity master playlist had no video variants.')
  return { masterUrl:master.href, masterText, embedUrl:embed, playerOrigin, ...parsed }
}

export async function resolveStream(item, episodeId = '') {
  const title = await loadTitle(item)
  let lastError
  for (const base of [title.base, ...BASES]) {
    try { return await resolveAt(base, item, episodeId) }
    catch (error) { lastError = error }
  }
  throw lastError || new Error('StreamingUnity stream is unavailable.')
}

export function qualityList(stream) {
  const heights = [...new Set((stream.variants || []).map(row => Number(row.height)).filter(value => value > 0))]
    .sort((a,b) => b - a)
  return ['source', ...heights.map(String)]
}

function wantedHeight(quality) {
  const value = Number(String(quality || '').replace(/[^0-9]/g, ''))
  return Number.isFinite(value) ? value : 0
}

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio:['ignore','pipe','pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
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
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(command + ' failed (' + code + '): ' + stderr.slice(-800)))
    })
  })
}

async function chooseProgram(masterUrl, quality, embedUrl) {
  const headers = vixCloudHeaders(embedUrl)
  const result = await run('ffprobe', [
    '-v','error','-headers',headers,'-show_programs','-of','json',masterUrl,
  ], 120000)
  let json
  try { json = JSON.parse(result.stdout) } catch { json = {} }
  const rows = (json.programs || []).map(program => {
    const video = (program.streams || []).find(stream => stream.codec_type === 'video')
    return {
      id:Number(program.program_id),
      height:Number(video && video.height || 0),
      bandwidth:Number(program.tags && program.tags.variant_bitrate || 0),
    }
  }).filter(row => Number.isFinite(row.id) && row.height > 0)
    .sort((a,b) => b.height - a.height || b.bandwidth - a.bandwidth)
  if (!rows.length) return null
  const target = wantedHeight(quality)
  if (!target) return rows[0]
  return rows.find(row => row.height === target) || rows.find(row => row.height < target) || rows.at(-1)
}

async function remux(stream, quality, delivery, durationSeconds = 0) {
  const root = await mkdtemp(join(tmpdir(), 'mscc-streamingunity-'))
  const asVideo = delivery === 'video'
  const output = join(root, asVideo ? 'media.mp4' : 'media.mkv')
  const embedUrl = stream.embedUrl || 'https://vixcloud.cc/embed/'
  const headers = vixCloudHeaders(embedUrl)
  try {
    const program = await chooseProgram(stream.masterUrl, quality, embedUrl)
    const args = ['-hide_banner','-loglevel','error','-headers',headers,'-i',stream.masterUrl]
    if (program) args.push('-map','0:p:' + program.id)
    if (asVideo) args.push('-sn')
    if (Number(durationSeconds) > 0) args.push('-t', String(Number(durationSeconds)))
    args.push('-c','copy')
    if (asVideo) args.push('-movflags','+faststart')
    args.push('-y',output)
    await run('ffmpeg', args, REMUX_TIMEOUT_MS)

    const probeRun = await run('ffprobe', [
      '-v','error',
      '-show_entries','format=duration,size:stream=codec_type,codec_name,width,height',
      '-of','json',output,
    ], 60000)
    let probe
    try { probe = JSON.parse(probeRun.stdout) } catch { probe = {} }
    if (!(Number(probe.format && probe.format.duration) > 0) || !(probe.streams || []).some(row => row.codec_type === 'video')) {
      throw new Error('StreamingUnity remux was not playable.')
    }
    return {
      path:output,
      root,
      extension:asVideo ? '.mp4' : '.mkv',
      probe,
      cleanup:() => rm(root, { recursive:true, force:true }).catch(() => {}),
    }
  } catch (error) {
    await rm(root, { recursive:true, force:true }).catch(() => {})
    throw error
  }
}

export async function materializeStream(stream, quality = 'source', delivery = 'document') {
  const task = remuxQueue.then(
    () => remux(stream, quality, delivery),
    () => remux(stream, quality, delivery),
  )
  remuxQueue = task.catch(() => {})
  return task
}

export const _probe = {
  materializeSample:(stream, quality = 'source', delivery = 'document', seconds = 8) =>
    remux(stream, quality, delivery, Math.max(1, Math.min(30, Number(seconds) || 8))),
}

export const _test = {
  parseDataPage,
  walkTitles,
  normalizeTitle,
  uniqueTitles,
  identity,
  parseMaster,
  findVixCloudEmbed,
  vixCloudOrigin,
  vixCloudHeaders,
  qualityList,
}
