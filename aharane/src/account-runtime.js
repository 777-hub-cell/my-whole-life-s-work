import { chmod, lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
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
      })().catch(error => {
        authDirectoriesReady = null
        throw error
      })
    }
    return authDirectoriesReady
  }

  function candidateRoot(id) {
    return resolve(dirname(directories[id]), '.aharane-auth-candidates', id)
  }

  async function readActiveAuthDirectory(session) {
    const pointerPath = directories[session.id] + '.active'
    const pointer = await readFile(pointerPath, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return ''
      throw error
    })
    if (!pointer.trim()) return directories[session.id]
    const active = resolve(pointer.trim())
    const root = candidateRoot(session.id)
    if (!active.startsWith(root + sep)) {
      throw new Error('The saved WhatsApp authentication pointer is outside its protected account directory.')
    }
    const info = await lstat(active).catch(error => {
      if (error.code === 'ENOENT') throw new Error('The active WhatsApp authentication directory is missing; the previous session backup has been preserved.')
      throw error
    })
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error('The active WhatsApp authentication path must be a real directory.')
    }
    return active
  }

  async function writeActiveAuthDirectory(session, directory) {
    const pointerPath = directories[session.id] + '.active'
    const target = resolve(directory)
    if (target === directories[session.id]) {
      await rm(pointerPath, { force: true })
      return
    }
    const root = candidateRoot(session.id)
    if (!target.startsWith(root + sep)) {
      throw new Error('A replacement WhatsApp session must use its own protected candidate directory.')
    }
    const temporary = pointerPath + '.' + randomUUID() + '.tmp'
    await writeFile(temporary, target + '\n', { mode: 0o600 })
    try {
      await rename(temporary, pointerPath)
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {})
      throw error
    }
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
    pairingBlockedUntil: 0,
    qr: '',
    pairingCandidate: null,
    pairingSucceeded: false,
    pairingError: '',
    replacementPending: null,
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
      pairingRetryAt: null,
      connected: session.state === 'connected',
      registered: session.registered,
      reconnectAttempts: session.reconnectAttempts,
      lastConnectedAt: session.lastConnectedAt || null,
      pairingInProgress: session.pairRequestActive || Boolean(session.pairingCandidate),
      pairingSucceeded: session.pairingSucceeded,
      pairingError: session.pairingError,
    }
  }

  function pairingQr(id) {
    const session = get(id)
    return session.pairingCandidate?.qr || ''
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

  function scheduleReconnect(id, { immediate = false } = {}) {
    const session = get(id)
    if (shuttingDown || session.manuallyStopped || session.reconnectTimer ||
        session.state === 'needs-pairing' || session.state === 'reconnect-exhausted' ||
        session.state === 'not-paired' || session.state === 'rate-limited' ||
        session.state === 'stopped') return
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
    const delayMs = immediate ? 0 : Math.min(
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
      session.authDir = await readActiveAuthDirectory(session)
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
          session.pairingBlockedUntil = 0
          session.state = 'connected'
          session.reconnectAttempts = 0
          session.lastConnectedAt = Date.now()
          if (session.replacementPending) {
            clearTimeout(session.replacementPending.timeoutTimer)
            session.replacementPending = null
            session.pairingSucceeded = true
            session.pairingError = ''
          }
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
          const replacement = session.replacementPending
          if (replacement) {
            session.socket = null
            session.qr = ''
            logger.error?.({
              event: 'whatsapp.replacement-session-restart-failed',
              accountId: id,
              disconnect: disconnectDetails(disconnectError),
            })
            void serializeSessionOperation(id, () => rollbackReplacementInternal(id, replacement, disconnectError))
              .catch(error => logger.error?.({ event: 'whatsapp.replacement-rollback-failed', accountId: id, error: String(error?.message || error) }))
            emit()
            return
          }
          const wasUnregisteredPairing = !session.registered &&
            (session.pairRequestActive || session.state === 'pairing')
          const pairingRateLimited = (session.pairingCodeIssued || session.pairRequestActive || session.state === 'pairing') && isPairingRateLimit(disconnectError)
          session.socket = null
          session.pairingCodeIssued = false
          if (pairingRateLimited) {
            clearUnfinishedPairingCredentials(session)
            session.registered = false
            session.state = session.registered ? 'disconnected' : 'not-paired'
            session.pairingBlockedUntil = 0
            logger.warn?.({ event: 'whatsapp.pairing-rate-limited', accountId: id, disconnect: disconnectDetails(disconnectError) })
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
              disconnect: disconnectDetails(disconnectError),
            })
            emit()
            return
          }
          if (code === 515 && session.registered) {
            // Baileys emits restartRequired (515) after a successful device link.
            // Re-open the socket with the freshly persisted credentials immediately.
            session.state = 'reconnecting'
            session.reconnectAttempts = 0
            emit()
            scheduleReconnect(id, { immediate: true })
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
            disconnect: disconnectDetails(disconnectError),
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
      } else if (session.replacementPending) {
        const replacement = session.replacementPending
        session.state = 'disconnected'
        emit()
        queueMicrotask(() => {
          void serializeSessionOperation(id, () => rollbackReplacementInternal(id, replacement, error))
            .catch(rollbackError => logger.error?.({ event: 'whatsapp.replacement-rollback-failed', accountId: id, error: String(rollbackError?.message || rollbackError) }))
        })
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

  function disconnectDetails(error) {
    if (!error) return { name: null, message: 'Connection closed without an error object.' }
    return {
      name: String(error?.name || 'Error'),
      message: String(error?.message || error).slice(0, 400),
      statusCode: error?.output?.statusCode ?? error?.statusCode ?? error?.status ?? null,
      code: error?.code ?? error?.cause?.code ?? null,
      errno: error?.errno ?? error?.cause?.errno ?? null,
      syscall: error?.syscall ?? error?.cause?.syscall ?? null,
      address: error?.address ?? error?.cause?.address ?? null,
      port: error?.port ?? error?.cause?.port ?? null,
      cause: error?.cause?.message ? String(error.cause.message).slice(0, 240) : null,
    }
  }

  function isPairingRateLimit(error) {
    const statusCode = error?.output?.statusCode ?? error?.statusCode ?? error?.status
    const message = String(error?.message || error || '')
    return statusCode === 429 || /rate[-_\s]?overlimit|peer.{0,24}rate|rate.{0,24}limit/i.test(message)
  }

  function pairingRateLimitError() {
    return Object.assign(new Error('WhatsApp refused this pairing attempt because of its own rate limit. The existing account session has not been changed; try again when WhatsApp allows it.'), { status: 429 })
  }

  function candidateFailureMessage(error) {
    if (isPairingRateLimit(error)) return pairingRateLimitError().message
    const details = disconnectDetails(error)
    return 'The replacement WhatsApp link did not complete (' + details.message + '). Your previous session was kept. You can try pairing again.'
  }

  async function saveCandidate(candidate) {
    candidate.saveChain = candidate.saveChain.catch(() => {}).then(() => candidate.auth.saveCreds?.())
    await candidate.saveChain
  }

  async function discardCandidateInternal(session, candidate, error) {
    if (session.pairingCandidate !== candidate) return
    session.pairingCandidate = null
    candidate.closed = true
    clearTimeout(candidate.expiryTimer)
    session.qr = ''
    session.pairingError = candidateFailureMessage(error)
    try { candidate.socket?.end?.(error) } catch {}
    await rm(candidate.authDir, { recursive: true, force: true }).catch(() => {})
    logger.warn?.({
      event: 'whatsapp.replacement-pairing-failed',
      accountId: session.id,
      disconnect: disconnectDetails(error),
    })
    emit()
  }

  async function rollbackReplacementInternal(id, replacement, error) {
    const session = get(id)
    if (session.replacementPending !== replacement) return
    clearTimeout(replacement.timeoutTimer)
    const failedSocket = session.socket
    session.socket = null
    if (failedSocket) {
      try { failedSocket.end?.(error) } catch {}
    }
    await writeActiveAuthDirectory(session, replacement.previousAuthDir)
    session.authDir = replacement.previousAuthDir
    session.auth = null
    session.registered = replacement.previousRegistered
    session.replacementPending = null
    session.pairingSucceeded = false
    session.pairingError = candidateFailureMessage(error)
    session.qr = ''
    session.reconnectAttempts = 0
    if (replacement.previousSocketActive ||
        (replacement.previousRegistered && !['stopped', 'needs-pairing', 'reconnect-exhausted'].includes(replacement.previousState))) {
      session.manuallyStopped = false
      try {
        await startInternal(id)
      } catch (restoreError) {
        logger.error?.({
          event: 'whatsapp.previous-session-restore-failed',
          accountId: id,
          error: String(restoreError?.message || restoreError),
        })
      }
    } else {
      session.state = replacement.previousState
    }
    logger.warn?.({
      event: 'whatsapp.replacement-rolled-back',
      accountId: id,
      previousAuthPreserved: true,
      reason: disconnectDetails(error),
    })
    emit()
  }

  async function promoteCandidateInternal(id, candidate) {
    const session = get(id)
    if (session.pairingCandidate !== candidate || candidate.promoting || candidate.closed) return
    candidate.promoting = true
    try {
      await saveCandidate(candidate)
      if (candidate.auth.state?.creds) candidate.auth.state.creds.registered = true
      await saveCandidate(candidate)
      const previousAuthDir = session.authDir
      const previousRegistered = session.registered
      const previousState = session.state
      const previousSocketActive = Boolean(session.socket)
      if (session.auth?.saveCreds) await session.auth.saveCreds()
      // Persist the candidate pointer while the old socket is still usable. If
      // this fails, the existing session has not been interrupted.
      await writeActiveAuthDirectory(session, candidate.authDir)
      session.authDir = candidate.authDir
      session.auth = null
      session.registered = true
      session.manuallyStopped = false
      session.qr = ''
      session.pairingCandidate = null
      candidate.closed = true
      const replacement = {
        previousAuthDir,
        previousRegistered,
        previousState,
        previousSocketActive,
        timeoutTimer: null,
      }
      session.replacementPending = replacement
      if (session.socket) {
        const previousSocket = session.socket
        session.socket = null
        try { previousSocket.end?.(undefined) } catch {}
      }
      replacement.timeoutTimer = setTimeout(() => {
        void serializeSessionOperation(id, () => rollbackReplacementInternal(
          id,
          replacement,
          new Error('The newly linked WhatsApp session did not reconnect in time.')
        )).catch(error => logger.error?.({ event: 'whatsapp.replacement-rollback-failed', accountId: id, error: String(error?.message || error) }))
      }, 30000)
      replacement.timeoutTimer.unref?.()
      try { candidate.socket?.end?.(undefined) } catch {}
      session.state = 'connecting'
      session.reconnectAttempts = 0
      emit()
      await startInternal(id)
      logger.info?.({
        event: 'whatsapp.replacement-session-promoted',
        accountId: id,
        previousSessionPreserved: true,
        candidateAuthDirectory: candidate.authDir,
      })
    } catch (error) {
      if (session.pairingCandidate === candidate) {
        await discardCandidateInternal(session, candidate, error)
      } else if (session.replacementPending) {
        await rollbackReplacementInternal(id, session.replacementPending, error)
      } else {
        session.pairingError = candidateFailureMessage(error)
        emit()
      }
    }
  }

  async function createPairingCandidateInternal(id) {
    const session = get(id)
    if (session.pairingCandidate && !session.pairingCandidate.closed) {
      const previousCandidate = session.pairingCandidate
      session.pairingCandidate = null
      previousCandidate.closed = true
      previousCandidate.rejectReady?.(new Error('A newer pairing request replaced this pending attempt.'))
      try { previousCandidate.socket?.end?.(undefined) } catch {}
      await rm(previousCandidate.authDir, { recursive: true, force: true }).catch(() => {})
    }
    await verifyAuthDirectories()
    session.authDir = await readActiveAuthDirectory(session)
    if (!session.auth) {
      session.auth = await loadAuthState(session.authDir)
      session.registered = session.auth.state?.creds?.registered === true
    }
    const directory = join(candidateRoot(id), randomUUID())
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await chmod(directory, 0o700)
    const auth = await loadAuthState(directory)
    const candidate = {
      authDir: directory,
      auth,
      socket: null,
      qr: '',
      registered: false,
      pairingCodeIssued: false,
      readyPromise: null,
      resolveReady: null,
      rejectReady: null,
      saveChain: Promise.resolve(),
      closed: false,
      promoting: false,
      expiryTimer: null,
    }
    candidate.readyPromise = new Promise((resolveReady, rejectReady) => {
      candidate.resolveReady = resolveReady
      candidate.rejectReady = rejectReady
    })
    void candidate.readyPromise.catch(() => {})
    try {
      session.pairingCandidate = candidate
      candidate.expiryTimer = setTimeout(() => {
        void serializeSessionOperation(id, () => discardCandidateInternal(
          session,
          candidate,
          new Error('This WhatsApp pairing attempt expired. Start a fresh attempt to try again.')
        )).catch(error => logger.warn?.({ event: 'whatsapp.pairing-expiry-failed', accountId: id, error: String(error?.message || error) }))
      }, 120000)
      candidate.expiryTimer.unref?.()
      const socket = makeSocket({ sessionId: id, auth: auth.state, pairingCandidate: true })
      if (!socket?.ev?.on) throw new Error('WhatsApp pairing socket factory returned an invalid socket.')
      candidate.socket = socket
      session.pairingError = ''
      session.pairingSucceeded = false
      socket.ev.on('creds.update', () => {
        candidate.registered = auth.state?.creds?.registered === true
        void saveCandidate(candidate).catch(error => {
          logger.warn?.({ event: 'auth.pairing-candidate-save-failed', accountId: id, error: String(error?.message || error) })
        })
      })
      socket.ev.on('connection.update', update => {
        if (session.pairingCandidate !== candidate || candidate.closed) return
        if (update?.qr) {
          candidate.qr = String(update.qr)
          candidate.resolveReady?.()
          candidate.resolveReady = null
          candidate.rejectReady = null
          emit()
        }
        if (update?.isNewLogin) {
          candidate.registered = true
          void saveCandidate(candidate).catch(error => {
            logger.warn?.({ event: 'auth.pairing-candidate-save-failed', accountId: id, error: String(error?.message || error) })
          })
        }
        if (update?.connection === 'open') {
          candidate.registered = true
          if (auth.state?.creds) auth.state.creds.registered = true
          candidate.qr = ''
          candidate.resolveReady?.()
          candidate.resolveReady = null
          candidate.rejectReady = null
          void saveCandidate(candidate).then(() =>
            serializeSessionOperation(id, () => promoteCandidateInternal(id, candidate))
          ).catch(error => {
            logger.error?.({ event: 'whatsapp.replacement-promote-failed', accountId: id, error: String(error?.message || error) })
          })
          return
        }
        if (update?.connection === 'close') {
          const error = update.lastDisconnect?.error || new Error('WhatsApp closed before the replacement account linked.')
          candidate.qr = ''
          candidate.rejectReady?.(error)
          candidate.resolveReady = null
          candidate.rejectReady = null
          candidate.registered = candidate.registered || auth.state?.creds?.registered === true
          void saveCandidate(candidate).then(() => {
            if (candidate.registered && Number(error?.output?.statusCode) === 515) {
              return serializeSessionOperation(id, () => promoteCandidateInternal(id, candidate))
            }
            return serializeSessionOperation(id, () => discardCandidateInternal(session, candidate, error))
          }).catch(saveError => {
            logger.error?.({ event: 'whatsapp.replacement-close-save-failed', accountId: id, error: String(saveError?.message || saveError) })
          })
        }
        emit()
      })
      logger.info?.({ event: 'whatsapp.replacement-pairing-started', accountId: id })
      emit()
      return candidate
    } catch (error) {
      session.pairingCandidate = candidate.socket ? candidate : null
      await discardCandidateInternal(session, candidate, error)
      throw error
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
    if (session.pairRequestActive) throw Object.assign(new Error('A pairing-code request is already in progress.'), { status: 409 })
    session.pairRequestActive = true
    session.pairingError = ''
    session.pairingSucceeded = false
    emit()
    try {
      const candidate = await createPairingCandidateInternal(id)
      await waitUntilCandidateReady(candidate)
      if (session.pairingCandidate !== candidate || candidate.closed) {
        throw new Error('The replacement WhatsApp pairing attempt closed before a code was requested.')
      }
      if (pairingReadyDelayMs > 0) await wait(pairingReadyDelayMs)
      const code = await candidate.socket.requestPairingCode(phoneNumber)
      candidate.pairingCodeIssued = true
      candidate.qr = ''
      emit()
      return String(code).replace(/\s/g, '')
    } catch (error) {
      const candidate = session.pairingCandidate
      if (candidate) {
        await discardCandidateInternal(session, candidate, error)
      } else {
        session.pairingError = candidateFailureMessage(error)
        emit()
      }
      logger.error?.({
        event: 'whatsapp.pairing-code-request-failed',
        accountId: id,
        disconnect: disconnectDetails(error),
        rateLimited: isPairingRateLimit(error),
      })
      throw isPairingRateLimit(error) ? pairingRateLimitError() : error
    } finally {
      session.pairRequestActive = false
      emit()
    }
  }

  async function waitUntilCandidateReady(candidate, timeoutMs = 20000) {
    let timer
    try {
      await Promise.race([
        candidate.readyPromise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('WhatsApp pairing socket did not become ready. Check the server network connection and retry.')), timeoutMs)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  async function cancelPairingInternal(id) {
    const session = get(id)
    if (session.pairingCandidate) {
      const candidate = session.pairingCandidate
      session.pairingCandidate = null
      candidate.closed = true
      clearTimeout(candidate.expiryTimer)
      candidate.rejectReady?.(new Error('This WhatsApp replacement attempt was cancelled.'))
      try { candidate.socket?.end?.(undefined) } catch {}
      await rm(candidate.authDir, { recursive: true, force: true }).catch(() => {})
      session.pairingError = ''
      session.pairingSucceeded = false
      emit()
      return sessionSnapshot(session)
    }
    if (session.replacementPending) {
      await rollbackReplacementInternal(
        id,
        session.replacementPending,
        new Error('The replacement WhatsApp link was cancelled before it became active.')
      )
      session.pairingError = ''
      emit()
    }
    return sessionSnapshot(session)
  }

  async function startPairingInternal(id) {
    const session = get(id)
    const candidate = await createPairingCandidateInternal(id)
    return {
      ...sessionSnapshot(session),
      qr: candidate.qr,
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
    session.qr = ''
    if (session.pairingCandidate) {
      const candidate = session.pairingCandidate
      session.pairingCandidate = null
      candidate.closed = true
      clearTimeout(candidate.expiryTimer)
      candidate.rejectReady?.(new Error('WhatsApp pairing was cancelled because the account was stopped.'))
      try { candidate.socket?.end?.(undefined) } catch {}
      await rm(candidate.authDir, { recursive: true, force: true }).catch(() => {})
    }
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

  async function repairInternal(id, _backupRoot) {
    const session = get(id)
    if (session.pairRequestActive) {
      throw Object.assign(new Error('This account is already processing a pairing request.'), { status: 409 })
    }
    // Kept for older clients: repair now starts a safe replacement candidate.
    // The previously linked auth directory and socket remain untouched until
    // WhatsApp confirms the new link and Aharane promotes it.
    const candidate = await createPairingCandidateInternal(id)
    return {
      ...sessionSnapshot(session),
      replacementSession: true,
      previousSessionPreserved: true,
      backupCreated: false,
      qr: candidate.qr,
    }
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
  function cancelPairing(id) { return serializeSessionOperation(id, () => cancelPairingInternal(id)) }
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
    startPairing,
    cancelPairing,
    requestPairingCode,
    reconnect,
    stop,
    restart,
    repair,
    shutdown,
  }
}
