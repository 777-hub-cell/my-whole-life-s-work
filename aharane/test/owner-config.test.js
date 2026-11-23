import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadOwnerConfig, normalizeOwnerConfig, saveOwnerConfig } from '../src/owner-config.js'

test('Private and Public share one Owner number while the Public bot has its own number', () => {
  const value = normalizeOwnerConfig({
    ownerNumber: '+234 801 234 5678',
    publicBotNumber: '+44 7700 900123',
    allowedPublicSenders: '2348099999999',
  })
  assert.equal(value.ownerNumber, '2348012345678')
  assert.equal(value.privateOwnerNumber, value.ownerNumber)
  assert.equal(value.publicOwnerNumber, value.ownerNumber)
  assert.equal(value.publicBotNumber, '447700900123')
  assert.deepEqual(value.allowedPublicSenders, [])
  assert.throws(() => normalizeOwnerConfig({
    ownerNumber: '2348012345678',
    publicBotNumber: '2348012345678',
  }), /must be different/)
})

test('legacy v2 owner settings migrate to one shared identity and discard the sender allow-list', () => {
  const migrated = normalizeOwnerConfig({
    privateOwnerNumber: '2348012345678',
    publicOwnerNumber: '14155550123',
    publicBotNumber: '447700900123',
    allowedPublicSenders: ['14155550123', '2348099999999'],
  })
  assert.equal(migrated.ownerNumber, '2348012345678')
  assert.equal(migrated.privateOwnerNumber, '2348012345678')
  assert.equal(migrated.publicOwnerNumber, '2348012345678')
  assert.deepEqual(migrated.allowedPublicSenders, [])
})

test('legacy config without a Private Owner can migrate from the old Public Owner field', () => {
  const migrated = normalizeOwnerConfig({
    publicOwnerNumber: '14155550123',
    publicBotNumber: '447700900123',
  })
  assert.equal(migrated.ownerNumber, '14155550123')
  assert.equal(migrated.privateOwnerNumber, migrated.publicOwnerNumber)
})

test('owner config persists atomically and reloads the unified identity', async t => {
  const root = await mkdtemp(join(tmpdir(), 'aharane-owner-config-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const file = join(root, 'owner-config.json')
  const original = normalizeOwnerConfig({
    ownerNumber: '2348012345678',
    publicBotNumber: '447700900123',
  })
  await saveOwnerConfig(file, original)
  const loaded = await loadOwnerConfig(file, {
    ownerNumber: '2348000000000',
    publicBotNumber: '447700900000',
  })
  assert.equal(loaded.ownerNumber, '2348012345678')
  assert.equal(loaded.privateOwnerNumber, '2348012345678')
  assert.equal(loaded.publicOwnerNumber, '2348012345678')
  assert.equal(loaded.publicBotNumber, '447700900123')
  assert.deepEqual(loaded.allowedPublicSenders, [])
  const disk = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(disk.version, 3)
  assert.equal(disk.ownerNumber, '2348012345678')
  assert.equal(disk.privateOwnerNumber, disk.publicOwnerNumber)
})

test('an old v2 file migrates without preserving its Public sender allow-list', async t => {
  const root = await mkdtemp(join(tmpdir(), 'aharane-owner-config-v2-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const file = join(root, 'owner-config.json')
  await import('node:fs/promises').then(({ writeFile }) => writeFile(file, JSON.stringify({
    version: 2,
    privateOwnerNumber: '2348012345678',
    publicOwnerNumber: '14155550123',
    publicBotNumber: '447700900123',
    allowedPublicSenders: ['14155550123', '2348099999999'],
  })))
  const loaded = await loadOwnerConfig(file)
  assert.equal(loaded.ownerNumber, '2348012345678')
  assert.deepEqual(loaded.allowedPublicSenders, [])
})
