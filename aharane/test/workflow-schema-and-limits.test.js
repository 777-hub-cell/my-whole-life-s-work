import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  SYSTEM_MAX_MESSAGES_PER_RUN,
  VISUAL_NODE_LIBRARY,
  WORKFLOW_SCHEMA_VERSION,
  assertSupportedWorkflowSchema,
  createVisualCommandStore,
  createWorkflowDraft,
  executeVisualWorkflow,
  normalizeWorkflow,
  validateWorkflow,
} from '../src/visual-command-builder.js'

async function makeStore(t) {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-schema-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const path = join(dir, 'visual-commands.json')
  const store = createVisualCommandStore(path)
  await store.init()
  return { store, path }
}

function chainOfSends(count, limit) {
  const workflow = createWorkflowDraft('private')
  const trigger = workflow.nodes[0]
  trigger.config.maxMessagesPerRun = String(limit)
  const sends = Array.from({ length: count }, (_, index) => ({
    id: 'send-' + index, type: 'message.sendText', x: 300 + index * 10, y: 100, config: { text: 'm' + index },
  }))
  workflow.nodes = [trigger, ...sends]
  const ordered = [trigger, ...sends]
  workflow.edges = ordered.slice(1).map((node, index) => ({
    id: 'edge-' + index, from: ordered[index].id, fromSocket: 'next', to: node.id, toSocket: 'in',
  }))
  return workflow
}

function runContext(sent) {
  return {
    sessionId: 'private', privateControl: true,
    remoteJid: '2348012345678@s.whatsapp.net', sender: '2348012345678@s.whatsapp.net',
    messageText: '.hello', args: [], rawArgs: '',
    message: { key: { id: 'm1', remoteJid: '2348012345678@s.whatsapp.net', fromMe: true }, message: { conversation: '.hello' } },
    socket: { sendMessage: async (jid, payload) => { sent.push({ jid, payload }); return { key: { id: 'sent-' + sent.length } } } },
  }
}

test('node library has no duplicate node types', () => {
  const types = VISUAL_NODE_LIBRARY.flatMap(group => group.nodes.map(node => node.type))
  const duplicates = types.filter((type, index) => types.indexOf(type) !== index)
  assert.deepEqual(duplicates, [])
})

test('per-run message limit is user-configurable well beyond 20, up to the system ceiling only', () => {
  for (const [value, valid] of [[1, true], [20, true], [21, true], [100, true], [SYSTEM_MAX_MESSAGES_PER_RUN, true],
    [SYSTEM_MAX_MESSAGES_PER_RUN + 1, false], [0, false], [-3, false], [2.5, false], ['abc', false]]) {
    const workflow = createWorkflowDraft('private')
    workflow.nodes[0].config.maxMessagesPerRun = String(value)
    const result = validateWorkflow(workflow)
    assert.equal(result.valid, valid, 'limit ' + value + ': ' + JSON.stringify(result.errors))
    if (!valid) assert.ok(result.errors.some(item => item.nodeId === workflow.nodes[0].id && item.message.includes(String(SYSTEM_MAX_MESSAGES_PER_RUN))))
  }
  assert.ok(SYSTEM_MAX_MESSAGES_PER_RUN > 20)
})

test('a configured limit of 30 really lets 25 messages through the real executor', async t => {
  const { store } = await makeStore(t)
  const sent = []
  const workflow = chainOfSends(25, 30)
  assert.equal(validateWorkflow(workflow).valid, true)
  const result = await executeVisualWorkflow(workflow, { store, context: runContext(sent) })
  assert.equal(result.ok, true, JSON.stringify(result.error))
  assert.equal(sent.length, 25)
})

test('the configured per-run limit is still enforced at runtime', async t => {
  const { store } = await makeStore(t)
  const sent = []
  const workflow = chainOfSends(25, 20)
  const result = await executeVisualWorkflow(workflow, { store, context: runContext(sent) })
  assert.equal(sent.length, 20)
  assert.equal(result.ok, false)
  assert.match(String(result.error), /20 message-per-run limit/)
})

test('schema v2 fields are emitted and legacy v1 documents migrate', () => {
  const fresh = normalizeWorkflow(createWorkflowDraft('private'))
  assert.equal(fresh.schemaVersion, WORKFLOW_SCHEMA_VERSION)
  assert.equal(fresh.revision, 1)
  const legacy = { ...createWorkflowDraft('public'), version: 1 }
  delete legacy.schemaVersion
  delete legacy.revision
  const migrated = normalizeWorkflow(legacy)
  assert.equal(migrated.schemaVersion, WORKFLOW_SCHEMA_VERSION)
  assert.equal(migrated.revision, 1)
  assert.equal(migrated.nodes.length, legacy.nodes.length)
  assert.equal(migrated.edges.length, legacy.edges.length)
  const roundTrip = normalizeWorkflow(JSON.parse(JSON.stringify(migrated)))
  assert.deepEqual({ ...roundTrip, updatedAt: '' }, { ...migrated, updatedAt: '' })
})

test('newer or malformed schema versions are rejected instead of being silently downgraded', () => {
  assert.doesNotThrow(() => assertSupportedWorkflowSchema({}))
  assert.doesNotThrow(() => assertSupportedWorkflowSchema({ schemaVersion: 1 }))
  assert.doesNotThrow(() => assertSupportedWorkflowSchema({ schemaVersion: WORKFLOW_SCHEMA_VERSION }))
  assert.throws(() => assertSupportedWorkflowSchema({ schemaVersion: WORKFLOW_SCHEMA_VERSION + 1 }), /supports up to/)
  assert.throws(() => assertSupportedWorkflowSchema({ schemaVersion: 0 }), /invalid/)
  assert.throws(() => assertSupportedWorkflowSchema({ schemaVersion: 'two' }), /invalid/)
})

test('oversized workflows stay detectable after normalisation and are never silently truncated', async t => {
  const { store } = await makeStore(t)
  const big = createWorkflowDraft('private')
  big.nodes = Array.from({ length: 101 }, (_, index) => ({ id: 'n' + index, type: 'flow.end', x: index, y: 0, config: {} }))
  const normalized = normalizeWorkflow(big)
  assert.ok(normalized.nodes.length > 100)
  assert.ok(validateWorkflow(normalized).errors.some(item => /100 nodes/.test(item.message)))
  await assert.rejects(() => store.save(normalized), /100-node limit/)
  assert.equal(store.list().length, 0)

  const manyEdges = createWorkflowDraft('private')
  manyEdges.edges = Array.from({ length: 301 }, (_, index) => ({ id: 'e' + index, from: 'a', fromSocket: 'next', to: 'b', toSocket: 'in' }))
  const normalizedEdges = normalizeWorkflow(manyEdges)
  assert.ok(normalizedEdges.edges.length > 300)
  await assert.rejects(() => store.save(normalizedEdges), /300-connection limit/)
})

test('revision increments on each save, survives restart, and stale saves are rejected', async t => {
  const { store, path } = await makeStore(t)
  const draft = createWorkflowDraft('private')
  const first = await store.save(draft)
  assert.equal(first.workflow.revision, 1)
  const second = await store.save({ ...first.workflow, name: 'Second' })
  assert.equal(second.workflow.revision, 2)

  await assert.rejects(
    () => store.save({ ...second.workflow, name: 'Stale edit' }, { expectedRevision: 1 }),
    error => error.conflict === true && error.currentRevision === 2 && /Reload/.test(error.message),
  )
  assert.equal(store.get(draft.id).name, 'Second', 'a rejected stale save must not overwrite stored work')

  const third = await store.save({ ...second.workflow, name: 'Third' }, { expectedRevision: 2 })
  assert.equal(third.workflow.revision, 3)
  const legacyClient = await store.save({ ...third.workflow, name: 'Legacy client' })
  assert.equal(legacyClient.workflow.revision, 4, 'clients that send no expectedRevision keep working')

  const reopened = createVisualCommandStore(path)
  await reopened.init()
  assert.equal(reopened.get(draft.id).revision, 4)
  assert.equal(reopened.get(draft.id).schemaVersion, WORKFLOW_SCHEMA_VERSION)
})
