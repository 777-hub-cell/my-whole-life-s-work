import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createControlCentreApi } from './control-centre-api.js'

const PAGE = readFileSync(new URL('./panel.html', import.meta.url), 'utf8')
const MAX_BODY = 16 * 1024
const SESSION_AGE = 7 * 24 * 60 * 60
const LOGIN_WINDOW = 10 * 60 * 1000
const MAX_ATTEMPTS = 10

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...headers
  })
  res.end(body)
}

function sendHtml(res, status, body) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  })
  res.end(body)
}

async function readJson(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY) throw new Error('Request too large')
    chunks.push(chunk)
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

function getCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return ''
}

function origin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http'
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim()
  return host ? `${proto}://${host}` : ''
}

function mutationAllowed(req) {
  const o = String(req.headers.origin || '').trim()
  if (o) return o === origin(req)
  // Missing Origin is not proof of trust; accept only explicit same-origin Fetch Metadata.
  return String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'same-origin'
}

function ip(req) {
  // X-Forwarded-For is fully caller-controlled unless a verified reverse proxy
  // overwrites it. Never allow arbitrary public clients to evade login
  // throttling by rotating this header on every password attempt.
  return req.socket.remoteAddress || 'unknown'
}

export function startWebPanel({ port, host = '127.0.0.1', password, sessionSecret, localControlPort = 8788, nightPlayHandler = null, getState, getActivity = async () => [], getAccountDiagnostics = async () => null, pairAccount, reconnectAccount, disconnectAccount, removeAccount, repairAccount, createAccount, renameAccount, assignAccountProfile, setSetting, setPublicPrefix, getOwnerConfig, setOwnerConfig, getManagedEnv, setManagedEnv, listCommandModules, setProfileCapability, setDestination, reloadCommands, reloadCustomCommands, customCommandsDir, reloadModule, getCloudDashboard = async () => ({ provider:'MEGA', configured:false, targets:[] }), getCloudDashboardActive = async () => ({ provider:'MEGA', configured:false, targets:[] }), getCloudMounts = async () => [], verifyCloudFolder = async () => ({ success:false }) }) {
  const configured = Boolean(password && password !== 'change-this-password' && password !== 'change-me')
  const sessions = new Map()
  const attempts = new Map()
  const MAX_LOGIN_BUCKETS = 2048
  const MAX_SESSIONS = 2048

  function sessionFor(req) {
    const id = getCookie(req, 'mscc_session')
    const session = sessions.get(id)
    if (!session) return null
    if (session.expiresAt <= Date.now()) { sessions.delete(id); return null }
    return { id, ...session }
  }

  function trimSessions(now) {
    for (const [id, session] of sessions) if (session.expiresAt <= now) sessions.delete(id)
    while (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value)
  }

  function trimAttempts(now) {
    for (const [key, times] of attempts) {
      const fresh = times.filter(at => now - at < LOGIN_WINDOW)
      if (fresh.length) attempts.set(key, fresh)
      else attempts.delete(key)
    }
    while (attempts.size > MAX_LOGIN_BUCKETS) attempts.delete(attempts.keys().next().value)
  }
  const controlCentreApi = createControlCentreApi({
    password, getState, getActivity, getCloudDashboard, getCloudDashboardActive, getCloudMounts,
    createAccount, renameAccount, assignAccountProfile, pairAccount, reconnectAccount,
    disconnectAccount, repairAccount, removeAccount, setSetting, setPublicPrefix,
    getOwnerConfig, setOwnerConfig, getManagedEnv, setManagedEnv, listCommandModules, setProfileCapability,
    reloadCustomCommands, customCommandsDir,
  })

  function authed(req) {
    return configured && Boolean(sessionFor(req))
  }

  function cookie(req, value, maxAge = SESSION_AGE) {
    const secure = String(req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : ''
    return `mscc_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://mscc.local')
    try {
      // The NIGHT Control Centre UI is hosted on a separate website server.
      // This process exposes only its API; it never serves the website assets.
      if (url.pathname === '/api/control-centre' || url.pathname.startsWith('/api/control-centre/')) {
        return await controlCentreApi.handle(req, res, url)
      }
      if (url.pathname === '/api/night-play/rpc' && nightPlayHandler) return await nightPlayHandler(req, res)
      if (req.method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, { ok: true, service: 'mscc', panelConfigured: configured })
      }
      if (req.method === 'GET' && url.pathname === '/') return sendHtml(res, 200, PAGE)

      if (req.method === 'POST' && url.pathname === '/api/login') {
        if (!configured) return sendJson(res, 503, { error: 'Set WEB_PASSWORD first.' })
        if (!mutationAllowed(req)) return sendJson(res, 403, { error: 'Origin rejected' })
        const key = ip(req)
        const now = Date.now()
        trimAttempts(now)
        const list = attempts.get(key) || []
        if (list.length >= MAX_ATTEMPTS) return sendJson(res, 429, { error: 'Too many attempts. Try later.' })
        const body = await readJson(req)
        if (!safeEqual(body.password || '', password)) {
          list.push(now)
          attempts.set(key, list)
          trimAttempts(now)
          return sendJson(res, 401, { error: 'Wrong password' })
        }
        attempts.delete(key)
        const sessionId = randomBytes(32).toString('base64url')
        trimSessions(now)
        sessions.set(sessionId, { expiresAt: now + SESSION_AGE * 1000 })
        return sendJson(res, 200, { ok: true }, { 'set-cookie': cookie(req, sessionId) })
      }

      if (!authed(req)) return sendJson(res, 401, { error: 'Locked' })
      if (req.method !== 'GET' && !mutationAllowed(req)) return sendJson(res, 403, { error: 'Origin rejected' })

      if (req.method === 'POST' && url.pathname === '/api/logout') {
        if (!mutationAllowed(req)) return sendJson(res, 403, { error: 'Origin rejected' })
        const session = sessionFor(req)
        if (session) sessions.delete(session.id)
        return sendJson(res, 200, { ok: true }, { 'set-cookie': cookie(req, '', 0) })
      }
      if (req.method === 'GET' && url.pathname === '/api/state') {
        return sendJson(res, 200, await getState())
      }
      if (req.method === 'GET' && url.pathname === '/api/cloud') {
        return sendJson(res, 200, await getCloudDashboard())
      }
      if (req.method === 'GET' && url.pathname === '/api/activity') {
        return sendJson(res, 200, { entries: await getActivity(url.searchParams.get('limit')) })
      }
      const publicDiag = url.pathname.match(/^\/api\/accounts\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\/diagnostics$/)
      if (req.method === 'GET' && publicDiag) {
        const result = await getAccountDiagnostics(publicDiag[1], url.searchParams.get('limit'))
        return sendJson(res, result ? 200 : 404, result || { error: 'Unknown account' })
      }
      if (req.method === 'POST' && url.pathname === '/api/settings') {
        const body = await readJson(req)
        if (typeof body.key !== 'string' || typeof body.value !== 'boolean') {
          return sendJson(res, 400, { error: 'Invalid setting' })
        }
        await setSetting(body.key, body.value)
        return sendJson(res, 200, { ok: true })
      }
      if (req.method === 'POST' && url.pathname === '/api/accounts') {
        if (typeof createAccount !== 'function') return sendJson(res, 501, { error: 'Dynamic account creation is not enabled yet' })
        return sendJson(res, 200, await createAccount(await readJson(req)))
      }
      if (req.method === 'POST' && url.pathname === '/api/destination') {
        const body = await readJson(req)
        return sendJson(res, 200, { ok: true, destination: await setDestination(body.account) })
      }
      if (req.method === 'POST' && url.pathname === '/api/commands/reload') {
        return sendJson(res, 200, { ok: true, commands: await reloadCommands() })
      }

      const moduleMatch = url.pathname.match(/^\/api\/modules\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\/reload$/)
      if (req.method === 'POST' && moduleMatch) {
        if (typeof reloadModule !== 'function') return sendJson(res, 501, { error: 'Module reload is not enabled' })
        return sendJson(res, 200, await reloadModule(moduleMatch[1]))
      }

      const m = url.pathname.match(/^\/api\/accounts\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\/(pair|reconnect|disconnect|repair)$/)
      if (req.method === 'POST' && m) {
        const [, id, action] = m
        const body = await readJson(req)
        if (action === 'pair') {
          const mode = body.mode === 'qr' ? 'qr' : 'code'
          return sendJson(res, 200, await pairAccount(id, mode))
        }
        if (action === 'reconnect') return sendJson(res, 200, await reconnectAccount(id))
        if (action === 'disconnect') return sendJson(res, 200, await disconnectAccount(id))
        if (body.confirm !== true) return sendJson(res, 400, { error: 'Re-pair requires confirmation' })
        return sendJson(res, 200, await repairAccount(id, body.mode === 'qr' ? 'qr' : 'code'))
      }

      const renameMatch = url.pathname.match(/^\/api\/accounts\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})$/)
      if (req.method === 'PATCH' && renameMatch) {
        if (typeof renameAccount !== 'function') return sendJson(res, 501, { error: 'Account rename is not enabled' })
        const body = await readJson(req)
        return sendJson(res, 200, await renameAccount(renameMatch[1], body.displayName))
      }

      const profileMatch = url.pathname.match(/^\/api\/accounts\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\/profile$/)
      if (req.method === 'POST' && profileMatch) {
        if (typeof assignAccountProfile !== 'function') return sendJson(res, 501, { error: 'Profile assignment is not enabled' })
        const body = await readJson(req)
        if (typeof body.profileId !== 'string') return sendJson(res, 400, { error: 'profileId is required' })
        return sendJson(res, 200, await assignAccountProfile(profileMatch[1], body.profileId))
      }

      const removeMatch = url.pathname.match(/^\/api\/accounts\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})$/)
      if (req.method === 'DELETE' && removeMatch) {
        if (url.searchParams.get('confirm') !== 'true') {
          return sendJson(res, 400, { error: 'Account removal requires confirm=true' })
        }
        if (typeof removeAccount !== 'function') return sendJson(res, 501, { error: 'Account removal is not enabled' })
        return sendJson(res, 200, await removeAccount(removeMatch[1]))
      }

      return sendJson(res, 404, { error: 'Not found' })
    } catch (error) {
      console.error('Web request failed:', error?.message || error)
      return sendJson(res, 500, { error: error?.message || 'Internal error' })
    }
  })

  const localServer = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://mscc.local')
    try {
      if (req.method === 'GET' && url.pathname === '/state') {
        return sendJson(res, 200, await getState())
      }
      // Cortex must ask NIGHT itself to change command settings. NIGHT owns
      // the in-memory settings object and /var/lib/mscc/data; a separately
      // sandboxed Cortex process must never replace that private JSON file.
      // This route is on the existing 127.0.0.1-only control listener, not
      // the public password-gated web panel.
      if (req.method === 'POST' && url.pathname === '/settings') {
        const body = await readJson(req)
        if (typeof body.key !== 'string' ||
            !/^[A-Za-z_][A-Za-z0-9._-]{0,79}$/.test(body.key) ||
            typeof body.value !== 'boolean') {
          return sendJson(res, 400, { error: 'Invalid command setting' })
        }
        await setSetting(body.key, body.value)
        return sendJson(res, 200, { ok: true })
      }
      if (req.method === 'POST' && url.pathname === '/cloud/verify') {
        const body = await readJson(req)
        return sendJson(res, 200, await verifyCloudFolder({ targetId:body.targetId }))
      }
      if (req.method === 'GET' && url.pathname === '/cloud/discover') {
        // Compatibility for older Cortex APKs that silently call GET on every
        // Cloud refresh. Do not authenticate to MEGA from a read-only request.
        return sendJson(res, 200, { mounts: [], signInRequired: true })
      }
      if (req.method === 'POST' && url.pathname === '/cloud/discover/explicit') {
        // A deliberate button action must use POST; no automatic login from
        // old Cortex GET clients, even before they upgrade their APK.
        return sendJson(res, 200, { mounts: await getCloudMounts() })
      }
      if (req.method === 'GET' && url.pathname === '/cloud') {
        return sendJson(res, 200, await getCloudDashboard())
      }
      if (req.method === 'GET' && url.pathname === '/activity') {
        return sendJson(res, 200, { entries: await getActivity(url.searchParams.get('limit')) })
      }
      const localDiag = url.pathname.match(/^\/accounts\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\/diagnostics$/)
      if (req.method === 'GET' && localDiag) {
        const result = await getAccountDiagnostics(localDiag[1], url.searchParams.get('limit'))
        return sendJson(res, result ? 200 : 404, result || { error: 'Unknown account' })
      }
      if (req.method === 'POST' && url.pathname === '/accounts') {
        if (typeof createAccount !== 'function') return sendJson(res, 501, { error: 'Dynamic account creation is not enabled yet' })
        return sendJson(res, 200, await createAccount(await readJson(req)))
      }
      if (req.method === 'POST' && url.pathname === '/destination') {
        const body = await readJson(req)
        return sendJson(res, 200, { ok: true, destination: await setDestination(body.account) })
      }
      if (req.method === 'POST' && url.pathname === '/commands/reload') {
        return sendJson(res, 200, { ok: true, commands: await reloadCommands() })
      }
      const moduleMatch = url.pathname.match(/^\/modules\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\/reload$/)
      if (req.method === 'POST' && moduleMatch) {
        if (typeof reloadModule !== 'function') return sendJson(res, 501, { error: 'Module reload is not enabled' })
        return sendJson(res, 200, await reloadModule(moduleMatch[1]))
      }

      const m = url.pathname.match(/^\/accounts\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\/(pair|reconnect|disconnect|repair)$/)
      if (req.method === 'POST' && m) {
        const [, id, action] = m
        const body = await readJson(req)
        if (action === 'pair') {
          const mode = body.mode === 'qr' ? 'qr' : 'code'
          return sendJson(res, 200, await pairAccount(id, mode))
        }
        if (action === 'reconnect') return sendJson(res, 200, await reconnectAccount(id))
        if (action === 'disconnect') return sendJson(res, 200, await disconnectAccount(id))
        return sendJson(res, 200, await repairAccount(id, body.mode === 'qr' ? 'qr' : 'code'))
      }

      const renameMatch = url.pathname.match(/^\/accounts\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})$/)
      if (req.method === 'PATCH' && renameMatch) {
        if (typeof renameAccount !== 'function') return sendJson(res, 501, { error: 'Account rename is not enabled' })
        const body = await readJson(req)
        return sendJson(res, 200, await renameAccount(renameMatch[1], body.displayName))
      }

      const profileMatch = url.pathname.match(/^\/accounts\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\/profile$/)
      if (req.method === 'POST' && profileMatch) {
        if (typeof assignAccountProfile !== 'function') return sendJson(res, 501, { error: 'Profile assignment is not enabled' })
        const body = await readJson(req)
        if (typeof body.profileId !== 'string') return sendJson(res, 400, { error: 'profileId is required' })
        return sendJson(res, 200, await assignAccountProfile(profileMatch[1], body.profileId))
      }

      const removeMatch = url.pathname.match(/^\/accounts\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})$/)
      if (req.method === 'DELETE' && removeMatch) {
        if (typeof removeAccount !== 'function') return sendJson(res, 501, { error: 'Account removal is not enabled' })
        return sendJson(res, 200, await removeAccount(removeMatch[1]))
      }
      return sendJson(res, 404, { error: 'Not found' })
    } catch (error) {
      console.error('Local control request failed:', error?.message || error)
      return sendJson(res, 500, { error: error?.message || 'Internal error' })
    }
  })

  localServer.on('error', error => {
    console.error(`MSCC local control listen error on 127.0.0.1:${localControlPort}:`, error?.message || error)
  })
  localServer.listen(localControlPort, '127.0.0.1', () => {
    console.log(`MSCC local control listening on 127.0.0.1:${localControlPort}`)
  })

  server.on('error', error => {
    console.error(`MSCC panel listen error on 0.0.0.0:${port}:`, error?.message || error)
  })
  server.listen(port, host, () => {
    console.log(`MSCC panel listening on ${host}:${port}`)
  })
  return {
    close() {
      server.close()
      localServer.close()
    }
  }
}
