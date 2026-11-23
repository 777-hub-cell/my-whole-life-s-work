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

test('Public direct command workflows accept numeric LID-addressed direct chats after sender authorization', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft('public')
  draft.nodes[0].config.command = 'hello'
  const result = await executeVisualWorkflow(draft, {
    store,
    dryRun: true,
    context: context({
      sessionId: 'public',
      privateControl: false,
      allowedPublicSender: true,
      remoteJid: '123456789012345@lid',
      sender: '2348012345678@s.whatsapp.net',
      senderJid: '2348012345678@s.whatsapp.net',
      messageText: '!hello',
    }),
  })
  assert.equal(result.ok, true, result.error)
  assert.equal(result.dryRun, true)
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
  const event = context()
  event.message.message = {
    extendedTextMessage: {
      text: '.hello Ada',
      contextInfo: { quotedMessage: { conversation: 'Please help me' } },
    },
  }
  const sent = []
  event.socket = { sendMessage: async (_jid, body) => { sent.push(body.text); return { key: { id: 'quoted-reply' } } } }
  const result = await executeVisualWorkflow(draft, { store, context: event })
  assert.equal(result.ok, true, result.error)
  assert.deepEqual(sent, ['Please help me'])
})

test('interactive buttons use the documented fork payload and never execute in dry-run', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft()
  const trigger = draft.nodes[0]
  const buttons = {
    id: 'buttons',
    type: 'message.sendButtons',
    x: 280,
    y: 100,
    config: { text: 'Choose one', buttons: 'Yes|yes\nNo|no' },
  }
  draft.nodes = [trigger, buttons]
  draft.edges = [{ id: 'buttons-exec', from: trigger.id, fromSocket: 'next', to: buttons.id, toSocket: 'in' }]
  assert.equal(validateWorkflow(draft).valid, true, JSON.stringify(validateWorkflow(draft).errors))
  let payload
  const result = await executeVisualWorkflow(draft, {
    store,
    context: context({ socket: { sendMessage: async (_jid, body) => { payload = body; return { key: { id: 'buttons-id' } } } } }),
  })
  assert.equal(result.ok, true, result.error)
  assert.deepEqual(payload, {
    text: 'Choose one',
    buttons: [{ text: 'Yes', id: 'yes' }, { text: 'No', id: 'no' }],
  })
})

test('location and contact-card nodes validate and produce documented WhatsApp payloads', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft()
  const trigger = draft.nodes[0]
  const location = {
    id: 'location', type: 'message.sendLocation', x: 260, y: 60,
    config: { latitude: '6.5244', longitude: '3.3792', name: 'Lagos' },
  }
  const contact = {
    id: 'contact', type: 'contact.sendCard', x: 500, y: 60,
    config: { name: 'Ada', phone: '+234 801 234 5678' },
  }
  draft.nodes = [trigger, location, contact]
  draft.edges = [
    { id: 'location-exec', from: trigger.id, fromSocket: 'next', to: location.id, toSocket: 'in' },
    { id: 'contact-exec', from: location.id, fromSocket: 'next', to: contact.id, toSocket: 'in' },
  ]
  assert.equal(validateWorkflow(draft).valid, true, JSON.stringify(validateWorkflow(draft).errors))
  const payloads = []
  const result = await executeVisualWorkflow(draft, {
    store,
    context: context({ socket: { sendMessage: async (_jid, body) => { payloads.push(body); return { key: { id: String(payloads.length) } } } } }),
  })
  assert.equal(result.ok, true, result.error)
  assert.deepEqual(payloads[0], { location: { degreesLatitude: 6.5244, degreesLongitude: 3.3792, name: 'Lagos' } })
  assert.equal(payloads[1].contacts.displayName, 'Ada')
  assert.match(payloads[1].contacts.contacts[0].vcard, /FN:Ada/)
  assert.match(payloads[1].contacts.contacts[0].vcard, /waid=2348012345678:\+2348012345678/)
})

test('Public group workflows require explicit group scope and an allow-listed participant', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft('public')
  draft.nodes[0].config.chatScope = 'groups'
  draft.nodes[0].config.command = 'hello'
  const update = { id: 'subject', type: 'group.updateSubject', x: 300, y: 100, config: { subject: 'Aharane Builders' } }
  draft.nodes = [draft.nodes[0], update]
  draft.edges = [{ id: 'group-exec', from: draft.nodes[0].id, fromSocket: 'next', to: update.id, toSocket: 'in' }]
  assert.equal(validateWorkflow(draft).valid, true, JSON.stringify(validateWorkflow(draft).errors))

  let calls = 0
  const allowedGroupContext = context({
    sessionId: 'public',
    privateControl: false,
    isPublicOwner: true,
    allowedPublicSender: true,
    remoteJid: '120363012345678901-1234567890@g.us',
    sender: '2348012345678@s.whatsapp.net',
    senderJid: '2348012345678@s.whatsapp.net',
    messageText: '!hello',
    socket: { groupUpdateSubject: async (jid, subject) => { calls += 1; assert.match(jid, /@g\.us$/); assert.equal(subject, 'Aharane Builders') } },
  })
  const accepted = await executeVisualWorkflow(draft, { store, context: allowedGroupContext })
  assert.equal(accepted.ok, true, accepted.error)
  assert.equal(calls, 1)

  const rejected = await executeVisualWorkflow({ ...draft, nodes: draft.nodes.map(node =>
    node.id === draft.nodes[0].id ? { ...node, config: { ...node.config, chatScope: 'direct' } } : node
  ) }, { store, context: allowedGroupContext })
  assert.equal(rejected.ok, false)
  assert.ok(rejected.validation.errors.some(issue => /chat scope/i.test(issue.message)))
  assert.equal(calls, 1)
})

test('Public group administration actions require the verified Public Owner', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft('public')
  draft.nodes[0].config.chatScope = 'groups'
  draft.nodes[0].config.command = 'hello'
  const admin = {
    id: 'participants', type: 'group.participantsUpdate', x: 300, y: 100,
    config: { action: 'promote', participants: '2348098765432' },
  }
  draft.nodes = [draft.nodes[0], admin]
  draft.edges = [{ id: 'admin-exec', from: draft.nodes[0].id, fromSocket: 'next', to: admin.id, toSocket: 'in' }]
  let calls = 0
  const nonOwner = context({
    sessionId: 'public', privateControl: false, isPublicOwner: false, allowedPublicSender: true,
    remoteJid: '120363012345678901-1234567890@g.us',
    sender: '2348012345678@s.whatsapp.net',
    senderJid: '2348012345678@s.whatsapp.net',
    messageText: '!hello',
    socket: { groupParticipantsUpdate: async () => { calls += 1; return [{ status: '200' }] } },
  })
  const denied = await executeVisualWorkflow(draft, { store, context: nonOwner })
  assert.equal(denied.ok, false)
  assert.match(denied.error, /account owner/i)
  assert.equal(calls, 0)

  const owner = await executeVisualWorkflow(draft, {
    store,
    context: { ...nonOwner, isPublicOwner: true, socket: { groupParticipantsUpdate: async (jid, participants, action) => {
      calls += 1
      assert.match(jid, /@g\.us$/)
      assert.deepEqual(participants, ['2348098765432@s.whatsapp.net'])
      assert.equal(action, 'promote')
      return [{ status: '200' }]
    } } },
  })
  assert.equal(owner.ok, true, owner.error)
  assert.equal(calls, 1)
})

test('group, moderation, profile and newsletter actions remain non-destructive in dry-run', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft('public')
  const trigger = draft.nodes[0]
  trigger.config.chatScope = 'groups'
  trigger.config.command = 'hello'
  const definitions = [
    ['group.getInfo', {}],
    ['group.updateSubject', { subject: 'New subject' }],
    ['group.updateDescription', { description: 'New description' }],
    ['group.participantsUpdate', { action: 'promote', participants: '2348012345678\n2348098765432' }],
    ['group.settingUpdate', { setting: 'announcement' }],
    ['moderation.blockContact', { phone: '2348012345678' }],
    ['moderation.unblockContact', { phone: '2348012345678' }],
    ['profile.updateName', { name: 'New name' }],
    ['profile.updateStatus', { status: 'New status' }],
    ['newsletter.create', { name: 'Test letter', description: 'Preview' }],
    ['newsletter.follow', { newsletterJid: '12345678901@newsletter' }],
    ['newsletter.unfollow', { newsletterJid: '12345678901@newsletter' }],
    ['newsletter.publishText', { newsletterJid: '12345678901@newsletter', text: 'Preview post' }],
  ]
  const nodes = definitions.map(([type, config], index) => ({
    id: 'privileged-' + index,
    type,
    x: 300 + index * 220,
    y: 100,
    config,
  }))
  draft.nodes = [trigger, ...nodes]
  draft.edges = []
  let previous = trigger.id
  let fromSocket = 'next'
  for (const node of nodes) {
    draft.edges.push({
      id: 'edge-' + node.id,
      from: previous,
      fromSocket,
      to: node.id,
      toSocket: 'in',
    })
    previous = node.id
    fromSocket = 'next'
  }
  const validation = validateWorkflow(draft)
  assert.equal(validation.valid, true, JSON.stringify(validation.errors))

  let externalCalls = 0
  const forbidden = async () => { externalCalls += 1; throw new Error('Dry-run must never call a live WhatsApp method.') }
  const result = await executeVisualWorkflow(draft, {
    store,
    dryRun: true,
    context: context({
      sessionId: 'public',
      privateControl: false,
      isPublicOwner: true,
      allowedPublicSender: true,
      remoteJid: '120363012345678901-1234567890@g.us',
      sender: '2348012345678@s.whatsapp.net',
      senderJid: '2348012345678@s.whatsapp.net',
      messageText: '!hello',
      socket: {
        sendMessage: forbidden,
        groupMetadata: forbidden,
        groupUpdateSubject: forbidden,
        groupUpdateDescription: forbidden,
        groupParticipantsUpdate: forbidden,
        groupSettingUpdate: forbidden,
        updateBlockStatus: forbidden,
        updateProfileName: forbidden,
        updateProfileStatus: forbidden,
        newsletterCreate: forbidden,
        newsletterFollow: forbidden,
        newsletterUnfollow: forbidden,
      },
    }),
  })
  assert.equal(result.ok, true, result.error)
  assert.equal(externalCalls, 0)
  assert.equal(result.trace.filter(item => item.status === 'simulated' && item.nodeId !== trigger.id).length, definitions.length)
})

test('Is group admin uses Baileys group metadata and branches on the participant admin flag', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft('public')
  const trigger = draft.nodes[0]
  trigger.config.chatScope = 'groups'
  trigger.config.command = 'hello'
  const check = { id: 'is-admin', type: 'condition.isGroupAdmin', x: 260, y: 100, config: {} }
  const yes = { id: 'admin-yes', type: 'message.sendText', x: 500, y: 40, config: { text: 'You are an admin.' } }
  const no = { id: 'admin-no', type: 'message.sendText', x: 500, y: 180, config: { text: 'You are not an admin.' } }
  draft.nodes = [trigger, check, yes, no]
  draft.edges = [
    { id: 'trigger-admin', from: trigger.id, fromSocket: 'next', to: check.id, toSocket: 'in' },
    { id: 'yes-admin', from: check.id, fromSocket: 'yes', to: yes.id, toSocket: 'in' },
    { id: 'no-admin', from: check.id, fromSocket: 'no', to: no.id, toSocket: 'in' },
  ]
  assert.equal(validateWorkflow(draft).valid, true, JSON.stringify(validateWorkflow(draft).errors))
  const sent = []
  const event = context({
    sessionId: 'public',
    privateControl: false,
    isPublicOwner: false,
    allowedPublicSender: true,
    remoteJid: '120363012345678901-1234567890@g.us',
    sender: '2348012345678@s.whatsapp.net',
    senderJid: '2348012345678@s.whatsapp.net',
    messageText: '!hello',
  })
  event.socket = {
    groupMetadata: async () => ({
      participants: [
        { id: '2348012345678@s.whatsapp.net', admin: 'admin' },
        { id: '2348098765432@s.whatsapp.net', admin: null },
      ],
    }),
    sendMessage: async (_jid, body) => { sent.push(body.text); return { key: { id: 'admin-branch' } } },
  }
  const result = await executeVisualWorkflow(draft, { store, context: event })
  assert.equal(result.ok, true, result.error)
  assert.deepEqual(sent, ['You are an admin.'])

  const notAdmin = await executeVisualWorkflow(draft, {
    store,
    context: { ...event, senderJid: '2348098765432@s.whatsapp.net', sender: '2348098765432@s.whatsapp.net' },
  })
  assert.equal(notAdmin.ok, true, notAdmin.error)
})

test('Is group admin safe test is simulated and never fetches live group metadata', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft('public')
  draft.nodes[0].config.chatScope = 'groups'
  draft.nodes[0].config.command = 'hello'
  const check = { id: 'is-admin', type: 'condition.isGroupAdmin', x: 260, y: 100, config: {} }
  const yes = { id: 'admin-yes', type: 'flow.end', x: 500, y: 40, config: {} }
  const no = { id: 'admin-no', type: 'flow.end', x: 500, y: 180, config: {} }
  draft.nodes = [draft.nodes[0], check, yes, no]
  draft.edges = [
    { id: 'trigger-admin', from: draft.nodes[0].id, fromSocket: 'next', to: check.id, toSocket: 'in' },
    { id: 'yes-admin', from: check.id, fromSocket: 'yes', to: yes.id, toSocket: 'in' },
    { id: 'no-admin', from: check.id, fromSocket: 'no', to: no.id, toSocket: 'in' },
  ]
  let calls = 0
  const result = await executeVisualWorkflow(draft, {
    store,
    dryRun: true,
    context: context({
      sessionId: 'public',
      privateControl: false,
      isPublicOwner: true,
      allowedPublicSender: true,
      remoteJid: '120363012345678901-1234567890@g.us',
      sender: '2348012345678@s.whatsapp.net',
      senderJid: '2348012345678@s.whatsapp.net',
      messageText: '!hello',
      socket: { groupMetadata: async () => { calls += 1; throw new Error('Must not fetch live data during a dry-run.') } },
    }),
  })
  assert.equal(result.ok, true, result.error)
  assert.equal(calls, 0)
  assert.ok(result.trace.some(item => item.type === 'condition.isGroupAdmin' && item.status === 'simulated'))
})

test('group metadata output can feed a downstream message and non-owner profile updates are denied', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft('public')
  draft.nodes[0].config.chatScope = 'groups'
  draft.nodes[0].config.command = 'hello'
  const info = { id: 'info', type: 'group.getInfo', x: 250, y: 100, config: {} }
  const send = { id: 'send', type: 'message.sendText', x: 500, y: 100, config: { text: '' } }
  draft.nodes[1] = info
  draft.nodes.push(send)
  draft.edges = [
    { id: 'exec-1', from: draft.nodes[0].id, fromSocket: 'next', to: info.id, toSocket: 'in' },
    { id: 'exec-2', from: info.id, fromSocket: 'next', to: send.id, toSocket: 'in' },
    { id: 'data', from: info.id, fromSocket: 'subject', to: send.id, toSocket: 'text' },
  ]
  const sent = []
  const event = context({
    sessionId: 'public', privateControl: false, isPublicOwner: false, allowedPublicSender: true,
    remoteJid: '120363012345678901-1234567890@g.us',
    sender: '2348012345678@s.whatsapp.net',
    senderJid: '2348012345678@s.whatsapp.net',
    messageText: '!hello',
  })
  event.socket = {
    groupMetadata: async () => ({ subject: 'Aharane Builders', participants: [{ id: 'one' }, { id: 'two' }] }),
    sendMessage: async (_jid, body) => { sent.push(body.text); return { key: { id: 'group-info-reply' } } },
  }
  const result = await executeVisualWorkflow(draft, { store, context: event })
  assert.equal(result.ok, true, result.error)
  assert.deepEqual(sent, ['Aharane Builders'])

  const profile = createWorkflowDraft('public')
  profile.nodes[0].config.command = 'hello'
  profile.nodes.push({ id: 'profile', type: 'profile.updateName', x: 300, y: 100, config: { name: 'Not allowed' } })
  profile.edges.push({ id: 'profile-edge', from: profile.nodes[0].id, fromSocket: 'next', to: 'profile', toSocket: 'in' })
  let profileCalls = 0
  const noOwner = await executeVisualWorkflow(profile, {
    store,
    context: context({ sessionId: 'public', privateControl: false, isPublicOwner: false, allowedPublicSender: true,
      socket: { updateProfileName: async () => { profileCalls += 1 } } }),
  })
  assert.equal(noOwner.ok, false)
  assert.equal(profileCalls, 0)
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

test('Repeat validation rejects a branch that does not reach End repeat body', () => {
  const draft = createWorkflowDraft()
  const trigger = draft.nodes[0]
  const repeat = { id: 'repeat', type: 'flow.repeat', x: 260, y: 100, config: { count: 2 } }
  const condition = { id: 'condition', type: 'condition.equals', x: 480, y: 100, config: { left: 'yes', right: 'yes' } }
  const send = { id: 'send', type: 'message.sendText', x: 720, y: 30, config: { text: 'OK' } }
  const missingTerminator = { id: 'missing', type: 'message.sendText', x: 720, y: 180, config: { text: 'Also OK' } }
  const repeatEnd = { id: 'repeat-end', type: 'flow.repeatEnd', x: 960, y: 30, config: {} }
  const end = { id: 'end', type: 'flow.end', x: 960, y: 180, config: {} }
  draft.nodes = [trigger, repeat, condition, send, missingTerminator, repeatEnd, end]
  draft.edges = [
    { id: 'trigger', from: trigger.id, fromSocket: 'next', to: repeat.id, toSocket: 'in' },
    { id: 'body', from: repeat.id, fromSocket: 'body', to: condition.id, toSocket: 'in' },
    { id: 'yes', from: condition.id, fromSocket: 'yes', to: send.id, toSocket: 'in' },
    { id: 'no', from: condition.id, fromSocket: 'no', to: missingTerminator.id, toSocket: 'in' },
    { id: 'yes-next', from: send.id, fromSocket: 'next', to: repeatEnd.id, toSocket: 'in' },
    { id: 'no-next', from: missingTerminator.id, fromSocket: 'next', to: end.id, toSocket: 'in' },
    { id: 'after-repeat', from: repeat.id, fromSocket: 'next', to: end.id, toSocket: 'in' },
  ]
  const validation = validateWorkflow(draft)
  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some(item => item.nodeId === repeat.id && /every repeat path/i.test(item.message)))
})

test('oversized workflows are rejected instead of silently truncated', async t => {
  const { store } = await makeStore(t)
  const draft = createWorkflowDraft()
  draft.nodes = Array.from({ length: 101 }, (_, index) => ({
    id: 'node-' + index,
    type: 'flow.end',
    x: index * 10,
    y: 0,
    config: {},
  }))
  const validation = validateWorkflow(draft)
  assert.ok(validation.errors.some(item => /100 nodes/i.test(item.message)))
  await assert.rejects(() => store.save(draft), /100-node limit/i)
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
