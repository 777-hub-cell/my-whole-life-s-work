import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadOwnerConfig, normalizeOwnerConfig, saveOwnerConfig } from '../src/owner-config.js'

test('owner identities are independent and must be different numbers', () => {
  const value = normalizeOwnerConfig({
    privateOwnerNumber: '+234 801 234 5678',
    publicOwnerNumber: '+1 415 555 0123',
    publicBotNumber: '+44 7700 900123',
    allowedPublicSenders: '2348099999999',
  })
  assert.equal(value.privateOwnerNumber, '2348012345678')
  assert.equal(value.publicOwnerNumber, '14155550123')
  assert.equal(value.publicBotNumber, '447700900123')
  assert.deepEqual(value.allowedPublicSenders, ['14155550123', '2348099999999'])
  assert.throws(() => normalizeOwnerConfig({
    privateOwnerNumber: '2348012345678',
    publicOwnerNumber: '+2348012345678',
  }), /must be different/)
})

test('owner config persists atomically and reloads without mixing owner roles', async t => {
  const root = await mkdtemp(join(tmpdir(), 'aharane-owner-config-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const file = join(root, 'owner-config.json')
  const original = normalizeOwnerConfig({
    privateOwnerNumber: '2348012345678',
    publicOwnerNumber: '14155550123',
    publicBotNumber: '447700900123',
    allowedPublicSenders: ['14155550123', '2348099999999'],
  })
  await saveOwnerConfig(file, original)
  const loaded = await loadOwnerConfig(file, {
    privateOwnerNumber: '2348000000000',
    publicOwnerNumber: '14150000000',
    publicBotNumber: '447700900000',
  })
  assert.equal(loaded.privateOwnerNumber, '2348012345678')
  assert.equal(loaded.publicOwnerNumber, '14155550123')
  assert.equal(loaded.publicBotNumber, '447700900123')
  assert.deepEqual(loaded.allowedPublicSenders, ['14155550123', '2348099999999'])
  const disk = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(disk.privateOwnerNumber, '2348012345678')
  assert.equal(disk.publicOwnerNumber, '14155550123')
  assert.equal(disk.publicBotNumber, '447700900123')
})

test('the Public bot WhatsApp number is separate from both Owner identities', () => {
  const value = normalizeOwnerConfig({
    privateOwnerNumber: '2348012345678',
    publicOwnerNumber: '14155550123',
    publicBotNumber: '447700900123',
  })
  assert.equal(value.publicBotNumber, '447700900123')
  assert.throws(() => normalizeOwnerConfig({
    privateOwnerNumber: '2348012345678',
    publicOwnerNumber: '14155550123',
    publicBotNumber: '14155550123',
  }), /must be different/)
  assert.throws(() => normalizeOwnerConfig({
    privateOwnerNumber: '2348012345678',
    publicOwnerNumber: '14155550123',
    publicBotNumber: '2348012345678',
  }), /must be different/)
})
