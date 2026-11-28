import test from 'node:test'
import assert from 'node:assert/strict'
import { executeCustomEngine, engineIsolationFor } from '../src/engine-runtime.js'

function makeEngine(manifest = {}, code = 'export async function run(inputs) { return { result: inputs.query.toUpperCase() } }') {
  return {
    manifest: {
      id: 'example', name: 'Example Engine', version: 1, entryPoint: 'run',
      inputs: [{ id: 'query', type: 'string' }],
      outputs: [{ id: 'result', type: 'string' }],
      permissions: [], allowedHosts: [], timeoutMs: 3000, maxResults: 10,
      ...manifest,
    },
    code,
  }
}

test('executes custom JavaScript without exposing Node host globals', async () => {
  const engine = makeEngine({}, 'export async function run(inputs) { return { result: [typeof process, typeof require, typeof fetch, typeof Buffer, inputs.query].join(":") } }')
  const result = await executeCustomEngine(engine, { query: 'ok' })
  assert.equal(result.outputs.result, 'undefined:undefined:undefined:undefined:ok')
  assert.equal(result.engineId, 'example')
  assert.equal(result.engineVersion, 1)
})

test('exposes network.fetch only through an explicit host allowlist', async () => {
  const engine = makeEngine({
    permissions: ['network.fetch'],
    allowedHosts: ['images.example.com'],
  }, 'export async function run(inputs, context) { const response = JSON.parse(context.network.fetch(inputs.query)); return { result: String(response.status) + ":" + response.body } }')
  const result = await executeCustomEngine(engine, { query: 'https://images.example.com/search?q=cat' }, {
    networkFetch: async (manifest, url) => {
      assert.deepEqual(manifest.allowedHosts, ['images.example.com'])
      assert.equal(url, 'https://images.example.com/search?q=cat')
      return { status: 200, contentType: 'application/json', encoding: 'utf8', body: '{"items":[1]}' }
    },
  })
  assert.equal(result.outputs.result, '200:{"items":[1]}')
})

test('rejects missing inputs and interrupts non-terminating code', async () => {
  await assert.rejects(executeCustomEngine(makeEngine(), {}), /Missing Engine input/)
  const engine = makeEngine({ timeoutMs: 100 }, 'export function run() { while (true) {} }')
  await assert.rejects(executeCustomEngine(engine, { query: 'x' }), /time limit/)
})

test('does not expose the network capability without permission', async () => {
  const engine = makeEngine({}, 'export function run(inputs, context) { return { result: typeof context.network.fetch } }')
  const result = await executeCustomEngine(engine, { query: 'x' })
  assert.equal(result.outputs.result, 'undefined')
})


test('production Engines use worker isolation while injected test doubles stay inline', () => {
  assert.equal(engineIsolationFor(), 'worker')
  assert.equal(engineIsolationFor({ isolation: 'inline' }), 'inline')
  assert.equal(engineIsolationFor({ quickjs: {} }), 'inline')
  assert.equal(engineIsolationFor({ networkFetch: async () => ({}) }), 'inline')
  assert.equal(engineIsolationFor({ lookup: async () => [] }), 'inline')
})

test('a synchronous Engine loop can be cancelled without blocking the main event loop', async () => {
  const controller = new AbortController()
  const abortTimer = setTimeout(() => controller.abort(), 80)
  try {
    const engine = makeEngine(
      { timeoutMs: 3_000 },
      'export function run() { while (true) {} }'
    )
    await assert.rejects(
      executeCustomEngine(engine, { query: 'x' }, { signal: controller.signal }),
      error => error?.outcome === 'cancelled'
    )
  } finally {
    clearTimeout(abortTimer)
  }
})
