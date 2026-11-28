import test from 'node:test'
import assert from 'node:assert/strict'
import {
  commandResponse,
  isAllowedInbound,
  isPrivateVisibleChatJid,
  isSafeMessageUpsert,
  normalizePhone,
  senderNumberFromJid,
} from '../src/policy.js'

test('normalizes only international-length digit strings', () => {
  assert.equal(normalizePhone('+234 801-234-5678'), '2348012345678')
  assert.equal(normalizePhone('12345'), '')
  assert.equal(normalizePhone(''), '')
})

test('only phone JIDs resolve to phone numbers; LIDs remain opaque', () => {
  assert.equal(senderNumberFromJid('2348012345678@s.whatsapp.net'), '2348012345678')
  assert.equal(senderNumberFromJid('2348012345678:3@s.whatsapp.net'), '2348012345678')
  assert.equal(senderNumberFromJid('123456789012345@lid'), '')
  assert.equal(senderNumberFromJid('120363000000000000@g.us'), '')
})

test('Public direct messages are available to any valid phone-number sender', () => {
  assert.equal(isAllowedInbound({ remoteJid: '2348012345678@s.whatsapp.net' }), true)
  assert.equal(isAllowedInbound({ remoteJid: '2348099999999@s.whatsapp.net' }), true)
  assert.equal(isAllowedInbound({ remoteJid: '14155550123@s.whatsapp.net' }), true)
})

test('Public direct LID messages accept numeric LIDs or their paired alternate phone JID', () => {
  assert.equal(isAllowedInbound({ remoteJid: '123456789012345@lid' }), true)
  assert.equal(isAllowedInbound({
    remoteJid: '123456789012345@lid',
    remoteJidAlt: '2348012345678@s.whatsapp.net',
  }), true)
  assert.equal(isAllowedInbound({
    remoteJid: '123456789012345@lid',
    remoteJidAlt: '14155550123@s.whatsapp.net',
  }), true)
  assert.equal(isAllowedInbound({ remoteJid: 'opaque@lid' }), false)
})

test('Public rejects self messages, broadcasts, newsletters and unrecognised JIDs', () => {
  assert.equal(isAllowedInbound({ remoteJid: '2348012345678@s.whatsapp.net', fromMe: true }), false)
  assert.equal(isAllowedInbound({ remoteJid: 'status@broadcast' }), false)
  assert.equal(isAllowedInbound({ remoteJid: '123456789@broadcast' }), false)
  assert.equal(isAllowedInbound({ remoteJid: '123456789@newsletter' }), false)
  assert.equal(isAllowedInbound({ remoteJid: 'opaque@lid' }), false)
  assert.equal(isAllowedInbound({ remoteJid: '120363000000000000@g.us' }), false)
})

test('group senders are accepted only for workflows that explicitly enable groups', () => {
  const directParticipant = {
    remoteJid: '120363000000000000-1234567890@g.us',
    participantJid: '2348012345678@s.whatsapp.net',
  }
  assert.equal(isAllowedInbound(directParticipant), false)
  assert.equal(isAllowedInbound({ ...directParticipant, allowGroups: true }), true)
  assert.equal(isAllowedInbound({
    remoteJid: '120363000000000000-1234567890@g.us',
    participantJid: '123456789012345@lid',
    participantAltJid: '2348012345678@s.whatsapp.net',
    allowGroups: true,
  }), true)
  assert.equal(isAllowedInbound({
    remoteJid: '120363000000000000-1234567890@g.us',
    participantJid: 'opaque@lid',
    allowGroups: true,
  }), false)
})

test('Private inbox supports new messages from direct, group and LID chats only', () => {
  assert.equal(isPrivateVisibleChatJid('2348012345678@s.whatsapp.net'), true)
  assert.equal(isPrivateVisibleChatJid('120363000000000000-1234567890@g.us'), true)
  assert.equal(isPrivateVisibleChatJid('123456789012345@lid'), true)
  assert.equal(isPrivateVisibleChatJid('status@broadcast'), false)
  assert.equal(isPrivateVisibleChatJid('1234567890@newsletter'), false)
  assert.equal(isPrivateVisibleChatJid('opaque@lid'), false)
})

test('only the explicit local command set generates replies', () => {
  assert.equal(commandResponse('!ping'), 'Aharane is online.')
  assert.match(commandResponse('!help'), /!ping/)
  assert.equal(commandResponse('hello'), null)
  assert.equal(commandResponse('!delete everything'), null)
  assert.equal(commandResponse('!PING'), 'Aharane is online.')
})

test('rejects suspicious message-upsert events carrying a requestId', () => {
  assert.equal(isSafeMessageUpsert({ type: 'notify', messages: [] }), true)
  assert.equal(isSafeMessageUpsert({ type: 'notify', messages: [], requestId: 'resend-123' }), false)
  assert.equal(isSafeMessageUpsert({ type: 'append', messages: [] }), false)
  assert.equal(isSafeMessageUpsert({ type: 'notify', messages: null }), false)
})
