// REAL-SANDBOX adversarial suite for Agent 06 (packages 6B, 6C, 6D, 6H).
//
// These tests run saved Engine source through the actual QuickJS WebAssembly runtime via the same
// invokeEngine path as workflows and the Scheduler. They are SKIPPED (reported as skipped, never as
// passed) when `quickjs-emscripten` is not installed. Run `npm install` on Node 24, then
// `node --test test/engine-real-quickjs.test.js`.
//
// STATUS: written against the host code and the quickjs-emscripten API but NEVER EXECUTED in the
// authoring environment (no network). Expect to adjust assertions marked "OBSERVE" once real
// behaviour is seen; do not treat a first run as a rubber stamp in either direction.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEngineStore } from '../src/engine-store.js'
import { OUTCOMES, invokeEngine } from '../src/engine-invocation.js'

let available = true
try { await import('quickjs-emscripten') } catch { available = false }
const real = { skip: available ? false : 'quickjs-emscripten is not installed (run npm install on Node 24)' }

const manifest = (extra = {}) => ({
  id: 'probe', name: 'Probe', version: 1, entryPoint: 'run',
  inputs: [{ id: 'query', type: 'string' }], outputs: [{ id: 'result', type: 'string' }],
  permissions: [], allowedHosts: [], timeoutMs: 1000, maxResults: 10, ...extra,
})

async function workspace(t) {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-real-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const store = createEngineStore({ dataDir: dir })
  await store.init()
  // Saves `code` as the next revision of the 'probe' Engine, then invokes that exact revision.
  const run = async (code, extra = {}, { request = {}, signal } = {}) => {
    const current = await store.get('probe')
    const saved = current
      ? await store.save(manifest(extra), code, current.manifest.version, { expectedRevision: current.revision })
      : await store.save(manifest(extra), code)
    return invokeEngine({
      store, signal,
      request: { engineId: 'probe', revision: saved.revision, inputs: { query: 'world' }, source: 'library-test', ...request },
    })
  }
  return { dir, store, run }
}
const body = text => 'export async function run(inputs, context) {\n' + text + '\n}'

test('saved source persists and executes through real QuickJS, including after a store restart', real, async t => {
  const { dir, run } = await workspace(t)
  const first = await run(body('await Promise.resolve(); return { result: "hello " + inputs.query }'))
  assert.equal(first.ok, true, first.message)
  assert.deepEqual(first.outputs, { result: 'hello world' })
  assert.match(first.engine.sourceSha256, /^[0-9a-f]{64}$/)
  const restarted = createEngineStore({ dataDir: dir })
  await restarted.init()
  const again = await invokeEngine({ store: restarted, request: { engineId: 'probe', revision: first.engine.revision, inputs: { query: 'again' }, source: 'scheduler', account: 'private' } })
  assert.equal(again.ok, true, again.message)
  assert.deepEqual(again.outputs, { result: 'hello again' })
})

test('no ambient Node, browser or host globals exist in the guest', real, async t => {
  const { run } = await workspace(t)
  const names = ['process', 'require', 'module', 'exports', 'Buffer', 'global', 'window', 'document', 'fetch', 'XMLHttpRequest',
    'WebSocket', 'setTimeout', 'setInterval', 'setImmediate', 'importScripts', 'Deno', 'Bun', 'std', 'os']
  const probe = names.map(n => 'typeof ' + n).join(', ')
  const envelope = await run(body('return { result: JSON.stringify([' + probe + ']) }'))
  assert.equal(envelope.ok, true, envelope.message)
  assert.deepEqual(JSON.parse(envelope.outputs.result), names.map(() => 'undefined'))
})

test('the only host-installed globals are the Aharane context and inputs (OBSERVE)', real, async t => {
  const { run } = await workspace(t)
  const envelope = await run(body('return { result: JSON.stringify(Object.getOwnPropertyNames(globalThis).filter(n => n.startsWith("__")).sort()) }'))
  assert.equal(envelope.ok, true, envelope.message)
  assert.deepEqual(JSON.parse(envelope.outputs.result), ['__aharaneContext', '__aharaneInputs'])
})

test('module loading and constructor escapes find nothing to reach', real, async t => {
  const { run } = await workspace(t)
  const dyn = await run(body('let r = "none"; try { await import("node:fs"); r = "imported" } catch (e) { r = "blocked" } return { result: r }'))
  assert.ok(!(dyn.ok && dyn.outputs.result === 'imported'), 'dynamic import must not succeed')
  const ctor = await run(body('return { result: Function("return typeof process + typeof require")() }'))
  assert.equal(ctor.ok, true, ctor.message)
  assert.equal(ctor.outputs.result, 'undefinedundefined')
  const self = await run(body('return { result: String((function () { return this })() === undefined) + typeof (0, eval)("typeof process") }'))
  assert.equal(self.ok, true, self.message)
  assert.ok(!/process/.test(JSON.stringify(self.outputs)) || self.outputs.result.includes('string'))
})

test('network.fetch is absent without a grant and every unsafe call is denied with no I/O', real, async t => {
  const { run } = await workspace(t)
  const none = await run(body('return { result: typeof context.network.fetch }'))
  assert.equal(none.outputs.result, 'undefined')
  const grant = { permissions: ['network.fetch'], allowedHosts: ['api.example.com'] }
  for (const url of ['https://evil.example.org/', 'http://api.example.com/', 'https://127.0.0.1/', 'https://api.example.com:8443/', 'file:///etc/passwd']) {
    const uncaught = await run(body('const r = await context.network.fetch(' + JSON.stringify(url) + '); return { result: String(r.status) }'), grant)
    assert.equal(uncaught.ok, false, url)
    assert.equal(uncaught.outcome, 'policy_denied', url + ' (OBSERVE: how a host denial surfaces in the guest)')
    const swallowed = await run(body('try { await context.network.fetch(' + JSON.stringify(url) + ') } catch (e) {} return { result: "swallowed" }'), grant)
    assert.equal(swallowed.ok, true, swallowed.message)
    assert.ok(swallowed.denials.length >= 1, 'a denial the guest swallowed is still reported: ' + url)
    assert.equal(swallowed.networkCalls, 1)
  }
})

test('infinite loops and never-settling promises time out and release the sandbox', real, async t => {
  const { run } = await workspace(t)
  const started = Date.now()
  const loop = await run(body('while (true) {}'), { timeoutMs: 300 })
  assert.equal(loop.outcome, 'timeout')
  const hang = await run(body('await new Promise(() => {}); return { result: "never" }'), { timeoutMs: 300 })
  assert.equal(hang.outcome, 'timeout')
  assert.ok(Date.now() - started < 5000, 'both returned promptly')
  const after = await run(body('return { result: "alive" }'))
  assert.equal(after.ok, true, 'the service still runs Engines after exhaustion')
})

test('memory and stack exhaustion are contained and the next run still works (OBSERVE exact outcome)', real, async t => {
  const { run } = await workspace(t)
  const contained = new Set(['resource_exhausted', 'runtime_error', 'timeout'])
  const memory = await run(body('const a = []; for (;;) a.push("x".repeat(1000000)); return { result: "" }'), { timeoutMs: 5000 })
  assert.equal(memory.ok, false)
  assert.ok(contained.has(memory.outcome), memory.outcome)
  const stack = await run(body('const f = () => f() + 1; return { result: String(f()) }'), { timeoutMs: 5000 })
  assert.equal(stack.ok, false)
  assert.ok(contained.has(stack.outcome), stack.outcome)
  assert.equal((await run(body('return { result: "alive" }'))).ok, true)
})

test('cancellation stops a running guest promptly with outcome cancelled', real, async t => {
  const { run } = await workspace(t)
  const controller = new AbortController()
  const started = Date.now()
  setTimeout(() => controller.abort(), 100)
  const envelope = await run(body('while (true) {}'), { timeoutMs: 20000 }, { signal: controller.signal })
  assert.equal(envelope.outcome, 'cancelled')
  assert.ok(Date.now() - started < 3000, 'stopped promptly, long before the 20 s time limit')
})

test('invalid outputs and oversized results fail closed', real, async t => {
  const { run } = await workspace(t)
  for (const code of [body('return { result: 5 }'), body('return {}'), body('return { result: "x".repeat(9000) }'), body('return { result: "ok", leak: "x" }')]) {
    const envelope = await run(code)
    assert.equal(envelope.ok, false)
    assert.equal(envelope.outputs, undefined)
  }
  const syntax = await run('export async function run(inputs, context) { return { result: ')
  assert.equal(syntax.ok, false)
  assert.ok(['runtime_error', 'invalid_source'].includes(syntax.outcome), syntax.outcome)
})

test('concurrent pressure yields only structured outcomes, bounded queueing, and recovery', real, async t => {
  const { store } = await workspace(t)
  await store.save(manifest({ timeoutMs: 300 }), body('while (true) {}'))
  const results = await Promise.all(Array.from({ length: 24 }, () => invokeEngine({
    store, request: { engineId: 'probe', inputs: { query: 'q' }, source: 'workflow', account: 'public' },
  })))
  assert.ok(results.every(r => OUTCOMES.includes(r.outcome) && r.ok === false))
  assert.ok(results.some(r => r.outcome === 'timeout'), 'some runs executed and timed out')
  assert.ok(results.some(r => r.outcome === 'resource_exhausted'), 'the bounded queue rejected the overflow instead of growing')
  const current = await store.get('probe')
  await store.save(manifest(), body('return { result: "recovered" }'), current.manifest.version, { expectedRevision: current.revision })
  const after = await invokeEngine({ store, request: { engineId: 'probe', inputs: { query: 'q' }, source: 'workflow' } })
  assert.equal(after.ok, true, after.message)
})

test('host secrets never reach guest code or results (canary)', real, async t => {
  const canary = 'CANARY-' + Math.random().toString(36).slice(2)
  process.env.AHARANE_ADMIN_TOKEN = canary
  t.after(() => { delete process.env.AHARANE_ADMIN_TOKEN })
  const { run } = await workspace(t)
  const envelope = await run(body('const dump = JSON.stringify({ g: Object.getOwnPropertyNames(globalThis), c: Object.keys(context), n: Object.keys(context.network) }); return { result: dump.slice(0, 8000) }'))
  assert.equal(envelope.ok, true, envelope.message)
  assert.ok(!JSON.stringify(envelope).includes(canary))
  assert.deepEqual(JSON.parse(envelope.outputs.result).c, ['network'])
})
