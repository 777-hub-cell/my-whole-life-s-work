import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAccountRuntime } from '../src/account-runtime.js'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'aharane-accounts-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const authLoads = []
  const sockets = []
  const runtime = createAccountRuntime({
    authDirs: { public: join(root, 'public-auth'), private: join(root, 'private-auth') },
    loadAuthState: async authDir => {
      authLoads.push(authDir)
      return { state: { creds: { registered: false } }, saveCreds: async () => {} }
    },
    makeSocket: ({ sessionId }) => {
      const socket = {
        sessionId,
        ev: new EventEmitter(),
        requestPairingCode: async phone => sessionId + '-' + phone.slice(-4),
        end() {},
      }
      sockets.push(socket)
      return socket
    },
    reconnectBaseMs: 5,
    reconnectMaxMs: 5,
    logger: { info() {}, warn() {}, error() {} },
  })
  return { root, runtime, authLoads, sockets }
}

test('private and public sessions use isolated auth directories and state', async t => {
  const { runtime, authLoads, sockets } = await fixture(t)
  await Promise.all([runtime.start('private'), runtime.start('public')])
  assert.equal(new Set(authLoads).size, 2)
  assert.equal(new Set(sockets.map(socket => socket.sessionId)).size, 2)
  assert.notEqual(runtime.get('private'), runtime.get('public'))
  assert.equal(runtime.snapshot().accounts.private.id, 'private')
  assert.equal(runtime.snapshot().accounts.public.id, 'public')
  assert.equal(runtime.get('private').socket.sessionId, 'private')
  assert.equal(runtime.get('public').socket.sessionId, 'public')
  await runtime.shutdown()
})

test('pairing code is requested only from the selected account socket', async t => {
  const { runtime, sockets } = await fixture(t)
  await runtime.start('private')
  await runtime.start('public')
  sockets[0].ev.emit('connection.update', { connection: 'connecting' })
  sockets[1].ev.emit('connection.update', { connection: 'connecting' })
  const code = await runtime.requestPairingCode('private', '2348012345678')
  assert.equal(code, 'private-5678')
  assert.equal(runtime.get('public').pairRequestActive, false)
  await runtime.shutdown()
})

test('manual stop preserves registration state and never schedules reconnect', async t => {
  const { runtime, sockets } = await fixture(t)
  await runtime.start('public')
  const session = runtime.get('public')
  session.registered = true
  sockets[0].ev.emit('connection.update', { connection: 'open' })
  await runtime.stop('public')
  assert.equal(runtime.get('public').state, 'stopped')
  assert.equal(runtime.get('public').registered, true)
  sockets[0].ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 500 } } } })
  assert.equal(runtime.get('public').state, 'stopped')
  await runtime.shutdown()
})

test('a logged-out account is isolated and requires explicit repair', async t => {
  const { runtime, sockets } = await fixture(t)
  await runtime.start('private')
  sockets[0].ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } })
  assert.equal(runtime.get('private').state, 'needs-pairing')
  assert.equal(runtime.get('public').state, 'starting')
  await assert.rejects(runtime.reconnect('private'), /re-pair/i)
  await runtime.shutdown()
})

test('repair backs up only the selected account authentication before creating a fresh session', async t => {
  const { runtime, root } = await fixture(t)
  const privateDir = join(root, 'private-auth')
  await runtime.start('private')
  await import('node:fs/promises').then(fs => fs.writeFile(join(privateDir, 'creds.json'), 'test-auth'))
  runtime.get('private').state = 'needs-pairing'
  runtime.get('private').registered = false
  const result = await runtime.repair('private', join(root, 'auth-backups'))
  assert.equal(result.backupCreated, true)
  const backups = await readdir(join(root, 'auth-backups'))
  assert.equal(backups.length, 1)
  assert.equal(await readFile(join(root, 'auth-backups', backups[0], 'creds.json'), 'utf8'), 'test-auth')
  assert.equal(runtime.get('private').state, 'pairing')
  assert.equal(runtime.get('public').authDir, join(root, 'public-auth'))
  await runtime.shutdown()
})

test('authentication directory overlap is rejected', () => {
  assert.throws(() => createAccountRuntime({
    authDirs: { public: '/tmp/aharane/auth', private: '/tmp/aharane/auth/private' },
    loadAuthState: async () => ({ state: { creds: {} }, saveCreds() {} }),
    makeSocket: () => ({ ev: new EventEmitter(), end() {} }),
  }), /separate authentication directories/)
})

test('a disconnect on one account reconnects only that account', async t => {
  const { runtime, sockets } = await fixture(t)
  await Promise.all([runtime.start('private'), runtime.start('public')])
  const oldPrivateSocket = runtime.get('private').socket
  const publicSocket = runtime.get('public').socket
  oldPrivateSocket.ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode: 500 } } },
  })
  await new Promise(resolveWait => setTimeout(resolveWait, 25))
  assert.notEqual(runtime.get('private').socket, oldPrivateSocket)
  assert.equal(runtime.get('public').socket, publicSocket)
  assert.equal(runtime.get('public').state, 'pairing')
  await runtime.shutdown()
})

test('authentication directory symlinks are rejected even when paths look different', async t => {
  const root = await mkdtemp(join(tmpdir(), 'aharane-auth-link-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const real = join(root, 'real')
  const alias = join(root, 'alias')
  const { mkdir, symlink } = await import('node:fs/promises')
  await mkdir(real, { recursive: true })
  await symlink(real, alias, 'dir')
  const runtime = createAccountRuntime({
    authDirs: { public: real, private: alias },
    loadAuthState: async () => ({ state: { creds: { registered: false } }, saveCreds: async () => {} }),
    makeSocket: () => ({ ev: new EventEmitter(), end() {} }),
  })
  await assert.rejects(runtime.start('private'), /real directories|separate authentication directories/)
})

test('pairing QR is available only until the selected account connects', async t => {
  const { runtime, sockets } = await fixture(t)
  await runtime.start('private')
  sockets[0].ev.emit('connection.update', { qr: 'private-real-qr-value' })
  assert.equal(runtime.pairingQr('private'), 'private-real-qr-value')
  assert.equal(runtime.pairingQr('public'), '')
  sockets[0].ev.emit('connection.update', { connection: 'open' })
  assert.equal(runtime.pairingQr('private'), '')
  await runtime.shutdown()
})
