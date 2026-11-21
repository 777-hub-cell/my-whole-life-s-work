import { chmod, lstat, mkdir, realpath, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'

const SESSION_IDS = Object.freeze(['private', 'public'])
const PEER_RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000

function accountId(value) {
  const id = String(value || '').trim().toLowerCase()
  if (!SESSION_IDS.includes(id)) throw new Error('Choose either the private or public WhatsApp account.')
  return id
}

function wait(ms) {
  return new Promise(resolveWait => setTimeout(resolveWait, ms))
}

/**
 * Owns two isolated Baileys sessions. The public session keeps the original
 * Aharane auth directory so existing installations retain their linked device.
 * The private session always uses a different auth directory.
 */
export function createAccountRuntime({
  authDirs,
  rateLimitFile = '',
  loadAuthState,
  makeSocket,
  onMessages = async () => {},
  onMessageUpdates = async () => {},
  onMessageDeletes = async () => {},
  onCalls = async () => {},
  onConnection = async () => {},
  publish = () => {},
  logger = console,
  loggedOutCode = 401,
  reconnectBaseMs = 2000,
  reconnectMaxMs = 60000,
  reconnectLimit = 12,
}) {
  if (typeof loadAuthState !== 'function' || typeof makeSocket !== 'function') {
    throw new TypeError('Account runtime requires auth-state and socket factories.')
  }

  const privatePath = String(authDirs?.private || '').trim()
  const publicPath = String(authDirs?.public || '').trim()
  if (!privatePath || !publicPath) {
    throw new Error('Private and public WhatsApp account authentication directories are required.')
  }
  const directories = {
    private: resolve(privatePath),
    public: resolve(publicPath),
  }
  if (directories.private === directories.public ||
      directories.private.startsWith(directories.public + sep) ||
      directories.public.startsWith(directories.private + sep)) {
    throw new Error('Private and public WhatsApp accounts must use separate authentication directories.')
  }

  const rateLimitPath = String(rateLimitFile || '').trim()
  let rateLimitsReady = null
  let rateLimitWrite = Promise.resolve()

  async function ensureRateLimitsLoaded() {
    if (!rateLimitPath) return
    if (!rateLimitsReady) {
      rateLimitsReady = (async () => {
        const raw = await readFile(rateLimitPath, 'utf8').catch(() => '')
        let saved = {}
        try { saved = raw ? JSON.parse(raw) : {} } catch {
          logger.warn?.({ event: 'whatsapp.rate-limit-state-invalid' })
        }
        for (const id of SESSION_IDS) {
          const until = Number(saved?.[id]?.until || 0)
          if (Number.isFinite(until) && until > Date.now()) {
            const session = sessions.get(id)
            session.rateLimitedUntil = until
            session.lastError = 'WhatsApp temporarily rate-limited this account. Wait before retrying.'
            session.state = 'rate-limited'
          }
        }
      })().catch(error => {
        rateLimitsReady = null
        logger.warn?.({ event: 'whatsapp.rate-limit-state-read-failed', error: String(error?.message || error) })
      })
    }
    await rateLimitsReady
  }

  function persistRateLimits() {
    if (!rateLimitPath) return
    const payload = Object.fromEntries(SESSION_IDS
      .map(id => [id, sessions.get(id).rateLimitedUntil])
      .filter(([, until]) => until > Date.now())
      .map(([id, until]) => [id, { until }]))
    rateLimitWrite = rateLimitWrite.then(async () => {
      const temporary = rateLimitPath + '.' + process.pid + '.' + randomUUID() + '.tmp'
      await writeFile(temporary, JSON.stringify(payload), { mode: 0o600 })
      await rename(temporary, rateLimitPath)
    }).catch(error => {
      logger.warn?.({ event: 'whatsapp.rate-limit-state-write-failed', error: String(error?.message || error) })
    })
    return rateLimitWrite
  }

  function isPeerRateLimitError(error) {
    const status = Number(error?.output?.statusCode ?? error?.statusCode ?? error?.status)
    const message = [
      error?.message,
      error?.data,
      error?.output?.payload?.message,
      error?.output?.payload?.error,
    ].filter(Boolean).join(' ')
    return status === 429 || /peer.{0,20}rate.?limit|rate.?limit|too many requests|throttl/i.test(message)
  }

  function rateLimitError(session) {
    const remainingMs = Math.max(0, session.rateLimitedUntil - Date.now())
    const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000))
    return Object.assign(
      new Error('WhatsApp has temporarily rate-limited this account. Wait ' +
        Math.ceil(remainingMs / 60_000) + ' minute(s) before trying again.'),
      { status: 429, retryAfterSeconds }
    )
  }

  function assertNotRateLimited(session) {
    if (session.rateLimitedUntil > Date.now()) throw rateLimitError(session)
    if (session.rateLimitedUntil) {
      session.rateLimitedUntil = 0
      session.lastError = ''
      if (session.state === 'rate-limited') session.state = session.registered ? 'disconnected' : 'not-paired'
      void persistRateLimits()
    }
  }

  function markPeerRateLimited(session, error) {
    const staleSocket = session.socket
    session.socket = null
    if (staleSocket) {
      try { staleSocket.end?.(undefined) } catch {}
    }
    session.rateLimitedUntil = Date.now() + PEER_RATE_LIMIT_COOLDOWN_MS
    session.lastError = 'WhatsApp temporarily rate-limited this account. Wait 15 minutes before retrying.'
    session.state = 'rate-limited'
    session.reconnectAttempts = 0
    if (session.reconnectTimer) clearTimeout(session.reconnectTimer)
    session.reconnectTimer = null
    logger.error?.({
      event: 'whatsapp.peer-rate-limited',
      accountId: session.id,
      retryAfterAt: new Date(session.rateLimitedUntil).toISOString(),
      statusCode: error?.output?.statusCode ?? error?.statusCode ?? error?.status ?? null,
      error: String(error?.message || error),
    })
    void persistRateLimits()
    emit()
  }

  let authDirectoriesReady = null
  async function verifyAuthDirectories() {
    if (!authDirectoriesReady) {
      authDirectoriesReady = (async () => {
        const canonical = []
        for (const id of SESSION_IDS) {
          const directory = directories[id]
          await mkdir(directory, { recursive: true, mode: 0o700 })
          const info = await lstat(directory)
          if (!info.isDirectory() || info.isSymbolicLink()) {
            throw new Error('WhatsApp account authentication paths must be real directories, not links.')
          }
          await chmod(directory, 0o700)
          const actual = await realpath(directory)
          for (const previous of canonical) {
            if (actual === previous.path ||
                actual.startsWith(previous.path + sep) ||
                previous.path.startsWith(actual + sep)) {
              throw new Error('Private and public WhatsApp accounts must use separate authentication directories.')
            }
          }
          canonical.push({ id, path: actual })
        }
      })().catch(error => {
        authDirectoriesReady = null
        throw error
      })
    }
    return authDirectoriesReady
  }

  const sessions = new Map(SESSION_IDS.map(id => [id, {
    id,
    authDir: directories[id],
    socket: null,
    auth: null,
    state: 'starting',
    registered: false,
    reconnectAttempts: 0,
    lastConnectedAt: 0,
    reconnectTimer: null,
    startPromise: null,
    readyPromise: Promise.resolve(),
    resolveReady: null,
    rejectReady: null,
    pairRequestActive: false,
    rateLimitedUntil: 0,
    lastError: '',
    qr: '',
    manuallyStopped: false,
  }]))
  let shuttingDown = false

  function get(id) {
    return sessions.get(accountId(id))
  }

  function sessionSnapshot(session) {
    return {
      id: session.id,
      state: session.state,
      connected: session.state === 'connected',
      registered: session.registered,
      reconnectAttempts: session.reconnectAttempts,
      lastConnectedAt: session.lastConnectedAt || null,
      pairingInProgress: session.pairRequestActive,
      rateLimitedUntil: session.rateLimitedUntil || null,
      lastError: session.lastError || '',
    }
  }

  function pairingQr(id) {
    const session = get(id)
    return session.state === 'connected' ? '' : session.qr
  }

  function snapshot() {
    const accounts = Object.fromEntries(SESSION_IDS.map(id => [id, sessionSnapshot(sessions.get(id))]))
    const primary = accounts.public
    return { ...primary, accounts }
  }

  function emit() {
    try { publish(snapshot()) } catch (error) {
      logger.warn?.({ event: 'account.status-publish-failed', error: String(error?.message || error) })
    }
  }

  function scheduleReconnect(id) {
    const session = get(id)
    if (shuttingDown || session.manuallyStopped || session.reconnectTimer ||
        session.state === 'needs-pairing' || session.state === 'stopped' ||
        session.state === 'rate-limited' || session.rateLimitedUntil > Date.now()) return
    session.reconnectAttempts += 1
    if (session.reconnectAttempts > reconnectLimit) {
      session.state = 'degraded'
      logger.error?.({ event: 'whatsapp.reconnect-limit-reached', accountId: id })
      emit()
      return
    }
    const delayMs = Math.min(
      reconnectMaxMs,
      reconnectBaseMs * (2 ** Math.min(5, session.reconnectAttempts - 1)),
    )
    session.state = 'reconnecting'
    emit()
    logger.warn?.({ event: 'whatsapp.reconnect-scheduled', accountId: id, attempt: session.reconnectAttempts, delayMs })
    session.reconnectTimer = setTimeout(() => {
      session.reconnectTimer = null
      void start(id).catch(() => scheduleReconnect(id))
    }, delayMs)
    session.reconnectTimer.unref?.()
  }

  async function startInternal(id, { deferUnregistered = false } = {}) {
    const session = get(id)
    if (shuttingDown) return null
    await ensureRateLimitsLoaded()
    assertNotRateLimited(session)
    if (session.socket) return session.socket
    if (session.startPromise) return session.startPromise
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer)
      session.reconnectTimer = null
    }
    session.manuallyStopped = false

    session.startPromise = (async () => {
      await verifyAuthDirectories()
      const auth = await loadAuthState(session.authDir)
      session.auth = auth
      session.registered = auth.state?.creds?.registered === true
      if (deferUnregistered && !session.registered) {
        session.state = 'not-paired'
        session.qr = ''
        emit()
        return null
      }
      session.readyPromise = new Promise((resolveReady, rejectReady) => {
        session.resolveReady = resolveReady
        session.rejectReady = rejectReady
      })
      // Keep a handler attached for sessions that close before a pairing request awaits readiness.
      void session.readyPromise.catch(() => {})

      const currentSocket = makeSocket({ sessionId: id, auth: auth.state })
      if (!currentSocket?.ev?.on) throw new Error('WhatsApp socket factory returned an invalid socket.')
      session.socket = currentSocket
      session.state = session.registered ? 'connecting' : 'pairing'
      emit()

      currentSocket.ev.on('creds.update', () => {
        session.registered = auth.state?.creds?.registered === true
        void Promise.resolve(auth.saveCreds?.()).catch(() => {
          logger.warn?.({ event: 'auth.save-failed', accountId: id })
        })
      })

      currentSocket.ev.on('connection.update', update => {
        Promise.resolve(onConnection({ sessionId: id, socket: currentSocket, update })).catch(error => logger.warn?.({ event: 'whatsapp.connection-hook-failed', accountId: id, error: String(error?.message || error) }))
        if (update?.qr) session.qr = String(update.qr)
        if (update?.connection === 'open' || update?.connection === 'close') session.qr = ''
        // Phone-number pairing must wait for WhatsApp's initial pair-device/QR
        // event, not merely the earlier transport-level "connecting" update.
        if (update?.qr || update?.connection === 'open') {
          session.resolveReady?.()
          session.resolveReady = null
          session.rejectReady = null
        }
        if (update?.connection === 'open') {
          session.registered = true
          session.state = 'connected'
          session.rateLimitedUntil = 0
          session.lastError = ''
          session.reconnectAttempts = 0
          session.lastConnectedAt = Date.now()
          void persistRateLimits()
          logger.info?.({ event: 'whatsapp.connected', accountId: id })
          emit()
          return
        }
        if (update?.connection === 'close') {
          // A stale socket's close event must never mutate a newer session.
          if (session.socket !== currentSocket) return
          session.rejectReady?.(
            update.lastDisconnect?.error || new Error('WhatsApp closed before the pairing session became ready.')
          )
          session.resolveReady = null
          session.rejectReady = null
          const disconnectError = update.lastDisconnect?.error
          const code = disconnectError?.output?.statusCode
          session.socket = null
          if (isPeerRateLimitError(disconnectError)) {
            markPeerRateLimited(session, disconnectError)
            return
          }
          if (code === loggedOutCode || code === 401 || code === 403) {
            session.registered = false
            session.state = 'needs-pairing'
            logger.error?.({ event: 'whatsapp.auth-rejected', accountId: id })
            emit()
            return
          }
          session.state = 'disconnected'
          session.lastError = String(disconnectError?.message || (Number.isFinite(code) ? 'WhatsApp WebSocket closed (' + code + ').' : 'WhatsApp WebSocket disconnected.'))
          logger.warn?.({
            event: 'whatsapp.connection-closed',
            accountId: id,
            code: Number.isFinite(code) ? code : null,
          })
          emit()
          scheduleReconnect(id)
        }
      })

      currentSocket.ev.on('call', calls => {
        if (session.socket !== currentSocket || session.manuallyStopped || shuttingDown) return
        Promise.resolve(onCalls({ sessionId: id, socket: currentSocket, calls })).catch(error => logger.warn?.({ event: 'whatsapp.call-hook-failed', accountId: id, error: String(error?.message || error) }))
      })

      currentSocket.ev.on('messages.upsert', event => {
        if (session.socket !== currentSocket || session.manuallyStopped || shuttingDown) return
        Promise.resolve(onMessages({ sessionId: id, socket: currentSocket, event })).catch(() => {
          logger.warn?.({ event: 'message.handler-failed', accountId: id })
        })
      })
      currentSocket.ev.on('messages.update', updates => {
        if (session.socket !== currentSocket || session.manuallyStopped || shuttingDown) return
        Promise.resolve(onMessageUpdates({ sessionId: id, socket: currentSocket, updates })).catch(() => {
          logger.warn?.({ event: 'message-update.handler-failed', accountId: id })
        })
      })
      currentSocket.ev.on('messages.delete', update => {
        if (session.socket !== currentSocket || session.manuallyStopped || shuttingDown) return
        Promise.resolve(onMessageDeletes({ sessionId: id, socket: currentSocket, update })).catch(() => {
          logger.warn?.({ event: 'message-delete.handler-failed', accountId: id })
        })
      })

      logger.info?.({ event: 'whatsapp.socket-started', accountId: id, registered: session.registered })
      return currentSocket
    })()

    try {
      return await session.startPromise
    } catch (error) {
      session.socket = null
      if (isPeerRateLimitError(error)) {
        markPeerRateLimited(session, error)
      } else {
        session.state = 'degraded'
        session.lastError = String(error?.message || 'WhatsApp connection failed.')
        emit()
        scheduleReconnect(id)
      }
      throw error
    } finally {
      session.startPromise = null
    }
  }

  async function waitUntilReady(id, timeoutMs = 20000) {
    const session = get(id)
    let timer
    try {
      await Promise.race([
        session.readyPromise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('WhatsApp connection is not ready; retry shortly.')), timeoutMs)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  async function requestPairingCodeInternal(id, phoneNumber) {
    const session = get(id)
    await ensureRateLimitsLoaded()
    assertNotRateLimited(session)
    if (session.pairRequestActive) throw Object.assign(new Error('A pairing request is already in progress.'), { status: 409 })
    if (session.registered) throw Object.assign(new Error('This WhatsApp account is already paired.'), { status: 409 })
    if (session.state === 'needs-pairing') {
      throw Object.assign(new Error('This saved session needs an explicit repair first. Existing authentication will be backed up before re-pairing.'), { status: 409 })
    }
    session.pairRequestActive = true
    emit()
    try {
      const currentSocket = session.socket || await startInternal(id)
      if (!currentSocket) throw new Error('WhatsApp socket is unavailable.')
      await waitUntilReady(id)
      if (session.socket !== currentSocket) throw new Error('WhatsApp session changed during pairing. Retry the request.')
      const code = await currentSocket.requestPairingCode(phoneNumber)
      session.state = 'pairing'
      emit()
      return String(code).replace(/\s/g, '')
    } catch (error) {
      if (isPeerRateLimitError(error)) markPeerRateLimited(session, error)
      logger.error?.({
        event: 'whatsapp.pairing-code-request-failed',
        accountId: id,
        statusCode: error?.output?.statusCode ?? error?.status ?? null,
        error: String(error?.message || error),
      })
      throw error
    } finally {
      session.pairRequestActive = false
      emit()
    }
  }

  async function reconnect(id) {
    const session = get(id)
    await ensureRateLimitsLoaded()
    assertNotRateLimited(session)
    if (session.state === 'needs-pairing') {
      throw Object.assign(new Error('This session was rejected by WhatsApp. Use Re-pair so its saved authentication is backed up first.'), { status: 409 })
    }
    if (!session.registered && !session.socket) {
      throw Object.assign(new Error('This WhatsApp account has not been paired yet. Use the explicit Pair action to request a code or QR.'), { status: 409 })
    }
    if (session.socket) return sessionSnapshot(session)
    session.manuallyStopped = false
    await start(id)
    return sessionSnapshot(session)
  }

  async function stopInternal(id) {
    const session = get(id)
    session.manuallyStopped = true
    session.qr = ''
    if (session.reconnectTimer) clearTimeout(session.reconnectTimer)
    session.reconnectTimer = null
    const currentSocket = session.socket
    session.rejectReady?.(new Error('WhatsApp session was stopped before pairing became ready.'))
    session.resolveReady = null
    session.rejectReady = null
    session.socket = null
    try { await session.auth?.saveCreds?.() } catch {
      logger.warn?.({ event: 'auth.save-on-stop-failed', accountId: session.id })
    }
    if (currentSocket) {
      try { currentSocket.end?.(undefined) } catch {}
    }
    session.state = 'stopped'
    emit()
    return sessionSnapshot(session)
  }

  async function restartInternal(id) {
    const session = get(id)
    await ensureRateLimitsLoaded()
    assertNotRateLimited(session)
    await stopInternal(id)
    await wait(150)
    session.manuallyStopped = false
    await startInternal(id)
    return sessionSnapshot(session)
  }

  async function repairInternal(id, backupRoot) {
    const session = get(id)
    if (session.state !== 'needs-pairing') {
      throw Object.assign(new Error('Re-pair is only available after WhatsApp rejects the saved session. Use reconnect for ordinary connection problems.'), { status: 409 })
    }
    if (session.pairRequestActive || session.startPromise) {
      throw Object.assign(new Error('This account is busy. Retry after its current operation finishes.'), { status: 409 })
    }
    const rawBackupRoot = String(backupRoot || '').trim()
    if (!rawBackupRoot) throw new Error('A protected authentication backup directory is required.')
    const root = resolve(rawBackupRoot)
    if (root === session.authDir || root.startsWith(session.authDir + sep) || session.authDir.startsWith(root + sep)) {
      throw new Error('Authentication backup must use a separate protected directory.')
    }
    await mkdir(root, { recursive: true, mode: 0o700 })
    await chmod(root, 0o700)
    // The rejected connection has already closed. Flush the latest credentials
    // before moving its directory so a repair never overwrites the only copy.
    if (session.auth?.saveCreds) await session.auth.saveCreds()
    if (session.socket) {
      const staleSocket = session.socket
      session.socket = null
      try { staleSocket.end?.(undefined) } catch {}
    }
    if (session.reconnectTimer) clearTimeout(session.reconnectTimer)
    session.reconnectTimer = null
    const existing = await stat(session.authDir).catch(error => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    let backupId = ''
    if (existing) {
      backupId = id + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8)
      const backupPath = join(root, backupId)
      await rename(session.authDir, backupPath)
    }
    await mkdir(session.authDir, { recursive: true, mode: 0o700 })
    await chmod(session.authDir, 0o700)
    session.registered = false
    // Back up and prepare the fresh auth directory, but do not create a
    // WhatsApp socket or generate a QR until the user explicitly asks.
    session.state = 'not-paired'
    session.qr = ''
    session.reconnectAttempts = 0
    emit()
    return { ...sessionSnapshot(session), backupCreated: Boolean(backupId) }
  }

  const sessionOperationTails = new Map()
  function serializeSessionOperation(id, operation) {
    const key = accountId(id)
    const previous = sessionOperationTails.get(key) || Promise.resolve()
    const current = previous.catch(() => {}).then(operation)
    let tracked
    tracked = current.catch(() => {}).finally(() => {
      if (sessionOperationTails.get(key) === tracked) sessionOperationTails.delete(key)
    })
    sessionOperationTails.set(key, tracked)
    return current
  }
  function start(id, options) { return serializeSessionOperation(id, () => startInternal(id, options)) }
  function requestPairingCode(id, phoneNumber) { return serializeSessionOperation(id, () => requestPairingCodeInternal(id, phoneNumber)) }
  function stop(id) { return serializeSessionOperation(id, () => stopInternal(id)) }
  function restart(id) { return serializeSessionOperation(id, () => restartInternal(id)) }
  function repair(id, backupRoot) { return serializeSessionOperation(id, () => repairInternal(id, backupRoot)) }

  async function shutdown() {
    shuttingDown = true
    await Promise.all(SESSION_IDS.map(id => serializeSessionOperation(id, () => stopInternal(id))))
  }

  return {
    get,
    snapshot,
    pairingQr,
    start,
    waitUntilReady,
    requestPairingCode,
    reconnect,
    stop,
    restart,
    repair,
    shutdown,
  }
}
