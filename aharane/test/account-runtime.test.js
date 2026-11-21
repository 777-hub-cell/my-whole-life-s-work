import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAccountRuntime } from '../src/account-runtime.js'

async function fixture(t, { pairingError = null, registered = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'aharane-accounts-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const authLoads = []
  const authContexts = []
  const sockets = []
  const savedAuth = new Map()
  const runtime = createAccountRuntime({
    authDirs: { public: join(root, 'public-auth'), private: join(root, 'private-auth') },
    loadAuthState: async authDir => {
      authLoads.push(authDir)
      const saved = savedAuth.get(authDir)
      const auth = {
        state: { creds: saved ? JSON.parse(JSON.stringify(saved)) : { registered } },
        saveCount: 0,
        async saveCreds() {
          this.saveCount += 1
          savedAuth.set(authDir, JSON.parse(JSON.stringify(this.state.creds)))
        },
      }
      authContexts.push(auth)
      return auth
    },
    makeSocket: ({ sessionId, auth, pairingCandidate = false }) => {
      const socket = {
        sessionId,
        pairingCandidate,
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
  return { root, runtime, authLoads, authContexts, sockets, savedAuth }
}

async function waitFor(predicate, timeoutMs = 700) {
  const started = Date.now()
  while (!predicate() && Date.now() - started < timeoutMs) {
    await new Promise(resolveWait => setTimeout(resolveWait, 2))
  }
  assert.ok(predicate(), 'Timed out waiting for the expected account runtime state.')
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

test('pairing code is requested only from the selected account candidate socket', async t => {
  const { runtime, sockets } = await fixture(t)
  await runtime.start('private')
  await runtime.start('public')
  const pending = runtime.requestPairingCode('private', '2348012345678')
  await waitFor(() => sockets.length === 3)
  sockets[2].ev.emit('connection.update', { qr: 'pair-device-ready' })
  const code = await pending
  assert.equal(code, 'private-5678')
  assert.equal(sockets[2].pairingCandidate, true)
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
  const { runtime, sockets } = await fixture(t, { registered: true })
  await runtime.start('private')
  sockets[0].ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } })
  assert.equal(runtime.get('private').state, 'needs-pairing')
  assert.equal(runtime.get('public').state, 'starting')
  await assert.rejects(runtime.reconnect('private'), /re-pair/i)
  await runtime.shutdown()
})

test('legacy repair starts a candidate and preserves the selected account authentication', async t => {
  const { runtime, root } = await fixture(t, { registered: true })
  const privateDir = join(root, 'private-auth')
  await runtime.start('private')
  const originalSocket = runtime.get('private').socket
  await import('node:fs/promises').then(fs => fs.writeFile(join(privateDir, 'creds.json'), 'test-auth'))
  runtime.get('private').state = 'needs-pairing'
  const result = await runtime.repair('private', join(root, 'auth-backups'))
  assert.equal(result.replacementSession, true)
  assert.equal(result.previousSessionPreserved, true)
  assert.equal(result.backupCreated, false)
  assert.equal(runtime.get('private').socket, originalSocket)
  assert.equal(runtime.get('private').authDir, privateDir)
  assert.equal(await readFile(join(privateDir, 'creds.json'), 'utf8'), 'test-auth')
  assert.ok(runtime.get('private').pairingCandidate)
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
  await assert.rejects(runtime.reconnect('private'), /needs re-pairing/i)
  await runtime.shutdown()
})

test('legacy repair also preserves authentication after automatic reconnect attempts are exhausted', async t => {
  const { runtime, root } = await fixture(t, { registered: true })
  await runtime.start('private')
  await import('node:fs/promises').then(fs => fs.writeFile(join(root, 'private-auth', 'creds.json'), 'test-auth'))
  runtime.get('private').state = 'reconnect-exhausted'
  const result = await runtime.repair('private', join(root, 'auth-backups'))
  assert.equal(result.replacementSession, true)
  assert.equal(runtime.get('private').state, 'reconnect-exhausted')
  assert.equal(runtime.get('private').registered, true)
  assert.equal(runtime.get('private').authDir, join(root, 'private-auth'))
  assert.equal(await readFile(join(root, 'private-auth', 'creds.json'), 'utf8'), 'test-auth')
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

test('pairing QR is exposed from the replacement candidate while an old session exists', async t => {
  const { runtime } = await fixture(t, { registered: true })
  await runtime.start('private')
  const originalSocket = runtime.get('private').socket
  await runtime.startPairing('private')
  const candidateSocket = runtime.get('private').pairingCandidate.socket
  candidateSocket.ev.emit('connection.update', { qr: 'private-real-qr-value' })
  assert.equal(runtime.pairingQr('private'), 'private-real-qr-value')
  assert.equal(runtime.pairingQr('public'), '')
  assert.equal(runtime.get('private').socket, originalSocket)
  candidateSocket.ev.emit('connection.update', { connection: 'open' })
  assert.equal(runtime.pairingQr('private'), '')
  await runtime.shutdown()
})
test('never-paired accounts stay dormant until an explicit pairing candidate is requested', async t => {
  const { runtime, sockets } = await fixture(t)
  const result = await runtime.start('public', { deferUnregistered: true })
  assert.equal(result, null)
  assert.equal(runtime.get('public').state, 'not-paired')
  assert.equal(runtime.get('public').registered, false)
  assert.equal(sockets.length, 0)
  await assert.rejects(runtime.reconnect('public'), /not been paired/i)
  const pending = runtime.requestPairingCode('public', '447700900123')
  await waitFor(() => Boolean(runtime.get('public').pairingCandidate))
  runtime.get('public').pairingCandidate.socket.ev.emit('connection.update', { qr: 'pair-device-ready' })
  assert.equal(await pending, 'public-0123')
  assert.equal(sockets.length, 1)
  await runtime.shutdown()
})
test('phone-number pairing waits for candidate pair-device readiness, not only connecting', async t => {
  const { runtime, sockets } = await fixture(t)
  await runtime.start('private')
  const pending = runtime.requestPairingCode('private', '2348012345678')
  await waitFor(() => sockets.length === 2)
  sockets[1].ev.emit('connection.update', { connection: 'connecting' })
  await new Promise(resolveWait => setTimeout(resolveWait, 0))
  assert.deepEqual(sockets[1].pairingRequests, [])
  sockets[1].ev.emit('connection.update', { qr: 'pair-device-ready' })
  assert.equal(await pending, 'private-5678')
  assert.deepEqual(sockets[1].pairingRequests, ['2348012345678'])
  await runtime.shutdown()
})
test('WhatsApp rate limiting is surfaced without an Aharane cooldown or damage to the old session', async t => {
  const error = Object.assign(new Error('rate-overlimit'), { output: { statusCode: 429 } })
  const { runtime, sockets } = await fixture(t, { pairingError: error, registered: true })
  await runtime.start('private')
  const originalSocket = runtime.get('private').socket
  originalSocket.ev.emit('connection.update', { connection: 'open' })
  const originalAuthDir = runtime.get('private').authDir

  const pending = runtime.requestPairingCode('private', '2348012345678')
  await waitFor(() => sockets.length === 2)
  sockets[1].ev.emit('connection.update', { qr: 'candidate-ready' })
  await assert.rejects(pending, /WhatsApp refused this pairing attempt/i)

  assert.equal(runtime.get('private').state, 'connected')
  assert.equal(runtime.get('private').socket, originalSocket)
  assert.equal(runtime.get('private').authDir, originalAuthDir)
  assert.equal(runtime.get('private').registered, true)
  assert.equal('pairingBlockedUntil' in runtime.get('private'), false)
  assert.match(runtime.get('private').pairingError, /existing account session has not been changed/i)

  await runtime.startPairing('private')
  await waitFor(() => sockets.length === 3)
  assert.ok(runtime.get('private').pairingCandidate)
  await runtime.shutdown()
})
test('pairing candidate closes promptly when WhatsApp disconnects before readiness', async t => {
  const { runtime, sockets } = await fixture(t)
  await runtime.start('private')
  const pending = runtime.requestPairingCode('private', '2348012345678')
  await waitFor(() => sockets.length === 2)
  sockets[1].ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: Object.assign(new Error('Connection Closed'), { output: { statusCode: 428 } }) },
  })
  await assert.rejects(pending, /Connection Closed/)
  assert.deepEqual(sockets[1].pairingRequests, [])
  assert.equal(runtime.get('private').socket, sockets[0])
  assert.equal(runtime.get('private').pairingCandidate, null)
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


test('a failed replacement pairing leaves the existing connected session untouched', async t => {
  const { runtime, sockets } = await fixture(t, { registered: true })
  await runtime.start('private')
  const oldSocket = runtime.get('private').socket
  oldSocket.ev.emit('connection.update', { connection: 'open' })
  const oldAuthDir = runtime.get('private').authDir

  await runtime.startPairing('private')
  const candidate = runtime.get('private').pairingCandidate
  candidate.socket.ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: Object.assign(new Error('WebSocket Error ()'), { output: { statusCode: 0 }, code: 'ECONNRESET' }) },
  })
  await waitFor(() => runtime.get('private').pairingCandidate === null)

  assert.equal(runtime.get('private').socket, oldSocket)
  assert.equal(runtime.get('private').state, 'connected')
  assert.equal(runtime.get('private').authDir, oldAuthDir)
  assert.equal(runtime.get('private').registered, true)
  assert.match(runtime.get('private').pairingError, /previous session was kept/i)
  assert.match(runtime.get('private').pairingError, /ECONNRESET/i)
  assert.equal(oldSocket.ended, false)
  await runtime.shutdown()
})

test('canceling a replacement candidate leaves the existing socket and auth directory untouched', async t => {
  const { runtime } = await fixture(t, { registered: true })
  await runtime.start('private')
  const oldSocket = runtime.get('private').socket
  oldSocket.ev.emit('connection.update', { connection: 'open' })
  const oldAuthDir = runtime.get('private').authDir

  await runtime.startPairing('private')
  const candidate = runtime.get('private').pairingCandidate
  assert.ok(candidate)
  const candidateDir = candidate.authDir
  await runtime.cancelPairing('private')

  assert.equal(runtime.get('private').pairingCandidate, null)
  assert.equal(runtime.get('private').socket, oldSocket)
  assert.equal(runtime.get('private').state, 'connected')
  assert.equal(runtime.get('private').authDir, oldAuthDir)
  await assert.rejects(import('node:fs/promises').then(fs => fs.stat(candidateDir)), { code: 'ENOENT' })
  await runtime.shutdown()
})

test('a successful replacement candidate becomes active only after linking and keeps the previous auth directory', async t => {
  const { runtime, sockets } = await fixture(t, { registered: true })
  await runtime.start('private')
  const oldSocket = runtime.get('private').socket
  oldSocket.ev.emit('connection.update', { connection: 'open' })
  const oldAuthDir = runtime.get('private').authDir

  await runtime.startPairing('private')
  const candidate = runtime.get('private').pairingCandidate
  candidate.auth.state.creds.registered = true
  candidate.socket.ev.emit('creds.update')
  candidate.socket.ev.emit('connection.update', { connection: 'open' })
  await waitFor(() => sockets.length === 3 && runtime.get('private').socket !== oldSocket)

  assert.equal(runtime.get('private').authDir, candidate.authDir)
  assert.equal(oldSocket.ended, true)
  assert.equal(candidate.socket.ended, true)
  assert.equal(runtime.get('private').pairingSucceeded, false)

  const replacementSocket = runtime.get('private').socket
  replacementSocket.ev.emit('connection.update', { connection: 'open' })
  assert.equal(runtime.get('private').pairingSucceeded, true)
  assert.equal(runtime.get('private').state, 'connected')
  assert.equal(runtime.get('private').registered, true)
  assert.equal(runtime.get('private').authDir, candidate.authDir)
  assert.notEqual(runtime.get('private').authDir, oldAuthDir)
  await runtime.shutdown()
})

test('an explicit stop cancels an in-flight replacement without restoring a running session', async t => {
  const { runtime, sockets } = await fixture(t, { registered: true })
  await runtime.start('private')
  const oldSocket = runtime.get('private').socket
  oldSocket.ev.emit('connection.update', { connection: 'open' })
  const oldAuthDir = runtime.get('private').authDir

  await runtime.startPairing('private')
  const candidate = runtime.get('private').pairingCandidate
  candidate.auth.state.creds.registered = true
  candidate.socket.ev.emit('creds.update')
  candidate.socket.ev.emit('connection.update', { connection: 'open' })
  await waitFor(() => runtime.get('private').replacementPending !== null && sockets.length === 3)

  await runtime.stop('private')
  assert.equal(runtime.get('private').state, 'stopped')
  assert.equal(runtime.get('private').socket, null)
  assert.equal(runtime.get('private').replacementPending, null)
  assert.equal(runtime.get('private').authDir, oldAuthDir)
  await new Promise(resolveWait => setTimeout(resolveWait, 40))
  assert.equal(sockets.length, 3, 'An explicit stop must not schedule rollback or automatic restart.')
  await runtime.shutdown()
})

test('a new WhatsApp link that fails to reconnect rolls back to the previous authentication', async t => {
  const { runtime, sockets } = await fixture(t, { registered: true })
  await runtime.start('private')
  const oldSocket = runtime.get('private').socket
  oldSocket.ev.emit('connection.update', { connection: 'open' })
  const oldAuthDir = runtime.get('private').authDir

  await runtime.startPairing('private')
  const candidate = runtime.get('private').pairingCandidate
  candidate.auth.state.creds.registered = true
  candidate.socket.ev.emit('creds.update')
  candidate.socket.ev.emit('connection.update', { connection: 'open' })
  await waitFor(() => sockets.length === 3 && runtime.get('private').socket !== oldSocket)

  const failedReplacementSocket = runtime.get('private').socket
  failedReplacementSocket.ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: Object.assign(new Error('Replacement socket failed'), { output: { statusCode: 500 } }) },
  })
  await waitFor(() => sockets.length === 4 && runtime.get('private').authDir === oldAuthDir)
  const restoredSocket = runtime.get('private').socket
  restoredSocket.ev.emit('connection.update', { connection: 'open' })

  assert.equal(runtime.get('private').socket, restoredSocket)
  assert.equal(runtime.get('private').registered, true)
  assert.equal(runtime.get('private').pairingSucceeded, false)
  assert.match(runtime.get('private').pairingError, /previous session was kept/i)
  await runtime.shutdown()
})
