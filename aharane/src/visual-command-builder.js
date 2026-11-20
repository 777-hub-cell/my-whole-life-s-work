import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

const MAX_NODES = 100
const MAX_EDGES = 300
const MAX_STEPS = 200
const MAX_REPEAT = 10
const MAX_DELAY_MS = 10_000
const MAX_EXECUTION_MS = 30_000
const COMMAND_NAME = /^[a-z][a-z0-9_-]{0,63}$/
const SAFE_KEY = /^[a-zA-Z][a-zA-Z0-9_.-]{0,47}$/
const execIn = { id: 'in', label: 'In', type: 'exec' }
const execOut = { id: 'next', label: 'Next', type: 'exec' }
const ports = (inputs, outputs) => ({ inputs, outputs })

export const VISUAL_NODE_LIBRARY = Object.freeze([
  { category: 'Triggers and events', nodes: [
    { type: 'trigger.command', name: 'Command trigger', description: 'Start when an allowed WhatsApp user sends this command.', ports: ports([], [
      { id: 'next', label: 'Next', type: 'exec' }, { id: 'messageText', label: 'Message text', type: 'string' },
      { id: 'message', label: 'Original message', type: 'message' }, { id: 'sender', label: 'Sender JID', type: 'string' },
      { id: 'chat', label: 'Chat JID', type: 'string' }, { id: 'arguments', label: 'Arguments', type: 'string' },
    ]) },
    { type: 'trigger.message', name: 'Message received', description: 'Start for a message from an authorized one-to-one sender.', ports: ports([], [
      { id: 'next', label: 'Next', type: 'exec' }, { id: 'messageText', label: 'Message text', type: 'string' },
      { id: 'message', label: 'Original message', type: 'message' }, { id: 'sender', label: 'Sender JID', type: 'string' },
      { id: 'chat', label: 'Chat JID', type: 'string' },
    ]) },
  ] },
  { category: 'Messages', nodes: [
    { type: 'message.sendText', name: 'Send text', description: 'Send text to the chat that triggered this workflow.', ports: ports([execIn, { id: 'text', label: 'Text', type: 'string' }], [execOut, { id: 'sent', label: 'Sent message', type: 'message' }]) },
    { type: 'message.replyText', name: 'Reply to message', description: 'Reply to the triggering WhatsApp message with a quote.', ports: ports([execIn, { id: 'text', label: 'Text', type: 'string' }], [execOut, { id: 'sent', label: 'Sent message', type: 'message' }]) },
    { type: 'message.react', name: 'React to message', description: 'React to the triggering message with an emoji.', ports: ports([execIn, { id: 'emoji', label: 'Emoji', type: 'string' }], [execOut]) },
  ] },
  { category: 'Message information', nodes: [
    { type: 'message.text', name: 'Message text', description: 'Read the text of the triggering WhatsApp message.', ports: ports([], [{ id: 'value', label: 'Text', type: 'string' }]) },
    { type: 'message.sender', name: 'Message sender', description: 'Read the sender JID of the triggering message.', ports: ports([], [{ id: 'value', label: 'Sender JID', type: 'string' }]) },
    { type: 'message.arguments', name: 'Command arguments', description: 'Read the command arguments as one string.', ports: ports([], [{ id: 'value', label: 'Arguments', type: 'string' }]) },
  ] },
  { category: 'Conditions and comparisons', nodes: [
    { type: 'condition.equals', name: 'Text equals', description: 'Compare two values and follow YES or NO.', ports: ports([execIn, { id: 'left', label: 'Left value', type: 'string' }, { id: 'right', label: 'Right value', type: 'string' }], [{ id: 'yes', label: 'YES', type: 'exec' }, { id: 'no', label: 'NO', type: 'exec' }]) },
    { type: 'condition.contains', name: 'Text contains', description: 'Check whether text contains another value.', ports: ports([execIn, { id: 'text', label: 'Text', type: 'string' }, { id: 'search', label: 'Search for', type: 'string' }], [{ id: 'yes', label: 'YES', type: 'exec' }, { id: 'no', label: 'NO', type: 'exec' }]) },
    { type: 'condition.isOwner', name: 'Is account owner', description: 'Check the authenticated Private Owner or Public Owner.', ports: ports([execIn], [{ id: 'yes', label: 'YES', type: 'exec' }, { id: 'no', label: 'NO', type: 'exec' }]) },
  ] },
  { category: 'Variables and counters', nodes: [
    { type: 'variable.set', name: 'Set variable', description: 'Set a temporary text variable for this workflow run.', ports: ports([execIn, { id: 'value', label: 'Value', type: 'string' }], [execOut]) },
    { type: 'variable.get', name: 'Get variable', description: 'Read a variable set earlier in this run.', ports: ports([], [{ id: 'value', label: 'Value', type: 'string' }]) },
    { type: 'counter.increment', name: 'Increment counter', description: 'Increase a persistent counter for this command.', ports: ports([execIn], [execOut, { id: 'value', label: 'Count', type: 'number' }]) },
  ] },
  { category: 'Flow control', nodes: [
    { type: 'flow.delay', name: 'Wait', description: 'Wait for up to 10 seconds before continuing.', ports: ports([execIn], [execOut]) },
    { type: 'flow.repeat', name: 'Repeat', description: 'Run a body a fixed number of times (maximum 10).', ports: ports([execIn], [{ id: 'body', label: 'Body', type: 'exec' }, { id: 'next', label: 'Next', type: 'exec' }]) },
    { type: 'flow.repeatEnd', name: 'End repeat body', description: 'Return to Repeat for its next iteration.', ports: ports([execIn], []) },
    { type: 'flow.end', name: 'End workflow', description: 'Stop this workflow run.', ports: ports([execIn], []) },
  ] },
])

const definitions = new Map(VISUAL_NODE_LIBRARY.flatMap(group => group.nodes.map(node => [node.type, node])))
const triggerTypes = new Set(['trigger.command', 'trigger.message'])
const textValue = (value, max = 2000) => String(value == null ? '' : value).slice(0, max)
const isExec = (node, socket) => definitions.get(node && node.type)?.ports.outputs.find(item => item.id === socket)?.type === 'exec'

function cleanConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {}
  const result = {}
  for (const [key, value] of Object.entries(config).slice(0, 40)) {
    if (typeof value === 'string') result[key] = textValue(value, 2000)
    else if (typeof value === 'number' && Number.isFinite(value)) result[key] = value
    else if (typeof value === 'boolean') result[key] = value
    else if (Array.isArray(value)) result[key] = value.slice(0, 20).map(item => textValue(item, 64))
  }
  return result
}

export function normalizeWorkflow(input = {}) {
  const account = input.account === 'private' || input.account === 'public' ? input.account : ''
  const nodes = Array.isArray(input.nodes) ? input.nodes.slice(0, MAX_NODES).map(node => ({
    id: textValue(node?.id, 80) || randomUUID(),
    type: textValue(node?.type, 80),
    x: Number.isFinite(Number(node?.x)) ? Math.max(-10000, Math.min(10000, Number(node.x))) : 32,
    y: Number.isFinite(Number(node?.y)) ? Math.max(-10000, Math.min(10000, Number(node.y))) : 32,
    config: cleanConfig(node?.config),
  })) : []
  const edges = Array.isArray(input.edges) ? input.edges.slice(0, MAX_EDGES).map(edge => ({
    id: textValue(edge?.id, 80) || randomUUID(),
    from: textValue(edge?.from, 80),
    fromSocket: textValue(edge?.fromSocket, 40),
    to: textValue(edge?.to, 80),
    toSocket: textValue(edge?.toSocket, 40),
  })) : []
  return {
    id: textValue(input.id, 80) || randomUUID(),
    name: textValue(input.name, 80).trim() || 'Untitled command',
    account,
    enabled: input.enabled === true,
    version: 1,
    nodes,
    edges,
    createdAt: textValue(input.createdAt, 40) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function inputEdge(workflow, nodeId, socketId) {
  return workflow.edges.find(edge => edge.to === nodeId && edge.toSocket === socketId)
}
function outputEdges(workflow, nodeId, socketId) {
  return workflow.edges.filter(edge => edge.from === nodeId && edge.fromSocket === socketId)
}
function findPort(node, direction, socketId) {
  return definitions.get(node?.type)?.ports[direction].find(port => port.id === socketId) || null
}
function canReachRepeatEnd(startId, byId, edges, seen = new Set()) {
  if (seen.has(startId)) return false
  seen.add(startId)
  const node = byId.get(startId)
  if (!node) return false
  if (node.type === 'flow.repeatEnd') return true
  if (node.type === 'flow.end') return false
  return edges.filter(edge => edge.from === startId && edge.fromSocket !== 'body')
    .some(edge => canReachRepeatEnd(edge.to, byId, edges, new Set(seen)))
}

export function validateWorkflow(input) {
  const workflow = normalizeWorkflow(input)
  const errors = [], warnings = [], nodeErrors = {}
  const issue = (nodeId, severity, message, fix) => {
    const item = { nodeId: nodeId || null, severity, message, fix }
    ;(severity === 'error' ? errors : warnings).push(item)
    if (nodeId && severity === 'error') (nodeErrors[nodeId] ||= []).push(message)
  }
  const byId = new Map()
  if (!workflow.account) issue(null, 'error', 'Choose a WhatsApp account.', 'Select Private or Public in workflow settings.')
  if (!workflow.nodes.length) issue(null, 'error', 'The workspace is empty.', 'Add one trigger and an action.')
  if (workflow.nodes.length > MAX_NODES) issue(null, 'error', 'Too many nodes.', 'Keep the workflow at 100 nodes or fewer.')
  if (workflow.edges.length > MAX_EDGES) issue(null, 'error', 'Too many connections.', 'Keep the workflow at 300 connections or fewer.')

  for (const node of workflow.nodes) {
    if (!node.id || byId.has(node.id)) issue(node.id, 'error', 'Node IDs must be unique.', 'Remove the duplicate node.')
    byId.set(node.id, node)
    if (!definitions.has(node.type)) {
      issue(node.id, 'error', 'Unsupported node type: ' + (node.type || '(empty)') + '.', 'Replace it with a verified library node.')
      continue
    }
    const config = node.config
    if (node.type === 'trigger.command') {
      const name = textValue(config.command, 64).trim().toLowerCase()
      if (!COMMAND_NAME.test(name)) issue(node.id, 'error', 'The command name is missing or invalid.', 'Use a letter first, then letters, numbers, underscores or hyphens.')
      for (const alias of Array.isArray(config.aliases) ? config.aliases : []) {
        if (!COMMAND_NAME.test(textValue(alias, 64).trim().toLowerCase())) issue(node.id, 'error', 'A command alias is invalid.', 'Correct or remove the alias.')
      }
    }
    if (['message.sendText', 'message.replyText'].includes(node.type) && !textValue(config.text).trim() && !inputEdge(workflow, node.id, 'text')) {
      issue(node.id, 'error', 'Message text is required.', 'Enter text or connect a text output.')
    }
    if (node.type === 'message.react' && !textValue(config.emoji, 24).trim() && !inputEdge(workflow, node.id, 'emoji')) {
      issue(node.id, 'error', 'A reaction emoji is required.', 'Enter an emoji or connect a text output.')
    }
    if (['variable.set', 'variable.get', 'counter.increment'].includes(node.type) && !SAFE_KEY.test(textValue(config.key, 48))) {
      issue(node.id, 'error', 'The variable or counter name is invalid.', 'Use a name beginning with a letter and no spaces.')
    }
    if (node.type === 'flow.delay') {
      const ms = Number(config.milliseconds == null ? 1000 : config.milliseconds)
      if (!Number.isInteger(ms) || ms < 0 || ms > MAX_DELAY_MS) issue(node.id, 'error', 'Wait duration is outside the supported range.', 'Choose a whole number from 0 to 10000 milliseconds.')
    }
    if (node.type === 'flow.repeat') {
      const count = Number(config.count == null ? 2 : config.count)
      if (!Number.isInteger(count) || count < 1 || count > MAX_REPEAT) issue(node.id, 'error', 'Repeat count is outside the supported range.', 'Choose a whole number from 1 to 10.')
      if (!outputEdges(workflow, node.id, 'next').length) issue(node.id, 'warning', 'Nothing runs after this repeat.', 'Connect Next to another action if needed.')
    }
    if (node.type === 'condition.equals') {
      if (!textValue(config.left).trim() && !inputEdge(workflow, node.id, 'left')) issue(node.id, 'error', 'The left comparison value is missing.', 'Enter a value or connect a text output.')
      if (!textValue(config.right).trim() && !inputEdge(workflow, node.id, 'right')) issue(node.id, 'error', 'The right comparison value is missing.', 'Enter a value or connect a text output.')
    }
    if (node.type === 'condition.contains') {
      if (!textValue(config.text).trim() && !inputEdge(workflow, node.id, 'text')) issue(node.id, 'error', 'The text to inspect is missing.', 'Enter a value or connect a text output.')
      if (!textValue(config.search).trim() && !inputEdge(workflow, node.id, 'search')) issue(node.id, 'error', 'The search value is missing.', 'Enter a value or connect a text output.')
    }
  }

  // Validate Repeat bodies only after every node has been indexed.
  for (const node of workflow.nodes) {
    if (node.type !== 'flow.repeat') continue
    const body = outputEdges(workflow, node.id, 'body')[0]
    if (!body) issue(node.id, 'error', 'The repeat body is not connected.', 'Connect Body to a sequence ending at End repeat body.')
    else if (!canReachRepeatEnd(body.to, byId, workflow.edges)) issue(node.id, 'error', 'The repeat body has no End repeat body node.', 'Connect the body to End repeat body.')
  }

  const triggers = workflow.nodes.filter(node => triggerTypes.has(node.type))
  if (triggers.length !== 1) issue(null, 'error', 'A workflow needs exactly one trigger.', 'Keep one Command trigger or Message received node.')

  for (const edge of workflow.edges) {
    const from = byId.get(edge.from), to = byId.get(edge.to)
    if (!from || !to) {
      issue(to?.id || from?.id || null, 'error', 'A connection points to a missing node.', 'Delete it and reconnect the nodes.')
      continue
    }
    const source = findPort(from, 'outputs', edge.fromSocket)
    const target = findPort(to, 'inputs', edge.toSocket)
    if (!source || !target) issue(to.id, 'error', 'A connection uses a socket that does not exist.', 'Reconnect using the visible sockets.')
    else if (source.type !== target.type) issue(to.id, 'error', 'Cannot connect ' + source.type + ' to ' + target.type + '.', 'Connect sockets with matching types.')
    if (source?.type === 'exec' && outputEdges(workflow, from.id, edge.fromSocket).length > 1) issue(from.id, 'error', 'An execution output has more than one connection.', 'Use a condition or repeat node for branches.')
  }

  for (const node of workflow.nodes) {
    const definition = definitions.get(node.type)
    if (!definition) continue
    if (definition.ports.inputs.some(port => port.id === 'in' && port.type === 'exec') && !inputEdge(workflow, node.id, 'in')) {
      issue(node.id, 'error', 'This action has no execution input.', 'Connect an execution wire from the previous node.')
    }
    if (node.type.startsWith('condition.')) {
      if (!outputEdges(workflow, node.id, 'yes').length) issue(node.id, 'warning', 'The YES branch is not connected.', 'Connect YES to the matching action.')
      if (!outputEdges(workflow, node.id, 'no').length) issue(node.id, 'warning', 'The NO branch is not connected.', 'Connect NO to the non-matching action.')
    }
  }

  const trigger = triggers[0]
  if (trigger && !outputEdges(workflow, trigger.id, 'next').length) issue(trigger.id, 'error', 'The trigger has no next action.', 'Connect its Next output to an action.')

  const reached = new Set()
  const visit = id => {
    if (reached.has(id)) return
    reached.add(id)
    for (const edge of workflow.edges) if (edge.from === id && isExec(byId.get(id), edge.fromSocket)) visit(edge.to)
  }
  if (trigger) visit(trigger.id)
  for (const node of workflow.nodes) if (!reached.has(node.id)) issue(node.id, 'warning', 'This node cannot be reached from the trigger.', 'Connect it to the active execution path or remove it.')

  const adjacency = new Map(workflow.nodes.map(node => [node.id, []]))
  for (const edge of workflow.edges) if (isExec(byId.get(edge.from), edge.fromSocket)) adjacency.get(edge.from)?.push(edge.to)
  const visiting = new Set(), visited = new Set()
  const containsCycle = id => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    for (const next of adjacency.get(id) || []) if (containsCycle(next)) return true
    visiting.delete(id); visited.add(id); return false
  }
  for (const node of workflow.nodes) if (containsCycle(node.id)) {
    issue(null, 'error', 'The execution graph contains an unbounded cycle.', 'Remove the cycle and use the bounded Repeat node.')
    break
  }
  return { valid: errors.length === 0, errors, warnings, nodeErrors, summary: { nodes: workflow.nodes.length, connections: workflow.edges.length, errors: errors.length, warnings: warnings.length } }
}

function resolveTemplate(value, context) {
  return textValue(value).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_all, key) => {
    if (key === 'message.text') return context.messageText || ''
    if (key === 'sender') return context.sender || ''
    if (key === 'chat') return context.remoteJid || ''
    if (key === 'command') return context.commandName || ''
    if (key === 'args') return context.rawArgs || ''
    if (/^arg\d+$/.test(key)) return context.args?.[Number(key.slice(3)) - 1] || ''
    if (key.startsWith('var:')) return context.variables[key.slice(4)] ?? ''
    if (key.startsWith('counter:')) return context.counters[key.slice(8)] ?? ''
    return ''
  })
}
function resolveSource(workflow, edge, context) {
  const sourceNode = context.nodes.get(edge.from)
  if (!sourceNode) return undefined
  const cached = context.outputs.get(edge.from)
  if (cached && Object.prototype.hasOwnProperty.call(cached, edge.fromSocket)) return cached[edge.fromSocket]
  if (sourceNode.type === 'message.text') return context.event.messageText || ''
  if (sourceNode.type === 'message.sender') return context.event.sender || ''
  if (sourceNode.type === 'message.arguments') return context.event.rawArgs || ''
  if (sourceNode.type === 'variable.get') return context.variables[textValue(sourceNode.config.key, 48)] ?? ''
  return undefined
}
function readInput(workflow, node, socketId, configKey, context) {
  const edge = inputEdge(workflow, node.id, socketId)
  if (edge) return resolveSource(workflow, edge, context)
  return resolveTemplate(node.config[configKey], { ...context.event, variables: context.variables, counters: context.counters })
}
function safeChat(context) {
  const jid = textValue(context.remoteJid, 100)
  return /^\d{7,15}@s\.whatsapp\.net$/.test(jid)
}

export async function executeVisualWorkflow(input, options = {}) {
  const workflow = normalizeWorkflow(input)
  const validation = validateWorkflow(workflow)
  const dryRun = options.dryRun === true
  const store = options.store
  const event = options.context
  const now = options.now || Date.now
  const trace = []
  if (!validation.valid) return { ok: false, dryRun, validation, trace, error: 'Workflow validation failed.' }
  if (!store || !event) return { ok: false, dryRun, validation, trace, error: 'Workflow runtime context is unavailable.' }
  const authorized = workflow.account === 'private'
    ? event.sessionId === 'private' && event.privateControl === true
    : event.sessionId === 'public' && event.allowedPublicSender === true
  if (!authorized) return { ok: false, dryRun, validation, trace, error: 'This WhatsApp account is not authorized to run the workflow.' }
  if (!safeChat(event)) return { ok: false, dryRun, validation, trace, error: 'Only verified one-to-one chats are supported.' }

  const trigger = workflow.nodes.find(node => triggerTypes.has(node.type))
  if (trigger.type === 'trigger.command') {
    const prefix = workflow.account === 'private' ? '.' : '!'
    const raw = textValue(event.messageText).trim()
    if (!raw.startsWith(prefix)) return { ok: false, dryRun, validation, trace, error: 'The test message does not match the command trigger.' }
    const name = raw.slice(prefix.length).trim().split(/\s+/, 1)[0]?.toLowerCase()
    const aliases = Array.isArray(trigger.config.aliases) ? trigger.config.aliases.map(value => textValue(value, 64).toLowerCase()) : []
    if (![textValue(trigger.config.command, 64).toLowerCase(), ...aliases].includes(name)) {
      return { ok: false, dryRun, validation, trace, error: 'The test message does not match this command.' }
    }
  }

  const nodes = new Map(workflow.nodes.map(node => [node.id, node]))
  const outputs = new Map()
  const variables = Object.create(null)
  const counters = Object.create(null)
  const state = { nodes, outputs, variables, counters, event, startedAt: now() }
  let budget = MAX_STEPS
  let terminated = false

  const firstEdge = (node, socket) => outputEdges(workflow, node.id, socket)[0]?.to || null
  const chain = async (startId, repeatBody = false, depth = 0) => {
    if (depth > 3) throw new Error('Repeat nesting is limited to three levels.')
    let id = startId
    const visited = new Set()
    while (id && !terminated) {
      if (--budget < 0) throw new Error('Workflow exceeded the 200-step safety limit.')
      if (now() - state.startedAt > MAX_EXECUTION_MS) throw new Error('Workflow exceeded its 30-second execution limit.')
      if (visited.has(id)) throw new Error('An execution cycle was detected.')
      visited.add(id)
      const node = nodes.get(id)
      if (!node) throw new Error('A connected node no longer exists.')
      if (node.type === 'flow.repeatEnd') {
        if (!repeatBody) throw new Error('End repeat body is outside a Repeat node.')
        return
      }
      if (node.type === 'flow.end') {
        terminated = true
        trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'Workflow ended.' })
        return
      }
      let next = firstEdge(node, 'next')
      try {
        if (node.type === 'message.sendText' || node.type === 'message.replyText') {
          const value = textValue(readInput(workflow, node, 'text', 'text', state))
          if (!value.trim()) throw new Error('Message text is empty.')
          if (dryRun) {
            trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would send: ' + value.slice(0, 160) })
            outputs.set(node.id, { sent: { simulated: true, text: value } })
          } else {
            const sent = await event.socket.sendMessage(event.remoteJid, { text: value },
              node.type === 'message.replyText' ? { quoted: event.message } : undefined)
            if (!sent?.key?.id) throw new Error('WhatsApp did not return a sent message.')
            outputs.set(node.id, { sent })
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'WhatsApp accepted the message.' })
          }
        } else if (node.type === 'message.react') {
          const emoji = textValue(readInput(workflow, node, 'emoji', 'emoji', state), 24).trim()
          const key = event.message?.key
          if (!emoji || !key?.id || !key?.remoteJid) throw new Error('A reaction requires an emoji and the original message key.')
          if (dryRun) trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would react with ' + emoji + '.' })
          else {
            await event.socket.sendMessage(event.remoteJid, { react: { text: emoji, key } })
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'WhatsApp accepted the reaction.' })
          }
        } else if (node.type === 'condition.equals') {
          const left = textValue(readInput(workflow, node, 'left', 'left', state))
          const right = textValue(readInput(workflow, node, 'right', 'right', state))
          next = firstEdge(node, left === right ? 'yes' : 'no')
          trace.push({ nodeId: node.id, type: node.type, status: 'success', message: left === right ? 'YES branch selected.' : 'NO branch selected.' })
        } else if (node.type === 'condition.contains') {
          const source = textValue(readInput(workflow, node, 'text', 'text', state))
          const search = textValue(readInput(workflow, node, 'search', 'search', state))
          const matched = source.toLocaleLowerCase().includes(search.toLocaleLowerCase())
          next = firstEdge(node, matched ? 'yes' : 'no')
          trace.push({ nodeId: node.id, type: node.type, status: 'success', message: matched ? 'YES branch selected.' : 'NO branch selected.' })
        } else if (node.type === 'condition.isOwner') {
          const owner = workflow.account === 'private' ? event.privateControl === true : event.isPublicOwner === true
          next = firstEdge(node, owner ? 'yes' : 'no')
          trace.push({ nodeId: node.id, type: node.type, status: 'success', message: owner ? 'YES branch selected.' : 'NO branch selected.' })
        } else if (node.type === 'variable.set') {
          const key = textValue(node.config.key, 48)
          variables[key] = textValue(readInput(workflow, node, 'value', 'value', state))
          trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'Variable ' + key + ' set.' })
        } else if (node.type === 'counter.increment') {
          const key = textValue(node.config.key, 48)
          const value = dryRun ? ((counters[key] || 0) + 1) : await store.incrementCounter(workflow.id, key)
          counters[key] = value
          outputs.set(node.id, { value })
          trace.push({ nodeId: node.id, type: node.type, status: dryRun ? 'simulated' : 'success', message: key + ': ' + value })
        } else if (node.type === 'flow.delay') {
          const ms = Number(node.config.milliseconds == null ? 1000 : node.config.milliseconds)
          if (!Number.isInteger(ms) || ms < 0 || ms > MAX_DELAY_MS) throw new Error('Wait duration is invalid.')
          if (!dryRun && ms) await new Promise(resolve => setTimeout(resolve, ms))
          trace.push({ nodeId: node.id, type: node.type, status: dryRun ? 'simulated' : 'success', message: 'Waited ' + ms + ' ms.' })
        } else if (node.type === 'flow.repeat') {
          const count = Number(node.config.count == null ? 2 : node.config.count)
          const body = firstEdge(node, 'body')
          if (!body) throw new Error('Repeat body is not connected.')
          for (let index = 0; index < count && !terminated; index += 1) {
            trace.push({ nodeId: node.id, type: node.type, status: 'running', message: 'Repeat ' + (index + 1) + ' of ' + count + '.' })
            await chain(body, true, depth + 1)
          }
          trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'Repeated ' + count + ' time(s).' })
        } else {
          throw new Error('This node cannot execute in the current position.')
        }
      } catch (error) {
        trace.push({ nodeId: node.id, type: node.type, status: 'error', message: textValue(error?.message || error, 240) })
        return { error: textValue(error?.message || error, 240) }
      }
      id = next
    }
    return {}
  }

  outputs.set(trigger.id, {
    messageText: textValue(event.messageText, 4000),
    message: event.message,
    sender: event.sender,
    chat: event.remoteJid,
    arguments: event.rawArgs || '',
  })
  trace.push({ nodeId: trigger.id, type: trigger.type, status: dryRun ? 'simulated' : 'success', message: 'Trigger accepted.' })
  const result = await chain(firstEdge(trigger, 'next'))
  const error = result?.error || trace.find(item => item.status === 'error')?.message
  return { ok: !error, dryRun, validation, trace, error, ended: terminated }
}

export function createVisualCommandStore(filePath) {
  let data = { version: 1, workflows: [], counters: {} }
  let tail = Promise.resolve()

  async function persist() {
    await mkdir(dirname(filePath), { recursive: true, mode: 0o700 })
    const temporary = filePath + '.' + process.pid + '.' + randomUUID() + '.tmp'
    await writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600 })
    await rename(temporary, filePath)
  }
  function mutate(work) {
    const operation = tail.then(async () => {
      const result = await work()
      await persist()
      return result
    })
    tail = operation.catch(() => {})
    return operation
  }

  return {
    async init() {
      await mkdir(dirname(filePath), { recursive: true, mode: 0o700 })
      try {
        const loaded = JSON.parse(await readFile(filePath, 'utf8'))
        if (loaded?.version === 1 && Array.isArray(loaded.workflows) && loaded.counters && typeof loaded.counters === 'object') {
          data = { version: 1, workflows: loaded.workflows.map(normalizeWorkflow), counters: loaded.counters }
        }
      } catch (error) {
        if (error?.code !== 'ENOENT') throw new Error('Visual command storage is invalid; saved data was not overwritten.')
      }
      return this.list()
    },
    list(account) { return data.workflows.filter(item => !account || item.account === account).map(item => structuredClone(item)) },
    get(id) { const item = data.workflows.find(workflow => workflow.id === id); return item ? structuredClone(item) : null },
    async save(input) {
      const workflow = normalizeWorkflow(input)
      const validation = validateWorkflow(workflow)
      if (!workflow.account) throw new Error('Choose a WhatsApp account.')
      if (workflow.enabled && !validation.valid) {
        const error = new Error('A workflow must pass validation before activation.')
        error.validation = validation
        throw error
      }
      return mutate(async () => {
        const index = data.workflows.findIndex(item => item.id === workflow.id)
        if (data.workflows.some(item => item.id !== workflow.id && item.account === workflow.account && item.enabled && workflow.enabled &&
            item.nodes.some(node => node.type === 'trigger.command') && workflow.nodes.some(node => node.type === 'trigger.command') &&
            [workflow.nodes.find(node => node.type === 'trigger.command')?.config.command, ...(workflow.nodes.find(node => node.type === 'trigger.command')?.config.aliases || [])]
              .some(name => [item.nodes.find(node => node.type === 'trigger.command')?.config.command, ...(item.nodes.find(node => node.type === 'trigger.command')?.config.aliases || [])].includes(name)))) {
          throw new Error('An enabled workflow already uses this command name or alias.')
        }
        if (index >= 0) workflow.createdAt = data.workflows[index].createdAt
        if (index >= 0) data.workflows[index] = workflow
        else {
          if (data.workflows.length >= 100) throw new Error('The 100-workflow limit has been reached.')
          data.workflows.push(workflow)
        }
        return { workflow: structuredClone(workflow), validation }
      })
    },
    remove(id) {
      return mutate(async () => {
        const before = data.workflows.length
        data.workflows = data.workflows.filter(item => item.id !== id)
        delete data.counters[id]
        return data.workflows.length !== before
      })
    },
    incrementCounter(id, key) {
      return mutate(async () => {
        data.counters[id] ||= {}
        const current = Number(data.counters[id][key] || 0)
        const next = Math.min(Number.MAX_SAFE_INTEGER, current + 1)
        data.counters[id][key] = next
        return next
      })
    },
    findCommand(account, name) {
      return data.workflows.filter(item => item.enabled && item.account === account).filter(item => {
        const trigger = item.nodes.find(node => node.type === 'trigger.command')
        return trigger && [trigger.config.command, ...(trigger.config.aliases || [])].some(value => textValue(value, 64).toLowerCase() === name)
      }).map(item => structuredClone(item))
    },
    findMessageTriggers(account) {
      return data.workflows.filter(item => item.enabled && item.account === account && item.nodes.some(node => node.type === 'trigger.message')).map(item => structuredClone(item))
    },
  }
}

export function createWorkflowDraft(account = 'private') {
  const triggerId = randomUUID()
  const replyId = randomUUID()
  return normalizeWorkflow({
    id: randomUUID(), name: 'New command', account, enabled: false,
    nodes: [
      { id: triggerId, type: 'trigger.command', x: 30, y: 100, config: { command: 'hello', aliases: [] } },
      { id: replyId, type: 'message.replyText', x: 270, y: 100, config: { text: 'Hello, {{sender}}!' } },
    ],
    edges: [{ id: randomUUID(), from: triggerId, fromSocket: 'next', to: replyId, toSocket: 'in' }],
  })
}
