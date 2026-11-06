import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadMediaMessage } from '@itsliaaa/baileys'
import { contextInfo, messageMedia, quotedMessage } from './whatsapp/messages.js'
import { normalizeJid } from './whatsapp/jid.js'
import { applyStickerMetadata } from './sticker-metadata.js'

export const STICKER_CANVAS = 512
// Nexia_bot.zip: utils/stickerUtils.js uses a 20px rounded-square alpha mask.
// Preserve the original shape rather than guessing a larger corner radius.
export const STICKER_CORNER_RADIUS = 20
const STICKER_CORNER_END = STICKER_CANVAS - STICKER_CORNER_RADIUS
const STICKER_CORNER_RADIUS_SQUARED = STICKER_CORNER_RADIUS ** 2
export const STICKER_FIT_FILTER =
  `scale=${STICKER_CANVAS}:${STICKER_CANVAS}:force_original_aspect_ratio=increase,` +
  `crop=${STICKER_CANVAS}:${STICKER_CANVAS},format=rgba,` +
  "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':" +
  `a='if(lte(pow(max(${STICKER_CORNER_RADIUS}-X,max(X-${STICKER_CORNER_END},0)),2)+` +
  `pow(max(${STICKER_CORNER_RADIUS}-Y,max(Y-${STICKER_CORNER_END},0)),2),` +
  `${STICKER_CORNER_RADIUS_SQUARED}),alpha(X,Y),0)',setsar=1`

const MAX_STICKER_BYTES = 900 * 1024
const MAX_INPUT_BYTES = 32 * 1024 * 1024
const FFMPEG_TIMEOUT_MS = 120_000

const silentLogger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
}

function isRetryableMediaFetchError(error) {
  const detail = [
    error?.message,
    error?.cause?.message,
    error?.cause?.code,
    error?.cause?.cause?.code,
  ].filter(Boolean).join(' ')
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|UND_ERR_CONNECT_TIMEOUT/i.test(detail)
}

export async function socketMediaDownloadOptions(sock, forceRefresh = false) {
  if (typeof sock?.refreshMediaConn === 'function') {
    // Baileys caches this value for the media_conn TTL, so this is cheap
    // when the socket already has a current media CDN assignment.
    try {
      await sock.refreshMediaConn(forceRefresh)
    } catch {
      // Retain the last known host and let the normal downloader report failure.
    }
  }

  const host = typeof sock?.getMediaHost === 'function' ? sock.getMediaHost() : ''
  return host ? { host: String(host) } : {}
}

export async function downloadMediaWithSocketHost(
  target,
  sock,
  retryContext,
  downloader = downloadMediaMessage,
) {
  const options = await socketMediaDownloadOptions(sock)

  try {
    return await downloader(target, 'buffer', options, retryContext)
  } catch (error) {
    if (!isRetryableMediaFetchError(error)) throw error

    if (typeof sock?.refreshMediaConn === 'function') {
      const retryOptions = await socketMediaDownloadOptions(sock, true)
      try {
        return await downloader(target, 'buffer', retryOptions, retryContext)
      } catch (retryError) {
        if (!isRetryableMediaFetchError(retryError)) throw retryError
        throw new Error(
          'WhatsApp could not reach its media CDN. Please resend the media and try again.',
          { cause: retryError },
        )
      }
    }

    throw new Error(
      'WhatsApp could not reach its media CDN. Please resend the media and try again.',
      { cause: error },
    )
  }
}

let conversionTail = Promise.resolve()

function numberValue(value) {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (value && typeof value.toNumber === 'function') return value.toNumber()
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function classifyMessageMedia(found) {
  const key = String(found?.key || '')
  const mime = String(found?.media?.mimetype || '').toLowerCase()

  if (key === 'imageMessage') return 'image'
  if (key === 'videoMessage') return 'video'
  if (key === 'audioMessage') return 'audio'
  if (key === 'stickerMessage') return 'sticker'
  if (key === 'documentMessage') {
    if (mime === 'image/gif' || mime.startsWith('video/')) return 'video'
    if (mime.startsWith('image/')) return 'image'
    return 'document'
  }
  return ''
}

export function mediaIsAnimated(found) {
  const kind = classifyMessageMedia(found)
  const mime = String(found?.media?.mimetype || '').toLowerCase()
  if (kind === 'video') return true
  if (kind === 'sticker') return found?.media?.isAnimated === true
  return mime === 'image/gif'
}

function commandCandidates(ctx) {
  const message = ctx?.message
  const chat = normalizeJid(message?.key?.remoteJid)
  const info = contextInfo(message?.message)
  const quoted = quotedMessage(message, info, chat)
  return [quoted, message].filter(Boolean)
}

export function resolveCommandMedia(ctx, acceptedKinds = []) {
  const accepted = new Set(acceptedKinds.map(value => String(value)))
  let firstMedia = null

  for (const target of commandCandidates(ctx)) {
    const found = messageMedia(target?.message)
    if (!found) continue
    const resolved = {
      target,
      found,
      kind: classifyMessageMedia(found),
      animated: mediaIsAnimated(found),
    }
    if (!firstMedia) firstMedia = resolved
    if (!accepted.size || accepted.has(resolved.kind)) return resolved
  }

  return firstMedia
}

export async function downloadCommandMedia(ctx, acceptedKinds = []) {
  const resolved = resolveCommandMedia(ctx, acceptedKinds)
  if (!resolved || (acceptedKinds.length && !acceptedKinds.includes(resolved.kind))) return null

  const declaredSize = numberValue(resolved.found?.media?.fileLength)
  if (declaredSize > MAX_INPUT_BYTES) {
    throw new Error('That media is too large for sticker conversion.')
  }

  const sock = ctx?.account?.sock
  if (!sock) throw new Error('WhatsApp connection is unavailable.')

  const retryContext = typeof sock.updateMediaMessage === 'function'
    ? {
        logger: silentLogger,
        reuploadRequest: message => sock.updateMediaMessage(message),
      }
    : undefined

  const buffer = await downloadMediaWithSocketHost(resolved.target, sock, retryContext)
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error('I could not download that media.')
  }
  if (buffer.length > MAX_INPUT_BYTES) {
    throw new Error('That media is too large for sticker conversion.')
  }

  return { ...resolved, buffer }
}

async function withTempDir(label, work) {
  const directory = await mkdtemp(join(tmpdir(), `mscc-${label}-`))
  try {
    return await work(directory)
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}

function ffmpegError(stderr, code) {
  const detail = String(stderr || '').trim().split(/\r?\n/).slice(-4).join(' | ')
  return new Error(detail ? `ffmpeg failed (${code}): ${detail}` : `ffmpeg failed with code ${code}`)
}

export function runFfmpeg(args, { timeoutMs = FFMPEG_TIMEOUT_MS } = {}) {
  const binary = String(process.env.FFMPEG_PATH || 'ffmpeg').trim() || 'ffmpeg'

  return new Promise((resolve, reject) => {
    const child = spawn(binary, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    let stderr = ''
    let settled = false
    let timedOut = false

    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve()
    }

    child.stderr?.on('data', chunk => {
      stderr += chunk.toString()
      if (stderr.length > 32_000) stderr = stderr.slice(-32_000)
    })

    child.once('error', error => {
      if (error?.code === 'ENOENT') {
        finish(new Error('ffmpeg is not installed on this MSCC host.'))
      } else {
        finish(error)
      }
    })

    child.once('close', code => {
      if (timedOut) return finish(new Error('Media conversion timed out.'))
      if (code === 0) return finish()
      return finish(ffmpegError(stderr, code))
    })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    timer.unref?.()
  })
}

async function serializedConversion(work) {
  const previous = conversionTail
  let release
  conversionTail = new Promise(resolve => { release = resolve })
  await previous.catch(() => {})
  try {
    return await work()
  } finally {
    release()
  }
}

async function fileSize(path) {
  return Number((await stat(path)).size || 0)
}

function animatedStickerArgs(input, output, { seconds, fps, quality }) {
  return [
    '-i', input,
    '-t', String(seconds),
    '-an',
    '-vf', `${STICKER_FIT_FILTER},fps=${fps},format=rgba`,
    '-c:v', 'libwebp',
    '-preset', 'default',
    '-loop', '0',
    '-fps_mode', 'passthrough',
    '-pix_fmt', 'yuva420p',
    '-quality', String(quality),
    '-compression_level', '6',
    output,
  ]
}

function staticStickerArgs(input, output, quality) {
  return [
    '-i', input,
    '-frames:v', '1',
    '-vf', `${STICKER_FIT_FILTER},format=rgba`,
    '-c:v', 'libwebp',
    '-preset', 'picture',
    '-pix_fmt', 'yuva420p',
    '-quality', String(quality),
    '-compression_level', '6',
    output,
  ]
}

export async function mediaToSticker(buffer, { animated = false, packName, publisher, emojis } = {}) {
  return serializedConversion(() => withTempDir('sticker', async directory => {
    const input = join(directory, 'input.bin')
    const output = join(directory, 'sticker.webp')
    await writeFile(input, buffer)

    if (animated) {
      const profiles = [
        { seconds: 6, fps: 15, quality: 72 },
        { seconds: 5, fps: 12, quality: 52 },
        { seconds: 4, fps: 10, quality: 40 },
        { seconds: 3, fps: 8, quality: 30 },
      ]

      for (const profile of profiles) {
        await runFfmpeg(animatedStickerArgs(input, output, profile))
        if (await fileSize(output) <= MAX_STICKER_BYTES) break
      }
    } else {
      for (const quality of [82, 68, 52, 38]) {
        await runFfmpeg(staticStickerArgs(input, output, quality))
        if (await fileSize(output) <= MAX_STICKER_BYTES) break
      }
    }

    const sticker = await readFile(output)
    return applyStickerMetadata(sticker, { packName, publisher, emojis })
  }))
}

export async function stickerToPng(buffer) {
  return serializedConversion(() => withTempDir('toimg', async directory => {
    const input = join(directory, 'sticker.webp')
    const output = join(directory, 'sticker.png')
    await writeFile(input, buffer)
    await runFfmpeg([
      '-i', input,
      '-frames:v', '1',
      '-vf', 'format=rgba',
      output,
    ])
    return readFile(output)
  }))
}

export async function stickerToGif(buffer) {
  return serializedConversion(() => withTempDir('togif', async directory => {
    const input = join(directory, 'sticker.webp')
    const output = join(directory, 'sticker.gif')
    await writeFile(input, buffer)
    const filter =
      '[0:v]fps=15,scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,' +
      'setsar=1,split[v0][v1];' +
      '[v0]palettegen=reserve_transparent=1:stats_mode=diff[p];' +
      '[v1][p]paletteuse=dither=sierra2_4a:alpha_threshold=128'
    await runFfmpeg([
      '-i', input,
      '-filter_complex', filter,
      '-loop', '0',
      output,
    ])
    return readFile(output)
  }))
}

export async function stickerToVideo(buffer) {
  return serializedConversion(() => withTempDir('tovideo', async directory => {
    const input = join(directory, 'sticker.webp')
    const output = join(directory, 'sticker.mp4')
    await writeFile(input, buffer)
    await runFfmpeg([
      '-i', input,
      '-an',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos,format=yuv420p',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-movflags', '+faststart',
      output,
    ])
    return readFile(output)
  }))
}
