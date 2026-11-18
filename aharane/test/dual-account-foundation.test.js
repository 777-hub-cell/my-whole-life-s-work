import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('Aharane uses two scoped command registries and independent WhatsApp auth stores', async () => {
  const runtime = await read('../src/index.js')
  const accounts = await read('../src/account-runtime.js')
  for (const marker of [
    "join(DATA_DIR, 'whatsapp-auth')",
    "join(DATA_DIR, 'whatsapp-auth-private')",
    "new URL('../commands/'",
    "new URL('../private-commands/'",
    "dispatchCommand({",
    "sessionId === 'private'",
    "sessionId === 'public'",
    "accountRuntime.start(accountId, { deferUnregistered: true })",
    'await accountRuntime.shutdown()',
  ]) assert.ok(runtime.includes(marker), 'Missing runtime integration: ' + marker)
  assert.ok(accounts.includes("SESSION_IDS = Object.freeze(['private', 'public'])"))
  assert.ok(accounts.includes('verifyAuthDirectories()'))
  assert.ok(accounts.includes('session.socket !== currentSocket'))
  assert.ok(!runtime.includes('let socket = null'), 'The old single-socket runtime must be removed')
})

test('Private Owner and Public Owner are separate, persisted identities', async () => {
  const runtime = await read('../src/index.js')
  const config = await read('../src/owner-config.js')
  assert.ok(config.includes('publicBotNumber'))
  const auth = await read('../src/authorization.js')
  assert.ok(runtime.includes("OWNER_CONFIG_FILE = join(DATA_DIR, 'owner-config.json')"))
  assert.ok(runtime.includes("app.get('/api/owners'"))
  assert.ok(runtime.includes("app.put('/api/owners'"))
  assert.ok(config.includes('Private Owner, Public Owner, and Public bot WhatsApp numbers must be different.'))
  assert.ok(auth.includes('Private Owner never inherits this role.'))
  assert.ok(runtime.includes('isPublicOwnerSender'))
  assert.ok(runtime.includes('isPrivateSelfCommand'))
})

test('private and public account management is wired into the supplied Studio preview', async () => {
  const html = await read('../control-centre/index.html')
  const bridge = await read('../control-centre/production-bridge.js')
  assert.ok(html.includes('<title>Aharane Local Studio</title>'))
  for (const marker of [
    'id="owner-private"',
    'id="owner-public"',
    'data-pair-account',
    'data-account',
    'data-action="reconnect"',
    'id="prod-pair-repair"',
  ]) assert.ok(bridge.includes(marker), 'Missing production account control: ' + marker)
  for (const marker of [
    "apiP('owners'",
    "apiP('accounts/'+id+'/pair-code'",
    "apiP('accounts/'+id+'/'+action",
    "apiP('accounts/'+id+'/qr'",
  ]) assert.ok(bridge.includes(marker), 'Missing account API integration: ' + marker)
})

test('source manager and update archives keep private code editable but exclude auth stores', async () => {
  const runtime = await read('../src/index.js')
  const updater = await read('../src/update-manager.js')
  const packageGuide = await read('../UPDATE-PACKAGE.md')
  for (const folder of ['commands', 'private-commands', 'plugins', 'lib']) {
    assert.ok(runtime.includes("'" + folder + "'"))
    assert.ok(packageGuide.includes(folder))
  }
  for (const secretFolder of ['whatsapp-auth', 'whatsapp-auth-private', 'whatsapp-auth-backups']) {
    assert.ok(updater.includes("'" + secretFolder + "'"))
    assert.ok(packageGuide.includes(secretFolder))
  }
})
