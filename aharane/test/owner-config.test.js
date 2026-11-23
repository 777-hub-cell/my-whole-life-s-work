import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadOwnerConfig, normalizeOwnerConfig, saveOwnerConfig } from '../src/owner-config.js'

test('Private/Public owners are independent and Public may own its own paired bot', () => {
  const settings = normalizeOwnerConfig({
    privateOwnerNumber: '+234 801 234 5678',
    publicOwnerNumber: '+44 7700 900123',
    publicBotNumber: '+44 7700 900123',
    allowedPublicSenders: ['2348999999999'],
  })
  assert.equal(settings.version, 4)
  assert.equal(settings.privateOwnerNumber, '2348012345678')
  assert.equal(settings.publicOwnerNumber, '447700900123')
  assert.equal(settings.publicBotNumber, settings.publicOwnerNumber)
  assert.equal(settings.ownerNumber, settings.privateOwnerNumber)
  assert.deepEqual(settings.allowedPublicSenders, [])
})

test('same Owner for Private and Public remains a valid explicit choice', () => {
  const settings = normalizeOwnerConfig({
    privateOwnerNumber: '2348012345678',
    publicOwnerNumber: '2348012345678',
    publicBotNumber: '447700900123',
  })
  assert.equal(settings.privateOwnerNumber, settings.publicOwnerNumber)
})

test('distinct legacy v2 owners survive migration', async t => {
  const root = await mkdtemp(join(tmpdir(), 'aharane-v2-owner-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const file = join(root, 'owner-config.json')
  await writeFile(file, JSON.stringify({
    version: 2,
    privateOwnerNumber: '2348012345678',
    publicOwnerNumber: '14155550123',
    publicBotNumber: '447700900123',
  }))
  const migrated = await loadOwnerConfig(file)
  assert.equal(migrated.privateOwnerNumber, '2348012345678')
  assert.equal(migrated.publicOwnerNumber, '14155550123')
  assert.equal(migrated.publicBotNumber, '447700900123')
})

test('legacy v3 shared Owner remains stable until explicitly changed', () => {
  const migrated = normalizeOwnerConfig({
    version: 3,
    ownerNumber: '2348012345678',
    privateOwnerNumber: '2348012345678',
    publicOwnerNumber: '2348012345678',
  })
  assert.equal(migrated.privateOwnerNumber, migrated.publicOwnerNumber)
})

test('atomic save/reload preserves distinct Owner values', async t => {
  const root = await mkdtemp(join(tmpdir(), 'aharane-v4-owner-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const file = join(root, 'owner-config.json')
  await saveOwnerConfig(file, {
    privateOwnerNumber: '2348012345678',
    publicOwnerNumber: '14155550123',
    publicBotNumber: '447700900123',
  })
  const loaded = await loadOwnerConfig(file)
  assert.equal(loaded.privateOwnerNumber, '2348012345678')
  assert.equal(loaded.publicOwnerNumber, '14155550123')
  assert.equal(loaded.publicBotNumber, '447700900123')
  assert.equal(JSON.parse(await readFile(file, 'utf8')).version, 4)
})
