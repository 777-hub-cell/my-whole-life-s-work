import test from 'node:test'
import assert from 'node:assert/strict'
import { scheduledDestinationError } from '../src/schedule-destination.js'

const direct = '2348012345678@s.whatsapp.net'
const lid = '123456789012345@lid'
const modernGroup = '120363000000000001@g.us'
const legacyGroup = '2348012345678-1600000000@g.us'
const workflow = (account, config = {}, extra = {}) => ({
  enabled: true, account, nodes: [{ id: 't', type: 'trigger.command', config: { chatScope: 'direct', ...config } }], ...extra,
})
const owners = { privateOwnerNumber: '2348012345678', publicOwnerNumber: '2348055555555' }

// Regression: these checks once used double-escaped regexes (/^\\d.../) that match a literal
// backslash, so no real JID ever matched and every Public schedule was rejected.
test('Public schedules accept real direct, LID and group destinations according to chat scope', () => {
  assert.equal(scheduledDestinationError(workflow('public', { chatScope: 'direct' }), direct, owners), '')
  assert.equal(scheduledDestinationError(workflow('public', { chatScope: 'both' }), lid, owners), '')
  assert.equal(scheduledDestinationError(workflow('public', { chatScope: 'groups' }), modernGroup, owners), '')
  assert.equal(scheduledDestinationError(workflow('public', { chatScope: 'groups' }), legacyGroup, owners), '')
  assert.equal(scheduledDestinationError(workflow('public', { chatScope: 'both' }), modernGroup, owners), '')
})

test('Public schedules reject the wrong chat kind for the command scope, and malformed ids', () => {
  assert.match(scheduledDestinationError(workflow('public', { chatScope: 'direct' }), modernGroup, owners), /not configured to run in groups/)
  assert.match(scheduledDestinationError(workflow('public', { chatScope: 'groups' }), direct, owners), /valid WhatsApp direct-chat or permitted group/)
  for (const bad of ['', 'status@broadcast', 'abc@g.us', '12@g.us', '2348012345678@example.com', '\\d{7,15}@s.whatsapp.net']) {
    assert.match(scheduledDestinationError(workflow('public', { chatScope: 'both' }), bad, owners), /valid WhatsApp direct-chat or permitted group|not configured/, JSON.stringify(bad))
  }
})

test('Private schedules may only target the configured Private Owner self-chat', () => {
  assert.equal(scheduledDestinationError(workflow('private'), direct, owners), '')
  assert.equal(scheduledDestinationError(workflow('private'), direct, { privateOwnerNumber: '+234 801 234 5678' }), '')
  assert.match(scheduledDestinationError(workflow('private'), '2348099999999@s.whatsapp.net', owners), /only send to the configured Private Owner/)
  assert.match(scheduledDestinationError(workflow('private', { chatScope: 'both' }), modernGroup, owners), /only send to the configured Private Owner/)
  assert.match(scheduledDestinationError(workflow('private'), direct, {}), /Configure the Private Owner/)
})

test('workflows that cannot run unattended are rejected before any destination check', () => {
  assert.match(scheduledDestinationError(workflow('public', {}, { enabled: false }), direct, owners), /enabled saved command workflow/)
  assert.match(scheduledDestinationError({ enabled: true, account: 'public', nodes: [] }, direct, owners), /enabled saved command workflow/)
  assert.match(scheduledDestinationError(workflow('public', { requireQuoted: true }), direct, owners), /cannot require a quoted/)
  assert.match(scheduledDestinationError(workflow('public', { requireReply: 'true' }), direct, owners), /cannot require a quoted/)
  assert.match(scheduledDestinationError(workflow('other'), direct, owners), /account is invalid/)
})
