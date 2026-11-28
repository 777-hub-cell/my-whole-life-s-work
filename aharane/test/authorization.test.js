import test from 'node:test'
import assert from 'node:assert/strict'
import { isPrivateSelfChat, isPrivateSelfCommand, isPublicOwnerSender } from '../src/authorization.js'

const registry = { scope: 'private', commands: new Map([['status', {}]]) }
const self = '2348012345678@s.whatsapp.net'
const selfLid = '123456789012345@lid'

function message(fromMe = true, remoteJid = self, remoteJidAlt = '') {
  return {
    key: {
      id: 'message-1',
      fromMe,
      remoteJid,
      ...(remoteJidAlt ? { remoteJidAlt } : {}),
    },
    message: { conversation: '.status' },
  }
}

test('private control accepts only a registered command in the private account phone-number self-chat', () => {
  const args = {
    sessionId: 'private',
    message: message(true),
    remoteJid: self,
    ownJid: self,
    privateOwnerNumber: '2348012345678',
    text: '.status',
    privateRegistry: registry,
  }
  assert.equal(isPrivateSelfCommand(args), true)
  assert.equal(isPrivateSelfCommand({ ...args, sessionId: 'public' }), false)
  assert.equal(isPrivateSelfCommand({ ...args, message: message(false) }), false)
  assert.equal(isPrivateSelfCommand({ ...args, remoteJid: '2348099999999@s.whatsapp.net' }), false)
  assert.equal(isPrivateSelfCommand({ ...args, privateOwnerNumber: '2348099999999' }), false)
  assert.equal(isPrivateSelfCommand({ ...args, text: '.unknown' }), false)
  assert.equal(isPrivateSelfCommand({ ...args, remoteJid: 'opaque@lid', ownJid: 'opaque@lid' }), false)
  assert.equal(isPrivateSelfCommand({ ...args, remoteJid: '120363000000000000@g.us' }), false)
})

test('private control accepts the linked account own LID paired with its configured phone number', () => {
  const args = {
    sessionId: 'private',
    message: message(true, selfLid, self),
    remoteJid: selfLid,
    remoteJidAlt: self,
    ownJid: self,
    ownLid: selfLid,
    privateOwnerNumber: '2348012345678',
    text: '.status',
    privateRegistry: registry,
  }
  assert.equal(isPrivateSelfChat(args), true)
  assert.equal(isPrivateSelfCommand(args), true)
})

test('private LID self-chat can use Baileys alternate phone identity when own LID is not present', () => {
  assert.equal(isPrivateSelfChat({
    sessionId: 'private',
    remoteJid: selfLid,
    remoteJidAlt: self,
    ownJid: self,
    privateOwnerNumber: '2348012345678',
  }), true)
})

test('private LID authorization rejects a different LID or a contradictory alternate phone number', () => {
  const args = {
    sessionId: 'private',
    remoteJid: selfLid,
    remoteJidAlt: self,
    ownJid: self,
    ownLid: selfLid,
    privateOwnerNumber: '2348012345678',
  }
  assert.equal(isPrivateSelfChat({ ...args, remoteJid: '998877665544332@lid' }), false)
  assert.equal(isPrivateSelfChat({ ...args, remoteJidAlt: '2348099999999@s.whatsapp.net' }), false)
  assert.equal(isPrivateSelfChat({ ...args, ownLid: '998877665544332@lid' }), false)
  assert.equal(isPrivateSelfChat({ ...args, remoteJid: '120363000000000000@g.us' }), false)
})

test('Public Owner is distinct from Private Owner and is only recognised on the public session', () => {
  assert.equal(isPublicOwnerSender({
    sessionId: 'public', remoteJid: '14155550123@s.whatsapp.net', publicOwnerNumber: '14155550123',
  }), true)
  assert.equal(isPublicOwnerSender({
    sessionId: 'public', remoteJid: '2348012345678@s.whatsapp.net', publicOwnerNumber: '14155550123',
  }), false)
  assert.equal(isPublicOwnerSender({
    sessionId: 'private', remoteJid: '14155550123@s.whatsapp.net', publicOwnerNumber: '14155550123',
  }), false)
  assert.equal(isPublicOwnerSender({
    sessionId: 'public', remoteJid: 'opaque@lid', publicOwnerNumber: '14155550123',
  }), false)
})

test('the private Chats tab is restricted to the exact private self-chat only', () => {
  const args = {
    sessionId: 'private',
    remoteJid: self,
    ownJid: self,
    privateOwnerNumber: '2348012345678',
  }
  assert.equal(isPrivateSelfChat(args), true)
  assert.equal(isPrivateSelfChat({ ...args, sessionId: 'public' }), false)
  assert.equal(isPrivateSelfChat({ ...args, remoteJid: '2348099999999@s.whatsapp.net' }), false)
  assert.equal(isPrivateSelfChat({ ...args, remoteJid: '120363000000000000@g.us' }), false)
  assert.equal(isPrivateSelfChat({ ...args, remoteJid: 'opaque@lid' }), false)
  assert.equal(isPrivateSelfChat({ ...args, ownJid: '2348099999999@s.whatsapp.net' }), false)
  assert.equal(isPrivateSelfChat({ ...args, privateOwnerNumber: '2348099999999' }), false)
  assert.equal(isPrivateSelfChat({
    ...args, remoteJid: selfLid, remoteJidAlt: self, ownLid: selfLid,
  }), true)
})

test('private message visibility is broader than private command authorization', async () => {
  const policy = await import('../src/policy.js')
  assert.equal(policy.isPrivateVisibleChatJid('2348099999@s.whatsapp.net'), true)
  assert.equal(policy.isPrivateVisibleChatJid('120363000000000000-1234567890@g.us'), true)
  assert.equal(isPrivateSelfCommand({
    sessionId: 'private',
    message: message(false, '2348099999@s.whatsapp.net'),
    remoteJid: '2348099999@s.whatsapp.net',
    ownJid: self,
    privateOwnerNumber: '2348012345678',
    text: '.status',
    privateRegistry: registry,
  }), false)
  assert.equal(isPrivateSelfCommand({
    sessionId: 'private',
    message: message(false, selfLid, self),
    remoteJid: selfLid,
    remoteJidAlt: self,
    ownJid: self,
    ownLid: selfLid,
    privateOwnerNumber: '2348012345678',
    text: '.status',
    privateRegistry: registry,
  }), false)
})

// ---- Agent 04: canonical evaluator, adversarial matrix -------------------
import { evaluateAuthorization, AUTHORIZATION_POLICY_VERSION } from '../src/authorization.js'
import { isPrivateVisibleChatJid, isAllowedInbound } from '../src/policy.js'

const owners = { privateOwnerNumber: '2348012345678', publicOwnerNumber: '2348055555555' }
const privateScheduled = (over = {}) => evaluateAuthorization({
  source: 'scheduler', sessionId: 'private', privilege: 'private-control',
  ownerConfig: owners, ownJid: '2348012345678:7@s.whatsapp.net', ...over,
})

test('scheduled private control is re-evaluated against the current owner and session', () => {
  const ok = privateScheduled()
  assert.deepEqual(ok, { allow: true, reason: 'ok', policyVersion: AUTHORIZATION_POLICY_VERSION })
  // Owner changed after the schedule was created: stale approval is not trusted.
  assert.equal(privateScheduled({ ownerConfig: { ...owners, privateOwnerNumber: '2348099999999' } }).reason, 'session-owner-mismatch')
  // Owner cleared.
  assert.equal(privateScheduled({ ownerConfig: { ...owners, privateOwnerNumber: '' } }).reason, 'owner-not-configured')
  // Session identity unavailable or opaque.
  assert.equal(privateScheduled({ ownJid: '' }).allow, false)
  assert.equal(privateScheduled({ ownJid: '123456789012345@lid' }).allow, false)
  // Wrong account / unknown source / unknown privilege all deny.
  assert.equal(privateScheduled({ sessionId: 'public' }).reason, 'wrong-account')
  assert.equal(privateScheduled({ sessionId: 'other' }).reason, 'unknown-account')
  assert.equal(privateScheduled({ source: 'api' }).reason, 'untrusted-source')
  assert.equal(privateScheduled({ source: undefined }).reason, 'untrusted-source')
  assert.equal(privateScheduled({ privilege: 'root' }).reason, 'unknown-privilege')
})

test('scheduled public-owner privilege needs a configured Public Owner and the Public account', () => {
  const run = over => evaluateAuthorization({ source: 'scheduler', sessionId: 'public', privilege: 'public-owner', ownerConfig: owners, ...over })
  assert.equal(run().allow, true)
  assert.equal(run({ ownerConfig: { ...owners, publicOwnerNumber: '' } }).reason, 'owner-not-configured')
  assert.equal(run({ sessionId: 'private' }).reason, 'wrong-account')
  // Private Owner never inherits Public Owner privilege.
  assert.equal(run({ ownerConfig: { privateOwnerNumber: '2348012345678' } }).allow, false)
})

test('Public Owner may equal Private Owner, the bot number or another number without merging roles', () => {
  const same = { privateOwnerNumber: '2348012345678', publicOwnerNumber: '2348012345678' }
  assert.equal(evaluateAuthorization({ source: 'scheduler', sessionId: 'public', privilege: 'public-owner', ownerConfig: same }).allow, true)
  assert.equal(evaluateAuthorization({ source: 'scheduler', sessionId: 'private', privilege: 'private-control', ownerConfig: same, ownJid: self }).allow, true)
  // Same numbers, but the roles are still enforced per account.
  assert.equal(evaluateAuthorization({ source: 'scheduler', sessionId: 'private', privilege: 'public-owner', ownerConfig: same }).reason, 'wrong-account')
})

test('direct evaluation rejects spoofed, group, wrong-account and non-owner messages', () => {
  const base = { source: 'direct', sessionId: 'private', privilege: 'private-control', ownerConfig: owners, ownJid: self, remoteJid: self, message: message(true) }
  assert.equal(evaluateAuthorization({ ...base, ownerConfig: { privateOwnerNumber: '2348012345678' } }).allow, true)
  assert.equal(evaluateAuthorization({ ...base, message: message(false) }).reason, 'not-from-owner-session')
  assert.equal(evaluateAuthorization({ ...base, remoteJid: '120363000000000001@g.us', message: message(true, '120363000000000001@g.us') }).reason, 'not-private-self-chat')
  assert.equal(evaluateAuthorization({ ...base, remoteJid: '2348099999999@s.whatsapp.net', message: message(true, '2348099999999@s.whatsapp.net') }).reason, 'not-private-self-chat')
  assert.equal(evaluateAuthorization({ ...base, sessionId: 'public' }).reason, 'wrong-account')
  const pub = { source: 'direct', sessionId: 'public', privilege: 'public-owner', ownerConfig: owners }
  assert.equal(evaluateAuthorization({ ...pub, remoteJid: '2348055555555@s.whatsapp.net', senderJid: '2348055555555@s.whatsapp.net' }).allow, true)
  assert.equal(evaluateAuthorization({ ...pub, remoteJid: '2348077777777@s.whatsapp.net', senderJid: '2348077777777@s.whatsapp.net' }).reason, 'not-public-owner')
  // A group message cannot borrow the owner's identity from the group JID.
  assert.equal(evaluateAuthorization({ ...pub, remoteJid: '120363000000000001@g.us', senderJid: '120363000000000001@g.us' }).allow, false)
})

test('LID self-chat is accepted only with a matching own LID or owner alternate JID', () => {
  const args = { sessionId: 'private', remoteJid: selfLid, ownJid: self, ownLid: selfLid, privateOwnerNumber: '2348012345678' }
  assert.equal(isPrivateSelfChat(args), true)
  assert.equal(isPrivateSelfChat({ ...args, remoteJid: '999999999999999@lid' }), false)
  assert.equal(isPrivateSelfChat({ ...args, remoteJidAlt: '2348099999999@s.whatsapp.net' }), false)
  assert.equal(isPrivateSelfChat({ ...args, ownLid: '', remoteJidAlt: self }), true)
  assert.equal(isPrivateSelfChat({ ...args, ownLid: '' }), false)
})

test('current WhatsApp group ids are recognised without granting group command access', () => {
  const modern = '120363000000000001@g.us'
  const legacy = '2348012345678-1600000000@g.us'
  assert.equal(isPrivateVisibleChatJid(modern), true)
  assert.equal(isPrivateVisibleChatJid(legacy), true)
  assert.equal(isPrivateVisibleChatJid('abc@g.us'), false)
  const sender = { participantJid: '2348077777777@s.whatsapp.net', fromMe: false }
  assert.equal(isAllowedInbound({ remoteJid: modern, ...sender }), false)
  assert.equal(isAllowedInbound({ remoteJid: modern, ...sender, allowGroups: true }), true)
  assert.equal(isAllowedInbound({ remoteJid: modern, allowGroups: true, fromMe: false }), false)
})


// ---- Agent 04: public privileges, admin-preview source and the resolver ----
import { resolveExecutionAuthorization } from '../src/authorization.js'

const pubMsg = (remoteJid, fromMe = false, extra = {}) => ({ key: { id: 'p1', remoteJid, fromMe, ...extra }, message: { conversation: 'x' } })
const direct = (over = {}) => ({
  source: 'direct', sessionId: 'public', ownerConfig: owners,
  message: pubMsg('2348077777777@s.whatsapp.net'), remoteJid: '2348077777777@s.whatsapp.net',
  senderJid: '2348077777777@s.whatsapp.net', ...over,
})

test('public-command: direct non-self messages only; groups, broadcasts, self and wrong account deny', () => {
  const ev = over => evaluateAuthorization({ ...direct(over), privilege: 'public-command' })
  assert.equal(ev().allow, true)
  assert.equal(ev({ remoteJid: '123456789012345@lid', message: pubMsg('123456789012345@lid') }).allow, true)
  assert.equal(ev({ remoteJid: '120363000000000001@g.us', message: pubMsg('120363000000000001@g.us') }).reason, 'not-direct-chat')
  assert.equal(ev({ remoteJid: 'status@broadcast', message: pubMsg('status@broadcast') }).reason, 'not-direct-chat')
  assert.equal(ev({ message: pubMsg('2348077777777@s.whatsapp.net', true) }).reason, 'from-own-session')
  assert.equal(ev({ message: undefined }).reason, 'missing-message')
  assert.equal(ev({ sessionId: 'private' }).reason, 'wrong-account')
})

test('public-automation: groups need an eligible participant; self and wrong account deny', () => {
  const group = '120363000000000001@g.us'
  const ev = over => evaluateAuthorization({ ...direct({ remoteJid: group, message: pubMsg(group) }), privilege: 'public-automation', ...over })
  assert.equal(ev({ participantJid: '2348077777777@s.whatsapp.net' }).allow, true)
  assert.equal(ev({}).reason, 'sender-not-eligible')
  assert.equal(ev({ participantJid: 'junk' }).reason, 'sender-not-eligible')
  assert.equal(ev({ participantJid: '2348077777777@s.whatsapp.net', message: pubMsg(group, true) }).reason, 'from-own-session')
  assert.equal(ev({ participantJid: '2348077777777@s.whatsapp.net', sessionId: 'private' }).reason, 'wrong-account')
})

test('api is never trusted; admin-preview is trusted but still needs a configured owner', () => {
  assert.equal(evaluateAuthorization({ source: 'api', sessionId: 'public', privilege: 'public-owner', ownerConfig: owners }).reason, 'untrusted-source')
  const preview = (sessionId, privilege, ownerConfig = owners) => evaluateAuthorization({ source: 'admin-preview', sessionId, privilege, ownerConfig })
  assert.equal(preview('private', 'private-control').allow, true)
  assert.equal(preview('private', 'private-control', { ...owners, privateOwnerNumber: '' }).reason, 'owner-not-configured')
  assert.equal(preview('public', 'public-owner').allow, true)
  assert.equal(preview('public', 'public-owner', { privateOwnerNumber: '2348012345678' }).reason, 'owner-not-configured')
  assert.equal(preview('public', 'private-control').reason, 'wrong-account')
})

test('resolver: private session never receives public flags and public never receives private control', () => {
  const priv = resolveExecutionAuthorization({
    source: 'direct', sessionId: 'private', ownerConfig: owners, message: message(true), remoteJid: self, ownJid: self,
  })
  assert.equal(priv.privateControl, true)
  assert.equal(priv.isPublicOwner, false)
  assert.equal(priv.canRunPublicCommands, false)
  assert.equal(priv.allowedPublicSender, false)
  const pub = resolveExecutionAuthorization(direct({ remoteJid: '2348055555555@s.whatsapp.net', senderJid: '2348055555555@s.whatsapp.net', message: pubMsg('2348055555555@s.whatsapp.net') }))
  assert.equal(pub.privateControl, false)
  assert.equal(pub.isPublicOwner, true)
  assert.equal(pub.canRunPublicCommands, true)
  assert.equal(pub.allowedPublicSender, true)
})

test('resolver denies everything for missing, empty or unknown context', () => {
  for (const input of [undefined, {}, { source: 'direct' }, { sessionId: 'private' }, { source: 'direct', sessionId: 'x' }]) {
    const r = resolveExecutionAuthorization(input)
    assert.deepEqual([r.privateControl, r.isPublicOwner, r.canRunPublicCommands, r.allowedPublicSender], [false, false, false, false])
  }
})

test('owner arrangements: Public Owner equal to Private Owner, bot number or another number keep roles separate', () => {
  const botNumber = '447700900123'
  for (const publicOwnerNumber of ['2348012345678', botNumber, '14155550123']) {
    const cfg = { privateOwnerNumber: '2348012345678', publicOwnerNumber, publicBotNumber: botNumber }
    const asPublicOwner = resolveExecutionAuthorization(direct({
      ownerConfig: cfg, remoteJid: publicOwnerNumber + '@s.whatsapp.net', senderJid: publicOwnerNumber + '@s.whatsapp.net',
      message: pubMsg(publicOwnerNumber + '@s.whatsapp.net'),
    }))
    assert.equal(asPublicOwner.isPublicOwner, true, publicOwnerNumber)
    assert.equal(asPublicOwner.privateControl, false, 'public session never grants private control')
    // A non-owner sender on the same config is never owner.
    assert.equal(resolveExecutionAuthorization(direct({ ownerConfig: cfg })).isPublicOwner, false)
  }
})

test('scheduler re-evaluation: owner removed or session changed after scheduling denies private control', () => {
  const run = (ownerConfig, ownJid) => resolveExecutionAuthorization({ source: 'scheduler', sessionId: 'private', ownerConfig, ownJid })
  assert.equal(run(owners, '2348012345678:3@s.whatsapp.net').privateControl, true)
  assert.equal(run({ ...owners, privateOwnerNumber: '' }, self).decisions.privateControl.reason, 'owner-not-configured')
  assert.equal(run(owners, '2348099999999@s.whatsapp.net').decisions.privateControl.reason, 'session-owner-mismatch')
})
