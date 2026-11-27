import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { validateCustomNodeDefinition, runCustomNode } from './custom-node-engine.js'
import { validateEngineManifest } from './engine-contract.js'

const MAX_NODES = 100
const MAX_EDGES = 300
// Workflow document schema. v1 had no schemaVersion/revision fields; v2 adds both.
// Older documents are migrated on load (see normalizeWorkflow); newer ones are rejected.
export const WORKFLOW_SCHEMA_VERSION = 2
// Users choose their own per-run send amount. This is only the independent system ceiling
// (a safety/resource protection), not a UI limit; rate, payload and time limits still apply.
export const SYSTEM_MAX_MESSAGES_PER_RUN = 500
// Immutable per-revision history kept for each workflow so schedules/runs can reference a saved revision.
const MAX_REVISIONS_PER_WORKFLOW = 50
const EXECUTION_CLAIM_TTL_MS = 24 * 60 * 60 * 1000
const MAX_EXECUTION_CLAIMS = 2000
const MAX_IMPORT_BYTES = 512 * 1024
export const WORKFLOW_EXPORT_FORMAT = 'aharane.workflow'
export const RUN_STATUSES = Object.freeze(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
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
    { type: 'trigger.command', name: 'Command trigger', description: 'Start on an allowed WhatsApp command; Private always stays in the owner self-chat.', ports: ports([], [
      { id: 'next', label: 'Next', type: 'exec' }, { id: 'messageText', label: 'Message text', type: 'string' },
      { id: 'message', label: 'Original message', type: 'message' }, { id: 'sender', label: 'Sender JID', type: 'string' },
      { id: 'chat', label: 'Chat JID', type: 'string' }, { id: 'arguments', label: 'Arguments', type: 'string' },
    ]) },
    { type: 'trigger.message', name: 'Message received', description: 'Start on an allowed Public WhatsApp direct message or explicitly permitted group message.', ports: ports([], [
      { id: 'next', label: 'Next', type: 'exec' }, { id: 'messageText', label: 'Message text', type: 'string' },
      { id: 'message', label: 'Original message', type: 'message' }, { id: 'sender', label: 'Sender JID', type: 'string' },
      { id: 'chat', label: 'Chat JID', type: 'string' },
    ]) },
  ] },
  { category: 'Messages', nodes: [
    { type: 'message.sendText', name: 'Send text', description: 'Send text to the chat that triggered this workflow.', ports: ports([execIn, { id: 'text', label: 'Text', type: 'string' }], [execOut, { id: 'sent', label: 'Sent message', type: 'message' }]) },
    { type: 'message.replyText', name: 'Reply to message', description: 'Reply to the triggering WhatsApp message with a quote.', ports: ports([execIn, { id: 'text', label: 'Text', type: 'string' }], [execOut, { id: 'sent', label: 'Sent message', type: 'message' }]) },
    { type: 'message.react', name: 'React to message', description: 'React to the triggering message with an emoji.', ports: ports([execIn, { id: 'emoji', label: 'Emoji', type: 'string' }], [execOut]) },
    { type: 'message.editOriginal', name: 'Edit your triggering message', description: 'Edit the triggering message only when it was sent by this WhatsApp account.', ports: ports([execIn, { id: 'text', label: 'Replacement text', type: 'string' }], [execOut, { id: 'sent', label: 'Edited message', type: 'message' }]) },
    { type: 'message.deleteOriginal', name: 'Delete your triggering message', description: 'Delete the triggering message only when it was sent by this WhatsApp account.', ports: ports([execIn], [execOut]) },
    { type: 'message.pinOriginal', name: 'Pin or unpin triggering message', description: 'Pin or unpin the triggering message in the current chat (account owner only).', ports: ports([execIn], [execOut]) },
    { type: 'message.keepOriginal', name: 'Keep or unkeep triggering message', description: 'Keep or unkeep an eligible message in a disappearing chat (account owner only).', ports: ports([execIn], [execOut]) },
    { type: 'media.forwardOriginal', name: 'Forward original message', description: 'Forward the original WhatsApp message, except View Once content which remains one-time only.', ports: ports([execIn], [execOut, { id: 'sent', label: 'Forwarded message', type: 'message' }]) },
    { type: 'message.sendLocation', name: 'Send location', description: 'Send a WhatsApp location pin with validated coordinates.', ports: ports([execIn], [execOut, { id: 'sent', label: 'Location message', type: 'message' }]) },
  ] },
  { category: 'Contacts and chats', nodes: [
    { type: 'contact.sendCard', name: 'Send contact card', description: 'Send a WhatsApp vCard using a display name and phone number.', ports: ports([execIn], [execOut, { id: 'sent', label: 'Contact message', type: 'message' }]) },
  ] },
  { category: 'Groups and participants', nodes: [
    { type: 'group.getInfo', name: 'Get group information', description: 'Read metadata for the group that triggered this workflow.', ports: ports([execIn], [execOut, { id: 'subject', label: 'Group name', type: 'string' }, { id: 'participantCount', label: 'Participants', type: 'number' }]) },
    { type: 'group.updateSubject', name: 'Change group name', description: 'Change the current group name (Public Owner only).', ports: ports([execIn], [execOut]) },
    { type: 'group.updateDescription', name: 'Change group description', description: 'Change the current group description (Public Owner only).', ports: ports([execIn], [execOut]) },
    { type: 'group.participantsUpdate', name: 'Manage participants', description: 'Add, remove, promote or demote listed group participants (Public Owner only).', ports: ports([execIn], [execOut]) },
    { type: 'group.settingUpdate', name: 'Change group settings', description: 'Set who can send messages or edit group information (Public Owner only).', ports: ports([execIn], [execOut]) },
  ] },
  { category: 'Media and attachments', nodes: [
    { type: 'media.sendImage', name: 'Send image', description: 'Send an Engine-produced image to the triggering WhatsApp chat.', ports: ports([execIn, { id: 'image', label: 'Image', type: 'image' }, { id: 'caption', label: 'Caption', type: 'string' }], [execOut, { id: 'sent', label: 'Sent image', type: 'message' }]) },
    { type: 'media.sendImages', name: 'Send image results', description: 'Send a bounded number of Engine-produced images to the triggering WhatsApp chat.', ports: ports([execIn, { id: 'images', label: 'Images', type: 'list' }, { id: 'caption', label: 'Caption', type: 'string' }], [execOut, { id: 'sent', label: 'Sent messages', type: 'list' }]) },
    { type: 'media.sendMedia', name: 'Send media', description: 'Send an Engine-produced image, video, audio file, document or sticker.', ports: ports([execIn, { id: 'media', label: 'Media', type: 'media' }, { id: 'caption', label: 'Caption', type: 'string' }], [execOut, { id: 'sent', label: 'Sent media', type: 'message' }]) },
  ] },
  { category: 'View Once', nodes: [
    { type: 'message.sendViewOnceText', name: 'Send View Once text', description: 'Send text using WhatsApp View Once text wrapping. Availability depends on WhatsApp enabling this beta feature for the account.', ports: ports([execIn, { id: 'text', label: 'Text', type: 'string' }], [execOut, { id: 'sent', label: 'Sent View Once text', type: 'message' }]) },
    { type: 'media.sendViewOnce', name: 'Send View Once media', description: 'Send an Engine-produced photo, video or audio message using WhatsApp View Once.', ports: ports([execIn, { id: 'media', label: 'Media', type: 'media' }, { id: 'caption', label: 'Caption', type: 'string' }], [execOut, { id: 'sent', label: 'Sent View Once media', type: 'message' }]) },
    { type: 'message.isViewOnce', name: 'Read View Once flag', description: 'Read whether the triggering message is View Once without downloading or exposing its content.', ports: ports([], [{ id: 'value', label: 'Is View Once', type: 'boolean' }]) },
  ] },
  { category: 'Chat privacy', nodes: [
    { type: 'chat.setDisappearing', name: 'Set disappearing messages', description: 'Set the disappearing-message timer for the current Public group (account owner only).', ports: ports([execIn], [execOut]) },
  ] },
  { category: 'Interactive messages', nodes: [
    { type: 'message.sendButtons', name: 'Send buttons', description: 'Send up to three interactive reply buttons.', ports: ports([execIn], [execOut, { id: 'sent', label: 'Interactive message', type: 'message' }]) },
  ] },
  { category: 'Polls and reactions', nodes: [
    { type: 'message.sendPoll', name: 'Create poll', description: 'Send a WhatsApp poll with two to twelve answer options.', ports: ports([execIn], [execOut, { id: 'sent', label: 'Poll message', type: 'message' }]) },
  ] },
  { category: 'Message information', nodes: [
    { type: 'message.text', name: 'Message text', description: 'Read the text of the triggering WhatsApp message.', ports: ports([], [{ id: 'value', label: 'Text', type: 'string' }]) },
    { type: 'message.sender', name: 'Message sender', description: 'Read the sender JID of the triggering message.', ports: ports([], [{ id: 'value', label: 'Sender JID', type: 'string' }]) },
    { type: 'message.arguments', name: 'Command arguments', description: 'Read the command arguments as one string.', ports: ports([], [{ id: 'value', label: 'Arguments', type: 'string' }]) },
    { type: 'message.quotedText', name: 'Quoted message text', description: 'Read text from a quoted or replied-to WhatsApp message, when available.', ports: ports([], [{ id: 'value', label: 'Quoted text', type: 'string' }]) },
  ] },
  { category: 'Conditions and comparisons', nodes: [
    { type: 'condition.equals', name: 'Text equals', description: 'Compare two values and follow YES or NO.', ports: ports([execIn, { id: 'left', label: 'Left value', type: 'string' }, { id: 'right', label: 'Right value', type: 'string' }], [{ id: 'yes', label: 'YES', type: 'exec' }, { id: 'no', label: 'NO', type: 'exec' }]) },
    { type: 'condition.contains', name: 'Text contains', description: 'Check whether text contains another value.', ports: ports([execIn, { id: 'text', label: 'Text', type: 'string' }, { id: 'search', label: 'Search for', type: 'string' }], [{ id: 'yes', label: 'YES', type: 'exec' }, { id: 'no', label: 'NO', type: 'exec' }]) },
    { type: 'condition.isOwner', name: 'Is account owner', description: 'Check the authenticated Private Owner or Public Owner.', ports: ports([execIn], [{ id: 'yes', label: 'YES', type: 'exec' }, { id: 'no', label: 'NO', type: 'exec' }]) },
    { type: 'condition.isGroupAdmin', name: 'Is group admin', description: 'Check the triggering Public group participant against actual WhatsApp group metadata.', ports: ports([execIn], [{ id: 'yes', label: 'YES', type: 'exec' }, { id: 'no', label: 'NO', type: 'exec' }]) },
    { type: 'condition.isViewOnce', name: 'Is View Once message', description: 'Branch without downloading or exposing the View Once content.', ports: ports([execIn], [{ id: 'yes', label: 'YES', type: 'exec' }, { id: 'no', label: 'NO', type: 'exec' }]) },
  ] },
  { category: 'Variables and counters', nodes: [
    { type: 'variable.set', name: 'Set variable', description: 'Set a temporary text variable for this workflow run.', ports: ports([execIn, { id: 'value', label: 'Value', type: 'string' }], [execOut]) },
    { type: 'variable.get', name: 'Get variable', description: 'Read a variable set earlier in this run.', ports: ports([], [{ id: 'value', label: 'Value', type: 'string' }]) },
    { type: 'counter.increment', name: 'Increment counter', description: 'Increase a persistent counter for this command.', ports: ports([execIn], [execOut, { id: 'value', label: 'Count', type: 'number' }]) },
    { type: 'value.toText', name: 'Number to text', description: 'Convert a numeric output, such as a counter, into text.', ports: ports([{ id: 'value', label: 'Number', type: 'number' }], [{ id: 'value', label: 'Text', type: 'string' }]) },
  ] },
  { category: 'Timing and scheduling', nodes: [
    { type: 'flow.delay', name: 'Wait', description: 'Pause this workflow run for up to 10 seconds; this is not a persistent scheduled job.', ports: ports([execIn], [execOut]) },
  ] },
  { category: 'Flow control', nodes: [
    { type: 'flow.repeat', name: 'Repeat', description: 'Run a body a fixed number of times (maximum 10).', ports: ports([execIn], [{ id: 'body', label: 'Body', type: 'exec' }, { id: 'next', label: 'Next', type: 'exec' }]) },
    { type: 'flow.repeatEnd', name: 'End repeat body', description: 'Return to Repeat for its next iteration.', ports: ports([execIn], []) },
    { type: 'flow.end', name: 'End workflow', description: 'Stop this workflow run.', ports: ports([execIn], []) },
  ] },
  { category: 'Moderation and administration', nodes: [
    { type: 'moderation.blockContact', name: 'Block contact', description: 'Block a contact on this WhatsApp account (Owner only).', ports: ports([execIn], [execOut]) },
    { type: 'moderation.unblockContact', name: 'Unblock contact', description: 'Unblock a contact on this WhatsApp account (Owner only).', ports: ports([execIn], [execOut]) },
  ] },
  { category: 'WhatsApp account and profile', nodes: [
    { type: 'profile.updateName', name: 'Change profile name', description: 'Set this WhatsApp account profile name (Owner only).', ports: ports([execIn], [execOut]) },
    { type: 'profile.updateStatus', name: 'Change profile status', description: 'Set this WhatsApp account status text (Owner only).', ports: ports([execIn], [execOut]) },
  ] },
  { category: 'Newsletters', nodes: [
    { type: 'newsletter.create', name: 'Create newsletter', description: 'Create a WhatsApp newsletter (Owner only).', ports: ports([execIn], [execOut, { id: 'newsletterJid', label: 'Newsletter JID', type: 'string' }]) },
    { type: 'newsletter.follow', name: 'Follow newsletter', description: 'Follow a specified newsletter (Owner only).', ports: ports([execIn], [execOut]) },
    { type: 'newsletter.unfollow', name: 'Unfollow newsletter', description: 'Unfollow a specified newsletter (Owner only).', ports: ports([execIn], [execOut]) },
    { type: 'newsletter.publishText', name: 'Publish newsletter text', description: 'Publish text to a specified newsletter (Owner only).', ports: ports([execIn], [execOut, { id: 'sent', label: 'Published message', type: 'message' }]) },
  ] },
])

const definitions = new Map(VISUAL_NODE_LIBRARY.flatMap(group => group.nodes.map(node => [node.type, node])))
const customDefinitions = new Map()
const engineDefinitions = new Map()
const enginePortType = type => type === 'text' ? 'string' : type

export function registerEngineNode(input) {
  const manifest = validateEngineManifest(input)
  const type = 'engine.' + manifest.id
  const definition = {
    type, name: manifest.name, description: 'Run the custom ' + manifest.name + ' Engine.',
    category: 'Engine', version: manifest.version, engineId: manifest.id,
    ports: ports(
      [execIn, ...manifest.inputs.map(port => ({ id: port.id, label: port.id, type: enginePortType(port.type), required: port.required }))],
      [execOut, ...manifest.outputs.map(port => ({ id: port.id, label: port.id, type: enginePortType(port.type) }))]
    ),
  }
  engineDefinitions.set(type, manifest)
  definitions.set(type, definition)
  return structuredClone(definition)
}

export function unregisterEngineNode(id) {
  const type = String(id).startsWith('engine.') ? String(id) : 'engine.' + String(id)
  engineDefinitions.delete(type)
  definitions.delete(type)
}

export function registerCustomNode(input) {
  const item = validateCustomNodeDefinition(input)
  const definition = {
    type: item.type, name: item.name, description: item.description,
    category: item.category,
    ports: ports([execIn, ...item.inputs], [execOut, { id: 'result', label: 'Result', type: item.outputType }]),
  }
  customDefinitions.set(item.type, item)
  definitions.set(item.type, definition)
  return structuredClone(item)
}
export function unregisterCustomNode(type) {
  if (!String(type).startsWith('custom.')) throw new Error('Only custom nodes may be unregistered.')
  customDefinitions.delete(type)
  definitions.delete(type)
}
export function currentVisualNodeLibrary() {
  const categories = VISUAL_NODE_LIBRARY.map(group => ({
    category: group.category, nodes: group.nodes.map(node => ({ ...node, category: group.category })),
  }))
  const engineGroup = { category: 'Engine', nodes: [] }
  for (const [type, manifest] of engineDefinitions) engineGroup.nodes.push({ ...definitions.get(type), version: manifest.version })
  categories.push(engineGroup)
  for (const [type, definition] of customDefinitions) {
    let group = categories.find(item => item.category === 'Custom nodes')
    if (!group) { group = { category: 'Custom nodes', nodes: [] }; categories.push(group) }
    group.nodes.push({ ...definitions.get(type), version: definition.version })
  }
  return categories
}
const triggerTypes = new Set(['trigger.command', 'trigger.message'])
const OWNER_ONLY_NODES = new Set([
  'message.pinOriginal', 'message.keepOriginal', 'chat.setDisappearing',
  'group.updateSubject', 'group.updateDescription', 'group.participantsUpdate', 'group.settingUpdate',
  'moderation.blockContact', 'moderation.unblockContact',
  'profile.updateName', 'profile.updateStatus',
  'newsletter.create', 'newsletter.follow', 'newsletter.unfollow', 'newsletter.publishText',
])
const textValue = (value, max = 2000) => String(value == null ? '' : value).slice(0, max)
const isExec = (node, socket) => definitions.get(node && node.type)?.ports.outputs.find(item => item.id === socket)?.type === 'exec'

function isEnabled(value) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

const VIEW_ONCE_WRAPPERS = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']

function isViewOnceMessage(message) {
  let current = message?.message || message || {}
  for (let depth = 0; depth < 8 && current && typeof current === 'object'; depth++) {
    if (VIEW_ONCE_WRAPPERS.some(key => current[key]?.message)) return true
    for (const key of ['imageMessage', 'videoMessage', 'audioMessage', 'extendedTextMessage']) {
      if (current[key]?.viewOnce === true) return true
    }
    const next = current.ephemeralMessage?.message ||
      current.documentWithCaptionMessage?.message ||
      current.editedMessage?.message
    if (!next) break
    current = next
  }
  return false
}

function messageContextInfo(message) {
  const content = message?.message || {}
  const direct = content.extendedTextMessage?.contextInfo
  if (direct) return direct
  for (const value of Object.values(content)) {
    if (value?.contextInfo) return value.contextInfo
    if (value?.message?.extendedTextMessage?.contextInfo) return value.message.extendedTextMessage.contextInfo
  }
  return null
}

function quotedMessageText(message) {
  const quoted = messageContextInfo(message)?.quotedMessage
  if (!quoted) return ''
  const content = quoted.ephemeralMessage?.message || quoted.viewOnceMessageV2?.message || quoted
  return textValue(content.conversation || content.extendedTextMessage?.text ||
    content.imageMessage?.caption || content.videoMessage?.caption || '')
}

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

export function assertSupportedWorkflowSchema(input) {
  const declared = input?.schemaVersion
  if (declared != null && (!Number.isInteger(declared) || declared < 1)) {
    throw new Error('The workflow schemaVersion is invalid.')
  }
  if (Number.isInteger(declared) && declared > WORKFLOW_SCHEMA_VERSION) {
    throw new Error('This workflow uses schema version ' + declared + ', but this server supports up to ' + WORKFLOW_SCHEMA_VERSION + '. Update Aharane before opening it.')
  }
}

export function normalizeWorkflow(input = {}) {
  const account = input.account === 'private' || input.account === 'public' ? input.account : ''
  const nodes = Array.isArray(input.nodes) ? input.nodes.slice(0, MAX_NODES + 1).map(node => ({
    id: textValue(node?.id, 80) || randomUUID(),
    type: textValue(node?.type, 80),
    x: Number.isFinite(Number(node?.x)) ? Math.max(-10000, Math.min(10000, Number(node.x))) : 32,
    y: Number.isFinite(Number(node?.y)) ? Math.max(-10000, Math.min(10000, Number(node.y))) : 32,
    config: cleanConfig(node?.config),
  })) : []
  const edges = Array.isArray(input.edges) ? input.edges.slice(0, MAX_EDGES + 1).map(edge => ({
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
    // v1 -> v2 migration: documents without schemaVersion are treated as v1 and upgraded here.
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    version: WORKFLOW_SCHEMA_VERSION, // legacy alias kept for older clients
    // Server-managed save counter; the store increments it on every successful save.
    revision: Number.isInteger(input.revision) && input.revision >= 1 ? input.revision : 1,
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
function allRepeatPathsTerminate(startId, byId, edges, path = new Set()) {
  if (path.has(startId)) return false
  const node = byId.get(startId)
  if (!node) return false
  if (node.type === 'flow.repeatEnd') return true
  if (node.type === 'flow.end') return false
  const nextPath = new Set(path)
  nextPath.add(startId)
  const next = edges.filter(edge => edge.from === startId && isExec(byId.get(startId), edge.fromSocket))
  return next.length > 0 && next.every(edge => allRepeatPathsTerminate(edge.to, byId, edges, nextPath))
}

export function validateWorkflow(input) {
  const rawNodeCount = Array.isArray(input?.nodes) ? input.nodes.length : 0
  const rawEdgeCount = Array.isArray(input?.edges) ? input.edges.length : 0
  const workflow = normalizeWorkflow(input)
  const errors = [], warnings = [], nodeErrors = {}
  const issue = (nodeId, severity, message, fix, edgeId) => {
    const item = { nodeId: nodeId || null, edgeId: edgeId || null, severity, message, fix }
    ;(severity === 'error' ? errors : warnings).push(item)
    if (nodeId && severity === 'error') (nodeErrors[nodeId] ||= []).push(message)
  }
  const byId = new Map()
  if (!workflow.account) issue(null, 'error', 'Choose a WhatsApp account.', 'Select Private or Public in workflow settings.')
  if (!workflow.nodes.length) issue(null, 'error', 'The workspace is empty.', 'Add one trigger and an action.')
  if (rawNodeCount > MAX_NODES) issue(null, 'error', 'The workflow exceeds 100 nodes (maximum 100).', 'Remove nodes until the workflow contains 100 nodes or fewer.')
  if (rawEdgeCount > MAX_EDGES) issue(null, 'error', 'The workflow exceeds the 300-connection limit.', 'Remove connections until the workflow contains 300 or fewer.')

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
      if (config.requireQuoted != null && typeof config.requireQuoted !== 'boolean' && !['true', 'false'].includes(String(config.requireQuoted))) {
        issue(node.id, 'error', 'The quoted-message setting is invalid.', 'Use the toggle to enable or disable it.')
      }
      if (config.requireReply != null && typeof config.requireReply !== 'boolean' && !['true', 'false'].includes(String(config.requireReply))) {
        issue(node.id, 'error', 'The reply requirement setting is invalid.', 'Use the toggle to enable or disable it.')
      }
      const messageLimit = Number(config.maxMessagesPerRun == null ? 10 : config.maxMessagesPerRun)
      if (!Number.isInteger(messageLimit) || messageLimit < 1 || messageLimit > SYSTEM_MAX_MESSAGES_PER_RUN) issue(node.id, 'error', 'The per-run message limit must be a whole number from 1 to ' + SYSTEM_MAX_MESSAGES_PER_RUN + '.', 'Choose how many WhatsApp messages this command may send in one execution.')
      const chatScope = textValue(config.chatScope, 16) || 'direct'
      if (!['direct', 'groups', 'both'].includes(chatScope)) issue(node.id, 'error', 'The chat scope is invalid.', 'Choose direct chats, groups, or both.')
      if (workflow.account === 'private' && chatScope !== 'direct') issue(node.id, 'error', 'Private commands cannot run in groups.', 'Keep the Private account scope set to direct chats.')
    }
    if (node.type === 'trigger.message') {
      const messageLimit = Number(config.maxMessagesPerRun == null ? 10 : config.maxMessagesPerRun)
      if (!Number.isInteger(messageLimit) || messageLimit < 1 || messageLimit > SYSTEM_MAX_MESSAGES_PER_RUN) issue(node.id, 'error', 'The per-run message limit must be a whole number from 1 to ' + SYSTEM_MAX_MESSAGES_PER_RUN + '.', 'Choose how many WhatsApp messages this workflow may send in one execution.')
      const chatScope = textValue(config.chatScope, 16) || 'direct'
      if (!['direct', 'groups', 'both'].includes(chatScope)) issue(node.id, 'error', 'The message-event chat scope is invalid.', 'Choose direct chats, groups, or both.')
    }
    if (['message.sendText', 'message.replyText', 'message.sendViewOnceText', 'message.editOriginal'].includes(node.type) && !textValue(config.text).trim() && !inputEdge(workflow, node.id, 'text')) {
      issue(node.id, 'error', 'Message text is required.', 'Enter text or connect a text output.')
    }
    if (['media.sendMedia', 'media.sendViewOnce'].includes(node.type)) {
      if (!inputEdge(workflow, node.id, 'media')) issue(node.id, 'error', 'Media input is not connected.', 'Connect a media output from an Engine.')
      const kind = textValue(config.kind, 16) || 'image'
      const allowedKinds = node.type === 'media.sendViewOnce'
        ? ['image', 'video', 'audio']
        : ['image', 'video', 'audio', 'document', 'sticker']
      if (!allowedKinds.includes(kind)) issue(node.id, 'error', 'The media type is not supported.', 'Choose one of: ' + allowedKinds.join(', ') + '.')
    }
    if (node.type === 'message.pinOriginal' && ![86400, 604800, 2592000].includes(Number(config.seconds == null ? 86400 : config.seconds))) {
      issue(node.id, 'error', 'The pin duration is invalid.', 'Choose 86400, 604800 or 2592000 seconds.')
    }
    if (node.type === 'message.keepOriginal' && !['keep', 'unkeep'].includes(textValue(config.action, 12) || 'keep')) {
      issue(node.id, 'error', 'The keep action is invalid.', 'Choose keep or unkeep.')
    }
    if (node.type === 'chat.setDisappearing' && ![0, 86400, 604800, 7776000].includes(Number(config.seconds))) {
      issue(node.id, 'error', 'The disappearing timer is invalid.', 'Choose 0, 86400, 604800 or 7776000 seconds.')
    }
    if (node.type === 'message.react' && !textValue(config.emoji, 24).trim() && !inputEdge(workflow, node.id, 'emoji')) {
      issue(node.id, 'error', 'A reaction emoji is required.', 'Enter an emoji or connect a text output.')
    }
    if (node.type === 'message.sendLocation') {
      const latitude = Number(config.latitude)
      const longitude = Number(config.longitude)
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) issue(node.id, 'error', 'Latitude is invalid.', 'Enter a coordinate between -90 and 90.')
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) issue(node.id, 'error', 'Longitude is invalid.', 'Enter a coordinate between -180 and 180.')
    }
    if (node.type === 'contact.sendCard') {
      if (!textValue(config.name, 80).trim() || /[\r\n]/.test(textValue(config.name, 80))) issue(node.id, 'error', 'A valid contact name is required.', 'Enter a single-line display name.')
      if (!/^\+?[0-9]{7,15}$/.test(textValue(config.phone, 20).replace(/[\s()-]/g, ''))) issue(node.id, 'error', 'The contact phone number is invalid.', 'Use 7 to 15 digits, optionally beginning with +.')
    }
    if (node.type === 'group.getInfo' || node.type === 'group.updateSubject' || node.type === 'group.updateDescription' ||
        node.type === 'group.participantsUpdate' || node.type === 'group.settingUpdate') {
      if (workflow.account !== 'public') issue(node.id, 'error', 'Group nodes are available only on the Public account.', 'Use the Public account and a group-enabled command trigger.')
    }
    if (node.type === 'group.updateSubject' && !textValue(config.subject, 100).trim()) issue(node.id, 'error', 'A group name is required.', 'Enter the new group subject.')
    if (node.type === 'group.updateDescription' && !textValue(config.description, 512).trim()) issue(node.id, 'error', 'A group description is required.', 'Enter the new group description.')
    if (node.type === 'group.participantsUpdate') {
      const action = textValue(config.action, 16)
      if (!['add', 'remove', 'promote', 'demote'].includes(action)) issue(node.id, 'error', 'The participant action is invalid.', 'Choose add, remove, promote, or demote.')
      const phones = textValue(config.participants, 1000).split(/[\n,]+/).map(value => value.replace(/[\s()-]/g, '').replace(/^\+/, '')).filter(Boolean)
      if (!phones.length || phones.length > 50 || phones.some(phone => !/^[0-9]{7,15}$/.test(phone))) {
        issue(node.id, 'error', 'Participant numbers are invalid.', 'Enter 1 to 50 phone numbers, one per line, using 7 to 15 digits.')
      }
    }
    if (node.type === 'group.settingUpdate' && !['announcement', 'not_announcement', 'locked', 'unlocked'].includes(textValue(config.setting, 24))) {
      issue(node.id, 'error', 'The group setting is invalid.', 'Choose announcement, not_announcement, locked, or unlocked.')
    }
    if (['moderation.blockContact', 'moderation.unblockContact'].includes(node.type)) {
      const phone = textValue(config.phone, 20).replace(/[\s()-]/g, '').replace(/^\+/, '')
      if (!/^[0-9]{7,15}$/.test(phone)) issue(node.id, 'error', 'The contact number is invalid.', 'Use a phone number containing 7 to 15 digits.')
    }
    if (node.type === 'profile.updateName' && !textValue(config.name, 80).trim()) issue(node.id, 'error', 'A profile name is required.', 'Enter the WhatsApp account name.')
    if (node.type === 'profile.updateStatus' && !textValue(config.status, 139).trim()) issue(node.id, 'error', 'A profile status is required.', 'Enter the account status text.')
    if (node.type === 'newsletter.create' && !textValue(config.name, 100).trim()) issue(node.id, 'error', 'A newsletter name is required.', 'Enter a newsletter name.')
    if (['newsletter.follow', 'newsletter.unfollow', 'newsletter.publishText'].includes(node.type) &&
        !/^\d{5,25}@newsletter$/.test(textValue(config.newsletterJid, 80))) {
      issue(node.id, 'error', 'The newsletter ID is invalid.', 'Use the WhatsApp newsletter JID ending in @newsletter.')
    }
    if (node.type === 'newsletter.publishText' && !textValue(config.text, 2000).trim()) {
      issue(node.id, 'error', 'Newsletter post text is required.', 'Enter the text to publish.')
    }
    if (node.type === 'message.sendButtons') {
      const buttons = textValue(config.buttons, 1000).split(/\r?\n/).map(value => value.trim()).filter(Boolean)
      const parsed = buttons.map(value => value.split('|').map(part => part.trim()))
      if (!textValue(config.text, 1000).trim()) issue(node.id, 'error', 'Button message text is required.', 'Enter the prompt shown above the buttons.')
      if (parsed.length < 1 || parsed.length > 3 || parsed.some(parts => parts.length !== 2 || !parts[0] || !/^[a-zA-Z0-9_.#-]{1,64}$/.test(parts[1]))) {
        issue(node.id, 'error', 'Button configuration is invalid.', 'Add 1 to 3 lines in Label|id format; each id must be unique and use letters, numbers, dots, underscores or hyphens.')
      }
      if (new Set(parsed.map(parts => parts[1]?.toLowerCase())).size !== parsed.length) issue(node.id, 'error', 'Button IDs must be unique.', 'Give each button a different ID.')
    }
    if (node.type === 'message.sendPoll') {
      const options = textValue(config.options, 1000).split(/\r?\n/).map(value => value.trim()).filter(Boolean)
      const uniqueOptions = new Set(options.map(value => value.toLocaleLowerCase()))
      if (!textValue(config.title, 180).trim()) issue(node.id, 'error', 'A poll question is required.', 'Enter a short poll question.')
      if (options.length < 2 || options.length > 12 || uniqueOptions.size !== options.length) {
        issue(node.id, 'error', 'A poll needs 2 to 12 unique options.', 'Put one unique answer on each line.')
      }
      const selectable = Number(config.selectableCount == null ? 1 : config.selectableCount)
      if (!Number.isInteger(selectable) || selectable < 1 || selectable > Math.max(options.length, 1)) {
        issue(node.id, 'error', 'The selectable answer count is invalid.', 'Choose a whole number from 1 up to the number of poll options.')
      }
    }
    if (['variable.set', 'variable.get', 'counter.increment'].includes(node.type) && !SAFE_KEY.test(textValue(config.key, 48))) {
      issue(node.id, 'error', 'The variable or counter name is invalid.', 'Use a name beginning with a letter and no spaces.')
    }
    if (node.type === 'variable.set' && !textValue(config.value).trim() && !inputEdge(workflow, node.id, 'value')) {
      issue(node.id, 'error', 'A variable value is required.', 'Enter a value or connect a text output.')
    }
    if (node.type === 'value.toText' && !inputEdge(workflow, node.id, 'value')) {
      issue(node.id, 'error', 'The number input is not connected.', 'Connect a numeric output, such as Increment counter.')
    }
    if (node.type.startsWith('custom.')) {
      const definition = customDefinitions.get(node.type)
      if (!definition) issue(node.id, 'error', 'Custom node definition is missing.', 'Restore the node definition.')
      else if (node.config.nodeVersion != null && Number(node.config.nodeVersion) !== definition.version) {
        issue(node.id, 'error', 'Custom node version does not match.', 'Update or restore the required node definition version.')
      }
    }
    if (node.type.startsWith('engine.')) {
      const manifest = engineDefinitions.get(node.type)
      if (!manifest) issue(node.id, 'error', 'Engine definition is missing.', 'Restore the Engine or replace this node.')
      else {
        if (node.config.engineRevision != null && (!Number.isSafeInteger(Number(node.config.engineRevision)) || Number(node.config.engineRevision) < 1)) {
          issue(node.id, 'error', 'The pinned Engine revision is not a positive whole number.', 'Clear the pin or enter a saved revision number.')
        }
        if (node.config.engineVersion != null && Number(node.config.engineVersion) !== manifest.version) {
          issue(node.id, 'error', 'Engine version does not match.', 'Update the node and re-check its connected ports.')
        }
        for (const port of manifest.inputs) {
          const configured = Object.prototype.hasOwnProperty.call(node.config, port.id) && node.config[port.id] !== ''
          if (port.required && !configured && !inputEdge(workflow, node.id, port.id)) {
            issue(node.id, 'error', 'Engine input "' + port.id + '" is missing.', 'Enter a value or connect a compatible node output.')
          }
        }
      }
    }
    if (node.type === 'media.sendImage' && !inputEdge(workflow, node.id, 'image')) {
      issue(node.id, 'error', 'Image input is not connected.', 'Connect an image output from an Engine.')
    }
    if (node.type === 'media.sendImages') {
      if (!inputEdge(workflow, node.id, 'images')) issue(node.id, 'error', 'Images input is not connected.', 'Connect a list output from an Engine.')
      const limit = Number(config.limit == null ? 10 : config.limit)
      if (!Number.isInteger(limit) || limit < 1 || limit > SYSTEM_MAX_MESSAGES_PER_RUN) issue(node.id, 'error', 'Image/message limit must be a whole number from 1 to ' + SYSTEM_MAX_MESSAGES_PER_RUN + '.', 'Choose a per-run limit within the system maximum.')
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
    else if (!allRepeatPathsTerminate(body.to, byId, workflow.edges)) issue(node.id, 'error', 'Not every repeat path reaches End repeat body.', 'Connect every YES and NO path to End repeat body.')
  }

  const triggers = workflow.nodes.filter(node => triggerTypes.has(node.type))
  if (triggers.length !== 1) issue(null, 'error', 'A workflow needs exactly one trigger.', 'Keep one Command trigger or Message received node.')

  const inputCounts = new Map()
  for (const edge of workflow.edges) {
    const key = edge.to + ':' + edge.toSocket
    inputCounts.set(key, (inputCounts.get(key) || 0) + 1)
  }
  const seenInputs = new Set()
  for (const edge of workflow.edges) {
    const key = edge.to + ':' + edge.toSocket
    if ((inputCounts.get(key) || 0) > 1) {
      // The first connection stays valid; every extra one is reported by its own edge ID.
      if (seenInputs.has(key)) issue(edge.to, 'error', 'An input socket has more than one connection.', 'Keep one source connected to each input socket.', edge.id)
      seenInputs.add(key)
    }
  }

  for (const edge of workflow.edges) {
    const from = byId.get(edge.from), to = byId.get(edge.to)
    if (!from || !to) {
      issue(to?.id || from?.id || null, 'error', 'A connection points to a missing node.', 'Delete it and reconnect the nodes.', edge.id)
      continue
    }
    const source = findPort(from, 'outputs', edge.fromSocket)
    const target = findPort(to, 'inputs', edge.toSocket)
    if (!source || !target) issue(to.id, 'error', 'A connection uses a socket that does not exist.', 'Reconnect using the visible sockets.', edge.id)
    else if (source.type !== target.type) issue(to.id, 'error', 'Cannot connect ' + source.type + ' to ' + target.type + '.', 'Connect sockets with matching types.', edge.id)
    if (source?.type === 'exec' && outputEdges(workflow, from.id, edge.fromSocket).length > 1) issue(from.id, 'error', 'An execution output has more than one connection.', 'Use a condition or repeat node for branches.', edge.id)
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
  const groupNodes = workflow.nodes.filter(node => node.type.startsWith('group.') || node.type === 'condition.isGroupAdmin')
  if (groupNodes.length && trigger && !triggerAllowsGroups(trigger)) {
    for (const node of groupNodes) issue(node.id, 'error', 'This group node is not reachable under the trigger chat scope.', 'Set the Public trigger chat scope to Groups or Both.')
  }
  if (workflow.account === 'private' && trigger?.type === 'trigger.message') {
    issue(trigger.id, 'error', 'Private message-event triggers are not supported.', 'Use Command trigger. The Private account only accepts owner self-chat commands.')
  }
  if (trigger && !outputEdges(workflow, trigger.id, 'next').length) issue(trigger.id, 'error', 'The trigger has no next action.', 'Connect its Next output to an action.')

  const reached = new Set()
  const visitDataInputs = (id, seen = new Set()) => {
    if (seen.has(id)) return
    seen.add(id)
    for (const edge of workflow.edges) {
      if (edge.to !== id || isExec(byId.get(edge.from), edge.fromSocket)) continue
      reached.add(edge.from)
      visitDataInputs(edge.from, seen)
    }
  }
  const visit = id => {
    if (reached.has(id)) return
    reached.add(id)
    visitDataInputs(id)
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
  if (sourceNode.type === 'message.quotedText') return quotedMessageText(context.event.message)
  if (sourceNode.type === 'message.isViewOnce') return isViewOnceMessage(context.event.message)
  if (sourceNode.type === 'variable.get') return context.variables[textValue(sourceNode.config.key, 48)] ?? ''
  if (sourceNode.type === 'value.toText') {
    const valueEdge = inputEdge(workflow, sourceNode.id, 'value')
    const numeric = valueEdge ? resolveSource(workflow, valueEdge, context) : undefined
    return numeric === undefined ? '' : String(numeric)
  }
  return undefined
}
function readInput(workflow, node, socketId, configKey, context) {
  const edge = inputEdge(workflow, node.id, socketId)
  if (edge) return resolveSource(workflow, edge, context)
  return resolveTemplate(node.config[configKey], { ...context.event, variables: context.variables, counters: context.counters })
}
function isGroupJid(jid) {
  return /^\d{5,25}-\d{5,25}@g\.us$/.test(textValue(jid, 100))
}

function triggerAllowsGroups(trigger) {
  const scope = textValue(trigger?.config?.chatScope, 16) || 'direct'
  return scope === 'groups' || scope === 'both'
}

function safeChat(context, trigger) {
  const jid = textValue(context.remoteJid, 100)
  const scope = textValue(trigger?.config?.chatScope, 16) || 'direct'
  const direct = /^\d{7,15}@s\.whatsapp\.net$/.test(jid) || /^\d{5,25}@lid$/.test(jid)
  if (direct) return scope === 'direct' || scope === 'both'
  return context.sessionId === 'public' && context.allowedPublicSender === true &&
    isGroupJid(jid) && (scope === 'groups' || scope === 'both')
}

async function executeWorkflowCore(input, options = {}) {
  const workflow = normalizeWorkflow(input)
  const validation = validateWorkflow(workflow)
  const dryRun = options.dryRun === true
  const store = options.store
  // Preserve caller-provided command arguments, but derive them from the raw
  // command text for direct/manual invocations that only provide messageText.
  // An explicit empty rawArgs value remains authoritative (scheduled runs and
  // message-trigger workflows intentionally have no command arguments).
  const event = options.context && typeof options.context === 'object'
    ? { ...options.context }
    : options.context
  const commandTrigger = workflow.nodes.find(node => node.type === 'trigger.command')
  if (commandTrigger && event && event.rawArgs === undefined) {
    const tokens = textValue(event.messageText).trim().split(/\s+/).filter(Boolean)
    const inferredArgs = tokens.slice(1)
    if (!Array.isArray(event.args)) event.args = inferredArgs
    event.rawArgs = event.args.join(' ')
  }
  const now = options.now || Date.now
  const trace = []
  if (!validation.valid) return { ok: false, dryRun, validation, trace, error: 'Workflow validation failed.' }
  if (!store || !event) return { ok: false, dryRun, validation, trace, error: 'Workflow runtime context is unavailable.' }
  const authorized = workflow.account === 'private'
    ? event.sessionId === 'private' && event.privateControl === true
    : event.sessionId === 'public' && event.allowedPublicSender === true
  if (!authorized) return { ok: false, dryRun, validation, trace, error: 'This WhatsApp account is not authorized to run the workflow.' }
  const trigger = workflow.nodes.find(node => triggerTypes.has(node.type))
  const configuredMessageLimit = Number(trigger?.config?.maxMessagesPerRun == null ? 10 : trigger.config.maxMessagesPerRun)
  // Defence in depth: never exceed the system ceiling even if validation was bypassed.
  const perRunMessageLimit = Number.isInteger(configuredMessageLimit) && configuredMessageLimit >= 1
    ? Math.min(configuredMessageLimit, SYSTEM_MAX_MESSAGES_PER_RUN)
    : 1
  let sentMessageCount = 0
  const sendWhatsAppMessage = async (...args) => {
    if (sentMessageCount >= perRunMessageLimit) {
      throw new Error('This command reached its ' + perRunMessageLimit + ' message-per-run limit.')
    }
    if (typeof event.socket?.sendMessage !== 'function') throw new Error('WhatsApp sending is unavailable.')
    const sent = await event.socket.sendMessage(...args)
    if (sent?.key?.id) sentMessageCount += 1
    return sent
  }
  if (!safeChat(event, trigger)) return { ok: false, dryRun, validation, trace, error: 'This workflow is not enabled for the current chat type.' }
  if (trigger.type === 'trigger.command' && event.scheduledExecution !== true) {
    const prefix = workflow.account === 'private' ? '.' : '!'
    const raw = textValue(event.messageText).trim()
    if (!raw.startsWith(prefix)) return { ok: false, dryRun, validation, trace, error: 'The test message does not match the command trigger.' }
    const name = raw.slice(prefix.length).trim().split(/\s+/, 1)[0]?.toLowerCase()
    const aliases = Array.isArray(trigger.config.aliases) ? trigger.config.aliases.map(value => textValue(value, 64).toLowerCase()) : []
    if (![textValue(trigger.config.command, 64).toLowerCase(), ...aliases].includes(name)) {
      return { ok: false, dryRun, validation, trace, error: 'The test message does not match this command.' }
    }
    const contextInfo = messageContextInfo(event.message)
    if (isEnabled(trigger.config.requireQuoted) && !contextInfo?.quotedMessage) {
      return { ok: false, dryRun, validation, trace, error: 'This command requires a quoted message.' }
    }
    if (isEnabled(trigger.config.requireReply) && !contextInfo?.stanzaId) {
      return { ok: false, dryRun, validation, trace, error: 'This command requires a reply to an existing WhatsApp message.' }
    }
  }

  // Duplicate-send protection: a redelivered trigger message must not run the same workflow twice.
  // Opt-in (options.deduplicate) so dry runs and tests stay repeatable; production event paths enable it.
  if (options.deduplicate === true && !dryRun && typeof store.claimExecution === 'function') {
    const triggerKey = textValue(event.idempotencyKey || event.message?.key?.id, 200)
    if (triggerKey) {
      const claimed = await store.claimExecution(workflow.id + ':' + triggerKey)
      if (!claimed) return { ok: false, dryRun, validation, trace, error: 'This message was already processed by this workflow; nothing was sent again.', duplicate: true }
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
      if (options.signal?.aborted) throw cancelledError()
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
        if (OWNER_ONLY_NODES.has(node.type)) {
          const owner = workflow.account === 'private' ? event.privateControl === true : event.isPublicOwner === true
          if (!owner) throw new Error('This operation is restricted to the authenticated account owner.')
        }
        if (node.type === 'message.sendText' || node.type === 'message.replyText' || node.type === 'message.sendViewOnceText') {
          const value = textValue(readInput(workflow, node, 'text', 'text', state))
          if (!value.trim()) throw new Error('Message text is empty.')
          const payload = node.type === 'message.sendViewOnceText' ? { text: value, viewOnceV2: true } : { text: value }
          if (dryRun) {
            trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: node.type === 'message.sendViewOnceText'
              ? 'Would send View Once text (requires WhatsApp beta support on this account).'
              : 'Would send: ' + value.slice(0, 160) })
            outputs.set(node.id, { sent: { simulated: true, text: value, viewOnce: node.type === 'message.sendViewOnceText' } })
          } else {
            const sent = await sendWhatsAppMessage(event.remoteJid, payload,
              node.type === 'message.replyText' ? { quoted: event.message } : undefined)
            if (!sent?.key?.id) throw new Error('WhatsApp did not return a sent message.')
            outputs.set(node.id, { sent })
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: node.type === 'message.sendViewOnceText'
              ? 'WhatsApp accepted the View Once text wrapper. Recipient support remains a phased beta rollout.'
              : 'WhatsApp accepted the message.' })
          }
        } else if (node.type === 'message.editOriginal') {
          const key = event.message?.key
          const value = textValue(readInput(workflow, node, 'text', 'text', state))
          if (!key?.id || key.fromMe !== true || !value.trim()) throw new Error('Only a non-empty edit to a message sent by this WhatsApp account is allowed.')
          if (dryRun) trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would edit the triggering message.' })
          else {
            const sent = await sendWhatsAppMessage(event.remoteJid, { text: value, edit: key })
            if (!sent?.key?.id) throw new Error('WhatsApp did not confirm the edit.')
            outputs.set(node.id, { sent })
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'WhatsApp accepted the edit.' })
          }
        } else if (node.type === 'message.deleteOriginal') {
          const key = event.message?.key
          if (!key?.id || key.fromMe !== true) throw new Error('Only a message sent by this WhatsApp account can be deleted by this node.')
          if (dryRun) trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would delete the triggering account-owned message.' })
          else {
            const sent = await sendWhatsAppMessage(event.remoteJid, { delete: key })
            if (!sent?.key?.id) throw new Error('WhatsApp did not confirm the delete.')
            outputs.set(node.id, { sent })
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'WhatsApp accepted the delete.' })
          }
        } else if (node.type === 'message.pinOriginal') {
          const key = event.message?.key
          if (!key?.id) throw new Error('There is no triggering message to pin.')
          const seconds = Number(node.config.seconds == null ? 86400 : node.config.seconds)
          if (![86400, 604800, 2592000].includes(seconds)) throw new Error('Pin duration must be 1, 7 or 30 days.')
          const type = node.config.action === 'unpin' ? 2 : 1
          if (dryRun) trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: type === 2 ? 'Would unpin the triggering message.' : 'Would pin the triggering message for ' + seconds + ' seconds.' })
          else {
            const sent = await sendWhatsAppMessage(event.remoteJid, { pin: key, time: seconds, type })
            if (!sent?.key?.id) throw new Error('WhatsApp did not confirm the pin action.')
            outputs.set(node.id, { sent })
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: type === 2 ? 'Message unpinned.' : 'Message pinned.' })
          }
        } else if (node.type === 'message.keepOriginal') {
          const key = event.message?.key
          if (!key?.id || isViewOnceMessage(event.message)) throw new Error('There is no eligible message to keep.')
          const type = (node.config.action || 'keep') === 'unkeep' ? 2 : 1
          if (dryRun) trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: type === 2 ? 'Would unkeep the triggering message.' : 'Would keep the triggering message.' })
          else {
            const sent = await sendWhatsAppMessage(event.remoteJid, { keep: key, type })
            if (!sent?.key?.id) throw new Error('WhatsApp did not confirm the keep action.')
            outputs.set(node.id, { sent })
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: type === 2 ? 'Message unkept.' : 'Message kept.' })
          }
        } else if (node.type === 'chat.setDisappearing') {
          if (!isGroupJid(event.remoteJid) || workflow.account !== 'public') throw new Error('Disappearing-message settings are available only for Public group chats.')
          const seconds = Number(node.config.seconds)
          if (![0, 86400, 604800, 7776000].includes(seconds)) throw new Error('Choose a supported disappearing timer.')
          if (dryRun) trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would set group disappearing timer to ' + seconds + ' seconds.' })
          else {
            await sendWhatsAppMessage(event.remoteJid, { disappearingMessagesInChat: seconds })
            outputs.set(node.id, { updated: true, seconds })
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'Disappearing-message timer updated.' })
          }
        } else if (node.type === 'message.react') {
          const emoji = textValue(readInput(workflow, node, 'emoji', 'emoji', state), 24).trim()
          const key = event.message?.key
          if (!emoji || !key?.id || !key?.remoteJid) throw new Error('A reaction requires an emoji and the original message key.')
          if (dryRun) trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would react with ' + emoji + '.' })
          else {
            const sent = await sendWhatsAppMessage(event.remoteJid, { react: { text: emoji, key } })
            if (!sent?.key?.id) throw new Error('WhatsApp did not return a reaction message result.')
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'WhatsApp accepted the reaction.' })
          }
        } else if (node.type === 'message.sendLocation') {
          const latitude = Number(node.config.latitude)
          const longitude = Number(node.config.longitude)
          const name = textValue(node.config.name || 'Shared location', 100).replace(/[\r\n]/g, ' ').trim()
          if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
            throw new Error('Location coordinates are outside the supported range.')
          }
          if (dryRun) {
            trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would send location: ' + name })
          } else {
            const sent = await sendWhatsAppMessage(event.remoteJid, {
              location: { degreesLatitude: latitude, degreesLongitude: longitude, name },
            })
            if (!sent?.key?.id) throw new Error('WhatsApp did not return a location message.')
            outputs.set(node.id, { sent })
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'WhatsApp accepted the location.' })
          }
        } else if (node.type === 'contact.sendCard') {
          const name = textValue(node.config.name, 80).replace(/[\r\n]/g, ' ').trim()
          const phone = textValue(node.config.phone, 20).replace(/[\s()-]/g, '').replace(/^\+/, '')
          if (!name || !/^[0-9]{7,15}$/.test(phone)) throw new Error('Contact name or phone number is invalid.')
          const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:' + name + '\nTEL;type=CELL;type=VOICE;waid=' + phone + ':+'
            + phone + '\nEND:VCARD'
          if (dryRun) {
            trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would share contact: ' + name })
          } else {
            const sent = await sendWhatsAppMessage(event.remoteJid, {
              contacts: { displayName: name, contacts: [{ vcard }] },
            })
            if (!sent?.key?.id) throw new Error('WhatsApp did not return a contact message.')
            outputs.set(node.id, { sent })
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'WhatsApp accepted the contact card.' })
          }
        } else if (node.type === 'message.sendButtons') {
          const messageText = textValue(node.config.text, 1000).trim()
          const values = textValue(node.config.buttons, 1000).split(/\r?\n/).map(value => value.trim()).filter(Boolean)
          const buttons = values.map(value => {
            const [label, id] = value.split('|').map(part => part.trim())
            return { text: label, id }
          })
          if (!messageText || buttons.length < 1 || buttons.length > 3 ||
              buttons.some(button => !button.text || !/^[a-zA-Z0-9_.#-]{1,64}$/.test(button.id)) ||
              new Set(buttons.map(button => button.id.toLowerCase())).size !== buttons.length) {
            throw new Error('Interactive buttons need text and 1 to 3 unique Label|id entries.')
          }
          if (dryRun) {
            trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would send interactive buttons.' })
          } else {
            const sent = await sendWhatsAppMessage(event.remoteJid, { text: messageText, buttons })
            if (!sent?.key?.id) throw new Error('WhatsApp did not return an interactive message.')
            outputs.set(node.id, { sent })
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'WhatsApp accepted the interactive message.' })
          }
        } else if (node.type === 'media.forwardOriginal') {
          if (!event.message?.key?.id || !event.message?.message) throw new Error('There is no original message to forward.')
          if (isViewOnceMessage(event.message)) throw new Error('View Once content cannot be forwarded by a workflow. Open it in the conversation viewer using its normal one-time flow.')
          if (dryRun) {
            trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would forward the original message and its supported media.' })
          } else {
            const sent = await sendWhatsAppMessage(event.remoteJid, { forward: event.message })
            if (!sent?.key?.id) throw new Error('WhatsApp did not return the forwarded message.')
            outputs.set(node.id, { sent })
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'WhatsApp accepted the forwarded message.' })
          }
        } else if (node.type === 'message.sendPoll') {
          const title = textValue(node.config.title, 180).trim()
          const values = textValue(node.config.options, 1000).split(/\r?\n/).map(value => value.trim()).filter(Boolean)
          const selectableCount = Number(node.config.selectableCount == null ? 1 : node.config.selectableCount)
          if (!title || values.length < 2 || values.length > 12 || new Set(values.map(value => value.toLowerCase())).size !== values.length) {
            throw new Error('A poll needs a question and 2 to 12 unique options.')
          }
          if (!Number.isInteger(selectableCount) || selectableCount < 1 || selectableCount > values.length) {
            throw new Error('The poll selectable count is invalid.')
          }
          if (dryRun) {
            trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would send poll: ' + title })
            outputs.set(node.id, { sent: { simulated: true, title, values } })
          } else {
            const sent = await sendWhatsAppMessage(event.remoteJid, {
              poll: { name: title, values, selectableCount },
            })
            if (!sent?.key?.id) throw new Error('WhatsApp did not return a poll message.')
            outputs.set(node.id, { sent })
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'WhatsApp accepted the poll.' })
          }
        } else if (node.type === 'group.getInfo') {
          if (!isGroupJid(event.remoteJid)) throw new Error('Group information requires a group command trigger.')
          const metadata = dryRun
            ? { subject: 'Preview group', participants: [{ id: 'one' }, { id: 'two' }] }
            : await event.socket.groupMetadata(event.remoteJid)
          const participantCount = Array.isArray(metadata?.participants) ? metadata.participants.length : Number(metadata?.size || 0)
          outputs.set(node.id, { subject: textValue(metadata?.subject, 100), participantCount })
          trace.push({ nodeId: node.id, type: node.type, status: dryRun ? 'simulated' : 'success', message: dryRun ? 'Would read group information.' : 'Loaded group information.' })
        } else if (node.type === 'group.updateSubject') {
          if (!isGroupJid(event.remoteJid)) throw new Error('Changing a group name requires a group chat.')
          const subject = textValue(node.config.subject, 100).trim()
          if (dryRun) trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would change group name to: ' + subject })
          else {
            await event.socket.groupUpdateSubject(event.remoteJid, subject)
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'WhatsApp accepted the new group name.' })
          }
        } else if (node.type === 'group.updateDescription') {
          if (!isGroupJid(event.remoteJid)) throw new Error('Changing a group description requires a group chat.')
          const description = textValue(node.config.description, 512).trim()
          if (dryRun) trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would change the group description.' })
          else {
            await event.socket.groupUpdateDescription(event.remoteJid, description)
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'WhatsApp accepted the new group description.' })
          }
        } else if (node.type === 'group.participantsUpdate') {
          if (!isGroupJid(event.remoteJid)) throw new Error('Participant management requires a group chat.')
          const action = textValue(node.config.action, 16)
          const phones = textValue(node.config.participants, 1000).split(/[\n,]+/).map(value => value.replace(/[\s()-]/g, '').replace(/^\+/, '')).filter(Boolean)
          const participants = phones.map(phone => phone + '@s.whatsapp.net')
          if (dryRun) {
            trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would ' + action + ' ' + participants.length + ' participant(s).' })
          } else {
            const results = await event.socket.groupParticipantsUpdate(event.remoteJid, participants, action)
            const rejected = Array.isArray(results) ? results.filter(item => String(item?.status || '') !== '200') : []
            if (rejected.length || !Array.isArray(results) || results.length !== participants.length) {
              throw new Error('WhatsApp did not confirm every participant action: ' + JSON.stringify(rejected.map(item => ({ jid: item.jid, status: item.status })).slice(0, 10)))
            }
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'WhatsApp confirmed ' + results.length + ' participant update(s).' })
          }
        } else if (node.type === 'group.settingUpdate') {
          if (!isGroupJid(event.remoteJid)) throw new Error('Changing group settings requires a group chat.')
          const setting = textValue(node.config.setting, 24)
          if (dryRun) trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would set group option: ' + setting })
          else {
            await event.socket.groupSettingUpdate(event.remoteJid, setting)
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'WhatsApp accepted the group setting.' })
          }
        } else if (node.type === 'moderation.blockContact' || node.type === 'moderation.unblockContact') {
          const phone = textValue(node.config.phone, 20).replace(/[\s()-]/g, '').replace(/^\+/, '')
          if (!/^[0-9]{7,15}$/.test(phone)) throw new Error('The contact phone number is invalid.')
          const action = node.type === 'moderation.blockContact' ? 'block' : 'unblock'
          if (dryRun) trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would ' + action + ' the contact.' })
          else {
            await event.socket.updateBlockStatus(phone + '@s.whatsapp.net', action)
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: action === 'block' ? 'Contact blocked.' : 'Contact unblocked.' })
          }
        } else if (node.type === 'profile.updateName') {
          const name = textValue(node.config.name, 80).trim()
          if (dryRun) trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would update the profile name.' })
          else {
            await event.socket.updateProfileName(name)
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'WhatsApp accepted the profile name.' })
          }
        } else if (node.type === 'profile.updateStatus') {
          const status = textValue(node.config.status, 139).trim()
          if (dryRun) trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would update the profile status.' })
          else {
            await event.socket.updateProfileStatus(status)
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'WhatsApp accepted the profile status.' })
          }
        } else if (node.type === 'newsletter.create') {
          const name = textValue(node.config.name, 100).trim()
          const description = textValue(node.config.description, 512).trim()
          if (dryRun) {
            outputs.set(node.id, { newsletterJid: '12345678901@newsletter' })
            trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would create the newsletter.' })
          } else {
            const created = await event.socket.newsletterCreate(name, description)
            const newsletterJid = textValue(created?.id, 80)
            if (!/^\d{5,25}@newsletter$/.test(newsletterJid)) throw new Error('WhatsApp did not return a valid newsletter ID.')
            outputs.set(node.id, { newsletterJid })
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'Newsletter created: ' + newsletterJid })
          }
        } else if (node.type === 'newsletter.follow' || node.type === 'newsletter.unfollow') {
          const newsletterJid = textValue(node.config.newsletterJid, 80)
          if (!/^\d{5,25}@newsletter$/.test(newsletterJid)) throw new Error('The newsletter ID is invalid.')
          if (dryRun) trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: node.type === 'newsletter.follow' ? 'Would follow the newsletter.' : 'Would unfollow the newsletter.' })
          else {
            await (node.type === 'newsletter.follow'
              ? event.socket.newsletterFollow(newsletterJid)
              : event.socket.newsletterUnfollow(newsletterJid))
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: node.type === 'newsletter.follow' ? 'Newsletter followed.' : 'Newsletter unfollowed.' })
          }
        } else if (node.type === 'newsletter.publishText') {
          const newsletterJid = textValue(node.config.newsletterJid, 80)
          const text = textValue(node.config.text, 2000).trim()
          if (!/^\d{5,25}@newsletter$/.test(newsletterJid) || !text) throw new Error('Newsletter ID or post text is invalid.')
          if (dryRun) trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would publish text to the newsletter.' })
          else {
            const sent = await sendWhatsAppMessage(newsletterJid, { text })
            if (!sent?.key?.id) throw new Error('WhatsApp did not return the newsletter post.')
            outputs.set(node.id, { sent })
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'WhatsApp accepted the newsletter post.' })
          }
        } else if (node.type === 'condition.isViewOnce') {
          const matched = isViewOnceMessage(event.message)
          next = firstEdge(node, matched ? 'yes' : 'no')
          trace.push({ nodeId: node.id, type: node.type, status: 'success', message: matched
            ? 'YES branch selected: triggering message is View Once.'
            : 'NO branch selected: triggering message is not View Once.' })
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
        } else if (node.type === 'condition.isGroupAdmin') {
          if (workflow.account !== 'public' || !isGroupJid(event.remoteJid)) throw new Error('Group admin checks require an enabled Public group trigger.')
          const metadata = dryRun
            ? (event.groupMetadata || { participants: [{ id: event.senderJid, admin: event.isPublicOwner ? 'admin' : null }] })
            : await event.socket.groupMetadata(event.remoteJid)
          const senderJid = textValue(event.senderJid || event.sender, 100)
          const participant = (Array.isArray(metadata?.participants) ? metadata.participants : []).find(item =>
            textValue(item?.id, 100) === senderJid ||
            textValue(item?.phoneNumber, 100) === senderJid
          )
          const isAdmin = Boolean(participant && (
            participant.admin === 'admin' || participant.admin === 'superadmin' ||
            participant.isAdmin === true || participant.isSuperAdmin === true
          ))
          next = firstEdge(node, isAdmin ? 'yes' : 'no')
          trace.push({ nodeId: node.id, type: node.type, status: dryRun ? 'simulated' : 'success', message: isAdmin ? 'YES branch selected: participant is a group admin.' : 'NO branch selected: participant is not a group admin.' })
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
        } else if (node.type === 'media.sendMedia' || node.type === 'media.sendViewOnce') {
          const raw = readInput(workflow, node, 'media', 'media', state)
          const kind = textValue(node.config.kind, 16) || 'image'
          const isViewOnce = node.type === 'media.sendViewOnce'
          const allowedKinds = isViewOnce ? ['image', 'video', 'audio'] : ['image', 'video', 'audio', 'document', 'sticker']
          if (!allowedKinds.includes(kind)) throw new Error('Unsupported media type: ' + kind)
          if (!raw || typeof raw !== 'object' || typeof raw.base64 !== 'string' ||
              !/^[A-Za-z0-9+/]+={0,2}$/.test(raw.base64) || raw.base64.length > 700000) {
            throw new Error('Engine media must contain bounded base64 data and a MIME type.')
          }
          const mimeType = textValue(raw.mimeType, 100).toLowerCase()
          const expected = {
            image: /^image\/(?:jpeg|png|webp|gif)$/,
            video: /^video\/mp4$/,
            audio: /^audio\/(?:mpeg|mp4|ogg|opus|aac|webm)$/,
            document: /^(?:application\/(?:pdf|zip|vnd\.openxmlformats-officedocument\.[a-z.]+)|text\/(?:plain|csv))$/,
            sticker: /^image\/webp$/,
          }
          if (!expected[kind].test(mimeType)) throw new Error('Media MIME type does not match the selected ' + kind + ' type.')
          const bytes = Buffer.from(raw.base64, 'base64')
          if (!bytes.length || bytes.length > 512 * 1024 || bytes.toString('base64').replace(/=+$/, '') !== raw.base64.replace(/=+$/, '')) {
            throw new Error('Media is empty, malformed or exceeds the 512 KiB Builder send limit.')
          }
          const caption = textValue(node.config.caption, 1000)
          const fileName = textValue(raw.fileName || node.config.fileName || 'attachment', 120).replace(/[\\/\r\n]/g, '_')
          const body = kind === 'image' ? { image: bytes, caption }
            : kind === 'video' ? { video: bytes, mimetype: mimeType, caption }
              : kind === 'audio' ? { audio: bytes, mimetype: mimeType, ptt: node.config.voiceNote === 'true' }
                : kind === 'sticker' ? { sticker: bytes }
                  : { document: bytes, mimetype: mimeType, fileName, caption }
          if (isViewOnce) body.viewOnceV2 = true
          if (dryRun) {
            trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: isViewOnce
              ? 'Would send ' + kind + ' using the View Once V2 wrapper.'
              : 'Would send ' + kind + ' media.' })
            outputs.set(node.id, { sent: { simulated: true, kind, viewOnce: isViewOnce } })
          } else {
            const sent = await sendWhatsAppMessage(event.remoteJid, body)
            if (!sent?.key?.id) throw new Error('WhatsApp did not confirm the media message.')
            outputs.set(node.id, { sent })
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: isViewOnce
              ? 'WhatsApp accepted the View Once media message.'
              : 'WhatsApp accepted the media message.' })
          }
        } else if (node.type === 'media.sendImage' || node.type === 'media.sendImages') {
          const key = node.type === 'media.sendImage' ? 'image' : 'images'
          const raw = readInput(workflow, node, key, key, state)
          const items = node.type === 'media.sendImage' ? [raw] : raw
          if (!Array.isArray(items) || !items.length) throw new Error('The Engine did not provide any images.')
          const limit = node.type === 'media.sendImage' ? 1 : Number(node.config.limit == null ? 10 : node.config.limit)
          if (!Number.isInteger(limit) || limit < 1 || limit > SYSTEM_MAX_MESSAGES_PER_RUN) throw new Error('Image/message limit must be between 1 and ' + SYSTEM_MAX_MESSAGES_PER_RUN + '.')
          const remaining = Math.max(0, perRunMessageLimit - sentMessageCount)
          const selected = items.slice(0, Math.min(limit, remaining))
          if (!selected.length) throw new Error('This command has reached its per-run WhatsApp message limit.')
          const images = selected.map(item => {
            if (!item || typeof item !== 'object' ||
                !/^image\/(?:jpeg|png|webp|gif)$/.test(String(item.mimeType || '')) ||
                typeof item.base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.base64) ||
                item.base64.length > 700000) {
              throw new Error('Engine image must contain a supported mimeType and bounded base64 data.')
            }
            const data = Buffer.from(item.base64, 'base64')
            if (!data.length || data.length > 512 * 1024) throw new Error('Engine image exceeds the 512 KiB send limit.')
            return data
          })
          if (dryRun) {
            trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would send ' + images.length + ' image(s).' })
          } else {
            if (typeof event.socket?.sendMessage !== 'function') throw new Error('WhatsApp media sending is unavailable.')
            const sent = []
            for (const image of images) {
              const response = await sendWhatsAppMessage(event.remoteJid, { image, caption: textValue(node.config.caption, 1000) })
              if (!response?.key?.id) throw new Error('WhatsApp did not confirm an image message.')
              sent.push(response)
            }
            outputs.set(node.id, node.type === 'media.sendImage' ? { sent: sent[0] } : { sent })
            trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'WhatsApp accepted ' + sent.length + ' image message(s).' })
          }
        } else if (node.type.startsWith('engine.')) {
          const manifest = engineDefinitions.get(node.type)
          if (!manifest) throw new Error('Engine definition is not registered.')
          if (dryRun) {
            trace.push({ nodeId: node.id, type: node.type, status: 'simulated', message: 'Would execute Engine ' + manifest.name + '.' })
          } else {
            if (typeof options.runEngine !== 'function') throw new Error('The custom Engine runtime is unavailable.')
            const values = {}
            for (const port of manifest.inputs) {
              const value = readInput(workflow, node, port.id, port.id, state)
              if (value == null && !port.required) continue
              if (port.type === 'number') values[port.id] = Number(value)
              else if (port.type === 'boolean') values[port.id] = value === true || value === 'true'
              else if (port.type === 'json') values[port.id] = typeof value === 'string' ? JSON.parse(value) : value
              else if (port.type === 'list') values[port.id] = Array.isArray(value) ? value : String(value ?? '').split(/[,\n]+/).filter(Boolean)
              else values[port.id] = String(value ?? '')
            }
            // Scheduled and live runs go through the same invocation path; the source is derived from
            // trusted run state, never from workflow data.
            const result = await options.runEngine(manifest.id, values, {
              signal: options.signal,
              revision: node.config.engineRevision,
              source: event?.scheduledExecution === true ? 'scheduler' : 'workflow',
              account: event?.sessionId,
              correlationId: options.runId ? String(options.runId + ':' + node.id).replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 120) : undefined,
            })
            outputs.set(node.id, result.outputs || result)
            trace.push({
              nodeId: node.id, type: node.type, status: 'success',
              message: 'Engine ' + manifest.name + ' completed in ' + Number(result.durationMs || 0) + ' ms.' +
                (result.engineRevision ? ' Revision ' + result.engineRevision + (result.pinned === false ? ' (latest, not pinned).' : '.') : '') +
                (result.sourceSha256 ? ' Source ' + String(result.sourceSha256).slice(0, 12) + '.' : ''),
            })
          }
          next = firstEdge(node, 'next')
        } else if (node.type.startsWith('custom.')) {
          const definition = customDefinitions.get(node.type)
          if (!definition) throw new Error('Custom node definition is not registered.')
          const values = {}
          for (const port of definition.inputs) {
            const raw = readInput(workflow, node, port.id, port.id, state)
            values[port.id] = port.type === 'number' ? Number(raw)
              : port.type === 'boolean' ? (raw === true || raw === 'true')
              : port.type === 'list' ? (Array.isArray(raw) ? raw : String(raw).split(','))
              : String(raw ?? '')
          }
          const result = runCustomNode(definition, values, node.config)
          outputs.set(node.id, result)
          trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'Custom node evaluated: ' + definition.operator })
        } else if (node.type === 'flow.delay') {
          const ms = Number(node.config.milliseconds == null ? 1000 : node.config.milliseconds)
          if (!Number.isInteger(ms) || ms < 0 || ms > MAX_DELAY_MS) throw new Error('Wait duration is invalid.')
          if (!dryRun && ms) await abortableSleep(ms, options.signal)
          trace.push({ nodeId: node.id, type: node.type, status: dryRun ? 'simulated' : 'success', message: 'Waited ' + ms + ' ms.' })
        } else if (node.type === 'flow.repeat') {
          const count = Number(node.config.count == null ? 2 : node.config.count)
          const body = firstEdge(node, 'body')
          if (!body) throw new Error('Repeat body is not connected.')
          for (let index = 0; index < count && !terminated; index += 1) {
            trace.push({ nodeId: node.id, type: node.type, status: 'running', message: 'Repeat ' + (index + 1) + ' of ' + count + '.' })
            const bodyResult = await chain(body, true, depth + 1)
            if (bodyResult?.error) return bodyResult
          }
          trace.push({ nodeId: node.id, type: node.type, status: 'success', message: 'Repeated ' + count + ' time(s).' })
        } else {
          throw new Error('This node cannot execute in the current position.')
        }
      } catch (error) {
        trace.push({ nodeId: node.id, type: node.type, status: 'error', message: textValue(error?.message || error, 240), ...(error?.outcome ? { outcome: String(error.outcome) } : {}) })
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

function cancelledError() {
  const error = new Error('The run was cancelled.')
  error.cancelled = true
  return error
}
function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelledError())
    const timer = setTimeout(() => { signal?.removeEventListener?.('abort', onAbort); resolve() }, ms)
    const onAbort = () => { clearTimeout(timer); reject(cancelledError()) }
    signal?.addEventListener?.('abort', onAbort, { once: true })
  })
}

/**
 * Runs a workflow and reports an explicit run state. A run is never reported as
 * succeeded unless the executor finished without error; cancelled runs are distinct from failures.
 * options.onStatus({ runId, status }) receives queued -> running -> succeeded|failed|cancelled.
 * options.signal (AbortSignal) cancels between nodes and during Wait nodes.
 */
export async function executeVisualWorkflow(input, options = {}) {
  const runId = randomUUID()
  const startedAt = new Date().toISOString()
  const normalized = normalizeWorkflow(input)
  const meta = { runId, workflowId: normalized.id, workflowRevision: normalized.revision, startedAt }
  const emit = status => { try { options.onStatus?.({ runId, status, workflowId: meta.workflowId, workflowRevision: meta.workflowRevision }) } catch { /* observer errors must not affect the run */ } }
  emit('queued')
  if (options.signal?.aborted) {
    emit('cancelled')
    return { ok: false, dryRun: options.dryRun === true, trace: [], error: 'The run was cancelled.', status: 'cancelled', cancelled: true, ...meta, finishedAt: new Date().toISOString() }
  }
  emit('running')
  let result
  try {
    result = await executeWorkflowCore(input, { ...options, runId })
  } catch (error) {
    if (error?.cancelled) {
      emit('cancelled')
      return { ok: false, dryRun: options.dryRun === true, trace: [], error: 'The run was cancelled.', status: 'cancelled', cancelled: true, ...meta, finishedAt: new Date().toISOString() }
    }
    emit('failed')
    throw error
  }
  const cancelled = result.cancelled === true || options.signal?.aborted === true && !result.ok
  const status = cancelled ? 'cancelled' : result.ok ? 'succeeded' : 'failed'
  emit(status)
  return { ...result, status, cancelled, ...meta, finishedAt: new Date().toISOString() }
}

/** Runs one exact saved revision. An unsaved graph or unknown revision is refused, never guessed. */
export async function executeWorkflowRevision(workflowId, revision, options = {}) {
  const store = options.store
  const snapshot = typeof store?.getRevision === 'function' ? store.getRevision(workflowId, revision) : null
  if (!snapshot) {
    return { ok: false, dryRun: options.dryRun === true, trace: [], status: 'failed', workflowId, workflowRevision: revision,
      error: 'That saved workflow revision was not found. Save the workflow first; an unsaved graph cannot be run.' }
  }
  return executeVisualWorkflow(snapshot, options)
}

/** Portable export: no IDs of the store, no enabled flag, no timestamps. */
export function exportWorkflow(input) {
  const workflow = normalizeWorkflow(input)
  return {
    format: WORKFLOW_EXPORT_FORMAT,
    formatVersion: 1,
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    workflow: { name: workflow.name, account: workflow.account, nodes: workflow.nodes, edges: workflow.edges },
  }
}

/**
 * Safe import: size-limited, schema-checked, always lands as a DISABLED draft with a fresh ID and
 * revision. Nothing is activated or executed by importing; validation findings are returned.
 */
export function importWorkflow(payload, options = {}) {
  let parsed = payload
  if (typeof payload === 'string') {
    if (Buffer.byteLength(payload, 'utf8') > MAX_IMPORT_BYTES) throw new Error('The workflow file is too large to import.')
    try { parsed = JSON.parse(payload) } catch { throw new Error('The workflow file is not valid JSON.') }
  } else if (payload && typeof payload === 'object') {
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_IMPORT_BYTES) throw new Error('The workflow file is too large to import.')
  }
  if (!parsed || typeof parsed !== 'object' || parsed.format !== WORKFLOW_EXPORT_FORMAT) throw new Error('This is not an Aharane workflow export.')
  if (parsed.formatVersion !== 1) throw new Error('This workflow export format version is not supported.')
  assertSupportedWorkflowSchema(parsed)
  const source = parsed.workflow
  if (!source || typeof source !== 'object') throw new Error('The workflow export contains no workflow.')
  if (Array.isArray(source.nodes) && source.nodes.length > MAX_NODES) throw new Error('The imported workflow exceeds the 100-node limit.')
  if (Array.isArray(source.edges) && source.edges.length > MAX_EDGES) throw new Error('The imported workflow exceeds the 300-connection limit.')
  const account = options.account === 'private' || options.account === 'public' ? options.account : source.account
  const workflow = normalizeWorkflow({ name: source.name, account, nodes: source.nodes, edges: source.edges, enabled: false })
  return { workflow, validation: validateWorkflow(workflow) }
}

export function createVisualCommandStore(filePath) {
  let data = { version: 1, workflows: [], counters: {}, customNodes: [], revisions: {}, executions: {} }
  let tail = Promise.resolve()
  let storageError = ''

  function ensureHealthy() {
    if (storageError) throw new Error(storageError)
  }

  async function persist() {
    await mkdir(dirname(filePath), { recursive: true, mode: 0o700 })
    const temporary = filePath + '.' + process.pid + '.' + randomUUID() + '.tmp'
    await writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600 })
    await rename(temporary, filePath)
  }
  function mutate(work) {
    const operation = tail.then(async () => {
      ensureHealthy()
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
        if (loaded?.version === 1 && Array.isArray(loaded.workflows) && loaded.counters && typeof loaded.counters === 'object' && !Array.isArray(loaded.counters)) {
          data = { version: 1, workflows: loaded.workflows.map(normalizeWorkflow), counters: loaded.counters, customNodes: Array.isArray(loaded.customNodes) ? loaded.customNodes.map(registerCustomNode) : [],
            revisions: loaded.revisions && typeof loaded.revisions === 'object' && !Array.isArray(loaded.revisions) ? loaded.revisions : {},
            executions: loaded.executions && typeof loaded.executions === 'object' && !Array.isArray(loaded.executions) ? loaded.executions : {} }
          // Workflows saved before revision history existed become referenceable at their current revision.
          for (const workflow of data.workflows) {
            const history = Array.isArray(data.revisions[workflow.id]) ? data.revisions[workflow.id] : []
            if (!history.some(entry => entry?.revision === workflow.revision)) {
              history.push({ revision: workflow.revision, savedAt: workflow.updatedAt, workflow: structuredClone(workflow) })
            }
            data.revisions[workflow.id] = history
          }
        } else if (loaded != null) {
          storageError = 'Visual command storage has an unsupported or invalid format. Saved data was preserved; repair the file before editing workflows.'
        }
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          storageError = 'Visual command storage could not be read. Saved data was preserved; repair the file before editing workflows.'
        }
      }
      return this.list()
    },
    storageWarning() { return storageError },
    listCustomNodes() { return structuredClone(data.customNodes) },
    saveCustomNode(input) {
      return mutate(async () => {
        const item = validateCustomNodeDefinition(input)
        const index = data.customNodes.findIndex(value => value.id === item.id)
        const previous = index >= 0 ? data.customNodes[index] : null
        if (previous && data.workflows.some(workflow => workflow.nodes.some(node => node.type === item.type))) {
          throw new Error('Custom node is used by a workflow. Duplicate it under a new ID to preserve existing workflow behavior.')
        }
        if (previous && item.version <= previous.version) throw new Error('Increase the custom node version when updating.')
        if (index < 0 && data.customNodes.length >= 100) throw new Error('The custom-node library limit is 100.')
        registerCustomNode(item)
        if (index >= 0) data.customNodes[index] = item
        else data.customNodes.push(item)
        return structuredClone(item)
      })
    },
    removeCustomNode(id) {
      return mutate(async () => {
        const type = 'custom.' + String(id)
        if (data.workflows.some(workflow => workflow.nodes.some(node => node.type === type))) {
          throw new Error('Cannot remove a custom node used by a saved workflow.')
        }
        const before = data.customNodes.length
        data.customNodes = data.customNodes.filter(node => node.type !== type)
        if (data.customNodes.length !== before) unregisterCustomNode(type)
        return data.customNodes.length !== before
      })
    },
    list(account) { return data.workflows.filter(item => !account || item.account === account).map(item => structuredClone(item)) },
    get(id) { const item = data.workflows.find(workflow => workflow.id === id); return item ? structuredClone(item) : null },
    async save(input, options = {}) {
      assertSupportedWorkflowSchema(input)
      if (Array.isArray(input?.nodes) && input.nodes.length > MAX_NODES) throw new Error('The workflow exceeds the 100-node limit; no nodes were saved.')
      if (Array.isArray(input?.edges) && input.edges.length > MAX_EDGES) throw new Error('The workflow exceeds the 300-connection limit; no connections were saved.')
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
        const trigger = workflow.nodes.find(node => node.type === 'trigger.command')
        const commandNames = new Set(trigger
          ? [trigger.config.command, ...(Array.isArray(trigger.config.aliases) ? trigger.config.aliases : [])].map(value => textValue(value, 64).trim().toLowerCase()).filter(Boolean)
          : [])
        const conflict = data.workflows.some(item => {
          if (item.id === workflow.id || item.account !== workflow.account || !item.enabled || !workflow.enabled) return false
          const other = item.nodes.find(node => node.type === 'trigger.command')
          if (!other) return false
          return [other.config.command, ...(Array.isArray(other.config.aliases) ? other.config.aliases : [])]
            .some(value => commandNames.has(textValue(value, 64).trim().toLowerCase()))
        })
        if (conflict) throw new Error('An enabled workflow already uses this command name or alias.')
        const expected = options?.expectedRevision
        if (expected != null && index >= 0 && Number(expected) !== data.workflows[index].revision) {
          const error = new Error('This workflow was changed by someone else (saved revision ' + data.workflows[index].revision + ', yours ' + expected + '). Reload it before saving so no work is overwritten.')
          error.conflict = true
          error.currentRevision = data.workflows[index].revision
          throw error
        }
        workflow.revision = index >= 0 ? data.workflows[index].revision + 1 : 1
        if (index >= 0) workflow.createdAt = data.workflows[index].createdAt
        if (index >= 0) data.workflows[index] = workflow
        else {
          if (data.workflows.length >= 100) throw new Error('The 100-workflow limit has been reached.')
          data.workflows.push(workflow)
        }
        // Append an immutable snapshot of exactly what was saved.
        const history = Array.isArray(data.revisions[workflow.id]) ? data.revisions[workflow.id] : []
        history.push({ revision: workflow.revision, savedAt: workflow.updatedAt, workflow: structuredClone(workflow) })
        data.revisions[workflow.id] = history.slice(-MAX_REVISIONS_PER_WORKFLOW)
        return { workflow: structuredClone(workflow), validation }
      })
    },
    remove(id) {
      return mutate(async () => {
        const before = data.workflows.length
        data.workflows = data.workflows.filter(item => item.id !== id)
        delete data.counters[id]
        delete data.revisions[id]
        return data.workflows.length !== before
      })
    },
    listRevisions(id) {
      return (data.revisions[id] || []).map(entry => ({
        revision: entry.revision, savedAt: entry.savedAt, name: entry.workflow?.name, enabled: entry.workflow?.enabled === true,
        nodeCount: entry.workflow?.nodes?.length || 0, edgeCount: entry.workflow?.edges?.length || 0,
      }))
    },
    getRevision(id, revision) {
      const entry = (data.revisions[id] || []).find(item => item.revision === Number(revision))
      return entry ? structuredClone(entry.workflow) : null
    },
    /** Returns true the first time a key is claimed within the TTL, false for a duplicate. Persisted. */
    claimExecution(key) {
      return mutate(async () => {
        const nowMs = Date.now()
        for (const [existing, at] of Object.entries(data.executions)) if (nowMs - Number(at) > EXECUTION_CLAIM_TTL_MS) delete data.executions[existing]
        if (Object.hasOwn(data.executions, key)) return false
        data.executions[key] = nowMs
        const keys = Object.keys(data.executions)
        if (keys.length > MAX_EXECUTION_CLAIMS) for (const old of keys.slice(0, keys.length - MAX_EXECUTION_CLAIMS)) delete data.executions[old]
        return true
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
      if (account !== 'public') return []
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
