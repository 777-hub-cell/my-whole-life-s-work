import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AccountRegistry, ACCOUNT_SLOTS } from './account-registry.js'

const root = await mkdtemp(join(tmpdir(), 'mscc-az-slot-test-'))
const file = join(root, 'registry.json')
const authRoot = join(root, 'auth')
const number = i => String(2348000000000 + i)

try {
  assert.equal(ACCOUNT_SLOTS.length, 26)
  const registry = new AccountRegistry({ file, authRoot, maxAccounts: 99 })
  assert.equal(registry.maxAccounts, 26)
  await registry.load()
  await assert.rejects(registry.create({ phoneNumber: number(1), slot: 'B' }), /first account must/)
  const main = await registry.create({ phoneNumber: number(1), displayName: 'Main' })
  assert.equal(main.id, 'A')
  assert.equal(main.slot, 'A')
  await assert.rejects(registry.remove('A'), /cannot be removed/)
  const second = await registry.create({ phoneNumber: number(2), displayName: 'Second', slot: 'D' })
  assert.equal(second.id, 'D')
  assert.equal(second.slot, 'D')
  assert.equal(registry.get('d').id, 'D')
  assert.equal(registry.slots().find(row => row.slot === 'C').occupied, false)
  assert.equal(registry.slots().find(row => row.slot === 'D').occupied, true)
  await assert.rejects(registry.create({ phoneNumber: number(3), slot: 'D' }), /occupied/)
  await assert.rejects(registry.create({ phoneNumber: number(2) }), /already registered/)
  await assert.rejects(registry.create({ phoneNumber: number(3), slot: 'AA' }), /one letter/)
  await assert.rejects(registry.create({ phoneNumber: number(3), slot: 'A' }), /reserved/)

  const auto = await registry.create({ phoneNumber: number(3) })
  assert.equal(auto.slot, 'B')
  await writeFile(join(second.authDir, 'creds.json'), 'SENTINEL')
  const removed = await registry.remove('D')
  assert.equal(removed.authPreserved, true)
  assert.equal(await readFile(join(second.authDir, 'creds.json'), 'utf8'), 'SENTINEL')
  const replacement = await registry.create({ phoneNumber: number(4), slot: 'D' })
  assert.notEqual(replacement.authDir, second.authDir, 'reused slots cannot inherit saved WhatsApp credentials')
  const pending = []
  for (let i = 5; i <= 26; i++) pending.push(registry.create({ phoneNumber: number(i) }))
  const created = await Promise.all(pending)
  assert.equal(registry.list().length, 26)
  assert.equal(new Set(registry.list().map(row => row.slot)).size, 26)
  assert.equal(created.at(-1).slot, 'Z')
  await assert.rejects(registry.create({ phoneNumber: number(27) }), /limit reached/)
  const reopened = new AccountRegistry({ file, authRoot })
  await reopened.load()
  assert.equal(reopened.list().length, 26)
  assert.equal(reopened.get('D').authDir, replacement.authDir)

  // Existing identifiers and auth paths are preserved across migration. A
  // prior letter B is reserved before allocating free slots to legacy IDs.
  const legacyRoot = join(root, 'legacy')
  await mkdir(legacyRoot, { recursive: true })
  const legacyFile = join(legacyRoot, 'accounts.json')
  const oldAuth = join(legacyRoot, 'account-3-auth')
  await mkdir(oldAuth)
  await writeFile(join(oldAuth, 'creds.json'), 'DO NOT MODIFY')
  const legacy = {
    version: 2, nextSequence: 8, accounts: [
      { id: 'A', phoneNumber: number(101), authDir: join(legacyRoot, 'A'), role: 'owner' },
      { id: 'account-3', phoneNumber: number(102), authDir: oldAuth, role: 'linked' },
      { id: 'B', phoneNumber: number(103), authDir: join(legacyRoot, 'B'), role: 'linked' },
    ],
  }
  const original = JSON.stringify(legacy, null, 2)
  await writeFile(legacyFile, original)
  const migrate = new AccountRegistry({ file: legacyFile, authRoot: join(legacyRoot, 'auth') })
  await migrate.load()
  assert.equal(migrate.get('account-3').slot, 'C')
  assert.equal(migrate.get('C').id, 'account-3')
  assert.equal(migrate.get('B').id, 'B')
  assert.equal(migrate.get('account-3').authDir, oldAuth)
  assert.equal(await readFile(join(oldAuth, 'creds.json'), 'utf8'), 'DO NOT MODIFY')
  const backups = (await readdir(legacyRoot)).filter(name => name.startsWith('accounts.json.pre-az-') && name.endsWith('.bak'))
  assert.equal(backups.length, 1)
  assert.equal(await readFile(join(legacyRoot, backups[0]), 'utf8'), original)
  await migrate.load()
  assert.equal((await readdir(legacyRoot)).filter(name => name.endsWith('.bak')).length, 1, 'migration is idempotent')
  const existing = await migrate.create({ phoneNumber: number(104), slot: 'D' })
  assert.equal(existing.id, 'D')
  assert.equal(migrate.resolveId('C'), 'account-3')

  // Malformed registries fail closed and may not erase or renumber auth.
  for (const rows of [
    [{ ...legacy.accounts[0], slot: 'B' }],
    [{ ...legacy.accounts[0] }, { ...legacy.accounts[1], slot: 'A' }],
    [{ ...legacy.accounts[0] }, { ...legacy.accounts[1], slot: 'B' }, { ...legacy.accounts[2], slot: 'B' }],
    [{ ...legacy.accounts[0] }, { ...legacy.accounts[1], phoneNumber: legacy.accounts[0].phoneNumber }],
    [{ ...legacy.accounts[1] }],
  ]) {
    const unsafeFile = join(root, 'unsafe-' + Math.random().toString(36).slice(2) + '.json')
    await writeFile(unsafeFile, JSON.stringify({ accounts: rows }))
    await assert.rejects(new AccountRegistry({ file: unsafeFile, authRoot }).load())
  }
  console.log('PASS A–Z account slots, 26-account limit, legacy mapping, protected auth, migration backup and concurrent creation')
} finally {
  await rm(root, { recursive: true, force: true })
}
