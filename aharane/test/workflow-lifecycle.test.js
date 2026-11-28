import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  RUN_STATUSES,
  WORKFLOW_EXPORT_FORMAT,
  WORKFLOW_SCHEMA_VERSION,
  createVisualCommandStore,
  createWorkflowDraft,
  executeVisualWorkflow,
  executeWorkflowRevision,
  exportWorkflow,
  importWorkflow,
  validateWorkflow,
} from '../src/visual-command-builder.js'

async function makeStore(t, seed) {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-lifecycle-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const path = join(dir, 'visual-commands.json')
  if (seed) await writeFile(path, JSON.stringify(seed))
  const store = createVisualCommandStore(path)
  await store.init()
  return { store, path }
}

function context(sent, messageId = 'msg-1') {
  return {
    sessionId: 'private', privateControl: true,
    remoteJid: '2348012345678@s.whatsapp.net', sender: '2348012345678@s.whatsapp.net',
    messageText: '.hello', args: [], rawArgs: '',
    message: { key: { id: messageId, remoteJid: '2348012345678@s.whatsapp.net', fromMe: true }, message: { conversation: '.hello' } },
    socket: { sendMessage: async (jid, payload) => { sent.push({ jid, payload }); return { key: { id: 'sent-' + sent.length } } } },
  }
}

function sendTextWorkflow(text) {
  const workflow = createWorkflowDraft('private')
  workflow.nodes[1] = { id: workflow.nodes[1].id, type: 'message.sendText', x: 270, y: 100, config: { text } }
  return workflow
}

function delayThenSend(ms) {
  const workflow = createWorkflowDraft('private')
  const [trigger] = workflow.nodes
  const delay = { id: 'wait', type: 'flow.delay', x: 270, y: 100, config: { milliseconds: String(ms) } }
  const send = { id: 'send', type: 'message.sendText', x: 520, y: 100, config: { text: 'after wait' } }
  workflow.nodes = [trigger, delay, send]
  workflow.edges = [
    { id: 'e1', from: trigger.id, fromSocket: 'next', to: 'wait', toSocket: 'in' },
    { id: 'e2', from: 'wait', fromSocket: 'next', to: 'send', toSocket: 'in' },
  ]
  return workflow
}

const sentText = entry => entry.payload.text

test('every saved revision is kept as an immutable snapshot and survives restart', async t => {
  const { store, path } = await makeStore(t)
  const draft = sendTextWorkflow('v1')
  const first = await store.save(draft)
  await store.save({ ...first.workflow, nodes: sendTextWorkflow('v2').nodes.map((node, index) => index === 0 ? first.workflow.nodes[0] : { ...node, id: first.workflow.nodes[1].id }) })

  assert.deepEqual(store.listRevisions(draft.id).map(item => item.revision), [1, 2])
  const rev1 = store.getRevision(draft.id, 1)
  assert.equal(rev1.nodes[1].config.text, 'v1')
  assert.equal(store.getRevision(draft.id, 2).nodes[1].config.text, 'v2')

  rev1.nodes[1].config.text = 'tampered'
  assert.equal(store.getRevision(draft.id, 1).nodes[1].config.text, 'v1', 'returned snapshots are clones')
  assert.equal(store.getRevision(draft.id, 99), null)

  const reopened = createVisualCommandStore(path)
  await reopened.init()
  assert.equal(reopened.getRevision(draft.id, 1).nodes[1].config.text, 'v1')
  assert.equal(reopened.get(draft.id).revision, 2)

  await reopened.remove(draft.id)
  assert.deepEqual(reopened.listRevisions(draft.id), [])
})

test('workflows saved before history existed become referenceable at their current revision', async t => {
  const legacy = sendTextWorkflow('legacy')
  const { store } = await makeStore(t, { version: 1, workflows: [{ ...legacy, revision: undefined, schemaVersion: undefined }], counters: {}, customNodes: [] })
  assert.deepEqual(store.listRevisions(legacy.id).map(item => item.revision), [1])
  assert.equal(store.getRevision(legacy.id, 1).nodes[1].config.text, 'legacy')
})

test('a run executes exactly the requested saved revision and refuses unsaved or unknown ones', async t => {
  const { store } = await makeStore(t)
  const draft = sendTextWorkflow('first text')
  const saved = await store.save(draft)
  const changedNodes = saved.workflow.nodes.map(node => node.type === 'message.sendText' ? { ...node, config: { text: 'second text' } } : node)
  await store.save({ ...saved.workflow, nodes: changedNodes })

  const sent = []
  const result = await executeWorkflowRevision(draft.id, 1, { store, context: context(sent) })
  assert.equal(result.ok, true, JSON.stringify(result.error))
  assert.equal(result.workflowRevision, 1)
  assert.equal(result.workflowId, draft.id)
  assert.equal(sentText(sent[0]), 'first text')

  const latestSent = []
  const latest = await executeWorkflowRevision(draft.id, 2, { store, context: context(latestSent) })
  assert.equal(latest.workflowRevision, 2)
  assert.equal(sentText(latestSent[0]), 'second text')

  const missing = await executeWorkflowRevision(draft.id, 7, { store, context: context([]) })
  assert.equal(missing.ok, false)
  assert.equal(missing.status, 'failed')
  assert.match(missing.error, /not found/)
  const unsaved = await executeWorkflowRevision('never-saved', 1, { store, context: context([]) })
  assert.equal(unsaved.ok, false)
  assert.match(unsaved.error, /Save the workflow first/)
})

test('run status moves queued -> running -> succeeded and failures are never reported as success', async t => {
  const { store } = await makeStore(t)
  const states = []
  const ok = await executeVisualWorkflow(sendTextWorkflow('hi'), { store, context: context([]), onStatus: event => states.push(event.status) })
  assert.deepEqual(states, ['queued', 'running', 'succeeded'])
  assert.equal(ok.status, 'succeeded')
  assert.ok(ok.runId && ok.startedAt && ok.finishedAt)
  assert.ok(RUN_STATUSES.includes(ok.status))

  const failStates = []
  const invalid = sendTextWorkflow('hi')
  invalid.edges = []
  const failed = await executeVisualWorkflow(invalid, { store, context: context([]), onStatus: event => failStates.push(event.status) })
  assert.equal(failed.ok, false)
  assert.equal(failed.status, 'failed')
  assert.deepEqual(failStates, ['queued', 'running', 'failed'])

  const throwing = sendTextWorkflow('hi')
  const sendError = await executeVisualWorkflow(throwing, {
    store, context: { ...context([]), socket: { sendMessage: async () => { throw new Error('WhatsApp rejected it') } } },
  })
  assert.equal(sendError.ok, false)
  assert.equal(sendError.status, 'failed')
})

test('a run can be cancelled during a Wait node and nothing is sent afterwards', async t => {
  const { store } = await makeStore(t)
  const sent = []
  const states = []
  const controller = new AbortController()
  const started = Date.now()
  const pending = executeVisualWorkflow(delayThenSend(5000), {
    store, signal: controller.signal, context: context(sent), onStatus: event => states.push(event.status),
  })
  setTimeout(() => controller.abort(), 50)
  const result = await pending
  assert.equal(result.status, 'cancelled')
  assert.equal(result.cancelled, true)
  assert.equal(result.ok, false)
  assert.equal(sent.length, 0)
  assert.ok(Date.now() - started < 2000, 'cancellation must not wait for the full delay')
  assert.deepEqual(states, ['queued', 'running', 'cancelled'])
})

test('an already-cancelled signal never starts the run', async t => {
  const { store } = await makeStore(t)
  const sent = []
  const states = []
  const controller = new AbortController()
  controller.abort()
  const result = await executeVisualWorkflow(sendTextWorkflow('hi'), { store, signal: controller.signal, context: context(sent), onStatus: event => states.push(event.status) })
  assert.equal(result.status, 'cancelled')
  assert.equal(sent.length, 0)
  assert.deepEqual(states, ['queued', 'cancelled'])
})

test('a redelivered trigger message does not send twice when duplicate protection is on', async t => {
  const { store, path } = await makeStore(t)
  const workflow = sendTextWorkflow('once')
  const sent = []
  const run = (messageId, extra = {}) => executeVisualWorkflow(workflow, { store, deduplicate: true, context: context(sent, messageId), ...extra })

  assert.equal((await run('wa-1')).ok, true)
  const duplicate = await run('wa-1')
  assert.equal(duplicate.ok, false)
  assert.equal(duplicate.duplicate, true)
  assert.equal(duplicate.status, 'failed')
  assert.equal(sent.length, 1)

  assert.equal((await run('wa-2')).ok, true, 'a different message still runs')
  assert.equal(sent.length, 2)

  const other = sendTextWorkflow('other workflow')
  assert.equal((await executeVisualWorkflow(other, { store, deduplicate: true, context: context(sent, 'wa-1') })).ok, true, 'claims are per workflow')

  const dry = await run('wa-3', { dryRun: true })
  assert.equal(dry.ok, true)
  assert.equal((await run('wa-3')).ok, true, 'dry runs never consume a claim')

  const reopened = createVisualCommandStore(path)
  await reopened.init()
  const afterRestart = await executeVisualWorkflow(workflow, { store: reopened, deduplicate: true, context: context(sent, 'wa-1') })
  assert.equal(afterRestart.duplicate, true, 'claims survive a restart')
})

test('without the opt-in flag repeated runs are allowed (tests, manual runs)', async t => {
  const { store } = await makeStore(t)
  const sent = []
  const workflow = sendTextWorkflow('again')
  await executeVisualWorkflow(workflow, { store, context: context(sent, 'same') })
  await executeVisualWorkflow(workflow, { store, context: context(sent, 'same') })
  assert.equal(sent.length, 2)
})

test('export then import round-trips the graph as a fresh, disabled, revision-1 draft', async t => {
  const { store } = await makeStore(t)
  const source = sendTextWorkflow('portable')
  source.enabled = true
  const exported = exportWorkflow(source)
  assert.equal(exported.format, WORKFLOW_EXPORT_FORMAT)
  assert.equal(exported.schemaVersion, WORKFLOW_SCHEMA_VERSION)
  assert.equal('id' in exported.workflow, false)
  assert.equal('enabled' in exported.workflow, false)

  const imported = importWorkflow(JSON.stringify(exported))
  assert.notEqual(imported.workflow.id, source.id)
  assert.equal(imported.workflow.enabled, false)
  assert.equal(imported.workflow.revision, 1)
  assert.deepEqual(imported.workflow.nodes, exported.workflow.nodes.map(node => imported.workflow.nodes.find(item => item.id === node.id)))
  assert.deepEqual(imported.workflow.edges, exported.workflow.edges.map(edge => imported.workflow.edges.find(item => item.id === edge.id)))
  assert.equal(imported.validation.valid, true, JSON.stringify(imported.validation.errors))

  const forced = JSON.parse(JSON.stringify(exported))
  forced.workflow.enabled = true
  assert.equal(importWorkflow(forced).workflow.enabled, false, 'an import can never activate itself')
  assert.equal(importWorkflow(exported, { account: 'public' }).workflow.account, 'public')

  const saved = await store.save(imported.workflow)
  assert.equal(saved.workflow.revision, 1)
  assert.equal(store.list().length, 1)
})

test('unsafe or unsupported imports are rejected with clear errors', () => {
  const good = exportWorkflow(sendTextWorkflow('x'))
  assert.throws(() => importWorkflow('{not json'), /not valid JSON/)
  assert.throws(() => importWorkflow({ hello: 'world' }), /not an Aharane workflow export/)
  assert.throws(() => importWorkflow({ ...good, formatVersion: 2 }), /format version/)
  assert.throws(() => importWorkflow({ ...good, schemaVersion: WORKFLOW_SCHEMA_VERSION + 1 }), /supports up to/)
  assert.throws(() => importWorkflow({ ...good, workflow: null }), /no workflow/)
  assert.throws(() => importWorkflow('x'.repeat(600 * 1024)), /too large/)
  const huge = JSON.parse(JSON.stringify(good))
  huge.workflow.nodes = Array.from({ length: 101 }, (_, index) => ({ id: 'n' + index, type: 'flow.end', x: 0, y: 0, config: {} }))
  assert.throws(() => importWorkflow(huge), /100-node limit/)
})

test('imports with unknown node types are returned with validation errors, never silently fixed', () => {
  const exported = exportWorkflow(sendTextWorkflow('x'))
  exported.workflow.nodes[1].type = 'status.post'
  const imported = importWorkflow(exported)
  assert.equal(imported.validation.valid, false)
  assert.ok(imported.validation.errors.some(item => /Unsupported node type/.test(item.message)))
})

test('connection problems name the exact edge as well as the node', () => {
  const workflow = createWorkflowDraft('private')
  const [trigger, reply] = workflow.nodes
  workflow.edges.push(
    { id: 'bad-type', from: trigger.id, fromSocket: 'next', to: reply.id, toSocket: 'text' },
    { id: 'ghost-edge', from: trigger.id, fromSocket: 'next', to: 'ghost-node', toSocket: 'in' },
    { id: 'dup-input', from: trigger.id, fromSocket: 'next', to: reply.id, toSocket: 'in' },
  )
  const { errors } = validateWorkflow(workflow)
  const byEdge = id => errors.filter(item => item.edgeId === id)
  assert.ok(byEdge('bad-type').some(item => /Cannot connect exec to string/.test(item.message)))
  assert.ok(byEdge('ghost-edge').some(item => /missing node/.test(item.message)))
  assert.ok(byEdge('dup-input').some(item => /more than one connection/.test(item.message)))
  assert.ok(byEdge('dup-input').every(item => item.fix && item.nodeId))
  assert.ok(errors.filter(item => item.edgeId == null).every(item => 'edgeId' in item), 'every finding carries an edgeId field')
})
