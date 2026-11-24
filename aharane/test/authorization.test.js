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
