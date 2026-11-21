import { chmod, lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'

const SESSION_IDS = Object.freeze(['private', 'public'])

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
  reconnectLimit = 3,
  pairingReadyDelayMs = 1500,
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
  const authLocationsFile = resolve(String(authDirs?.locationsFile || join(dirname(directories.public), 'whatsapp-auth-locations.json')))
  const backupDirectory = resolve(String(authDirs?.backups || join(dirname(directories.public), 'whatsapp-auth-backups')))
  if (directories.private === directories.public ||
      directories.private.startsWith(directories.public + sep) ||
      directories.public.startsWith(directories.private + sep)) {
    throw new Error('Private and public WhatsApp accounts must use separate authentication directories.')
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
        const savedLocations = await readAuthLocations()
        for (const id of SESSION_IDS) {
          const savedPath = String(savedLocations[id] || '').trim()
          if (!savedPath) continue
          const candidate = resolve(savedPath)
          if (dirname(candidate) !== dirname(directories[id])) {
            throw new Error('Saved WhatsApp authentication locations must stay beside their original account directory.')
          }
          const info = await lstat(candidate)
          if (!info.isDirectory() || info.isSymbolicLink()) {
            throw new Error('Saved WhatsApp authentication locations must be real directories, not links.')
          }
          await chmod(candidate, 0o700)
          const actual = await realpath(candidate)
          for (const previous of canonical) {
            if (previous.id !== id && (actual === previous.path || actual.startsWith(previous.path + sep) || previous.path.startsWith(actual + sep))) {
              throw new Error('Private and public WhatsApp accounts must use separate authentication directories.')
            }
          }
          sessions.get(id).authDir = actual
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
    pairingCodeIssued: false,
    pendingPairing: null,
    pairingError: '',
    lastPairingSuccessAt: 0,
    qr: '',
    manuallyStopped: false,
  }]))
  let shuttingDown = false

  function get(id) {
    return sessions.get(accountId(id))
  }

  async function readAuthLocations() {
    try {
      const value = JSON.parse(await readFile(authLocationsFile, 'utf8'))
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    } catch (error) {
      if (error?.code === 'ENOENT') return {}
      throw error
    }
  }

  let authLocationWriteTail = Promise.resolve()
  function persistAuthLocation(id, directory) {
    const current = authLocationWriteTail.catch(() => {}).then(async () => {
      const locations = await readAuthLocations()
      locations[id] = resolve(directory)
      await mkdir(dirname(authLocationsFile), { recursive: true, mode: 0o700 })
      const temporary = authLocationsFile + '.tmp-' + randomUUID()
      try {
        await writeFile(temporary, JSON.stringify(locations, null, 2), { mode: 0o600, flag: 'wx' })
        await chmod(temporary, 0o600)
        await rename(temporary, authLocationsFile)
      } catch (error) {
        await rm(temporary, { force: true }).catch(() => {})
        throw error
      }
    })
    authLocationWriteTail = current.catch(() => {})
    return current
  }

  function sessionSnapshot(session) {
    return {
      id: session.id,
      state: session.state,
      connected: session.state === 'connected',
      registered: session.registered,
      reconnectAttempts: session.reconnectAttempts,
      lastConnectedAt: session.lastConnectedAt || null,
      pairingInProgress: session.pairRequestActive || Boolean(session.pendingPairing),
      pairingError: session.pairingError || '',
      lastPairingSuccessAt: session.lastPairingSuccessAt || 0,
    }
  }

  function pairingQr(id) {
    const session = get(id)
    return session.pendingPairing?.qr || ''
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
        session.state === 'needs-pairing' || session.state === 'reconnect-exhausted' ||
        session.state === 'not-paired' || session.state === 'stopped') return
    if (session.reconnectAttempts >= reconnectLimit) {
      session.state = 'reconnect-exhausted'
      logger.error?.({
        event: 'whatsapp.reconnect-limit-reached',
        accountId: id,
        attempts: session.reconnectAttempts,
        reconnectLimit,
      })
      emit()
      return
    }
    session.reconnectAttempts += 1
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
          session.pairingCodeIssued = false
                session.state = 'connected'
          session.reconnectAttempts = 0
          session.lastConnectedAt = Date.now()
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
          const wasUnregisteredPairing = !session.registered &&
            (session.pairRequestActive || session.state === 'pairing')
          const pairingRateLimited = (session.pairingCodeIssued || session.pairRequestActive || session.state === 'pairing') && isPairingRateLimit(disconnectError)
          session.socket = null
          session.pairingCodeIssued = false
          if (pairingRateLimited) {
            clearUnfinishedPairingCredentials(session)
            session.registered = false
            session.state = 'not-paired'
            session.pairingError = 'WhatsApp is rate-limiting the pairing request. Aharane has not added a cooldown; you can retry when WhatsApp is ready.'
            logger.warn?.({ event: 'whatsapp.pairing-rate-limited', accountId: id })
            emit()
            return
          }
          if (wasUnregisteredPairing) {
            // A failed first-time link is not a broken saved session. Do not
            // reconnect or re-use a pairing socket that WhatsApp has closed.
            clearUnfinishedPairingCredentials(session)
            session.registered = false
            session.state = 'not-paired'
            logger.error?.({
              event: 'whatsapp.pairing-connection-closed',
              accountId: id,
              code: Number.isFinite(code) ? code : null,
              reason: String(disconnectError?.message || 'Pairing connection closed').slice(0, 240),
            })
            emit()
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
          logger.warn?.({
            event: 'whatsapp.connection-closed',
            accountId: id,
            code: Number.isFinite(code) ? code : null,
            reason: String(disconnectError?.message || 'Connection closed').slice(0, 240),
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
      session.qr = ''
      if (!session.registered) {
        // Initial pairing failures must wait for an explicit user request.
        session.state = 'not-paired'
        emit()
      } else {
        session.state = 'disconnected'
        emit()
        scheduleReconnect(id)
      }
      throw error
    } finally {
      session.startPromise = null
    }
  }

  function isPairingRateLimit(error) {
    const statusCode = error?.output?.statusCode ?? error?.statusCode ?? error?.status
    const message = String(error?.message || error || '')
    return statusCode === 429 || /rate[-_\s]?overlimit|peer.{0,24}rate|rate.{0,24}limit/i.test(message)
  }

  function pairingRateLimitError() {
    return Object.assign(new Error('WhatsApp is rate-limiting this pairing request. Aharane has not added a cooldown; you can retry when WhatsApp is ready.'), { status: 429 })
  }

  function clearUnfinishedPairingCredentials(session) {
    const auth = session.auth
    const creds = auth?.state?.creds
    if (!creds) return
    creds.registered = false
    delete creds.me
    delete creds.pairingCode
    delete creds.pairingEphemeralKeyPair
    void Promise.resolve(auth.saveCreds?.()).catch(() => {
      logger.warn?.({ event: 'auth.pairing-reset-save-failed', accountId: session.id })
    })
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

  function makeReadySignal() {
    let resolveReady
    let rejectReady
    const promise = new Promise((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    void promise.catch(() => {})
    return { promise, resolve: resolveReady, reject: rejectReady }
  }

  async function discardPendingPairing(session, pending, reason, { suppressError = false } = {}) {
    if (!pending || pending.promoted || session.pendingPairing !== pending) return
    session.pendingPairing = null
    pending.rejectReady?.(reason instanceof Error ? reason : new Error(String(reason || 'Pairing attempt ended.')))
    try { pending.socket?.end?.(undefined) } catch {}
    await rm(pending.authDir, { recursive: true, force: true }).catch(error => {
      logger.warn?.({ event: 'whatsapp.pairing-staging-cleanup-failed', accountId: session.id, error: String(error?.message || error) })
    })
    if (session.state === 'pairing') {
      session.state = pending.previousState || (session.registered ? 'disconnected' : 'not-paired')
    }
    session.pairingError = suppressError ? '' : String(reason?.message || reason || 'WhatsApp pairing failed.').slice(0, 300)
    emit()
  }

  function handlePromotedSocketClose(session, socket, update) {
    if (session.socket !== socket) return
    const disconnectError = update?.lastDisconnect?.error
    const code = disconnectError?.output?.statusCode
    session.socket = null
    session.qr = ''
    session.pairingCodeIssued = false
    if (code === loggedOutCode || code === 401 || code === 403) {
      session.registered = false
      session.state = 'needs-pairing'
      session.pairingError = 'WhatsApp no longer accepts the saved linked-device session. You can link a replacement; the old credentials will be kept until the new link succeeds.'
      logger.error?.({ event: 'whatsapp.auth-rejected', accountId: session.id, code })
      emit()
      return
    }
    session.state = 'disconnected'
    logger.warn?.({
      event: 'whatsapp.connection-closed',
      accountId: session.id,
      code: Number.isFinite(code) ? code : null,
      reason: String(disconnectError?.message || 'Connection closed').slice(0, 240),
    })
    emit()
    scheduleReconnect(session.id)
  }

  async function commitPendingPairing(session, pending) {
    if (pending.promoted || session.pendingPairing !== pending) return
    if (pending.commitPromise) return pending.commitPromise
    pending.commitPromise = (async () => {
      // The WhatsApp open event is the commit point. Before it, the old auth
      // path/socket remains authoritative. After it, the new store is selected.
      await pending.auth.saveCreds?.()
      if (pending.auth.state?.creds) pending.auth.state.creds.registered = true
      const oldAuthDir = session.authDir
      const oldAuth = session.auth
      const oldSocket = session.socket
      await oldAuth?.saveCreds?.()
      await persistAuthLocation(session.id, pending.authDir)

      session.authDir = pending.authDir
      session.auth = pending.auth
      session.registered = true
      session.socket = pending.socket
      session.pendingPairing = null
      session.pairingCodeIssued = false
      session.pairingError = ''
      session.lastPairingSuccessAt = Date.now()
      session.reconnectAttempts = 0
      session.state = 'connected'
      session.lastConnectedAt = Date.now()
      pending.promoted = true
      pending.resolveReady?.()
      pending.resolveReady = null
      pending.rejectReady = null

      // Replace the socket only after the new device has opened successfully.
      if (oldSocket && oldSocket !== pending.socket) {
        try { oldSocket.end?.(undefined) } catch {}
      }
      if (pending.closedDuringCommit) handlePromotedSocketClose(session, pending.socket, pending.closedDuringCommit)
      if (oldAuthDir && oldAuthDir !== pending.authDir) {
        try {
          const old = await stat(oldAuthDir)
          if (old.isDirectory()) {
            await mkdir(backupDirectory, { recursive: true, mode: 0o700 })
            await chmod(backupDirectory, 0o700)
            const backupName = session.id + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8)
            await rename(oldAuthDir, join(backupDirectory, backupName))
          }
        } catch (error) {
          if (error?.code !== 'ENOENT') {
            logger.warn?.({ event: 'whatsapp.previous-auth-backup-failed', accountId: session.id, error: String(error?.message || error) })
          }
        }
      }
      logger.info?.({ event: 'whatsapp.pairing-replacement-committed', accountId: session.id })
      emit()
    })()
    return pending.commitPromise
  }

  async function createPendingPairing(session) {
    if (session.pendingPairing?.commitPromise) {
      throw Object.assign(new Error('The new WhatsApp link is finishing. Wait for it to complete before starting another attempt.'), { status: 409 })
    }
    if (session.pendingPairing) {
      await discardPendingPairing(session, session.pendingPairing, 'Replaced by a fresh pairing attempt.', { suppressError: true })
    }
    if (session.startPromise) await session.startPromise.catch(() => {})
    await verifyAuthDirectories()
    const authDir = join(dirname(session.authDir), '.' + basename(session.authDir) + '.pair-' + randomUUID())
    await mkdir(authDir, { recursive: true, mode: 0o700 })
    await chmod(authDir, 0o700)
    const previousState = session.state
    let pending = null
    try {
      const auth = await loadAuthState(authDir)
      const ready = makeReadySignal()
      pending = {
        authDir,
        auth,
        socket: null,
        qr: '',
        previousState,
        readyPromise: ready.promise,
        resolveReady: ready.resolve,
        rejectReady: ready.reject,
        promoted: false,
        commitPromise: null,
      }
      session.pendingPairing = pending
      session.pairingError = ''
      session.pairingCodeIssued = false
      if (session.state !== 'connected') session.state = 'pairing'
      const socket = makeSocket({ sessionId: session.id, auth: auth.state })
      if (!socket?.ev?.on) throw new Error('WhatsApp socket factory returned an invalid pairing socket.')
      pending.socket = socket

      socket.ev.on('creds.update', () => {
        void Promise.resolve(auth.saveCreds?.()).catch(() => {
          logger.warn?.({ event: 'auth.pairing-save-failed', accountId: session.id })
        })
      })
      socket.ev.on('connection.update', update => {
        Promise.resolve(onConnection({ sessionId: session.id, socket, update })).catch(error => {
          logger.warn?.({ event: 'whatsapp.connection-hook-failed', accountId: session.id, error: String(error?.message || error) })
        })
        if (pending.promoted) {
          if (update?.connection === 'open' && session.socket === socket) {
            session.registered = true
            session.state = 'connected'
            session.reconnectAttempts = 0
            session.lastConnectedAt = Date.now()
            emit()
          } else if (update?.connection === 'close') {
            handlePromotedSocketClose(session, socket, update)
          }
          return
        }
        if (update?.qr) {
          pending.qr = String(update.qr)
          pending.resolveReady?.()
          pending.resolveReady = null
          pending.rejectReady = null
          emit()
        }
        if (update?.connection === 'open') {
          pending.qr = ''
          if (auth.state?.creds) auth.state.creds.registered = true
          pending.resolveReady?.()
          pending.resolveReady = null
          pending.rejectReady = null
          void commitPendingPairing(session, pending).catch(async error => {
            logger.error?.({ event: 'whatsapp.pairing-commit-failed', accountId: session.id, error: String(error?.message || error) })
            await discardPendingPairing(session, pending, new Error('WhatsApp linked the replacement, but Aharane could not save the new session: ' + String(error?.message || error)))
          })
          return
        }
        if (update?.connection === 'close' && session.pendingPairing === pending && pending.commitPromise) {
          pending.closedDuringCommit = update
          return
        }
        if (update?.connection === 'close' && session.pendingPairing === pending && !pending.commitPromise) {
          const disconnectError = update.lastDisconnect?.error
          const code = disconnectError?.output?.statusCode ?? disconnectError?.statusCode ?? null
          const reason = String(disconnectError?.message || disconnectError || 'WhatsApp closed the pairing connection').slice(0, 220)
          const rateLimited = isPairingRateLimit(disconnectError)
          const message = rateLimited
            ? 'WhatsApp is rate-limiting this pairing attempt. Aharane has not added a cooldown; you can retry when WhatsApp is ready.'
            : 'WhatsApp pairing connection closed' + (code == null ? '' : ' (' + code + ')') + ': ' + reason + '. Your previous session was kept; you can retry.'
          logger.error?.({ event: 'whatsapp.pairing-attempt-closed', accountId: session.id, code, rateLimited, reason })
          void discardPendingPairing(session, pending, new Error(message))
        }
      })
      socket.ev.on('call', calls => {
        if (session.socket !== socket || session.manuallyStopped || shuttingDown) return
        Promise.resolve(onCalls({ sessionId: session.id, socket, calls })).catch(error => {
          logger.warn?.({ event: 'whatsapp.call-hook-failed', accountId: session.id, error: String(error?.message || error) })
        })
      })
      socket.ev.on('messages.upsert', event => {
        if (session.socket !== socket || session.manuallyStopped || shuttingDown) return
        Promise.resolve(onMessages({ sessionId: session.id, socket, event })).catch(() => {
          logger.warn?.({ event: 'message.handler-failed', accountId: session.id })
        })
      })
      socket.ev.on('messages.update', updates => {
        if (session.socket !== socket || session.manuallyStopped || shuttingDown) return
        Promise.resolve(onMessageUpdates({ sessionId: session.id, socket, updates })).catch(() => {
          logger.warn?.({ event: 'message-update.handler-failed', accountId: session.id })
        })
      })
      socket.ev.on('messages.delete', update => {
        if (session.socket !== socket || session.manuallyStopped || shuttingDown) return
        Promise.resolve(onMessageDeletes({ sessionId: session.id, socket, update })).catch(() => {
          logger.warn?.({ event: 'message-delete.handler-failed', accountId: session.id })
        })
      })
      logger.info?.({ event: 'whatsapp.pairing-socket-started', accountId: session.id, replacement: session.registered })
      emit()
      return pending
    } catch (error) {
      if (pending?.socket) { try { pending.socket.end?.(error) } catch {} }
      if (session.pendingPairing === pending) session.pendingPairing = null
      await rm(authDir, { recursive: true, force: true }).catch(() => {})
      session.pairingError = String(error?.message || error).slice(0, 300)
      if (session.state === 'pairing') session.state = previousState
      emit()
      throw error
    }
  }

  async function waitForPendingPairing(pending, timeoutMs = 20000) {
    let timer
    try {
      await Promise.race([
        pending.readyPromise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('WhatsApp pairing socket did not become ready. Retry the pairing request.')), timeoutMs)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  async function startPairingInternal(id) {
    const session = get(id)
    if (session.pairRequestActive) throw Object.assign(new Error('A pairing request is already in progress.'), { status: 409 })
    await createPendingPairing(session)
    return sessionSnapshot(session)
  }

  async function requestPairingCodeInternal(id, phoneNumber) {
    const session = get(id)
    if (session.pairRequestActive) throw Object.assign(new Error('A pairing request is already in progress.'), { status: 409 })
    session.pairRequestActive = true
    session.pairingError = ''
    emit()
    let pending = null
    try {
      pending = await createPendingPairing(session)
      await waitForPendingPairing(pending)
      if (pairingReadyDelayMs > 0) await wait(pairingReadyDelayMs)
      if (session.pendingPairing !== pending) throw new Error('The pairing attempt changed before WhatsApp was ready. Start a fresh attempt.')
      const code = await pending.socket.requestPairingCode(phoneNumber)
      session.pairingCodeIssued = true
      emit()
      return String(code).replace(/\\s/g, '')
    } catch (error) {
      const rateLimited = isPairingRateLimit(error)
      const failure = rateLimited
        ? Object.assign(new Error('WhatsApp is rate-limiting this pairing request. Aharane has not added a cooldown; you can retry when WhatsApp is ready.'), { status: 429 })
        : error
      if (pending && !pending.promoted) await discardPendingPairing(session, pending, failure)
      else if (!pending) {
        session.pairingError = String(failure?.message || failure).slice(0, 300)
        emit()
      }
      logger.error?.({
        event: 'whatsapp.pairing-code-request-failed',
        accountId: id,
        statusCode: error?.output?.statusCode ?? error?.status ?? null,
        rateLimited,
        error: String(error?.message || error),
      })
      throw failure
    } finally {
      session.pairRequestActive = false
      emit()
    }
  }

  async function reconnect(id) {
    const session = get(id)
    if (session.state === 'needs-pairing' || session.state === 'reconnect-exhausted') {
      throw Object.assign(new Error('This WhatsApp session needs repair. Use Re-pair after backing up its saved authentication before pairing again.'), { status: 409 })
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
    if (session.pendingPairing) await discardPendingPairing(session, session.pendingPairing, 'Pairing was stopped.', { suppressError: true })
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
    await stopInternal(id)
    await wait(150)
    session.manuallyStopped = false
    await startInternal(id)
    return sessionSnapshot(session)
  }

  async function repairInternal(id, backupRoot) {
    const session = get(id)
    if (!['needs-pairing', 'reconnect-exhausted'].includes(session.state)) {
      throw Object.assign(new Error('Re-pair is only available after WhatsApp rejects the saved session or automatic reconnect attempts are exhausted.'), { status: 409 })
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
    await persistAuthLocation(id, session.authDir)
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
  function startPairing(id) { return serializeSessionOperation(id, () => startPairingInternal(id)) }
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
    startPairing,
    waitUntilReady,
    requestPairingCode,
    reconnect,
    stop,
    restart,
    repair,
    shutdown,
  }
}
