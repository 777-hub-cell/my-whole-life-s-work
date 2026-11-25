// Offline sandbox-policy tests. These exercise the capability/host policy, DNS pinning checks,
// concurrency limiter, cancellation/timeout guard and the structured error contract WITHOUT the
// QuickJS WebAssembly package (not installable in the authoring sandbox). The "fake guest" tests
// stand in for QuickJS only to drive the host bridge; they are NOT proof of real sandbox isolation.
// Real-QuickJS behaviour is covered by test/engine-runtime.test.js when dependencies are installed.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EngineExecutionError,
  ENGINE_LIMITS,
  assertFetchAllowed,
  brokerFetch,
  createConcurrencyLimiter,
  executeCustomEngine,
} from '../src/engine-runtime.js'
import { validateEngineManifest } from '../src/engine-contract.js'

const manifestInput = (extra = {}) => ({
  id: 'probe', name: 'Probe', version: 1, entryPoint: 'run',
  inputs: [{ id: 'query', type: 'string' }], outputs: [{ id: 'result', type: 'string' }],
  permissions: ['network.fetch'], allowedHosts: ['api.example.com'], timeoutMs: 100, maxResults: 10,
  ...extra,
})
const manifest = (extra) => validateEngineManifest(manifestInput(extra))
const CODE = 'export async function run(inputs, context) { return { result: inputs.query } }'
const engine = (extra, code = CODE) => ({ manifest: manifestInput(extra), code })

const outcomeOf = async promise => { try { await promise } catch (error) { return error } return null }

test('fetch policy denies every unsafe request shape before any network I/O', () => {
  const allowed = manifest()
  const deny = (url, options, pattern) => assert.throws(() => assertFetchAllowed(allowed, url, options),
    error => error instanceof EngineExecutionError && error.outcome === 'policy_denied' && pattern.test(error.message), url)
  deny('http://api.example.com/x', {}, /HTTPS/)
  deny('https://evil.example.com/x', {}, /approved hostname/)
  deny('https://sub.api.example.com/x', {}, /approved hostname/)
  deny('https://api.example.com.evil.net/x', {}, /approved hostname/)
  deny('https://user:pw@api.example.com/x', {}, /approved hostname/)
  deny('https://api.example.com:8443/x', {}, /approved hostname/)
  deny('https://93.184.216.34/x', {}, /approved hostname/)
  deny('https://[::1]/x', {}, /approved hostname/)
  deny('file:///etc/passwd', {}, /HTTPS/)
  deny('not a url', {}, /not valid/)
  deny('https://api.example.com/x', { method: 'PUT' }, /GET and POST/)
  deny('https://api.example.com/x', { method: 'DELETE' }, /GET and POST/)
  assert.throws(() => assertFetchAllowed(manifest({ permissions: [], allowedHosts: [] }), 'https://api.example.com/x'), /no approved network.fetch host/)
  assert.throws(() => assertFetchAllowed(manifest({ allowedHosts: [] }), 'https://api.example.com/x'), /no approved network.fetch host/)
})

test('oversized request bodies are a resource denial, and only safe headers are forwarded', () => {
  const allowed = manifest()
  const big = 'x'.repeat(ENGINE_LIMITS.requestBytes + 1)
  assert.throws(() => assertFetchAllowed(allowed, 'https://api.example.com/x', { method: 'POST', body: big }),
    error => error.outcome === 'resource_exhausted')
  const ok = assertFetchAllowed(allowed, 'https://api.example.com/x?q=1', {
    method: 'POST', body: { a: 1 },
    headers: { authorization: 'Bearer secret', cookie: 'a=b', host: 'evil.example', 'x-forwarded-for': '1.2.3.4', accept: 'application/json', 'content-type': 'application/json' },
  })
  assert.deepEqual(Object.keys(ok.headers).sort(), ['accept', 'content-length', 'content-type', 'user-agent'])
  assert.equal(ok.host, 'api.example.com')
})

test('hostnames resolving to private, loopback, link-local or empty answers are refused (DNS rebinding / SSRF)', async () => {
  const allowed = manifest()
  for (const answers of [
    [{ address: '10.0.0.5' }], [{ address: '127.0.0.1' }], [{ address: '169.254.169.254' }], [{ address: '192.168.1.1' }],
    [{ address: '172.16.0.9' }], [{ address: '100.64.0.1' }], [{ address: '0.0.0.0' }],
    [{ address: '93.184.216.34' }, { address: '10.1.1.1' }], [],
  ]) {
    const error = await outcomeOf(brokerFetch(allowed, 'https://api.example.com/x', {}, { lookup: async () => answers }))
    assert.ok(error instanceof EngineExecutionError, JSON.stringify(answers))
    assert.equal(error.outcome, 'policy_denied')
    assert.match(error.message, /public IPv4/)
  }
})

test('a cancelled request is reported as cancelled before any connection is opened', async () => {
  const controller = new AbortController()
  controller.abort()
  const error = await outcomeOf(brokerFetch(manifest(), 'https://api.example.com/x', {}, { lookup: async () => [{ address: '93.184.216.34' }], signal: controller.signal }))
  assert.equal(error.outcome, 'cancelled')
})

test('concurrency limiter bounds active runs and queue, releases idempotently, honours cancel and wait limits', async () => {
  const limiter = createConcurrencyLimiter(2, 1, 5000)
  const a = await limiter.acquire()
  const b = await limiter.acquire()
  assert.deepEqual(limiter.stats(), { active: 2, queued: 0 })
  const queued = limiter.acquire()
  assert.deepEqual(limiter.stats(), { active: 2, queued: 1 })
  const overflow = await outcomeOf(limiter.acquire())
  assert.equal(overflow.outcome, 'resource_exhausted')
  a(); a() // second release is a no-op
  const c = await queued
  assert.deepEqual(limiter.stats(), { active: 2, queued: 0 })
  b(); c()
  assert.deepEqual(limiter.stats(), { active: 0, queued: 0 })

  const busy = createConcurrencyLimiter(1, 2, 5000)
  const hold = await busy.acquire()
  const controller = new AbortController()
  const waiting = outcomeOf(busy.acquire(controller.signal))
  controller.abort()
  assert.equal((await waiting).outcome, 'cancelled')
  assert.equal(busy.stats().queued, 0)
  hold()

  const slow = createConcurrencyLimiter(1, 2, 30)
  const hold2 = await slow.acquire()
  const timedOut = await outcomeOf(slow.acquire())
  assert.equal(timedOut.outcome, 'resource_exhausted')
  hold2()
})

// ---- fake QuickJS: drives the host bridge only ---------------------------------------------
function fakeQuickJS(script) {
  const calls = { disposed: 0, contexts: 0 }
  const handle = value => ({ value, dispose() {} })
  return {
    calls,
    async newAsyncContext() {
      calls.contexts += 1
      let hostFetch = null
      const context = {
        runtime: { setMemoryLimit() {}, setMaxStackSize() {}, setInterruptHandler() {}, hasPendingJob: () => false, executePendingJobs: () => ({}) },
        global: handle('global'),
        newString: value => handle(value),
        newObject: () => handle({}),
        setProp(_object, key, value) { if (key === 'fetch') hostFetch = value.value },
        newAsyncifiedFunction: (_name, fn) => handle(fn),
        getString: value => value.value,
        dump: value => value.value,
        evalCodeAsync: async () => ({ value: handle('evaluated') }),
        unwrapResult: result => { if (result.error) throw result.error; return result.value },
        resolvePromise: () => script({ fetch: (url, options) => hostFetch(handle(url), options === undefined ? undefined : handle(options)) }, handle),
        dispose() { calls.disposed += 1 },
      }
      return context
    },
  }
}
const guestError = error => new Error(error.message) // an uncaught host error reaches the guest as a plain error

test('success reports outcome, a source hash that changes with the code, and no denials', async () => {
  const quickjs = fakeQuickJS(async (_host, handle) => ({ value: handle({ result: 'ok' }) }))
  const result = await executeCustomEngine(engine(), { query: 'q' }, { quickjs })
  assert.equal(result.outcome, 'success')
  assert.deepEqual(result.outputs, { result: 'ok' })
  assert.match(result.sourceSha256, /^[0-9a-f]{64}$/)
  assert.deepEqual(result.denials, [])
  const changed = await executeCustomEngine(engine({}, CODE + '\n// edited'), { query: 'q' }, { quickjs })
  assert.notEqual(changed.sourceSha256, result.sourceSha256)
  const same = await executeCustomEngine(engine(), { query: 'q' }, { quickjs })
  assert.equal(same.sourceSha256, result.sourceSha256)
})

test('bad inputs, bad source and pre-cancelled runs fail with stable outcomes and never create a context', async () => {
  const quickjs = fakeQuickJS(async (_host, handle) => ({ value: handle({ result: 'ok' }) }))
  const missing = await outcomeOf(executeCustomEngine(engine(), {}, { quickjs }))
  assert.equal(missing.outcome, 'input_invalid')
  assert.match(missing.message, /Missing Engine input/)
  const extra = await outcomeOf(executeCustomEngine(engine(), { query: 'q', other: 1 }, { quickjs }))
  assert.equal(extra.outcome, 'input_invalid')
  const noRun = await outcomeOf(executeCustomEngine(engine({}, 'const x = 1'), { query: 'q' }, { quickjs }))
  assert.equal(noRun.outcome, 'invalid_source')
  const withImport = await outcomeOf(executeCustomEngine(engine({}, 'import fs from "fs"\nexport function run() { return {} }'), { query: 'q' }, { quickjs }))
  assert.equal(withImport.outcome, 'invalid_source')
  const empty = await outcomeOf(executeCustomEngine(engine({}, ''), { query: 'q' }, { quickjs }))
  assert.equal(empty.outcome, 'invalid_source')
  const controller = new AbortController()
  controller.abort()
  const cancelled = await outcomeOf(executeCustomEngine(engine(), { query: 'q' }, { quickjs, signal: controller.signal }))
  assert.equal(cancelled.outcome, 'cancelled')
  assert.equal(quickjs.calls.contexts, 0)
})

test('a guest promise that never settles is cut off at the time limit and its slot and context are released', async () => {
  const limiter = createConcurrencyLimiter(1, 0)
  const quickjs = fakeQuickJS(() => new Promise(() => {}))
  const started = Date.now()
  const error = await outcomeOf(executeCustomEngine(engine({ timeoutMs: 100 }), { query: 'q' }, { quickjs, limiter }))
  assert.equal(error.outcome, 'timeout')
  assert.match(error.message, /100 ms time limit/)
  assert.ok(Date.now() - started < 1500)
  assert.deepEqual(limiter.stats(), { active: 0, queued: 0 })
  assert.equal(quickjs.calls.disposed, 1)
})

test('cancelling a running Engine stops it promptly and releases resources', async () => {
  const limiter = createConcurrencyLimiter(1, 0)
  const quickjs = fakeQuickJS(() => new Promise(() => {}))
  const controller = new AbortController()
  const pending = outcomeOf(executeCustomEngine(engine({ timeoutMs: 30000 }), { query: 'q' }, { quickjs, limiter, signal: controller.signal }))
  setTimeout(() => controller.abort(), 30)
  const started = Date.now()
  const error = await pending
  assert.equal(error.outcome, 'cancelled')
  assert.ok(Date.now() - started < 1500)
  assert.deepEqual(limiter.stats(), { active: 0, queued: 0 })
  assert.equal(quickjs.calls.disposed, 1)
})

test('concurrent pressure beyond the limiter is rejected as resource_exhausted, not queued forever', async () => {
  const limiter = createConcurrencyLimiter(1, 0)
  const quickjs = fakeQuickJS(() => new Promise(() => {}))
  const first = outcomeOf(executeCustomEngine(engine({ timeoutMs: 200 }), { query: 'q' }, { quickjs, limiter }))
  await new Promise(resolve => setTimeout(resolve, 20))
  const second = await outcomeOf(executeCustomEngine(engine(), { query: 'q' }, { quickjs, limiter }))
  assert.equal(second.outcome, 'resource_exhausted')
  assert.equal((await first).outcome, 'timeout')
  assert.deepEqual(limiter.stats(), { active: 0, queued: 0 })
})

test('an uncaught policy denial inside the guest is reported as policy_denied with a structured record', async () => {
  const quickjs = fakeQuickJS(async (host, handle) => {
    try { await host.fetch('http://api.example.com/plain-http') } catch (error) { throw guestError(error) }
    return { value: handle({ result: 'unreachable' }) }
  })
  const error = await outcomeOf(executeCustomEngine(engine(), { query: 'q' }, { quickjs }))
  assert.equal(error.outcome, 'policy_denied')
  assert.equal(error.denials.length, 1)
  assert.equal(error.denials[0].host, 'api.example.com')
})

test('a denial the guest swallows is still reported on an otherwise successful run', async () => {
  const quickjs = fakeQuickJS(async (host, handle) => {
    try { await host.fetch('https://evil.example.com/steal') } catch { /* guest ignores the error */ }
    return { value: handle({ result: 'done' }) }
  })
  const result = await executeCustomEngine(engine(), { query: 'q' }, { quickjs })
  assert.equal(result.outcome, 'success')
  assert.equal(result.denials.length, 1)
  assert.equal(result.denials[0].outcome, 'policy_denied')
  assert.equal(result.denials[0].host, 'evil.example.com')
})

test('an injected transport can never widen the allowlist, and each call is checked', async () => {
  let transportCalls = 0
  const networkFetch = async () => { transportCalls += 1; return { status: 200, contentType: 'text/plain', encoding: 'utf8', body: 'x' } }
  const quickjs = fakeQuickJS(async (host, handle) => {
    await host.fetch('https://api.example.com/ok')
    try { await host.fetch('https://evil.example.com/no') } catch { /* swallowed */ }
    await host.fetch('https://api.example.com/ok-again')
    return { value: handle({ result: 'done' }) }
  })
  const result = await executeCustomEngine(engine(), { query: 'q' }, { quickjs, networkFetch })
  assert.equal(transportCalls, 2, 'the transport is never reached for the unapproved host')
  assert.equal(result.networkCalls, 3)
  assert.equal(result.denials.length, 1)
})

test('without the network.fetch permission the bridge does not exist and no transport is reached', async () => {
  let transportCalls = 0
  // The fake only registers hostFetch when the runtime registers it, so a missing registration
  // surfaces as a TypeError (calling null), exactly like a missing function in the guest.
  const quickjs = fakeQuickJS(async (host, handle) => {
    let reason = 'bridge present'
    try { await host.fetch('https://api.example.com/x') } catch (error) { reason = error instanceof TypeError ? 'no bridge' : error.message }
    return { value: handle({ result: reason }) }
  })
  const result = await executeCustomEngine(engine({ permissions: [], allowedHosts: [] }), { query: 'q' }, {
    quickjs, networkFetch: async () => { transportCalls += 1; return {} },
  })
  assert.equal(result.outputs.result, 'no bridge')
  assert.equal(transportCalls, 0)
})

test('per-run network request budget is enforced', async () => {
  const quickjs = fakeQuickJS(async (host, handle) => {
    for (let index = 0; index < ENGINE_LIMITS.fetchesPerRun + 1; index += 1) await host.fetch('https://api.example.com/n' + index)
    return { value: handle({ result: 'unreachable' }) }
  })
  const networkFetch = async () => ({ status: 200, contentType: 'text/plain', encoding: 'utf8', body: 'x' })
  const error = await outcomeOf(executeCustomEngine(engine({ timeoutMs: 5000 }), { query: 'q' }, { quickjs, networkFetch }))
  assert.equal(error.outcome, 'resource_exhausted')
  assert.match(error.message, /network requests per run/)
})

test('total response size budget is enforced across calls', async () => {
  const quickjs = fakeQuickJS(async (host, handle) => {
    for (let index = 0; index < 6; index += 1) await host.fetch('https://api.example.com/big' + index)
    return { value: handle({ result: 'unreachable' }) }
  })
  const networkFetch = async () => ({ status: 200, contentType: 'text/plain', encoding: 'utf8', body: 'x'.repeat(500 * 1024) })
  const error = await outcomeOf(executeCustomEngine(engine({ timeoutMs: 5000 }), { query: 'q' }, { quickjs, networkFetch }))
  assert.equal(error.outcome, 'resource_exhausted')
  assert.match(error.message, /2 MiB/)
})

test('runtime and resource failures are classified and never leak host stacks or paths', async () => {
  const run = message => outcomeOf(executeCustomEngine(engine(), { query: 'q' }, { quickjs: fakeQuickJS(async () => { throw new Error(message) }) }))
  assert.equal((await run('InternalError: out of memory')).outcome, 'resource_exhausted')
  assert.equal((await run('RangeError: stack overflow')).outcome, 'resource_exhausted')
  const plain = await run('TypeError: x is not a function')
  assert.equal(plain.outcome, 'runtime_error')
  assert.match(plain.message, /^Engine execution failed: TypeError/)
  assert.equal(/\n\s+at /.test(plain.message), false, 'no stack frames in the message')
  const outputs = await outcomeOf(executeCustomEngine(engine(), { query: 'q' }, { quickjs: fakeQuickJS(async (_h, handle) => ({ value: handle({ wrong: 1 }) })) }))
  assert.equal(outputs.outcome, 'runtime_error')
  assert.match(outputs.message, /Unexpected Engine output/)
})

test('host environment secrets are not reachable through the result or error contract', async () => {
  process.env.AHARANE_TEST_SECRET = 'super-secret-value-123'
  try {
    const quickjs = fakeQuickJS(async (_host, handle) => ({ value: handle({ result: 'safe' }) }))
    const result = await executeCustomEngine(engine(), { query: 'q' }, { quickjs })
    assert.equal(JSON.stringify(result).includes('super-secret-value-123'), false)
    const failure = await outcomeOf(executeCustomEngine(engine(), {}, { quickjs }))
    assert.equal(JSON.stringify({ message: failure.message, denials: failure.denials }).includes('super-secret-value-123'), false)
  } finally { delete process.env.AHARANE_TEST_SECRET }
})

test('a sandbox that cannot start is an infrastructure failure and still releases its slot', async () => {
  const limiter = createConcurrencyLimiter(1, 0)
  const broken = { newAsyncContext: async () => { throw new Error('wasm init failed at /srv/app/node_modules/x') } }
  const error = await outcomeOf(executeCustomEngine(engine(), { query: 'q' }, { quickjs: broken, limiter }))
  assert.equal(error.outcome, 'infrastructure')
  assert.equal(error.message.includes('/srv/app'), false, 'host paths are not leaked')
  assert.deepEqual(limiter.stats(), { active: 0, queued: 0 })
})
