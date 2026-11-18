import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeUpdatePath, validateUpdateManifest } from '../src/update-manager.js'

const validPackage = {
  name: 'aharane-whatsapp-bot',
  private: true,
  version: '1.2.3',
  engines: { node: '>=24' },
  dependencies: { '@whiskeysockets/baileys': '7.0.0-rc14' },
}
const validManifest = {
  package_type: 'aharane-bot-update',
  target: 'aharane',
  format_version: 1,
  bot_version: '1.2.3',
}

test('accepts ordinary source paths and the example environment file', () => {
  assert.deepEqual(normalizeUpdatePath('src/index.js'), { path: 'src/index.js', directory: false })
  assert.deepEqual(normalizeUpdatePath('src/'), { path: 'src', directory: true })
  assert.equal(normalizeUpdatePath('.env.example').path, '.env.example')
})

test('rejects absolute, traversal and backslash paths', () => {
  for (const value of ['/etc/passwd', '../secrets', 'src/../secrets', 'src\\index.js', 'C:/temp/file']) {
    assert.throws(() => normalizeUpdatePath(value))
  }
})

test('blocks auth, persistent data, dependency and secret directories', () => {
  for (const value of [
    'node_modules/baileys/index.js',
    'whatsapp-auth/creds.json',
    'data/users.json',
    'backups/latest.zip',
    '.env',
    '.env.production',
    'keys/admin.pem',
    'secrets/id_rsa',
    'install-azure.sh',
  ]) {
    assert.throws(() => normalizeUpdatePath(value))
  }
})

test('blocks both WhatsApp auth directories and the isolated auth-backup directory', () => {
  for (const value of [
    'whatsapp-auth/creds.json',
    'whatsapp-auth-private/creds.json',
    'whatsapp-auth-backups/private-2026/creds.json',
  ]) assert.throws(() => normalizeUpdatePath(value))
})

test('accepts separate public/private command folders and shared plugin source', () => {
  for (const value of [
    'commands/ping.js',
    'private-commands/status.js',
    'plugins/media.js',
    'lib/format.js',
  ]) assert.doesNotThrow(() => normalizeUpdatePath(value))
})

test('accepts a correctly identified Aharane update package', () => {
  assert.deepEqual(validateUpdateManifest(validManifest, validPackage), validManifest)
})

test('rejects packages without the Aharane marker, matching version or official Baileys dependency', () => {
  assert.throws(() => validateUpdateManifest({ ...validManifest, target: 'night' }, validPackage))
  assert.throws(() => validateUpdateManifest({ ...validManifest, bot_version: '1.2.4' }, validPackage))
  assert.throws(() => validateUpdateManifest(validManifest, { ...validPackage, dependencies: {} }))
  assert.throws(() => validateUpdateManifest(validManifest, {
    ...validPackage,
    dependencies: { ...validPackage.dependencies, '@itsliaaa/baileys': 'latest' },
  }))
  assert.throws(() => validateUpdateManifest(validManifest, { ...validPackage, engines: { node: '>=20' } }))
})
