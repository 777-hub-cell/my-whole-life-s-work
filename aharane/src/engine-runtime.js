import { createHash } from 'node:crypto'
import { lookup as dnsLookup } from 'node:dns/promises'
import https from 'node:https'
import { isIP } from 'node:net'
import { validateEngineInputs, validateEngineManifest, validateEngineOutputs } from './engine-contract.js'

// QuickJS is loaded lazily so the policy, limiter and error-contract code in this module can be
// imported (and unit tested) without the WebAssembly package; running an Engine still requires it.
async function loadQuickJS(options) {
  return options.quickjs || await import('quickjs-emscripten')
}

const MAX_REQUEST_BYTES = 16 * 1024
const MAX_RESPONSE_BYTES = 512 * 1024
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024
const MEMORY_LIMIT = 16 * 1024 * 1024
const STACK_LIMIT = 512 * 1024
const MAX_FETCHES_PER_RUN = 20
const MAX_TOTAL_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_CONCURRENT_RUNS = 4
const MAX_QUEUED_RUNS = 16
const MAX_QUEUE_WAIT_MS = 30_000

export const ENGINE_LIMITS = Object.freeze({
  requestBytes: MAX_REQUEST_BYTES, responseBytes: MAX_RESPONSE_BYTES, totalResponseBytes: MAX_TOTAL_RESPONSE_BYTES,
  outputBytes: MAX_OUTPUT_BYTES, memoryBytes: MEMORY_LIMIT, stackBytes: STACK_LIMIT, fetchesPerRun: MAX_FETCHES_PER_RUN,
  concurrentRuns: MAX_CONCURRENT_RUNS, queuedRuns: MAX_QUEUED_RUNS,
})

/**
 * Structured failure. `outcome` is one of: input_invalid, invalid_source, policy_denied, timeout,
 * cancelled, resource_exhausted, runtime_error, infrastructure. Messages never include host stacks.
 */
export class EngineExecutionError extends Error {
  constructor(outcome, message, details = {}) {
    super(message)
    this.name = 'EngineExecutionError'
    this.outcome = outcome
    this.code = outcome
    this.denials = details.denials || []
  }
}

/** Bounded concurrency with a bounded, time-limited queue. Release functions are idempotent. */
export function createConcurrencyLimiter(maxActive = MAX_CONCURRENT_RUNS, maxQueued = MAX_QUEUED_RUNS, maxWaitMs = MAX_QUEUE_WAIT_MS) {
  let active = 0
  const queue = []
  const makeRelease = () => {
    let released = false
    return () => {
      if (released) return
      released = true
      active -= 1
      const next = queue.shift()
      if (next) { clearTimeout(next.timer); active += 1; next.resolve(makeRelease()) }
    }
  }
  return {
    stats: () => ({ active, queued: queue.length }),
    acquire(signal) {
      if (signal?.aborted) return Promise.reject(new EngineExecutionError('cancelled', 'The Engine run was cancelled.'))
      if (active < maxActive) { active += 1; return Promise.resolve(makeRelease()) }
      if (queue.length >= maxQueued) {
        return Promise.reject(new EngineExecutionError('resource_exhausted', 'The Engine runtime is busy; try again shortly.'))
      }
      return new Promise((resolve, reject) => {
        const entry = { resolve, timer: null }
        const remove = () => { const index = queue.indexOf(entry); if (index >= 0) queue.splice(index, 1) }
        entry.timer = setTimeout(() => { remove(); reject(new EngineExecutionError('resource_exhausted', 'The Engine runtime is busy; try again shortly.')) }, maxWaitMs)
        signal?.addEventListener?.('abort', () => { remove(); clearTimeout(entry.timer); reject(new EngineExecutionError('cancelled', 'The Engine run was cancelled.')) }, { once: true })
        queue.push(entry)
      })
    },
  }
}
const defaultLimiter = createConcurrencyLimiter()

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

function denied(message) { return new EngineExecutionError('policy_denied', message) }

/**
 * Capability + host policy for ONE fetch call. Runs on every call, before any network I/O and
 * before any injected test transport, so a hidden UI or a stub can never widen the allowlist.
 */
export function assertFetchAllowed(manifest, urlValue, options = {}) {
  if (!manifest.permissions.includes('network.fetch') || !manifest.allowedHosts?.length) {
    throw denied('This Engine has no approved network.fetch host.')
  }
  let url
  try { url = new URL(String(urlValue || '')) } catch { throw denied('Network request rejected: the URL is not valid.') }
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || !manifest.allowedHosts.includes(host) ||
      url.username || url.password || (url.port && url.port !== '443') || isIP(host)) {
    throw denied('Network request rejected: use HTTPS on an exact approved hostname.')
  }

  const method = String(options.method || 'GET').toUpperCase()
  if (!['GET', 'POST'].includes(method)) throw denied('Only GET and POST are supported.')
  const body = options.body == null ? '' : typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
  if (Buffer.byteLength(body, 'utf8') > MAX_REQUEST_BYTES) throw new EngineExecutionError('resource_exhausted', 'Engine request body exceeds 16 KiB.')

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
  return { url, host, method, body, headers }
}

async function approvedFetch(manifest, urlValue, options = {}, transport = {}) {
  const { url, host, method, body, headers } = assertFetchAllowed(manifest, urlValue, options)
  const lookup = transport.lookup || dnsLookup
  const signal = transport.signal

  // Reject private DNS answers and pin the TLS request to the checked IPv4
  // address so a second DNS lookup cannot redirect it to an internal service.
  const resolved = await lookup(host, { all: true, family: 4, verbatim: true })
  if (!resolved.length || resolved.some(row => !publicIpv4(row.address))) {
    throw denied('Network request rejected: hostname did not resolve exclusively to public IPv4 addresses.')
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
    if (signal?.aborted) return finish(new EngineExecutionError('cancelled', 'The Engine run was cancelled.'))
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
          request.destroy(new EngineExecutionError('resource_exhausted', 'Engine response exceeds 512 KiB.'))
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
    signal?.addEventListener?.('abort', () => request.destroy(new EngineExecutionError('cancelled', 'The Engine run was cancelled.')), { once: true })
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
    throw new EngineExecutionError('invalid_source', 'Engine code must declare export function run(inputs, context).')
  }
  if (/^\s*(?:import|export)\s/m.test(body)) {
    throw new EngineExecutionError('invalid_source', 'Engine code cannot import modules or export additional values.')
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

export { approvedFetch as brokerFetch }

/** Source check without running anything (used for diagnostics); throws EngineExecutionError('invalid_source'). */
export function assertEngineSource(code) { return transformSource(code) }

function sourceHash(manifest, code) {
  return createHash('sha256').update(JSON.stringify({ manifest, code: String(code || '') })).digest('hex')
}

/** Rejects when the deadline passes or the run is cancelled, even if guest code never settles. */
function createGuard(deadline, signal) {
  let timer = null
  let onAbort = null
  const promise = new Promise((_, reject) => {
    const remaining = Math.max(0, deadline - Date.now())
    timer = setTimeout(() => reject(new EngineExecutionError('timeout', 'time limit')), remaining)
    if (signal) {
      onAbort = () => reject(new EngineExecutionError('cancelled', 'The Engine run was cancelled.'))
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }
  })
  promise.catch(() => {})
  return {
    race: operation => { const pending = Promise.resolve(operation); pending.catch(() => {}); return Promise.race([pending, promise]) },
    dispose() { clearTimeout(timer); if (signal && onAbort) signal.removeEventListener('abort', onAbort) },
  }
}

/**
 * Run user-authored JavaScript in a fresh QuickJS WebAssembly context.
 * Guest code has no Node globals, filesystem, process, module loader or ambient
 * fetch. External requests are brokered through an exact HTTPS host allowlist that is
 * re-checked on every call. Runs are concurrency-limited, time-limited (even when guest
 * promises never settle) and cancellable through options.signal.
 *
 * Failures throw EngineExecutionError with a stable `outcome` (see the class).
 */
export async function executeCustomEngine(engine, inputValues, options = {}) {
  const signal = options.signal
  if (signal?.aborted) throw new EngineExecutionError('cancelled', 'The Engine run was cancelled.')
  let manifest, inputs, source
  try {
    manifest = validateEngineManifest(engine?.manifest || engine)
    inputs = validateEngineInputs(manifest, inputValues)
  } catch (error) {
    throw new EngineExecutionError('input_invalid', String(error?.message || error).slice(0, 300))
  }
  source = transformSource(engine?.code)
  const sourceSha256 = sourceHash(manifest, engine?.code)

  const release = await (options.limiter || defaultLimiter).acquire(signal)
  const started = Date.now()
  const deadline = started + manifest.timeoutMs
  const denials = []
  let networkCalls = 0
  let totalResponseBytes = 0
  const guard = createGuard(deadline, signal)
  let context = null

  try {
    try {
      const quickjs = await loadQuickJS(options)
      context = await quickjs.newAsyncContext()
    } catch (error) {
      // The sandbox itself could not start: an infrastructure failure, not a fault in the Engine's code.
      throw new EngineExecutionError('infrastructure', 'The Engine sandbox is unavailable on this server.')
    }
    context.runtime.setMemoryLimit(MEMORY_LIMIT)
    context.runtime.setMaxStackSize(STACK_LIMIT)
    context.runtime.setInterruptHandler(() => Date.now() > deadline || signal?.aborted === true)

    const inputHandle = context.newString(JSON.stringify(inputs))
    try { context.setProp(context.global, '__aharaneInputsJson', inputHandle) }
    finally { inputHandle.dispose() }

    const api = context.newObject()
    const network = context.newObject()
    if (manifest.permissions.includes('network.fetch')) {
      const fetchHandle = context.newAsyncifiedFunction('fetch', async (urlHandle, optionsHandle) => {
        const url = context.getString(urlHandle)
        const requestOptions = optionsHandle ? context.dump(optionsHandle) : {}
        try {
          networkCalls += 1
          if (networkCalls > MAX_FETCHES_PER_RUN) throw new EngineExecutionError('resource_exhausted', 'Engine exceeded its limit of ' + MAX_FETCHES_PER_RUN + ' network requests per run.')
          // Capability and host policy are enforced on EVERY call, including when a transport is injected.
          assertFetchAllowed(manifest, url, requestOptions)
          const remaining = deadline - Date.now()
          requestOptions.timeoutMs = Math.min(Number(requestOptions.timeoutMs) || remaining, remaining)
          if (requestOptions.timeoutMs <= 0) throw new EngineExecutionError('timeout', 'Engine execution time limit reached.')
          const response = options.networkFetch
            ? await options.networkFetch(manifest, url, requestOptions)
            : await approvedFetch(manifest, url, requestOptions, { lookup: options.lookup, signal })
          totalResponseBytes += Buffer.byteLength(String(response?.body ?? ''), 'utf8')
          if (totalResponseBytes > MAX_TOTAL_RESPONSE_BYTES) throw new EngineExecutionError('resource_exhausted', 'Engine responses exceed the 2 MiB per-run limit.')
          return context.newString(JSON.stringify(response))
        } catch (error) {
          if (error instanceof EngineExecutionError && (error.outcome === 'policy_denied' || error.outcome === 'resource_exhausted')) {
            let host = ''
            try { host = new URL(url).hostname.slice(0, 100) } catch { /* invalid URL */ }
            denials.push({ outcome: error.outcome, message: error.message, host })
          }
          throw error
        }
      })
      try { context.setProp(network, 'fetch', fetchHandle) }
      finally { fetchHandle.dispose() }
    }
    try { context.setProp(api, 'network', network) }
    finally { network.dispose() }
    try { context.setProp(context.global, '__aharaneContext', api) }
    finally { api.dispose() }

    const bootstrap = await guard.race(context.evalCodeAsync(
      'globalThis.__aharaneInputs = JSON.parse(__aharaneInputsJson); delete globalThis.__aharaneInputsJson;'
    ))
    context.unwrapResult(bootstrap).dispose()

    // Asyncified host functions suspend the WebAssembly execution until the
    // restricted host capability has completed.
    const evaluated = await guard.race(context.evalCodeAsync(
      source + '\n;run(__aharaneInputs, __aharaneContext)',
      'aharane-engine.js'
    ))
    const promiseHandle = context.unwrapResult(evaluated)
    try {
      // QuickJS Promise callbacks are queued inside the guest runtime. Turning
      // the guest Promise into a host Promise is not enough: drain its pending
      // jobs so the guest .then(resolve, reject) callback can actually run.
      const hostResult = context.resolvePromise(promiseHandle)
      while (context.runtime.hasPendingJob()) {
        context.unwrapResult(context.runtime.executePendingJobs())
      }
      // The guard also covers guest promises that never settle (no host call, no loop to interrupt).
      const settled = await guard.race(hostResult)
      const finalHandle = context.unwrapResult(settled)
      try {
        const outputs = validateEngineOutputs(manifest, jsonSafe(context.dump(finalHandle)))
        return {
          outputs,
          durationMs: Date.now() - started,
          engineId: manifest.id,
          engineVersion: manifest.version,
          sourceSha256,
          outcome: 'success',
          networkCalls,
          denials,
        }
      } finally { finalHandle.dispose() }
    } finally { promiseHandle.dispose() }
  } catch (error) {
    if (error instanceof EngineExecutionError) {
      if (error.outcome === 'timeout') throw new EngineExecutionError('timeout', 'Engine execution exceeded its ' + manifest.timeoutMs + ' ms time limit.', { denials })
      throw new EngineExecutionError(error.outcome, error.message, { denials })
    }
    const message = String(error?.message || error)
    if (signal?.aborted) throw new EngineExecutionError('cancelled', 'The Engine run was cancelled.', { denials })
    if (Date.now() > deadline || /interrupted|interrupt/i.test(message)) {
      throw new EngineExecutionError('timeout', 'Engine execution exceeded its ' + manifest.timeoutMs + ' ms time limit.', { denials })
    }
    // A denial the guest did not catch surfaces as an ordinary guest error: report it as a policy denial.
    const denial = denials.find(item => message.includes(item.message))
    if (denial) throw new EngineExecutionError(denial.outcome, denial.message, { denials })
    if (/out of memory|stack overflow|memory limit/i.test(message)) {
      throw new EngineExecutionError('resource_exhausted', 'Engine execution failed: ' + message.slice(0, 300), { denials })
    }
    throw new EngineExecutionError('runtime_error', 'Engine execution failed: ' + message.slice(0, 300), { denials })
  } finally {
    guard.dispose()
    try { context?.dispose() } catch { /* a context still suspended on a host call cannot be disposed cleanly */ }
    release()
  }
}
