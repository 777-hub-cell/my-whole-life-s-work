import test from 'node:test'
import assert from 'node:assert/strict'
import {
  commandResponse,
  isAllowedInbound,
  normalizePhone,
  parseAllowedSenders,
  senderNumberFromJid,
} from '../src/policy.js'

test('normalizes only international-length digit strings', () => {
  assert.equal(normalizePhone('+234 801-234-5678'), '2348012345678')
  assert.equal(normalizePhone('12345'), '')
  assert.equal(normalizePhone(''), '')
})

test('parses an explicit sender allowlist and ignores malformed entries', () => {
  const allowed = parseAllowedSenders('2348012345678, bad, +14155550123')
  assert.deepEqual([...allowed].sort(), ['14155550123', '2348012345678'])
})

test('only direct WhatsApp phone JIDs can resolve to a sender number', () => {
  assert.equal(senderNumberFromJid('2348012345678@s.whatsapp.net'), '2348012345678')
  assert.equal(senderNumberFromJid('2348012345678:3@s.whatsapp.net'), '2348012345678')
  assert.equal(senderNumberFromJid('opaque@lid'), '')
  assert.equal(senderNumberFromJid('120363000000000000@g.us'), '')
})

test('inbound messages fail closed for groups, broadcasts, self messages and unknown senders', () => {
  const allowed = parseAllowedSenders('2348012345678')
  assert.equal(isAllowedInbound({ remoteJid: '2348012345678@s.whatsapp.net', allowedSenders: allowed }), true)
  assert.equal(isAllowedInbound({ remoteJid: '2348099999999@s.whatsapp.net', allowedSenders: allowed }), false)
  assert.equal(isAllowedInbound({ remoteJid: '120363000000000000@g.us', allowedSenders: allowed }), false)
  assert.equal(isAllowedInbound({ remoteJid: 'status@broadcast', allowedSenders: allowed }), false)
  assert.equal(isAllowedInbound({ remoteJid: '2348012345678@s.whatsapp.net', fromMe: true, allowedSenders: allowed }), false)
  assert.equal(isAllowedInbound({ remoteJid: 'opaque@lid', allowedSenders: allowed }), false)
})

test('group traffic remains disabled in the initial standalone runtime', () => {
  assert.equal(isAllowedInbound({ remoteJid: '120363000000000000@g.us' }), false)
})

test('only the explicit local command set generates replies', () => {
  assert.equal(commandResponse('!ping'), 'Aharane is online.')
  assert.match(commandResponse('!help'), /!ping/)
  assert.equal(commandResponse('hello'), null)
  assert.equal(commandResponse('!delete everything'), null)
  assert.equal(commandResponse('!PING'), 'Aharane is online.')
})
