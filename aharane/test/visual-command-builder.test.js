import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createVisualCommandStore,
  createWorkflowDraft,
  executeVisualWorkflow,
  normalizeWorkflow,
  validateWorkflow,
} from '../src/visual-command-builder.js'

async function makeStore(t) {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-visual-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const store = createVisualCommandStore(join(dir, 'visual-commands.json'))
  await store.init()
  return { store, path: join(dir, 'visual-commands.json') }
}

function context(overrides = {}) {
  return {
    sessionId: 'private',
    privateControl: true,
    isPublicOwner: false,
    allowedPublicSender: false,
    remoteJid: '2348012345678@s.whatsapp.net',
    sender: '2348012345678@s.whatsapp.net',
    messageText: '.hello Ada',
    rawArgs: 'Ada',
    args: ['Ada'],
    message: { key: { id: 'msg-1', remoteJid: '2348012345678@s.whatsapp.net', fromMe: true }, message: { conversation: '.hello Ada' } },
    socket: { sendMessage: async () => ({ key: { id: 'sent-1' } }) },
    ...overrides,
  }
}

test('new workflow draft has one connected command trigger and reply', () => {
  const draft = createWorkflowDraft('private')
  const validation = validateWorkflow(draft)
  assert.equal(draft.nodes.length, 2)
  assert.equal(draft.edges.length, 1)
  assert.equal(validation.valid, true, JSON.stringify(validation.errors))
})

test('validation rejects missing text, incompatible ports, missing triggers and cycles', () => {
  const draft = createWorkflowDraft()
  draft.nodes[1].config.text = ''
  assert.equal(validateWorkflow(draft).valid, false)

  const mismatch = createWorkflowDraft()
  mismatch.edges[0].fromSocket = 'message'
  assert.ok(validateWorkflow(mismatch).errors.some(item => item.message.includes('Cannot connect')))

  const noTrigger = createWorkflowDraft()
  noTrigger.nodes[0].type = 'message.text'
  assert.ok(validateWorkflow(noTrigger).errors.some(item => item.message.includes('exactly one trigger')))

  const cycle = createWorkflowDraft()
  cycle.nodes.push({ id: 'end', type: 'flow.delay', x: 500, y: 100, config: { milliseconds: 1 } })
  cycle.edges.push({ id: 'cycle-1', from: cycle.nodes[1].id, fromSocket: 'next', to: 'end', toSocket: 'in' })
  cycle.edges.push({ id: 'cycle-2', from: 'end', fromSocket: 'next', to: cycle.nodes[1].id, toSocket: 'in' })
  assert.ok(validateWorkflow(cycle).errors.some(item => item.message.includes('cycle')))
})

test('message text data output flows through a typed connection into Send text', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft()
  draft.nodes[1] = { id: 'send', type: 'message.sendText', x: 270, y: 100, config: { text: '' } }
  draft.edges = [
    { id: 'exec', from: draft.nodes[0].id, fromSocket: 'next', to: 'send', toSocket: 'in' },
    { id: 'data', from: draft.nodes[0].id, fromSocket: 'messageText', to: 'send', toSocket: 'text' },
  ]
  assert.equal(validateWorkflow(draft).valid, true)
  const sent = []
  const result = await executeVisualWorkflow(draft, {
    store, context: context({ socket: { sendMessage: async (_jid, body) => { sent.push(body.text); return { key: { id: 'sent-1' } } } } }),
  })
  assert.equal(result.ok, true, result.error)
  assert.deepEqual(sent, ['.hello Ada'])
})

test('dry-run simulates send nodes and never calls WhatsApp', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft()
  let sends = 0
  const result = await executeVisualWorkflow(draft, {
    store, dryRun: true,
    context: context({ socket: { sendMessage: async () => { sends += 1; throw new Error('must not send') } } }),
  })
  assert.equal(result.ok, true, result.error)
  assert.equal(result.dryRun, true)
  assert.equal(sends, 0)
  assert.ok(result.trace.some(item => item.status === 'simulated' && item.message.includes('Would send')))
})

test('private workflow cannot execute from the public account or non-owner chat', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft('private')
  let sends = 0
  const unauthorized = await executeVisualWorkflow(draft, {
    store, context: context({ sessionId: 'public', privateControl: false, allowedPublicSender: true }),
  })
  assert.equal(unauthorized.ok, false)
  assert.match(unauthorized.error, /not authorized/i)
  assert.equal(sends, 0)

  const fromOther = await executeVisualWorkflow(draft, {
    store, context: context({ privateControl: false }),
  })
  assert.equal(fromOther.ok, false)
})

test('public workflow requires the existing authorized sender gate', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft('public')
  draft.nodes[0].config.command = 'hello'
  const rejected = await executeVisualWorkflow(draft, {
    store, context: context({ sessionId: 'public', privateControl: false, allowedPublicSender: false, messageText: '!hello' }),
  })
  assert.equal(rejected.ok, false)
  const accepted = await executeVisualWorkflow(draft, {
    store, dryRun: true,
    context: context({ sessionId: 'public', privateControl: false, allowedPublicSender: true, messageText: '!hello' }),
  })
  assert.equal(accepted.ok, true, accepted.error)
})

test('conditional nodes select the correct YES and NO execution branch', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft()
  const trigger = draft.nodes[0]
  const reply = draft.nodes[1]
  const condition = { id: 'condition', type: 'condition.equals', x: 250, y: 100, config: { left: 'yes', right: 'yes' } }
  const yes = { id: 'yes', type: 'message.sendText', x: 500, y: 20, config: { text: 'matched' } }
  const no = { id: 'no', type: 'message.sendText', x: 500, y: 190, config: { text: 'not matched' } }
  draft.nodes = [trigger, condition, yes, no]
  draft.edges = [
    { id: 'a', from: trigger.id, fromSocket: 'next', to: condition.id, toSocket: 'in' },
    { id: 'b', from: condition.id, fromSocket: 'yes', to: yes.id, toSocket: 'in' },
    { id: 'c', from: condition.id, fromSocket: 'no', to: no.id, toSocket: 'in' },
  ]
  assert.equal(validateWorkflow(draft).valid, true)
  const sent = []
  const result = await executeVisualWorkflow(draft, {
    store, context: context({ socket: { sendMessage: async (_jid, body) => { sent.push(body.text); return { key: { id: 'sent' } } } } }),
  })
  assert.equal(result.ok, true, result.error)
  assert.deepEqual(sent, ['matched'])
})

test('Repeat is bounded and executes its body exactly the configured count', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft()
  const trigger = draft.nodes[0]
  const repeat = { id: 'repeat', type: 'flow.repeat', x: 260, y: 100, config: { count: 3 } }
  const send = { id: 'send', type: 'message.sendText', x: 490, y: 100, config: { text: 'again' } }
  const repeatEnd = { id: 'repeat-end', type: 'flow.repeatEnd', x: 720, y: 100, config: {} }
  const end = { id: 'end', type: 'flow.end', x: 490, y: 250, config: {} }
  draft.nodes = [trigger, repeat, send, repeatEnd, end]
  draft.edges = [
    { id: 'a', from: trigger.id, fromSocket: 'next', to: repeat.id, toSocket: 'in' },
    { id: 'b', from: repeat.id, fromSocket: 'body', to: send.id, toSocket: 'in' },
    { id: 'c', from: send.id, fromSocket: 'next', to: repeatEnd.id, toSocket: 'in' },
    { id: 'd', from: repeat.id, fromSocket: 'next', to: end.id, toSocket: 'in' },
  ]
  assert.equal(validateWorkflow(draft).valid, true, JSON.stringify(validateWorkflow(draft).errors))
  const result = await executeVisualWorkflow(draft, { store, dryRun: true, context: context() })
  assert.equal(result.ok, true, result.error)
  assert.equal(result.trace.filter(item => item.type === 'message.sendText').length, 3)
})

test('command triggers enforce quoted-message and reply requirements', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft()
  draft.nodes[0].config.requireQuoted = true
  draft.nodes[0].config.requireReply = true

  const missing = await executeVisualWorkflow(draft, { store, dryRun: true, context: context() })
  assert.equal(missing.ok, false)
  assert.match(missing.error, /requires a quoted message/i)

  const quotedMessage = context()
  quotedMessage.message.message = {
    extendedTextMessage: {
      text: '.hello Ada',
      contextInfo: {
        stanzaId: 'quoted-1',
        quotedMessage: { conversation: 'Please help me' },
      },
    },
  }
  const matched = await executeVisualWorkflow(draft, { store, dryRun: true, context: quotedMessage })
  assert.equal(matched.ok, true, matched.error)
})

test('quoted message text is available to downstream typed text inputs', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft()
  const trigger = draft.nodes[0]
  const send = draft.nodes[1]
  send.config.text = ''
  const quoted = { id: 'quoted', type: 'message.quotedText', x: 510, y: 100, config: {} }
  draft.nodes.push(quoted)
  draft.edges.push({
    id: 'quoted-text',
    from: quoted.id,
    fromSocket: 'value',
    to: send.id,
    toSocket: 'text',
  })
  assert.equal(validateWorkflow(draft).valid, true, JSON.stringify(validateWorkflow(draft).errors))
  const message = context()
  message.message.message = {
    extendedTextMessage: {
      text: '.hello Ada',
      contextInfo: { quotedMessage: { conversation: 'Please help me' } },
    },
  }
  const sent = []
  const result = await executeVisualWorkflow(draft, {
    store,
    context: context({
      message,
      socket: { sendMessage: async (_jid, body) => { sent.push(body.text); return { key: { id: 'quoted-reply' } } } },
    }),
  })
  assert.equal(result.ok, true, result.error)
  assert.deepEqual(sent, ['Please help me'])
})

test('poll node builds a documented WhatsApp poll payload; safe test never sends it', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft()
  const trigger = draft.nodes[0]
  const poll = {
    id: 'poll',
    type: 'message.sendPoll',
    x: 280,
    y: 100,
    config: { title: 'Choose one', options: 'Tea\nCoffee', selectableCount: 1 },
  }
  draft.nodes = [trigger, poll]
  draft.edges = [{ id: 'poll-exec', from: trigger.id, fromSocket: 'next', to: poll.id, toSocket: 'in' }]
  assert.equal(validateWorkflow(draft).valid, true, JSON.stringify(validateWorkflow(draft).errors))

  let liveCalls = 0
  const dry = await executeVisualWorkflow(draft, {
    store,
    dryRun: true,
    context: context({ socket: { sendMessage: async () => { liveCalls += 1; throw new Error('must not send') } } }),
  })
  assert.equal(dry.ok, true, dry.error)
  assert.equal(liveCalls, 0)
  assert.ok(dry.trace.some(item => item.type === 'message.sendPoll' && item.status === 'simulated'))

  let payload
  const live = await executeVisualWorkflow(draft, {
    store,
    context: context({ socket: { sendMessage: async (_jid, content) => { payload = content; return { key: { id: 'poll-id' } } } } }),
  })
  assert.equal(live.ok, true, live.error)
  assert.deepEqual(payload, { poll: { name: 'Choose one', values: ['Tea', 'Coffee'], selectableCount: 1 } })
})

test('counter outputs can be converted and passed into a WhatsApp text payload', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft()
  const trigger = draft.nodes[0]
  const counter = { id: 'counter', type: 'counter.increment', x: 250, y: 100, config: { key: 'visits' } }
  const convert = { id: 'convert', type: 'value.toText', x: 500, y: 100, config: {} }
  const send = { id: 'send', type: 'message.sendText', x: 750, y: 100, config: { text: '' } }
  draft.nodes = [trigger, counter, convert, send]
  draft.edges = [
    { id: 'exec-1', from: trigger.id, fromSocket: 'next', to: counter.id, toSocket: 'in' },
    { id: 'exec-2', from: counter.id, fromSocket: 'next', to: send.id, toSocket: 'in' },
    { id: 'data-1', from: counter.id, fromSocket: 'value', to: convert.id, toSocket: 'value' },
    { id: 'data-2', from: convert.id, fromSocket: 'value', to: send.id, toSocket: 'text' },
  ]
  assert.equal(validateWorkflow(draft).valid, true, JSON.stringify(validateWorkflow(draft).errors))
  const sent = []
  const result = await executeVisualWorkflow(draft, {
    store,
    context: context({ socket: { sendMessage: async (_jid, body) => { sent.push(body.text); return { key: { id: 'sent-counter' } } } } }),
  })
  assert.equal(result.ok, true, result.error)
  assert.deepEqual(sent, ['1'])
})

test('message-event triggers are unavailable to the private self-chat account', () => {
  const draft = createWorkflowDraft('private')
  draft.nodes[0].type = 'trigger.message'
  draft.nodes[0].config = {}
  const validation = validateWorkflow(draft)
  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some(item => item.message.includes('Private message-event triggers')))
})

test('repeat stops immediately when an action inside its body fails', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft()
  const trigger = draft.nodes[0]
  const repeat = { id: 'repeat', type: 'flow.repeat', x: 260, y: 100, config: { count: 3 } }
  const send = { id: 'send', type: 'message.sendText', x: 490, y: 100, config: { text: 'again' } }
  const repeatEnd = { id: 'repeat-end', type: 'flow.repeatEnd', x: 720, y: 100, config: {} }
  const end = { id: 'end', type: 'flow.end', x: 490, y: 250, config: {} }
  draft.nodes = [trigger, repeat, send, repeatEnd, end]
  draft.edges = [
    { id: 'a', from: trigger.id, fromSocket: 'next', to: repeat.id, toSocket: 'in' },
    { id: 'b', from: repeat.id, fromSocket: 'body', to: send.id, toSocket: 'in' },
    { id: 'c', from: send.id, fromSocket: 'next', to: repeatEnd.id, toSocket: 'in' },
    { id: 'd', from: repeat.id, fromSocket: 'next', to: end.id, toSocket: 'in' },
  ]
  let calls = 0
  const result = await executeVisualWorkflow(draft, {
    store,
    context: context({ socket: { sendMessage: async () => { calls += 1; throw new Error('simulated WhatsApp failure') } } }),
  })
  assert.equal(result.ok, false)
  assert.equal(calls, 1)
  assert.match(result.error, /simulated WhatsApp failure/)
})

test('persistent counters are saved atomically and survive a fresh store instance', async t => {
  const { store, path } = await makeStore(t)
  assert.equal(await store.incrementCounter('workflow-1', 'daily'), 1)
  assert.equal(await store.incrementCounter('workflow-1', 'daily'), 2)
  const saved = JSON.parse(await readFile(path, 'utf8'))
  assert.equal(saved.counters['workflow-1'].daily, 2)
  const reloaded = createVisualCommandStore(path)
  await reloaded.init()
  assert.equal(await reloaded.incrementCounter('workflow-1', 'daily'), 3)
})

test('corrupted workflow storage is preserved without blocking the bot runtime', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-visual-corrupt-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const path = join(dir, 'visual-commands.json')
  const original = '{ not valid JSON'
  await writeFile(path, original)
  const store = createVisualCommandStore(path)
  await store.init()
  assert.match(store.storageWarning(), /preserved/i)
  await assert.rejects(() => store.save(createWorkflowDraft()), /preserved/i)
  assert.equal(await readFile(path, 'utf8'), original)
})

test('only valid workflows can be activated, while invalid drafts remain editable', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft()
  draft.nodes[1].config.text = ''
  const saved = await store.save(draft)
  assert.equal(saved.validation.valid, false)
  assert.equal(store.get(draft.id).enabled, false)
  await assert.rejects(() => store.save({ ...draft, enabled: true }), /pass validation/i)
})

test('message triggers can be found only for their selected account', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft('public')
  draft.nodes[0].type = 'trigger.message'
  draft.nodes[0].config = {}
  draft.enabled = true
  await store.save(draft)
  assert.equal(store.findMessageTriggers('public').length, 1)
  assert.equal(store.findMessageTriggers('private').length, 0)
})
