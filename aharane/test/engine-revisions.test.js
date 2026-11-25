import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEngineStore } from '../src/engine-store.js'
import {
  createVisualCommandStore, createWorkflowDraft, executeVisualWorkflow,
  registerEngineNode, unregisterEngineNode, validateWorkflow,
} from '../src/visual-command-builder.js'

const base = {
  id: 'lookup', name: 'Lookup', version: 1, entryPoint: 'run',
  inputs: [{ id: 'query', type: 'string' }], outputs: [{ id: 'results', type: 'list' }],
  permissions: [], allowedHosts: [], timeoutMs: 5000, maxResults: 10,
}
const codeOf = label => 'export async function run(inputs) { return { results: [inputs.query, "' + label + '"] } }'

async function makeLibrary(t) {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-engine-rev-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return { dir, library: createEngineStore({ dataDir: dir }) }
}

test('every Engine save is an immutable, hashed revision, even at the same manifest version', async t => {
  const { dir, library } = await makeLibrary(t)
  const first = await library.save(base, codeOf('one'))
  assert.equal(first.revision, 1)
  assert.match(first.sha256, /^[0-9a-f]{64}$/)

  const second = await library.save(base, codeOf('two'), 1)
  assert.equal(second.revision, 2, 'same version, new code is a new revision')
  assert.notEqual(second.sha256, first.sha256)

  const original = await library.getRevision('lookup', 1)
  assert.equal(original.code, codeOf('one'))
  assert.equal(original.sha256, first.sha256)
  assert.equal((await library.getRevision('lookup', 2)).code, codeOf('two'))
  assert.equal(await library.getRevision('lookup', 9), null)
  assert.equal(await library.getRevision('lookup', 'x'), null)
  assert.equal(await library.getRevision('missing', 1), null)
  assert.deepEqual((await library.listRevisions('lookup')).map(row => row.revision), [1, 2])

  const reopened = createEngineStore({ dataDir: dir })
  assert.equal((await reopened.getRevision('lookup', 1)).code, codeOf('one'))
  assert.equal((await reopened.get('lookup')).revision, 2)
  const listed = (await reopened.list())[0]
  assert.equal(listed.revision, 2)
  assert.equal(listed.sha256, second.sha256)
})

test('two editors at the same version cannot silently overwrite each other', async t => {
  const { library } = await makeLibrary(t)
  const opened = await library.save(base, codeOf('start'))
  await library.save(base, codeOf('editor A'), 1, { expectedRevision: opened.revision })
  await assert.rejects(
    () => library.save(base, codeOf('editor B'), 1, { expectedRevision: opened.revision }),
    error => error.conflict === true && error.currentRevision === 2 && /Reload/.test(error.message),
  )
  assert.equal((await library.get('lookup')).code, codeOf('editor A'), 'the rejected save wrote nothing')
  const ok = await library.save(base, codeOf('editor B after reload'), 1, { expectedRevision: 2 })
  assert.equal(ok.revision, 3)
  const legacyClient = await library.save(base, codeOf('legacy client'), 1)
  assert.equal(legacyClient.revision, 4, 'clients that send no expectedRevision keep working')
})

test('history keeps the newest 20 revisions, is not counted as an Engine, and is deleted with the Engine', async t => {
  const { dir, library } = await makeLibrary(t)
  await library.save(base, codeOf('r1'))
  for (let index = 2; index <= 25; index += 1) await library.save(base, codeOf('r' + index), 1)
  const revisions = (await library.listRevisions('lookup')).map(row => row.revision)
  assert.equal(revisions.length, 20)
  assert.equal(revisions[0], 6)
  assert.equal(revisions.at(-1), 25)
  assert.equal(await library.getRevision('lookup', 2), null, 'revisions older than the window are not referenceable')
  assert.equal((await library.list()).length, 1, 'history files are not listed as Engines')

  await library.remove('lookup', { confirm: true })
  assert.deepEqual((await readdir(join(dir, 'engines'))).filter(name => name.startsWith('lookup')), [])
})

test('Engines saved before revisions existed load as revision 1 with a computed hash', async t => {
  const { dir, library } = await makeLibrary(t)
  await library.init()
  await writeFile(join(dir, 'engines', 'lookup.json'), JSON.stringify({ manifest: base, code: codeOf('legacy'), createdAt: 'a', updatedAt: 'b' }))
  const loaded = await library.get('lookup')
  assert.equal(loaded.revision, 1)
  assert.match(loaded.sha256, /^[0-9a-f]{64}$/)
  assert.equal((await library.getRevision('lookup', 1)).code, codeOf('legacy'))
  const next = await library.save(base, codeOf('after legacy'), 1)
  assert.equal(next.revision, 2)
  assert.equal((await library.getRevision('lookup', 1)).code, codeOf('legacy'), 'the legacy content is preserved in history')
})

// ---- workflow integration: pinned revision, cancellation signal, structured outcome in the trace
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
function runContext() {
  return {
    sessionId: 'private', privateControl: true,
    remoteJid: '2348012345678@s.whatsapp.net', sender: '2348012345678@s.whatsapp.net',
    messageText: '.lookup cats', args: ['cats'], rawArgs: 'cats',
    message: { key: { id: 'm1', remoteJid: '2348012345678@s.whatsapp.net', fromMe: true }, message: { conversation: '.lookup cats' } },
    socket: { sendMessage: async () => ({ key: { id: 's1' } }) },
  }
}

test('a workflow node can pin an Engine revision; the pin, the cancel signal and the source hash flow through', async t => {
  registerEngineNode(base)
  t.after(() => unregisterEngineNode('lookup'))
  const dir = await mkdtemp(join(tmpdir(), 'aharane-engine-wf-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const store = createVisualCommandStore(join(dir, 'w.json'))
  await store.init()
  const controller = new AbortController()
  const seen = []
  const runEngine = async (id, inputs, options) => {
    seen.push({ id, inputs, revision: options.revision, signal: options.signal })
    return { engineId: id, durationMs: 2, sourceSha256: 'abcdef0123456789'.repeat(4), outputs: { results: ['x'] } }
  }

  assert.equal(validateWorkflow(engineWorkflow('3')).valid, true)
  const pinned = await executeVisualWorkflow(engineWorkflow('3'), { store, context: runContext(), runEngine, signal: controller.signal })
  assert.equal(pinned.ok, true, pinned.error)
  assert.equal(seen[0].revision, '3')
  assert.equal(seen[0].signal, controller.signal)
  assert.match(pinned.trace.at(-1).message, /Source abcdef012345\./)

  const latest = await executeVisualWorkflow(engineWorkflow(), { store, context: runContext(), runEngine })
  assert.equal(latest.ok, true)
  assert.equal(seen[1].revision, undefined, 'no pin means the latest saved Engine')

  for (const bad of ['0', '-2', '1.5', 'abc']) {
    const { errors } = validateWorkflow(engineWorkflow(bad))
    assert.ok(errors.some(item => /pinned Engine revision/.test(item.message)), 'rejects pin ' + bad)
  }
})

test('structured Engine failures keep their outcome in the workflow trace and fail the run', async t => {
  registerEngineNode(base)
  t.after(() => unregisterEngineNode('lookup'))
  const dir = await mkdtemp(join(tmpdir(), 'aharane-engine-wf-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const store = createVisualCommandStore(join(dir, 'w.json'))
  await store.init()
  const runEngine = async () => { const error = new Error('Network request rejected: use HTTPS on an exact approved hostname.'); error.outcome = 'policy_denied'; throw error }
  const result = await executeVisualWorkflow(engineWorkflow(), { store, context: runContext(), runEngine })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'failed')
  const entry = result.trace.find(item => item.status === 'error')
  assert.equal(entry.outcome, 'policy_denied')
})
