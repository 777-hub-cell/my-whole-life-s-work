import { lookup } from 'node:dns/promises'
import https from 'node:https'
import { isIP } from 'node:net'
import { newAsyncContext } from 'quickjs-emscripten'
import { validateEngineInputs, validateEngineManifest, validateEngineOutputs } from './engine-contract.js'

const MAX_REQUEST_BYTES = 16 * 1024
const MAX_RESPONSE_BYTES = 512 * 1024
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024
const MEMORY_LIMIT = 16 * 1024 * 1024
const STACK_LIMIT = 512 * 1024

function publicIpv4(address) {
  if (isIP(address) !== 4) return false
  const [a, b, c] = address.split('.').map(Number)
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && (b === 0 || b === 2 || b === 168)) return false
  if (a === 192 && b === 88 && c === 99) return false
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

async function approvedFetch(manifest, urlValue, options = {}) {
  if (!manifest.permissions.includes('network.fetch') || !manifest.allowedHosts?.length) {
    throw new Error('This Engine has no approved network.fetch host.')
  }
  const url = new URL(String(urlValue || ''))
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || !manifest.allowedHosts.includes(host) ||
      url.username || url.password || (url.port && url.port !== '443') || isIP(host)) {
    throw new Error('Network request rejected: use HTTPS on an exact approved hostname.')
  }

  const method = String(options.method || 'GET').toUpperCase()
  if (!['GET', 'POST'].includes(method)) throw new Error('Only GET and POST are supported.')
  const body = options.body == null ? '' : typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
  if (Buffer.byteLength(body, 'utf8') > MAX_REQUEST_BYTES) throw new Error('Engine request body exceeds 16 KiB.')

  // Only innocuous content negotiation headers are accepted from Engine code.
  const requested = options.headers && typeof options.headers === 'object' ? options.headers : {}
  const headers = {
    'user-agent': 'Aharane-Engine/1.0',
    accept: String(requested.accept || '*/*').slice(0, 200),
  }
  if (body) {
    headers['content-type'] = String(requested['content-type'] || 'application/json').slice(0, 120)
    headers['content-length'] = String(Buffer.byteLength(body, 'utf8'))
  }

  // Reject private DNS answers and pin the TLS request to the checked IPv4
  // address so a second DNS lookup cannot redirect it to an internal service.
  const resolved = await lookup(host, { all: true, family: 4, verbatim: true })
  if (!resolved.length || resolved.some(row => !publicIpv4(row.address))) {
    throw new Error('Network request rejected: hostname did not resolve exclusively to public IPv4 addresses.')
  }
  const address = resolved[0].address
  const timeout = Math.max(100, Math.min(15000, Number(options.timeoutMs) || 10000))

  return new Promise((resolve, reject) => {
    let finished = false
    const finish = (error, value) => {
      if (finished) return
      finished = true
      error ? reject(error) : resolve(value)
    }
    const request = https.request({
      protocol: 'https:',
      hostname: host,
      servername: host,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers,
      agent: false,
      timeout,
      maxHeaderSize: 16 * 1024,
      lookup: (_host, _options, callback) => callback(null, address, 4),
    }, response => {
      const chunks = []
      let size = 0
      response.on('data', chunk => {
        size += chunk.length
        if (size > MAX_RESPONSE_BYTES) {
          request.destroy(new Error('Engine response exceeds 512 KiB.'))
          return
        }
        chunks.push(chunk)
      })
      response.on('error', error => finish(error))
      response.on('end', () => {
        const bytes = Buffer.concat(chunks)
        const contentType = String(response.headers['content-type'] || 'application/octet-stream').slice(0, 120)
        const binary = /^(image\/|application\/octet-stream)/i.test(contentType)
        finish(null, {
          status: Number(response.statusCode || 0),
          contentType,
          encoding: binary ? 'base64' : 'utf8',
          body: binary ? bytes.toString('base64') : bytes.toString('utf8'),
          redirected: Number(response.statusCode || 0) >= 300 && Number(response.statusCode || 0) < 400,
        })
      })
    })
    request.on('error', error => finish(error))
    request.setTimeout(timeout, () => request.destroy(new Error('Engine network request timed out.')))
    if (body) request.write(body)
    request.end()
  })
}

function transformSource(source) {
  const code = String(source || '')
  const body = code.replace(/^(\s*)export\s+(?=(?:async\s+)?function\s+run\s*\()/m, '$1')
  if (!/^\s*(?:async\s+)?function\s+run\s*\(/m.test(body)) {
    throw new Error('Engine code must declare export function run(inputs, context).')
  }
  if (/^\s*(?:import|export)\s/m.test(body)) {
    throw new Error('Engine code cannot import modules or export additional values.')
  }
  return body
}

function jsonSafe(value) {
  const encoded = JSON.stringify(value)
  if (typeof encoded !== 'string' || Buffer.byteLength(encoded, 'utf8') > MAX_OUTPUT_BYTES) {
    throw new Error('Engine output exceeds the 5 MiB result limit.')
  }
  return JSON.parse(encoded)
}

/**
 * Run user-authored JavaScript in a fresh QuickJS WebAssembly context.
 * Guest code has no Node globals, filesystem, process, module loader or ambient
 * fetch. External requests are brokered through an exact HTTPS host allowlist.
 */
export async function executeCustomEngine(engine, inputValues, options = {}) {
  const manifest = validateEngineManifest(engine?.manifest || engine)
  const inputs = validateEngineInputs(manifest, inputValues)
  const source = transformSource(engine?.code)
  const started = Date.now()
  const deadline = started + manifest.timeoutMs
  const context = await newAsyncContext()

  try {
    context.runtime.setMemoryLimit(MEMORY_LIMIT)
    context.runtime.setMaxStackSize(STACK_LIMIT)
    context.runtime.setInterruptHandler(() => Date.now() > deadline)

    const inputHandle = context.newString(JSON.stringify(inputs))
    try { context.setProp(context.global, '__aharaneInputsJson', inputHandle) }
    finally { inputHandle.dispose() }

    const api = context.newObject()
    const network = context.newObject()
    if (manifest.permissions.includes('network.fetch')) {
      const fetchHandle = context.newAsyncifiedFunction('fetch', async (urlHandle, optionsHandle) => {
        const url = context.getString(urlHandle)
        const requestOptions = optionsHandle ? context.dump(optionsHandle) : {}
        requestOptions.timeoutMs = Math.min(Number(requestOptions.timeoutMs) || deadline - Date.now(), deadline - Date.now())
        if (requestOptions.timeoutMs <= 0) throw new Error('Engine execution time limit reached.')
        const response = options.networkFetch
          ? await options.networkFetch(manifest, url, requestOptions)
          : await approvedFetch(manifest, url, requestOptions)
        return context.newString(JSON.stringify(response))
      })
      try { context.setProp(network, 'fetch', fetchHandle) }
      finally { fetchHandle.dispose() }
    }
    try { context.setProp(api, 'network', network) }
    finally { network.dispose() }
    try { context.setProp(context.global, '__aharaneContext', api) }
    finally { api.dispose() }

    const bootstrap = await context.evalCodeAsync(
      'globalThis.__aharaneInputs = JSON.parse(__aharaneInputsJson); delete globalThis.__aharaneInputsJson;'
    )
    context.unwrapResult(bootstrap).dispose()

    // Asyncified host functions suspend the WebAssembly execution until the
    // restricted host capability has completed.
    const evaluated = await context.evalCodeAsync(
      source + '\n;run(__aharaneInputs, __aharaneContext)',
      'aharane-engine.js'
    )
    const promiseHandle = context.unwrapResult(evaluated)
    try {
      const settled = await context.resolvePromise(promiseHandle)
      const finalHandle = context.unwrapResult(settled)
      try {
        const outputs = validateEngineOutputs(manifest, jsonSafe(context.dump(finalHandle)))
        return {
          outputs,
          durationMs: Date.now() - started,
          engineId: manifest.id,
          engineVersion: manifest.version,
        }
      } finally { finalHandle.dispose() }
    } finally { promiseHandle.dispose() }
  } catch (error) {
    const message = String(error?.message || error)
    if (Date.now() > deadline || /interrupted|interrupt/i.test(message)) {
      throw new Error('Engine execution exceeded its ' + manifest.timeoutMs + ' ms time limit.')
    }
    throw new Error('Engine execution failed: ' + message.slice(0, 300))
  } finally {
    context.dispose()
  }
}
