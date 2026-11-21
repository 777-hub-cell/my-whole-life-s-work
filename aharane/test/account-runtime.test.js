import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAccountRuntime } from '../src/account-runtime.js'

async function fixture(t, { pairingError = null, registered = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'aharane-accounts-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const authLoads = []
  const authContexts = []
  const sockets = []
  const runtime = createAccountRuntime({
    authDirs: { public: join(root, 'public-auth'), private: join(root, 'private-auth') },
    loadAuthState: async authDir => {
      authLoads.push(authDir)
      const auth = {
        state: { creds: { registered } },
        saveCount: 0,
        async saveCreds() { this.saveCount += 1 },
      }
      authContexts.push(auth)
      return auth
    },
    makeSocket: ({ sessionId, auth }) => {
      const socket = {
        sessionId,
        ev: new EventEmitter(),
        pairingRequests: [],
        requestPairingCode: async function (phone) {
          this.pairingRequests.push(phone)
          if (pairingError) {
            auth.creds.registered = true
            auth.creds.me = { id: sessionId + '@s.whatsapp.net' }
            auth.creds.pairingCode = 'STALE-CODE'
            auth.creds.pairingEphemeralKeyPair = { private: 'stale' }
            throw pairingError
          }
          return sessionId + '-' + phone.slice(-4)
        },
        ended: false,
        end() { this.ended = true },
      }
      sockets.push(socket)
      return socket
    },
    reconnectBaseMs: 5,
    reconnectMaxMs: 5,
    pairingReadyDelayMs: 0,
    logger: { info() {}, warn() {}, error() {} },
  })
  return { root, runtime, authLoads, authContexts, sockets }
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
  const pending = runtime.requestPairingCode('private', '2348012345678')
  await new Promise(resolveWait => setTimeout(resolveWait, 0))
  const pairingSocket = sockets[2]
  pairingSocket.ev.emit('connection.update', { qr: 'private-pair-ready' })
  const code = await pending
  assert.equal(code, 'private-5678')
  assert.equal(runtime.get('public').pairRequestActive, false)
  assert.equal(runtime.get('private').socket, sockets[0], 'The active session is not replaced just by requesting a code.')
  assert.equal(runtime.get('private').pairingInProgress, true)
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
  const { runtime, sockets } = await fixture(t, { registered: true })
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
  const { runtime, sockets } = await fixture(t, { registered: true })
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
  assert.equal(runtime.get('public').state, 'connecting')
  await runtime.shutdown()
})

test('an unregistered pairing socket that closes is not automatically reconnected', async t => {
  const { runtime, sockets } = await fixture(t)
  await runtime.start('private')
  sockets[0].ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: Object.assign(new Error('WebSocket error (0)'), { output: { statusCode: 0 } }) },
  })
  assert.equal(runtime.get('private').state, 'not-paired')
  assert.equal(runtime.get('private').reconnectAttempts, 0)
  await new Promise(resolveWait => setTimeout(resolveWait, 20))
  assert.equal(sockets.length, 1)
  await runtime.shutdown()
})

test('a linked account stops after exactly three automatic reconnect attempts', async t => {
  const { runtime, sockets } = await fixture(t, { registered: true })
  await runtime.start('private')
  const closeSocket = socket => socket.ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: Object.assign(new Error('WebSocket error (0)'), { output: { statusCode: 0 } }) },
  })
  closeSocket(sockets[0])
  for (let expected = 2; expected <= 4; expected += 1) {
    const startedAt = Date.now()
    while (sockets.length < expected && Date.now() - startedAt < 500) {
      await new Promise(resolveWait => setTimeout(resolveWait, 2))
    }
    assert.equal(sockets.length, expected, 'Expected one new socket for reconnect attempt ' + (expected - 1))
    closeSocket(sockets[expected - 1])
  }
  await new Promise(resolveWait => setTimeout(resolveWait, 20))
  assert.equal(runtime.get('private').state, 'reconnect-exhausted')
  assert.equal(runtime.get('private').reconnectAttempts, 3)
  assert.equal(sockets.length, 4, 'No fourth automatic retry should be created')
  await assert.rejects(runtime.reconnect('private'), /needs repair/i)
  await runtime.shutdown()
})

test('repair also backs up a session after its automatic reconnect attempts are exhausted', async t => {
  const { runtime, root } = await fixture(t, { registered: true })
  await runtime.start('private')
  await import('node:fs/promises').then(fs => fs.writeFile(join(root, 'private-auth', 'creds.json'), 'test-auth'))
  runtime.get('private').state = 'reconnect-exhausted'
  const result = await runtime.repair('private', join(root, 'auth-backups'))
  assert.equal(result.backupCreated, true)
  assert.equal(runtime.get('private').state, 'not-paired')
  assert.equal(runtime.get('private').registered, false)
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
  sockets[0].ev.emit('connection.update', { qr: 'pair-device-ready' })
  assert.equal(await pending, 'public-0123')
  assert.equal(sockets.length, 1)
  await runtime.shutdown()
})


test('phone-number pairing waits for WhatsApp pair-device readiness, not only connecting', async t => {
  const { runtime, sockets } = await fixture(t)
  await runtime.start('private')
  const pending = runtime.requestPairingCode('private', '2348012345678')
  await new Promise(resolveWait => setTimeout(resolveWait, 0))
  const pairingSocket = sockets[1]
  pairingSocket.ev.emit('connection.update', { connection: 'connecting' })
  await new Promise(resolveWait => setTimeout(resolveWait, 0))
  assert.deepEqual(pairingSocket.pairingRequests, [])
  pairingSocket.ev.emit('connection.update', { qr: 'pair-device-ready' })
  assert.equal(await pending, 'private-5678')
  assert.deepEqual(pairingSocket.pairingRequests, ['2348012345678'])
  await runtime.shutdown()
})

test('WhatsApp rate limits do not create an Aharane pairing cooldown', async t => {
  const error = Object.assign(new Error('rate-overlimit'), { output: { statusCode: 429 } })
  const { runtime, sockets } = await fixture(t, { pairingError: error, registered: true })
  await runtime.start('private')
  const originalSocket = runtime.get('private').socket
  const first = runtime.requestPairingCode('private', '2348012345678')
  await new Promise(resolveWait => setTimeout(resolveWait, 0))
  sockets[1].ev.emit('connection.update', { qr: 'pair-device-ready' })
  await assert.rejects(first, /Aharane has not added a cooldown/i)
  assert.equal(runtime.get('private').socket, originalSocket)
  assert.equal(runtime.get('private').registered, true)
  assert.equal(runtime.get('private').pairingInProgress, false)

  const second = runtime.requestPairingCode('private', '2348012345678')
  await new Promise(resolveWait => setTimeout(resolveWait, 0))
  assert.equal(sockets.length, 3, 'A new explicit attempt is allowed immediately.')
  sockets[2].ev.emit('connection.update', { qr: 'pair-device-ready-again' })
  await assert.rejects(second, /Aharane has not added a cooldown/i)
  await runtime.shutdown()
})

test('a failed replacement keeps the old linked authentication and socket', async t => {
  const { runtime, sockets } = await fixture(t, { registered: true })
  await runtime.start('private')
  const originalSocket = runtime.get('private').socket
  const originalAuthDir = runtime.get('private').authDir
  const pending = runtime.requestPairingCode('private', '2348012345678')
  await new Promise(resolveWait => setTimeout(resolveWait, 0))
  const replacementSocket = sockets[1]
  replacementSocket.ev.emit('connection.update', { qr: 'replace-ready' })
  assert.equal(await pending, 'private-5678')
  replacementSocket.ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: Object.assign(new Error('WebSocket error (0)'), { output: { statusCode: 0 } }) },
  })
  await new Promise(resolveWait => setTimeout(resolveWait, 20))
  assert.equal(runtime.get('private').socket, originalSocket)
  assert.equal(runtime.get('private').authDir, originalAuthDir)
  assert.equal(runtime.get('private').registered, true)
  assert.match(runtime.get('private').pairingError, /previous session was kept/i)
  assert.equal(originalSocket.ended, false)
  await runtime.shutdown()
})

test('successful replacement commits a new auth path and archives the previous one', async t => {
  const { runtime, root, sockets } = await fixture(t, { registered: true })
  await runtime.start('private')
  const originalSocket = runtime.get('private').socket
  const originalAuthDir = runtime.get('private').authDir
  const pending = runtime.requestPairingCode('private', '2348012345678')
  await new Promise(resolveWait => setTimeout(resolveWait, 0))
  const replacementSocket = sockets[1]
  replacementSocket.ev.emit('connection.update', { qr: 'replace-ready' })
  assert.equal(await pending, 'private-5678')
  replacementSocket.ev.emit('connection.update', { connection: 'open' })
  const startedAt = Date.now()
  while (runtime.get('private').socket !== replacementSocket && Date.now() - startedAt < 500) {
    await new Promise(resolveWait => setTimeout(resolveWait, 5))
  }
  assert.equal(runtime.get('private').socket, replacementSocket)
  assert.notEqual(runtime.get('private').authDir, originalAuthDir)
  assert.equal(runtime.get('private').registered, true)
  assert.equal(runtime.get('private').lastPairingSuccessAt > 0, true)
  assert.equal(originalSocket.ended, true)
  const locations = JSON.parse(await readFile(join(root, 'whatsapp-auth-locations.json'), 'utf8'))
  assert.equal(locations.private, runtime.get('private').authDir)
  assert.equal((await readdir(join(root, 'whatsapp-auth-backups'))).length, 1)
  await runtime.shutdown()
})

test('phone-number pairing fails promptly when WhatsApp closes before readiness', async t => {
  const { runtime, sockets } = await fixture(t)
  await runtime.start('private')
  const pending = runtime.requestPairingCode('private', '2348012345678')
  await new Promise(resolveWait => setTimeout(resolveWait, 0))
  sockets[1].ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: Object.assign(new Error('Connection Closed'), { output: { statusCode: 428 } }) },
  })
  await assert.rejects(pending, /Connection Closed/)
  assert.deepEqual(sockets[1].pairingRequests, [])
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
