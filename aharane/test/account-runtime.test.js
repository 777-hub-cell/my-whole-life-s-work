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
        pairingRequests: [],
        requestPairingCode: async function (phone) {
          this.pairingRequests.push(phone)
          return sessionId + '-' + phone.slice(-4)
        },
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
  sockets[0].ev.emit('connection.update', { qr: 'pair-device-ready' })
  sockets[1].ev.emit('connection.update', { qr: 'pair-device-ready' })
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
  assert.equal(runtime.get('private').state, 'not-paired')
  assert.equal(runtime.get('private').socket, null)
  assert.equal(runtime.get('private').qr, '')
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

test('never-paired accounts stay dormant at startup until an explicit pairing request', async t => {
  const { runtime, sockets } = await fixture(t)
  const result = await runtime.start('public', { deferUnregistered: true })
  assert.equal(result, null)
  assert.equal(runtime.get('public').state, 'not-paired')
  assert.equal(runtime.get('public').registered, false)
  assert.equal(sockets.length, 0)
  await assert.rejects(runtime.reconnect('public'), /not been paired/i)
  const pending = runtime.requestPairingCode('public', '447700900123')
  await new Promise(resolveWait => setTimeout(resolveWait, 0))
  runtime.get('public').socket.ev.emit('connection.update', { qr: 'pair-device-ready' })
  assert.equal(await pending, 'public-0123')
  assert.equal(sockets.length, 1)
  await runtime.shutdown()
})


test('phone-number pairing waits for WhatsApp pair-device readiness, not only connecting', async t => {
  const { runtime, sockets } = await fixture(t)
  await runtime.start('private')
  const pending = runtime.requestPairingCode('private', '2348012345678')
  await new Promise(resolveWait => setTimeout(resolveWait, 0))
  sockets[0].ev.emit('connection.update', { connection: 'connecting' })
  await new Promise(resolveWait => setTimeout(resolveWait, 0))
  assert.deepEqual(sockets[0].pairingRequests, [])
  sockets[0].ev.emit('connection.update', { qr: 'pair-device-ready' })
  assert.equal(await pending, 'private-5678')
  assert.deepEqual(sockets[0].pairingRequests, ['2348012345678'])
  await runtime.shutdown()
})

test('phone-number pairing fails promptly when WhatsApp closes before readiness', async t => {
  const { runtime, sockets } = await fixture(t)
  await runtime.start('private')
  const pending = runtime.requestPairingCode('private', '2348012345678')
  await new Promise(resolveWait => setTimeout(resolveWait, 0))
  sockets[0].ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: Object.assign(new Error('Connection Closed'), { output: { statusCode: 428 } }) },
  })
  await assert.rejects(pending, /Connection Closed/)
  assert.deepEqual(sockets[0].pairingRequests, [])
  await runtime.shutdown()
})


test('stop waits for an in-flight startup and closes the socket it creates', async t => {
  const root = await mkdtemp(join(tmpdir(), 'aharane-stop-race-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  let releaseAuth
  let authStarted
  const authStartedPromise = new Promise(resolve => { authStarted = resolve })
  const authGate = new Promise(resolve => { releaseAuth = resolve })
  let ended = false
  const runtime = createAccountRuntime({
    authDirs: { public: join(root, 'public'), private: join(root, 'private') },
    loadAuthState: async () => {
      authStarted()
      await authGate
      return { state: { creds: { registered: false } }, saveCreds: async () => {} }
    },
    makeSocket: () => ({ ev: new EventEmitter(), end() { ended = true } }),
    logger: { info() {}, warn() {}, error() {} },
  })
  const starting = runtime.start('private')
  await authStartedPromise
  const stopping = runtime.stop('private')
  releaseAuth()
  await starting
  const stopped = await stopping
  assert.equal(stopped.state, 'stopped')
  assert.equal(runtime.get('private').socket, null)
  assert.equal(ended, true)
  await runtime.shutdown()
})
