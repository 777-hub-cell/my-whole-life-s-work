import { get as httpsGet } from 'node:https'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { open, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const ID_RE = /^[A-Za-z0-9_-]{11}$/
const MAX_JSON_BYTES = 256 * 1024

// KnightBot-MD's provider strategy: resolve media on a separate service,
// then stream the returned file. This is a fallback; no WhatsApp/Cortex
// connection is proxied, and MSCC never sends private account data to APIs.
const PROVIDERS = [
  {
    name:'eliteprotech',
    endpoint:'https://eliteprotech-apis.zone.id/ytdown',
    params:videoUrl => ({url:videoUrl, format:'mp4'}),
    parse:data => data?.success && data?.downloadURL ? {url:data.downloadURL, title:data.title} : null,
  },
  {
    name:'yupra',
    endpoint:'https://api.yupra.my.id/api/downloader/ytmp4',
    params:videoUrl => ({url:videoUrl}),
    parse:data => data?.success && data?.data?.download_url ?
      {url:data.data.download_url,title:data.data.title} : null,
  },
  {
    name:'okatsu',
    endpoint:'https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4',
    params:videoUrl => ({url:videoUrl}),
    parse:data => data?.result?.mp4 ? {url:data.result.mp4,title:data.result.title} : null,
  },
]

export function knightProviderEnabled() {
  return process.env.MSCC_YOUTUBE_KNIGHT_FALLBACK !== '0'
}

export function isPublicIpv4(ip) {
  if (isIP(ip) !== 4) return false
  const a = ip.split('.').map(Number)
  const [x,y,z] = a
  return !(x === 0 || x === 10 || x === 127 || x >= 224 ||
    (x === 100 && y >= 64 && y <= 127) ||
    (x === 169 && y === 254) ||
    (x === 172 && y >= 16 && y <= 31) ||
    (x === 192 && (y === 168 || y === 0 || (y === 88 && z === 99) || (y === 0 && z === 2))) ||
    (x === 198 && (y === 18 || y === 19 || (y === 51 && z === 100))) ||
    (x === 203 && y === 0 && z === 113))
}

export function checkedMediaUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('Invalid downloader URL.')
  let parsed
  try { parsed = new URL(value) } catch { throw new Error('Invalid downloader URL.') }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if (parsed.protocol !== 'https:' || (parsed.port && parsed.port !== '443') ||
      parsed.username || parsed.password || !host || isIP(host) ||
      host === 'localhost' || /\.(localhost|local|internal|onion|test|invalid)$/.test(host)) {
    throw new Error('Downloader returned an unsafe URL.')
  }
  return parsed
}

// Node 24's Happy Eyeballs connector asks lookup() for `all:true`. In
// that mode the callback MUST receive [{address,family}], not a single IP;
// passing a string causes ERR_INVALID_IP_ADDRESS and makes *every* public
// API appear offline. Keep the DNS pin/SSRF guard while honoring the contract.
export function makeGuardedLookup(resolveAddresses = lookup) {
  return async function guardedLookup(hostname, options, callback) {
    try {
      const records = await resolveAddresses(hostname, {family:4, all:true, verbatim:true})
      const publicRecord = records.find(record => isPublicIpv4(record.address))
      if (!publicRecord) {
        const error = new Error('Downloader hostname has no permitted public IPv4 address.')
        error.code = 'DOWNLOADER_NO_PUBLIC_ADDRESS'
        throw error
      }
      if (options?.all) callback(null,[{address:publicRecord.address,family:4}])
      else callback(null,publicRecord.address,4)
    } catch (error) {
      if (error?.code === 'DOWNLOADER_NO_PUBLIC_ADDRESS') return callback(error)
      const failure = new Error('Downloader DNS lookup failed.')
      failure.code = 'DOWNLOADER_DNS_FAILURE'
      callback(failure)
    }
  }
}
const guardedLookup = makeGuardedLookup()

async function httpsResponse(target, redirects = 0) {
  const uri = checkedMediaUrl(String(target))
  const response = await new Promise((resolve,reject) => {
    const request = httpsGet(uri, {
      headers:{accept:'application/json,video/mp4,application/octet-stream,*/*'},
      lookup:guardedLookup,
    }, resolve)
    request.setTimeout(20000, () => request.destroy(new Error('Downloader timed out.')))
    request.once('error', reject)
  })
  if ([301,302,303,307,308].includes(response.statusCode)) {
    const location = response.headers.location
    response.resume()
    if (!location || redirects >= 2) throw new Error('Downloader redirected too many times.')
    return httpsResponse(new URL(location,uri), redirects + 1)
  }
  if (response.statusCode !== 200) {
    response.resume()
    const error = new Error('Downloader service returned an HTTP error.')
    const status = Number(response.statusCode)
    error.code = Number.isInteger(status) && status >= 100 && status <= 599
      ? 'DOWNLOADER_HTTP_' + status : 'DOWNLOADER_HTTP_ERROR'
    throw error
  }
  return response
}

async function readProviderJson(url) {
  const response = await httpsResponse(url)
  const type = String(response.headers['content-type'] || '')
  if (type && !/json|text\/plain/i.test(type)) {
    response.destroy()
    throw new Error('Downloader returned unexpected metadata.')
  }
  const chunks = []
  let bytes = 0
  for await (const chunk of response) {
    bytes += chunk.length
    if (bytes > MAX_JSON_BYTES) {
      response.destroy()
      throw new Error('Downloader metadata exceeded the safe limit.')
    }
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new Error('Downloader returned invalid metadata.') }
}

async function streamMp4(url, file, maxBytes) {
  const response = await httpsResponse(url)
  const contentLength = Number(response.headers['content-length'] || 0)
  if (contentLength && contentLength > maxBytes) {
    response.destroy()
    throw new Error('Video exceeds the MSCC size limit.')
  }
  let count = 0
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      count += chunk.length
      if (count > maxBytes) callback(new Error('Video exceeds the MSCC size limit.'))
      else callback(null,chunk)
    },
  })
  await pipeline(response,limiter,createWriteStream(file,{flags:'wx',mode:0o600}))
  const info = await stat(file)
  if (info.size < 12) throw new Error('Downloader returned an empty video.')
  const handle = await open(file,'r')
  try {
    const marker = Buffer.alloc(4)
    await handle.read(marker,0,4,4)
    if (marker.toString('ascii') !== 'ftyp') {
      throw new Error('Downloader did not return a valid MP4.')
    }
  } finally { await handle.close() }
  return info.size
}

export async function videoHeightFromFile(file) {
  return new Promise(resolve => {
    let finished = false
    const done = height => { if (finished) return; finished = true; resolve(height) }
    const child = spawn('ffprobe', [
      '-v','error','-select_streams','v:0','-show_entries','stream=height',
      '-of','default=noprint_wrappers=1:nokey=1',file,
    ], {stdio:['ignore','pipe','ignore']})
    let stdout = ''
    const timer = setTimeout(() => { child.kill('SIGKILL'); done(0) },7000)
    child.stdout.on('data',chunk => { stdout = (stdout + chunk.toString()).slice(0,40) })
    child.once('error', () => { clearTimeout(timer); done(0) })
    child.once('close',() => {
      clearTimeout(timer)
      const height = Number(stdout.trim())
      done(Number.isInteger(height) && height >= 144 && height <= 4320 ? height : 0)
    })
  })
}

// One-shot deployment health check. No media bytes, signed URLs or account
// data are printed; only an allowlisted public YouTube ID goes to providers.
// A deliberately finite vocabulary: deployment logs can distinguish a dead
// upstream API from a broken parser without exposing the upstream response,
// personal data, signed playback links, proxy configuration, or credentials.
export function providerFailureCategory(error) {
  const code = String(error?.code || '')
  if (/^DOWNLOADER_HTTP_[1-5][0-9][0-9]$/.test(code)) return 'http_' + code.slice(-3)
  if (code === 'DOWNLOADER_DNS_FAILURE' || ['ENOTFOUND','EAI_AGAIN'].includes(code)) return 'dns_failure'
  if (code === 'DOWNLOADER_NO_PUBLIC_ADDRESS') return 'no_public_ipv4'
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' ||
      /timed out/i.test(String(error?.message || ''))) return 'timeout'
  if (['ECONNREFUSED','ECONNRESET','EHOSTUNREACH','ENETUNREACH'].includes(code)) return 'network_failure'
  if (['CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','DEPTH_ZERO_SELF_SIGNED_CERT'].includes(code)) return 'tls_failure'
  const message = String(error?.message || '')
  if (/unsafe URL|Invalid downloader URL/i.test(message)) return 'invalid_media_url'
  if (/unexpected metadata/i.test(message)) return 'unexpected_content_type'
  if (/invalid metadata/i.test(message)) return 'invalid_json'
  if (/exceeded the safe limit/i.test(message)) return 'oversized_metadata'
  if (/redirected too many/i.test(message)) return 'redirect_limit'
  return 'provider_error'
}

export async function probeKnightProviders(videoId, {
  requestJson=readProviderJson, providers=PROVIDERS,
} = {}) {
  if (!ID_RE.test(String(videoId || ''))) throw new Error('Invalid YouTube video ID.')
  const watchUrl = 'https://www.youtube.com/watch?v=' + videoId
  const results = []
  for (const provider of providers) {
    let result = 'unavailable'
    let safeErrorCode
    try {
      const requestUrl = new URL(provider.endpoint)
      for (const [key,value] of Object.entries(provider.params(watchUrl))) {
        requestUrl.searchParams.set(key,value)
      }
      const payload = await requestJson(requestUrl.toString())
      const candidate = provider.parse(payload)
      if (candidate?.url) {
        checkedMediaUrl(candidate.url)
        result = 'link_resolved'
      } else result = 'no_media_link'
    } catch (error) {
      result = providerFailureCategory(error)
      if (result === 'provider_error') {
        // Only a short uppercase Node error identifier (never a message,
        // hostname, signed URL, header, or provider response) is exposed.
        const identifier = String(error?.code || error?.name || 'UNKNOWN')
        safeErrorCode = /^[A-Z][A-Z0-9_]{1,55}$/.test(identifier)
          ? identifier : 'UNKNOWN'
      }
    }
    results.push({provider:provider.name,result,
      ...(safeErrorCode ? {diagnosticCode:safeErrorCode} : {})})
  }
  return results
}

function emitProviderDiagnostic(onProviderResult, provider, phase, result, error = null, extra = {}) {
  const event = { provider, phase, result, ...extra }
  if (error) {
    // Node error codes are useful for operators, but raw messages can contain
    // signed media URLs or provider response fragments. Never log those.
    const code = String(error?.code || '')
    if (/^[A-Z][A-Z0-9_]{1,55}$/.test(code)) event.diagnosticCode = code
  }
  try {
    if (typeof onProviderResult === 'function') onProviderResult(event)
    else console.warn('[MSCC YouTube source]', JSON.stringify(event))
  } catch {
    // Diagnostics must never break a working download or fallback chain.
  }
}

export async function downloadFromKnightProviders(videoId, outputDir, maxBytes, {
  requestJson=readProviderJson, downloadFile=streamMp4, providers=PROVIDERS,
  inspectHeight=videoHeightFromFile, onProviderResult = null,
} = {}) {
  if (!ID_RE.test(String(videoId || ''))) throw new Error('Invalid YouTube video ID.')
  if (!knightProviderEnabled()) throw new Error('Third-party media fallback is disabled.')
  const cap = Math.max(1,Math.floor(Number(maxBytes) || 0))
  const watchUrl = 'https://www.youtube.com/watch?v=' + videoId
  for (const provider of providers) {
    let phase = 'metadata_request'
    try {
      const requestUrl = new URL(provider.endpoint)
      for (const [key,value] of Object.entries(provider.params(watchUrl))) {
        requestUrl.searchParams.set(key,value)
      }
      const data = await requestJson(requestUrl.toString())
      phase = 'parse_response'
      const media = provider.parse(data)
      if (!media?.url) {
        emitProviderDiagnostic(onProviderResult,provider.name,phase,'no_media_link')
        continue
      }

      phase = 'validate_media_url'
      const safeUrl = checkedMediaUrl(media.url)
      const file = join(outputDir,'knight-' + provider.name + '.mp4')

      phase = 'download_media'
      const size = await downloadFile(safeUrl.toString(),file,cap)

      phase = 'probe_media'
      const height = await inspectHeight(file)
      emitProviderDiagnostic(onProviderResult,provider.name,'complete','downloaded',null,{
        size,
        height:height || null,
      })
      return {
        provider:provider.name,
        file,
        extension:'mp4',
        size,
        height,
        title:String(media.title || 'YouTube video').slice(0,180),
      }
    } catch (error) {
      emitProviderDiagnostic(onProviderResult,provider.name,phase,providerFailureCategory(error),error)
      // A broken service, expired media URL or unsafe redirect should not
      // prevent the next provider from being tried. Never log signed URLs.
    }
  }
  const error = new Error('YouTube denied direct access, and no external media source returned a usable MP4.')
  error.code = 'YOUTUBE_KNIGHT_SOURCES_UNAVAILABLE'
  throw error
}
