// Offline tests for the single Engine invocation path (workflow, Scheduler, Library test action).
// They use the REAL Engine store and the REAL invokeEngine/createEngineRunner/executeCustomEngine
// host code. QuickJS itself is replaced by a recording fake guest, so these tests prove routing,
// revision pinning, policy and envelope behaviour, NOT real sandbox isolation. Real-sandbox tests
// are in test/engine-real-quickjs.test.js and are reported as SKIPPED when QuickJS is absent.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEngineStore } from '../src/engine-store.js'
import { EngineExecutionError, executeCustomEngine } from '../src/engine-runtime.js'
import {
  INVOCATION_SOURCES, OUTCOMES, createEngineRunner, describeEngineCapabilities, diagnoseEngine,
  httpResponseForEnvelope, httpStatusForEnvelope, invokeEngine, normalizeInvocationRequest,
} from '../src/engine-invocation.js'
import {
  createVisualCommandStore, createWorkflowDraft, executeVisualWorkflow, registerEngineNode, unregisterEngineNode,
} from '../src/visual-command-builder.js'

const manifest = (extra = {}) => ({
  id: 'lookup', name: 'Lookup', version: 1, entryPoint: 'run',
  inputs: [{ id: 'query', type: 'string' }], outputs: [{ id: 'result', type: 'string' }],
  permissions: ['network.fetch'], allowedHosts: ['api.example.com'], timeoutMs: 1000, maxResults: 10, ...extra,
})
const codeOf = label => 'export async function run(inputs, context) { return { result: "' + label + '" } }'

async function library(t) {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-invoke-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const store = createEngineStore({ dataDir: dir })
  await store.init()
  return store
}

/** Recording fake guest: captures what the host exposes and evaluates. */
function recordingGuest(result = { result: 'ok' }) {
  const seen = { props: [], evaluated: [], objects: [] }
  const handle = value => ({ value, dispose() {} })
  return {
    seen,
    async newAsyncContext() {
      let current = null
      return {
        runtime: { setMemoryLimit() {}, setMaxStackSize() {}, setInterruptHandler() {}, hasPendingJob: () => false, executePendingJobs: () => ({}) },
        global: handle('global'),
        newString: value => handle(value),
        newObject: () => { const object = handle({}); seen.objects.push(object); return object },
        setProp(object, key, value) { seen.props.push({ on: object.value === 'global' ? 'global' : 'object', key }); if (object.value && typeof object.value === 'object') object.value[key] = value.value },
        newAsyncifiedFunction: (_name, fn) => handle(fn),
        getString: value => value.value,
        dump: value => value.value,
        evalCodeAsync: async code => { seen.evaluated.push(code); return { value: handle('evaluated') } },
        unwrapResult: r => { if (r.error) throw r.error; return r.value },
        resolvePromise: () => Promise.resolve({ value: handle(result) }),
        dispose() { current = null },
      }
    },
  }
}

// ---------------------------------------------------------------- request contract
test('invocation request validation: sources, ids, revisions, inputs and correlation IDs', () => {
  const ok = over => normalizeInvocationRequest({ engineId: 'lookup', source: 'workflow', inputs: {}, ...over })
  for (const source of INVOCATION_SOURCES) assert.equal(ok({ source }).source, source)
  for (const source of ['api', 'admin-preview', 'direct', '', undefined, 'Workflow']) assert.throws(() => ok({ source }), /Unsupported invocation source/)
  for (const engineId of ['', 'Lookup', '../x', 'a'.repeat(49), '1abc', undefined]) assert.throws(() => ok({ engineId }), /Invalid Engine ID/)
  for (const revision of [0, -1, 1.5, 'abc', NaN]) assert.throws(() => ok({ revision }), /positive integer/)
  assert.equal(ok({ revision: '3' }).revision, 3)
  assert.equal(ok({ revision: undefined }).revision, null)
  for (const account of ['admin', 'PRIVATE', 7]) assert.throws(() => ok({ account }), /Invalid account/)
  assert.equal(ok({ account: 'public' }).account, 'public')
  for (const inputs of [null, [], 'x', 5]) assert.throws(() => ok({ inputs }), /inputs must be an object/)
  assert.deepEqual(ok({ inputs: undefined }).inputs, {})
  for (const correlationId of ['a b', 'a\nb', 'x'.repeat(121), '<script>', 'a/b']) assert.throws(() => ok({ correlationId }), /Invalid correlation ID/)
  assert.match(ok({}).correlationId, /^[0-9a-f-]{36}$/, 'a missing ID is generated')
  assert.equal(ok({ correlationId: 'run-1:node.2' }).correlationId, 'run-1:node.2')
  assert.throws(() => normalizeInvocationRequest(null), /must be an object/)
})

test('a malformed request is a structured invalid_request, never an exception or a run', async t => {
  const store = await library(t)
  let ran = false
  const envelope = await invokeEngine({ store, execute: async () => { ran = true }, request: { engineId: 'lookup', source: 'api' } })
  assert.equal(envelope.ok, false)
  assert.equal(envelope.outcome, 'invalid_request')
  assert.equal(ran, false)
  assert.equal(httpStatusForEnvelope(envelope), 400)
})

// ---------------------------------------------------------------- immutable revisions
test('pinned revision executes that exact saved snapshot even after the Engine changed (workflow and scheduler sources)', async t => {
  const store = await library(t)
  const r1 = await store.save(manifest(), codeOf('one'))
  const r2 = await store.save(manifest({ version: 2 }), codeOf('two'), 1)
  assert.deepEqual([r1.revision, r2.revision], [1, 2])
  const received = []
  const execute = async (engine, inputs) => { received.push({ code: engine.code, revision: engine.revision, sha: engine.sha256 }); return { outputs: { result: 'x' }, durationMs: 1, networkCalls: 0, denials: [] } }

  for (const source of ['workflow', 'scheduler']) {
    const pinned = await invokeEngine({ store, execute, request: { engineId: 'lookup', revision: 1, inputs: { query: 'q' }, source, account: 'private', correlationId: 'c-' + source } })
    assert.equal(pinned.ok, true)
    assert.deepEqual([pinned.engine.revision, pinned.engine.pinned, pinned.engine.sourceSha256], [1, true, r1.sha256])
    assert.equal(pinned.source, source)
    assert.equal(pinned.correlationId, 'c-' + source)
    assert.equal(received.at(-1).code, codeOf('one'), 'the OLD source ran, not the latest')
    assert.equal(received.at(-1).sha, r1.sha256)
  }
  const latest = await invokeEngine({ store, execute, request: { engineId: 'lookup', inputs: { query: 'q' }, source: 'workflow' } })
  assert.deepEqual([latest.engine.revision, latest.engine.pinned, latest.engine.version], [2, false, 2])
  assert.equal(received.at(-1).code, codeOf('two'))
})

test('missing Engine and pruned revision are distinct outcomes; nothing runs', async t => {
  const store = await library(t)
  await store.save(manifest(), codeOf('one'))
  let ran = 0
  const execute = async () => { ran += 1 }
  const missing = await invokeEngine({ store, execute, request: { engineId: 'ghost', source: 'workflow' } })
  const pinnedMissing = await invokeEngine({ store, execute, request: { engineId: 'ghost', revision: 1, source: 'workflow' } })
  const pruned = await invokeEngine({ store, execute, request: { engineId: 'lookup', revision: 9, source: 'scheduler' } })
  assert.deepEqual([missing.outcome, pinnedMissing.outcome, pruned.outcome], ['not_found', 'not_found', 'revision_unavailable'])
  assert.equal(pruned.message, 'The referenced Engine revision is not available.')
  assert.equal(httpStatusForEnvelope(pruned), 404)
  assert.equal(ran, 0)
})

// ---------------------------------------------------------------- structured outcomes
test('every runtime outcome maps to a distinct envelope and denials survive', async t => {
  const store = await library(t)
  await store.save(manifest(), codeOf('one'))
  for (const outcome of ['input_invalid', 'invalid_source', 'policy_denied', 'timeout', 'cancelled', 'resource_exhausted', 'runtime_error', 'infrastructure']) {
    const denials = outcome === 'policy_denied' ? [{ outcome, message: 'no', host: 'evil.test' }] : []
    const envelope = await invokeEngine({
      store, execute: async () => { throw new EngineExecutionError(outcome, 'm-' + outcome, { denials }) },
      request: { engineId: 'lookup', inputs: { query: 'q' }, source: 'workflow' },
    })
    assert.equal(envelope.ok, false)
    assert.equal(envelope.outcome, outcome)
    assert.equal(envelope.message, 'm-' + outcome)
    assert.deepEqual(envelope.denials, denials)
    assert.equal(envelope.engine.revision, 1)
    assert.ok(OUTCOMES.includes(envelope.outcome))
  }
})

test('unexpected failures never leak host paths, stacks or secrets in the envelope', async t => {
  const store = await library(t)
  await store.save(manifest(), codeOf('one'))
  const logged = []
  const logger = { error: entry => logged.push(entry), warn: entry => logged.push(entry) }
  const envelope = await invokeEngine({
    store, logger, execute: async () => { throw new Error('ENOENT /srv/aharane/data/secret-token.json token=SECRET123') },
    request: { engineId: 'lookup', inputs: { query: 'q' }, source: 'workflow' },
  })
  assert.equal(envelope.outcome, 'infrastructure')
  assert.ok(!JSON.stringify(envelope).includes('SECRET123') && !JSON.stringify(envelope).includes('/srv/aharane'))
  assert.ok(!JSON.stringify(logged).includes('SECRET123'), 'the log carries codes only')
  assert.equal(httpStatusForEnvelope(envelope), 503)
  // An unknown outcome string from a buggy runtime is normalised, not forwarded.
  const odd = await invokeEngine({ store, execute: async () => { throw new EngineExecutionError('made_up', 'x') }, request: { engineId: 'lookup', inputs: { query: 'q' }, source: 'workflow' } })
  assert.equal(odd.outcome, 'infrastructure')
})

test('a cancelled signal reaches the runtime and is reported as cancelled', async t => {
  const store = await library(t)
  await store.save(manifest(), codeOf('one'))
  const controller = new AbortController()
  controller.abort()
  const envelope = await invokeEngine({
    store, signal: controller.signal, executeOptions: { quickjs: recordingGuest() },
    request: { engineId: 'lookup', inputs: { query: 'q' }, source: 'library-test' },
  })
  assert.equal(envelope.outcome, 'cancelled')
})

// ---------------------------------------------------------------- real runtime host code, fake guest
test('saved source flows store -> invokeEngine -> executeCustomEngine -> guest as the exact pinned text', async t => {
  const store = await library(t)
  await store.save(manifest(), codeOf('first'))
  await store.save(manifest({ version: 2 }), codeOf('second'), 1)
  const guest = recordingGuest({ result: 'from-guest' })
  const envelope = await invokeEngine({
    store, executeOptions: { quickjs: guest },
    request: { engineId: 'lookup', revision: 1, inputs: { query: 'q' }, source: 'scheduler', account: 'public' },
  })
  assert.equal(envelope.ok, true, envelope.message)
  assert.deepEqual(envelope.outputs, { result: 'from-guest' })
  const evaluatedSource = guest.seen.evaluated.find(code => code.includes('run(__aharaneInputs'))
  assert.ok(evaluatedSource.includes('"first"') && !evaluatedSource.includes('"second"'), 'the pinned revision text was evaluated')
  assert.equal(envelope.engine.sourceSha256, (await store.getRevision('lookup', 1)).sha256)
})

test('the store hash and the runtime hash agree, so a result can be tied to a saved revision', async t => {
  const store = await library(t)
  const saved = await store.save(manifest(), codeOf('one'))
  const result = await executeCustomEngine(saved, { query: 'q' }, { quickjs: recordingGuest() })
  assert.equal(result.sourceSha256, saved.sha256)
})

// ---------------------------------------------------------------- workflow + scheduler through the production runner
function engineWorkflow(engineRevision) {
  const workflow = createWorkflowDraft('private')
  const trigger = workflow.nodes[0]
  trigger.config.command = 'lookup'
  const config = { engineVersion: '1' }
  if (engineRevision !== undefined) config.engineRevision = engineRevision
  const node = { id: 'engine-node', type: 'engine.lookup', x: 500, y: 100, config }
  workflow.nodes = [trigger, node]
  workflow.edges = [
    { id: 'e1', from: trigger.id, fromSocket: 'next', to: node.id, toSocket: 'in' },
    { id: 'e2', from: trigger.id, fromSocket: 'arguments', to: node.id, toSocket: 'query' },
  ]
  return workflow
}
const runContext = extra => ({
  sessionId: 'private', privateControl: true, remoteJid: '2348012345678@s.whatsapp.net', sender: '2348012345678@s.whatsapp.net',
  messageText: '.lookup cats', args: ['cats'], rawArgs: 'cats',
  message: { key: { id: 'm1', remoteJid: '2348012345678@s.whatsapp.net', fromMe: true }, message: { conversation: '.lookup cats' } },
  socket: { sendMessage: async () => ({ key: { id: 's1' } }) }, ...extra,
})

test('Builder and Scheduler both run the intended saved revision through createEngineRunner, with their own source', async t => {
  const store = await library(t)
  await store.save(manifest(), codeOf('one'))
  await store.save(manifest({ version: 2 }), codeOf('two'), 1)
  registerEngineNode(manifest())
  t.after(() => unregisterEngineNode('lookup'))
  const dir = await mkdtemp(join(tmpdir(), 'aharane-wf-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const workflows = createVisualCommandStore(join(dir, 'w.json'))
  await workflows.init()

  const calls = []
  const execute = async (engine, inputs) => { calls.push({ revision: engine.revision, inputs }); return { outputs: { result: 'r' + engine.revision }, durationMs: 1, networkCalls: 0, denials: [] } }
  const runEngine = createEngineRunner({ store, execute })

  const live = await executeVisualWorkflow(engineWorkflow('1'), { store: workflows, context: runContext(), runEngine })
  assert.equal(live.ok, true, live.error)
  assert.match(live.trace.at(-1).message, /Revision 1\./)

  const scheduled = await executeVisualWorkflow(engineWorkflow('1'), { store: workflows, context: runContext({ scheduledExecution: true }), runEngine })
  assert.equal(scheduled.ok, true, scheduled.error)
  assert.deepEqual(calls.map(c => c.revision), [1, 1], 'both sources ran revision 1 although revision 2 is latest')

  const unpinned = await executeVisualWorkflow(engineWorkflow(), { store: workflows, context: runContext(), runEngine })
  assert.match(unpinned.trace.at(-1).message, /Revision 2 \(latest, not pinned\)\./)

  const missing = await executeVisualWorkflow(engineWorkflow('9'), { store: workflows, context: runContext(), runEngine })
  assert.equal(missing.ok, false)
  assert.match(JSON.stringify(missing.trace), /revision is not available/)
})

test('the workflow executor derives the invocation source and account from run state, never from workflow data', async t => {
  registerEngineNode(manifest())
  t.after(() => unregisterEngineNode('lookup'))
  const dir = await mkdtemp(join(tmpdir(), 'aharane-wf-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const workflows = createVisualCommandStore(join(dir, 'w.json'))
  await workflows.init()
  const seen = []
  const runEngine = async (id, inputs, options) => { seen.push(options); return { outputs: { result: 'x' }, durationMs: 1 } }
  const hostile = engineWorkflow('1')
  hostile.nodes[1].config.source = 'scheduler'
  hostile.nodes[1].config.account = 'public'
  await executeVisualWorkflow(hostile, { store: workflows, context: runContext(), runEngine })
  await executeVisualWorkflow(engineWorkflow('1'), { store: workflows, context: runContext({ scheduledExecution: true, sessionId: 'private' }), runEngine })
  assert.deepEqual(seen.map(o => [o.source, o.account]), [['workflow', 'private'], ['scheduler', 'private']])
  assert.match(seen[0].correlationId, /^[0-9a-f-]{36}:engine-node$/)
  assert.deepEqual(Object.keys(seen[0]).sort(), ['account', 'correlationId', 'revision', 'signal', 'source'], 'the runner receives no socket, message or credentials')
})

// ---------------------------------------------------------------- capabilities and diagnostics
test('effective capabilities reflect the manifest the sandbox enforces', () => {
  const granted = describeEngineCapabilities(manifest())
  assert.equal(granted.permissions[0].granted, true)
  assert.deepEqual(granted.permissions[0].hosts, ['api.example.com'])
  assert.deepEqual(granted.permissions[0].methods, ['GET', 'POST'])
  const noHosts = describeEngineCapabilities(manifest({ allowedHosts: [] }))
  assert.deepEqual([noHosts.permissions[0].requested, noHosts.permissions[0].granted], [true, false])
  const none = describeEngineCapabilities(manifest({ permissions: [], allowedHosts: [] }))
  assert.deepEqual([none.permissions[0].requested, none.permissions[0].granted, none.permissions[0].hosts], [false, false, []])
  for (const name of ['filesystem', 'process', 'environment', 'shell', 'whatsapp', 'credentials']) assert.ok(granted.neverGranted.includes(name))
  assert.throws(() => describeEngineCapabilities({ id: 'x' }))
})

test('diagnostics flag grant mismatches and ambient APIs but are advisory only', () => {
  const codes = engine => diagnoseEngine(engine).findings.map(f => f.code)
  const good = { manifest: manifest(), code: 'export async function run(i, c) { const r = await c.network.fetch("https://api.example.com/x"); return { result: r } }' }
  assert.deepEqual(codes(good), [])
  assert.equal(diagnoseEngine(good).advisory, true)
  assert.ok(codes({ manifest: manifest({ permissions: [], allowedHosts: [] }), code: good.code }).includes('network_not_granted'))
  assert.ok(codes({ manifest: manifest({ allowedHosts: [] }), code: good.code }).includes('no_hosts'))
  assert.ok(codes({ manifest: manifest(), code: codeOf('x') }).includes('permission_unused'))
  assert.ok(codes({ manifest: manifest(), code: good.code.replace('https://api.example.com', 'https://evil.example.org') }).includes('host_not_approved'))
  assert.ok(codes({ manifest: manifest(), code: good.code.replace('https://', 'http://') }).includes('non_https'))
  const ambient = codes({ manifest: manifest(), code: 'export async function run(){ require("fs"); process.env.X; setTimeout(()=>1,1); return {result:""} }' })
  assert.ok(ambient.includes('ambient_api'))
  const bad = diagnoseEngine({ manifest: { id: 'x' }, code: 'nonsense' })
  assert.equal(bad.ok, false)
  assert.ok(bad.findings.some(f => f.code === 'manifest_invalid') && bad.findings.some(f => f.code === 'source_invalid'))
})

// ---------------------------------------------------------------- secret-leak audit
test('guest sees only inputs and a context with exactly the granted capabilities; no host secret reaches it or the result', async t => {
  const canary = 'CANARY-' + Math.random().toString(36).slice(2)
  process.env.AHARANE_ADMIN_TOKEN = canary
  process.env.ACCOUNT_AUTH_ROOT_CANARY = canary
  t.after(() => { delete process.env.AHARANE_ADMIN_TOKEN; delete process.env.ACCOUNT_AUTH_ROOT_CANARY })
  const store = await library(t)
  await store.save(manifest(), codeOf('one'))
  await store.save(manifest({ id: 'offline', name: 'Offline', permissions: [], allowedHosts: [] }), codeOf('two'))
  for (const [id, expectNetwork] of [['lookup', ['fetch']], ['offline', []]]) {
    const guest = recordingGuest()
    const envelope = await invokeEngine({
      store, executeOptions: { quickjs: guest },
      request: { engineId: id, inputs: { query: 'q' }, source: 'workflow', account: 'private' },
    })
    assert.equal(envelope.ok, true, envelope.message)
    const globals = guest.seen.props.filter(p => p.on === 'global').map(p => p.key).sort()
    assert.deepEqual(globals, ['__aharaneContext', '__aharaneInputsJson'], 'only two globals are installed by the host')
    const [api, network] = guest.seen.objects // the host creates the context object first, then its network member
    assert.deepEqual(Object.keys(network.value).sort(), expectNetwork, id + ': network capabilities')
    assert.deepEqual(Object.keys(api.value).sort(), ['network'], 'the context object has no other members (no socket, session, env or storage)')
    const everythingGuestSaw = JSON.stringify(guest.seen.evaluated) + JSON.stringify(guest.seen.props)
    assert.ok(!everythingGuestSaw.includes(canary))
    assert.ok(!JSON.stringify(envelope).includes(canary))
  }
})

test('runtime and invocation modules have no path to secrets or sockets (static guard)', async () => {
  for (const file of ['engine-runtime.js', 'engine-invocation.js', 'engine-contract.js', 'engine-store.js']) {
    const text = await readFile(new URL('../src/' + file, import.meta.url), 'utf8')
    for (const forbidden of [/process\.env/, /\bsocket\b/i, /accountRuntime/, /authState/, /useMultiFileAuthState/, /\bcreds\b/, /ADMIN_TOKEN/, /@itsliaaa\/baileys/]) {
      assert.ok(!forbidden.test(text), file + ' must not reference ' + forbidden)
    }
    for (const forbidden of [/from ['"]\.\/index\.js['"]/, /from ['"]\.\/account-runtime\.js['"]/, /from ['"]\.\/chat-store\.js['"]/]) {
      assert.ok(!forbidden.test(text), file + ' must not import ' + forbidden)
    }
  }
})

// ---------------------------------------------------------------- malformed source, inputs and outputs (no QuickJS needed)
test('empty, shapeless and module-style sources are rejected as invalid_source before any sandbox starts', async () => {
  const run = code => executeCustomEngine({ manifest: manifest(), code }, { query: 'q' }, { quickjs: recordingGuest() }).then(() => null, error => error)
  for (const code of [
    '', '   ', 'const x = 1', 'function other() {}', 'export const run = () => ({})',
    'import fs from "node:fs"\nexport async function run() { return { result: "" } }',
    'export async function run() { return { result: "" } }\nexport const extra = 1',
  ]) {
    const error = await run(code)
    assert.ok(error instanceof EngineExecutionError, JSON.stringify(code))
    assert.equal(error.outcome, 'invalid_source', JSON.stringify(code))
  }
})

test('missing, unexpected, mistyped and oversized inputs are input_invalid', async () => {
  const run = inputs => executeCustomEngine({ manifest: manifest(), code: codeOf('x') }, inputs, { quickjs: recordingGuest() }).then(() => null, error => error)
  for (const inputs of [{}, { query: 5 }, { query: 'x'.repeat(8193) }, { query: 'q', extra: 1 }, null, [], 'text']) {
    const error = await run(inputs)
    assert.equal(error?.outcome, 'input_invalid', JSON.stringify(inputs)?.slice(0, 40))
  }
})

test('invalid or oversized outputs never reach the caller as success', async () => {
  const runWith = result => executeCustomEngine({ manifest: manifest(), code: codeOf('x') }, { query: 'q' }, { quickjs: recordingGuest(result) }).then(value => ({ value }), error => ({ error }))
  for (const result of [{ result: 'x'.repeat(8193) }, { result: 5 }, {}, { result: 'ok', extra: 'leak' }, null, 'text', ['a']]) {
    const outcome = await runWith(result)
    assert.ok(outcome.error, JSON.stringify(result)?.slice(0, 40) + ' must fail')
    assert.equal(outcome.error.outcome, 'runtime_error')
    assert.equal(outcome.value, undefined)
  }
  assert.deepEqual((await runWith({ result: 'fine' })).value.outputs, { result: 'fine' })
})

test('Library test action: engine-level failures are 200, request/lookup/infra failures are 4xx/5xx and carry `error` for clients', () => {
  const ok = { ok: true, outcome: 'success', message: undefined }
  assert.deepEqual(httpResponseForEnvelope(ok), { status: 200, body: ok })
  for (const outcome of ['policy_denied', 'timeout', 'cancelled', 'resource_exhausted', 'runtime_error', 'input_invalid', 'invalid_source']) {
    const envelope = { ok: false, outcome, message: 'm' }
    const response = httpResponseForEnvelope(envelope)
    assert.equal(response.status, 200, outcome)
    assert.equal(response.body.error, undefined, 'a 200 body is the plain envelope')
  }
  for (const [outcome, status] of [['invalid_request', 400], ['not_found', 404], ['revision_unavailable', 404], ['infrastructure', 503]]) {
    const response = httpResponseForEnvelope({ ok: false, outcome, message: 'why' })
    assert.equal(response.status, status, outcome)
    assert.equal(response.body.error, 'why', outcome)
    assert.equal(response.body.outcome, outcome)
  }
})
