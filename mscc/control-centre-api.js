import { randomBytes, timingSafeEqual } from 'node:crypto'
import { constants as fsConstants, realpathSync } from 'node:fs'
import { chmod, lstat, mkdir, open, readdir, realpath } from 'node:fs/promises'
import { basename, dirname, extname, relative, resolve, sep } from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const API_ROOT = '/api/control-centre'
const SESSION_COOKIE = 'night_cc_session'
const PRE_COOKIE = 'night_cc_pre'
const SESSION_AGE = 7 * 24 * 60 * 60
const PRE_AGE = 10 * 60
const LOGIN_WINDOW = 10 * 60 * 1000
const MAX_ATTEMPTS = 10
const MAX_BODY = 16 * 1024
const MAX_PREVIEW = 512 * 1024
const SECRET_RE = /(KEY|TOKEN|SECRET|PASS|PWD|AUTH|COOKIE|SESSION|PRIVATE|CREDENTIAL|OWNER_NUMBER|PHONE|JID)/i
const APP_ENV_RE = /^(?:NODE_ENV|TZ|PORT$|MSCC_[A-Z0-9_]*|WEB_[A-Z0-9_]*|ACCOUNT_[A-Z0-9_]*|CC_[A-Z0-9_]*|OWNER_[A-Z0-9_]*|MESSAGE_[A-Z0-9_]*|MAX_[A-Z0-9_]*|AUTH_[A-Z0-9_]*|LOG_[A-Z0-9_]*|CONTROL_[A-Z0-9_]*|GROQ_[A-Z0-9_]*|MEGA_[A-Z0-9_]*|WHATSAPP_[A-Z0-9_]*|WEBSITE_[A-Z0-9_]*|AZURE_[A-Z0-9_]*)$/
const SECRET_ENV_RE = /(KEY|TOKEN|SECRET|PASS|PWD|AUTH|COOKIE|SESSION|PRIVATE|CREDENTIAL|PHONE|NUMBER|EMAIL|JID)/i
const SAFE_ROOT_FILES = new Set(['index.js', 'web-panel.js', 'panel.html', 'package.json', 'README.md', 'AGENTS.md', 'LICENSE'])
const SAFE_ROOT_DIRS = new Set(['commands', 'private-commands', 'sources', 'providers', 'utils', 'docs'])
const SAFE_EXTENSIONS = new Set(['.js', '.mjs', '.json', '.md', '.html', '.css', '.txt', '.yml', '.yaml'])
const HIDDEN_NAMES = /^(?:\.git|node_modules|data|sessions?|auth(?:[-_]state|_info)?|logs?|backups?|\.env.*|credentials?|secrets?|private|tmp|cache)$/i

function json(res, status, payload, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...headers,
  })
  res.end(JSON.stringify(payload))
}
function success(res, data, status = 200, headers = {}) { json(res, status, { ok: true, data }, headers) }
function failure(res, status, code, message) { json(res, status, { ok: false, error: { code, message } }) }
function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ''))
  const y = Buffer.from(String(b ?? ''))
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y)
}
function getCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i >= 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()) } catch { return '' }
    }
  }
  return ''
}
function requestOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http')).split(',')[0].trim()
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim()
  return host ? `${proto}://${host}` : ''
}
function sameOrigin(req) {
  const supplied = String(req.headers.origin || '').trim()
  if (supplied) return supplied === requestOrigin(req)
  return req.headers['sec-fetch-site'] === 'same-origin' || req.headers['x-requested-with'] === 'XMLHttpRequest'
}
async function readBody(req) {
  const chunks = []
  let length = 0
  for await (const chunk of req) {
    length += chunk.length
    if (length > MAX_BODY) throw Object.assign(new Error('Request body is too large.'), { status: 413, code: 'BODY_TOO_LARGE' })
    chunks.push(chunk)
  }
  let body
  try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {} }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400, code: 'INVALID_JSON' }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('Request body must be a JSON object.'), { status: 400, code: 'INVALID_BODY' })
  return body
}
function cookie(req, name, value, maxAge) {
  const secure = (req.socket?.encrypted || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https') ? '; Secure' : ''
  return `${name}=${encodeURIComponent(value)}; Path=${API_ROOT}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`
}
function expiredCookie(req, name) { return cookie(req, name, '', 0) }
function cleanText(value, max = 240) { return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) }
function statusOf(account) {
  if (account?.connected || account?.status === 'connected') return 'online'
  if (account?.pairingMode && (account?.pairingCode || account?.pairingQr || account?.status === 'pairing' || account?.status === 'connecting')) return 'pairing'
  if (account?.invalid || account?.status === 'auth-invalid' || account?.status === 'attention') return 'attention'
  return 'offline'
}
function accountDto(account) {
  return {
    id: String(account.id),
    name: cleanText(account.displayName || `Account ${account.id}`, 80),
    phone: String(account.numberMasked || 'Not linked'),
    profileId: String(account.profile || 'unassigned'),
    status: statusOf(account),
    lastSeen: Number(account.lastConnectedAt || account.lastDisconnectedAt || 0) || null,
    createdAt: Number(account.createdAt || 0) || null,
    session: account.role === 'owner' ? 'Private control' : 'Linked WhatsApp session',
    messages24h: null,
    pairStarted: Boolean(account.pairingMode),
    role: account.role,
    registered: Boolean(account.registered),
    invalid: Boolean(account.invalid),
    reconnectAttempts: Number(account.reconnectAttempts || 0),
    pairingError: scrub(account.pairingError || '').slice(0, 180),
  }
}
function profileDto(profile) {
  const capabilities = Array.isArray(profile.capabilities) ? profile.capabilities : []
  return {
    id: String(profile.id),
    name: cleanText(profile.displayName || profile.id, 80),
    description: capabilities.length
      ? 'Capabilities: ' + capabilities.map(item => cleanText(item.capability, 48)).join(', ')
      : (profile.id === 'control' ? 'Private control profile.' : profile.id === 'unassigned' ? 'No public command profile assigned.' : 'General public profile.'),
    color: profile.id === 'control' ? '#b6a4fa' : '#7cc4fa',
    modules: capabilities.length,
    createdAt: 0,
    capabilities,
  }
}
function scrub(value) {
  let text = cleanText(value, 600)
  text = text.replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, '[phone redacted]')
  text = text.replace(/\b(?:Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
  text = text.replace(/\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|AUTH|COOKIE|CREDENTIAL)[A-Z0-9_]*\s*[:=]\s*[^\s,;]+/gi, '[secret redacted]')
  return text
}
function safeDetail(value, depth = 0) {
  if (depth > 5) return '[nested data omitted]'
  if (Array.isArray(value)) return value.slice(0, 30).map(item => safeDetail(item, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_RE.test(key)).slice(0, 50).map(([key, item]) => [cleanText(key, 64), safeDetail(item, depth + 1)]))
  }
  if (typeof value === 'string') return scrub(value)
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value
  return cleanText(value, 160)
}
function eventDto(event) {
  const action = cleanText(event.action || 'activity', 100)
  const detail = event.detail && typeof event.detail === 'object' ? event.detail : {}
  const accountId = cleanText(detail.account || detail.accountId || '', 64)
  return {
    id: String(event.id || `${event.at || ''}-${action}`),
    ts: event.at || new Date().toISOString(),
    severity: /error/i.test(action) ? 'error' : /fail|invalid|removed|disconnect/i.test(action) ? 'warning' : /created|connected|paired|changed|requested/i.test(action) ? 'success' : 'info',
    title: action.replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    detail: scrub(Object.entries(safeDetail(detail)).map(([key, val]) => `${key}: ${typeof val === 'object' ? JSON.stringify(val) : val}`).join(' · ')),
    accountId,
    source: 'MSCC',
  }
}
function classifyError(error) {
  if (error?.status) return { status: error.status, code: error.code || 'REQUEST_FAILED', message: cleanText(error.message, 180) }
  const message = cleanText(error?.message || 'The operation failed.', 180)
  if (/unknown account|unknown profile|not found/i.test(message)) return { status: 404, code: 'NOT_FOUND', message }
  if (/only account a|account a must|cannot be removed|fixed to account a|owner account/i.test(message)) return { status: 403, code: 'FORBIDDEN', message }
  if (/invalid|must |cannot |requires|too many|already/i.test(message)) return { status: 400, code: 'VALIDATION', message }
  return { status: 409, code: 'OPERATION_FAILED', message }
}

export function createControlCentreApi(options = {}) {
  const sessions = new Map()
  const preSessions = new Map()
  const attempts = new Map()
  const root = realpathSync(resolve(fileURLToPath(new URL('.', import.meta.url))))
  const auditFile = process.env.MSCC_ADMIN_AUDIT_FILE || '/var/lib/mscc/data/mscc-admin-audit.jsonl'
  const configured = Boolean(options.password && !['change-this-password', 'change-me'].includes(options.password))

  function sweep() {
    const now = Date.now()
    for (const [id, session] of sessions) if (session.expiresAt <= now) sessions.delete(id)
    for (const [id, session] of preSessions) if (session.expiresAt <= now) preSessions.delete(id)
    for (const [key, times] of attempts) {
      const fresh = times.filter(time => now - time < LOGIN_WINDOW)
      if (fresh.length) attempts.set(key, fresh); else attempts.delete(key)
    }
  }
  function getSession(req) {
    sweep()
    const id = getCookie(req, SESSION_COOKIE)
    const session = sessions.get(id)
    return session && session.expiresAt > Date.now() ? { id, ...session } : null
  }
  async function audit(action, target, outcome) {
    await mkdir(dirname(auditFile), { recursive: true, mode: 0o700 })
    const row = JSON.stringify({ at: new Date().toISOString(), actor: 'administrator', action, target: cleanText(target, 120), outcome }) + '\n'
    const handle = await open(auditFile, 'a', 0o600)
    try { await handle.chmod(0o600); await handle.writeFile(row, 'utf8') }
    finally { await handle.close() }
  }
  async function mutation(req, action, target, work) {
    const session = getSession(req)
    if (!session) throw Object.assign(new Error('Administrator sign-in is required.'), { status: 401, code: 'UNAUTHORIZED' })
    if (!sameOrigin(req)) throw Object.assign(new Error('Cross-origin request rejected.'), { status: 403, code: 'ORIGIN_REJECTED' })
    if (!safeEqual(req.headers['x-csrf-token'], session.csrfToken)) throw Object.assign(new Error('The security token expired. Refresh the page and sign in again.'), { status: 403, code: 'CSRF_REJECTED' })
    await audit(action, target, 'started')
    try {
      const result = await work()
      await audit(action, target, 'success')
      return result
    } catch (error) {
      try { await audit(action, target, 'failed') } catch {}
      throw error
    }
  }
  function state() { return options.getState() }
  async function stateAccount(id) {
    const current = await state()
    const account = current.accounts.find(item => String(item.id) === String(id))
    if (!account) throw Object.assign(new Error('Unknown account.'), { status: 404, code: 'NOT_FOUND' })
    return account
  }
  function settingsFromState(current) {
    return Object.fromEntries(Object.entries(current.settings || {}).filter(([, value]) => typeof value === 'boolean'))
  }
  function modulesFromState(current) {
    return Object.entries(current.settings || {}).filter(([, value]) => typeof value === 'boolean').map(([key, enabled]) => ({
      id: key,
      name: key.replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      category: 'Command availability',
      description: 'Live command availability flag from the MSCC settings registry.',
      enabled: Boolean(enabled),
    }))
  }
  async function safeFile(relativePath) {
    const raw = String(relativePath || '').replace(/\\/g, '/')
    const parts = raw.split('/').filter(Boolean)
    if (!parts.length || parts.some((part, index) => part === '.' || part === '..' || HIDDEN_NAMES.test(part) || part.startsWith('.') || (index > 0 && SECRET_RE.test(part)))) {
      throw Object.assign(new Error('That path is not in the approved file browser.'), { status: 403, code: 'PATH_NOT_ALLOWED' })
    }
    if (!SAFE_ROOT_DIRS.has(parts[0]) && !(parts.length === 1 && SAFE_ROOT_FILES.has(parts[0]))) {
      throw Object.assign(new Error('That path is outside the approved file browser.'), { status: 403, code: 'PATH_NOT_ALLOWED' })
    }
    let full = root
    for (const part of parts) {
      full = resolve(full, part)
      const component = await lstat(full)
      if (component.isSymbolicLink()) throw Object.assign(new Error('Symbolic links are not available in the file browser.'), { status: 403, code: 'SYMLINK_BLOCKED' })
    }
    const rel = relative(root, full)
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || rel.split(sep).some(part => HIDDEN_NAMES.test(part))) {
      throw Object.assign(new Error('That path is outside the approved file browser.'), { status: 403, code: 'PATH_NOT_ALLOWED' })
    }
    const info = await lstat(full)
    if (info.isSymbolicLink()) throw Object.assign(new Error('Symbolic links are not available in the file browser.'), { status: 403, code: 'SYMLINK_BLOCKED' })
    const actual = await realpath(full)
    const actualRel = relative(root, actual)
    if (!actualRel || actualRel === '..' || actualRel.startsWith(`..${sep}`)) throw Object.assign(new Error('Resolved path is outside the approved application root.'), { status: 403, code: 'PATH_ESCAPE' })
    return { full, info, parts, path: '/' + parts.join('/') }
  }
  async function treeNode(pathParts, depth, budget) {
    const name = pathParts.length ? pathParts[pathParts.length - 1] : 'MSCC release'
    const path = '/' + pathParts.join('/')
    if (depth > 6) return { name, path, type: 'folder', children: [] }
    let entries = []
    if (!pathParts.length) {
      const names = [...SAFE_ROOT_DIRS, ...SAFE_ROOT_FILES].sort()
      entries = names.map(value => ({ name: value, isDirectory: SAFE_ROOT_DIRS.has(value) }))
    } else {
      const target = await safeFile(path)
      if (!target.info.isDirectory()) return { name, path, type: 'file', size: target.info.size, modified: target.info.mtime.toISOString() }
      const rows = await readdir(target.full, { withFileTypes: true })
      entries = rows.filter(row => !row.name.startsWith('.') && !HIDDEN_NAMES.test(row.name) && !SECRET_RE.test(row.name) && (row.isDirectory() || (row.isFile() && SAFE_EXTENSIONS.has(extname(row.name).toLowerCase())))).map(row => ({ name: row.name, isDirectory: row.isDirectory() }))
    }
    entries.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name))
    const children = []
    for (const entry of entries) {
      if (budget.count >= 1600) break
      if (pathParts.length === 0 && !entry.isDirectory && !SAFE_ROOT_FILES.has(entry.name)) continue
      const childParts = [...pathParts, entry.name]
      try {
        const target = await safeFile('/' + childParts.join('/'))
        if (target.info.isDirectory()) {
          budget.count++
          children.push(await treeNode(childParts, depth + 1, budget))
        } else if (target.info.isFile() && SAFE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
          budget.count++
          children.push({ name: entry.name, path: '/' + childParts.join('/'), type: 'file', size: target.info.size, modified: target.info.mtime.toISOString() })
        }
      } catch { /* skip inaccessible files, symlinks and paths outside the allowlist */ }
    }
    return { name, path, type: 'folder', children }
  }

  async function handle(req, url) {
    const path = url.pathname.slice(API_ROOT.length) || '/'
    const method = String(req.method || 'GET').toUpperCase()
    try {
      if (method === 'GET' && path === '/auth/session') {
        if (!configured) return success(req.res, { authenticated: false, csrfToken: '' }, 200)
        const session = getSession(req)
        if (session) return success(req.res, { authenticated: true, csrfToken: session.csrfToken })
        let preId = getCookie(req, PRE_COOKIE)
        let pre = preSessions.get(preId)
        let headers = {}
        if (!pre || pre.expiresAt <= Date.now()) {
          preId = randomBytes(32).toString('base64url')
          pre = { csrfToken: randomBytes(32).toString('base64url'), expiresAt: Date.now() + PRE_AGE * 1000 }
          preSessions.set(preId, pre)
          headers = { 'set-cookie': cookie(req, PRE_COOKIE, preId, PRE_AGE) }
        }
        return success(req.res, { authenticated: false, csrfToken: pre.csrfToken }, 200, headers)
      }
      if (method === 'POST' && path === '/auth/login') {
        if (!configured) return failure(req.res, 503, 'PANEL_NOT_CONFIGURED', 'Set WEB_PASSWORD before using the control centre.')
        if (!sameOrigin(req)) return failure(req.res, 403, 'ORIGIN_REJECTED', 'Cross-origin request rejected.')
        const preId = getCookie(req, PRE_COOKIE)
        const pre = preSessions.get(preId)
        if (!pre || pre.expiresAt <= Date.now() || !safeEqual(req.headers['x-csrf-token'], pre.csrfToken)) return failure(req.res, 403, 'CSRF_REJECTED', 'Refresh the sign-in page and try again.')
        const remote = req.socket.remoteAddress || 'unknown'
        const now = Date.now()
        const recent = (attempts.get(remote) || []).filter(time => now - time < LOGIN_WINDOW)
        if (recent.length >= MAX_ATTEMPTS) return failure(req.res, 429, 'RATE_LIMITED', 'Too many sign-in attempts. Try again later.')
        const body = await readBody(req)
        if (!safeEqual(body.password, options.password)) {
          recent.push(now); attempts.set(remote, recent)
          return failure(req.res, 401, 'BAD_CREDENTIALS', 'The administrator password is incorrect.')
        }
        attempts.delete(remote)
        preSessions.delete(preId)
        const sessionId = randomBytes(32).toString('base64url')
        const csrfToken = randomBytes(32).toString('base64url')
        sessions.set(sessionId, { csrfToken, expiresAt: Date.now() + SESSION_AGE * 1000 })
        await audit('auth.login', 'control-centre', 'success')
        return success(req.res, { authenticated: true, csrfToken }, 200, {
          'set-cookie': [cookie(req, SESSION_COOKIE, sessionId, SESSION_AGE), expiredCookie(req, PRE_COOKIE)],
        })
      }
      if (path.startsWith('/auth/')) {
        const session = getSession(req)
        if (!session) return failure(req.res, 401, 'UNAUTHORIZED', 'Administrator sign-in is required.')
        if (method === 'POST' && path === '/auth/logout') {
          if (!sameOrigin(req) || !safeEqual(req.headers['x-csrf-token'], session.csrfToken)) return failure(req.res, 403, 'CSRF_REJECTED', 'The security token is invalid.')
          sessions.delete(session.id)
          return success(req.res, { authenticated: false, csrfToken: '' }, 200, { 'set-cookie': expiredCookie(req, SESSION_COOKIE) })
        }
      }

      const session = getSession(req)
      if (!session) return failure(req.res, 401, 'UNAUTHORIZED', 'Administrator sign-in is required.')
      const current = await state()
      if (method !== 'GET' && method !== 'HEAD') {
        if (!sameOrigin(req)) return failure(req.res, 403, 'ORIGIN_REJECTED', 'Cross-origin request rejected.')
        if (!safeEqual(req.headers['x-csrf-token'], session.csrfToken)) return failure(req.res, 403, 'CSRF_REJECTED', 'The security token is invalid or expired.')
      }

      if (method === 'GET' && path === '/overview') {
        const accounts = current.accounts.map(accountDto)
        const online = accounts.filter(a => a.status === 'online').length
        const pairing = accounts.filter(a => a.status === 'pairing').length
        const attention = accounts.filter(a => a.status === 'attention').length
        const settings = settingsFromState(current)
        const modules = modulesFromState(current)
        return success(req.res, {
          bot: { status: 'online', version: String(current.version || 'unknown'), uptimeSeconds: Math.floor(process.uptime()) },
          fleet: { total: accounts.length, online, offline: accounts.length - online - pairing - attention, pairing, attention },
          messages24h: null,
          modulesEnabled: modules.filter(item => item.enabled).length,
          modulesTotal: modules.length,
          commandSettings: Object.keys(settings).length,
          commandPrefix: cleanText(current.settings?.publicPrefix || '.', 8),
        })
      }
      if (method === 'GET' && path === '/health') return success(req.res, { ok: true, adapter: 'live', serverTime: new Date().toISOString() })
      if (method === 'GET' && path === '/accounts') return success(req.res, current.accounts.map(accountDto))
      if (method === 'POST' && path === '/accounts') {
        const body = await readBody(req)
        const name = cleanText(body.name, 80)
        const phone = String(body.phone || '').replace(/[^0-9]/g, '')
        if (!name || phone.length < 7 || phone.length > 15) return failure(req.res, 400, 'VALIDATION', 'Enter an account name and a phone number with country code.')
        if (body.profileId && (!(current.botProfiles || []).some(profile => profile.id === body.profileId) || body.profileId === 'control')) return failure(req.res, 400, 'PROFILE_NOT_ALLOWED', 'Choose an existing public profile. The private Control profile is reserved for Account A.')
        const created = await mutation(req, 'account.create', 'new linked account', async () => {
          const result = await options.createAccount({ displayName: name, phoneNumber: phone })
          const id = result?.account?.id
          if (!id) throw new Error('MSCC did not return the new account ID.')
          if (body.profileId) await options.assignAccountProfile(id, body.profileId)
          const fresh = await stateAccount(id)
          return accountDto(fresh)
        })
        return success(req.res, created, 201)
      }
      const pairStatus = path.match(/^\/accounts\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\/pair-status$/)
      if (method === 'GET' && pairStatus) return success(req.res, { status: statusOf(await stateAccount(pairStatus[1])) })

      const accountAction = path.match(/^\/accounts\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})(?:\/(pair|reconnect|disconnect|repair|overrides))?$/)
      if (accountAction) {
        const id = accountAction[1]
        const action = accountAction[2] || ''
        async function waitForPairingPayload(mode) {
          // The WhatsApp pairing event may arrive after socket startup; give pairing-code requests enough time.
          const deadline = Date.now() + 25000
          let account = await stateAccount(id)
          while (Date.now() < deadline && !account.connected && !account.pairingError && !account.pairingCode && !account.pairingQr) {
            await new Promise(resolve => setTimeout(resolve, 250))
            account = await stateAccount(id)
          }
          if (account.pairingError) throw new Error(scrub(account.pairingError).slice(0, 160))
          if (account.connected) return { method: mode, qr: '', code: '', connected: true, expiresAt: Date.now() + 60000 }
          if (mode === 'qr' && !account.pairingQr) throw Object.assign(new Error('MSCC did not produce a QR code. Try pairing code or inspect the account status.'), { status: 409, code: 'PAIRING_QR_UNAVAILABLE' })
          if (mode === 'code' && !account.pairingCode) throw Object.assign(new Error('MSCC did not produce a pairing code. Try QR linking or inspect the account status.'), { status: 409, code: 'PAIRING_CODE_UNAVAILABLE' })
          return { method: mode, qr: account.pairingQr || '', code: account.pairingCode || '', expiresAt: Date.now() + 60000 }
        }
        if (method === 'POST' && action === 'pair') {
          const body = await readBody(req)
          const mode = body.method === 'qr' ? 'qr' : body.method === 'code' ? 'code' : ''
          if (!mode) return failure(req.res, 400, 'VALIDATION', 'Choose QR or pairing-code linking.')
          const payload = await mutation(req, 'account.pair', id, async () => {
            const account = await stateAccount(id)
            if (account.connected) throw Object.assign(new Error('This account is already connected.'), { status: 409, code: 'ALREADY_CONNECTED' })
            if (account.registered || account.invalid) throw Object.assign(new Error('This account has saved authentication. Use the confirmed re-pair flow instead.'), { status: 409, code: 'REPAIR_REQUIRED' })
            await options.pairAccount(id, mode)
            return waitForPairingPayload(mode)
          })
          return success(req.res, payload)
        }
        if (method === 'POST' && ['reconnect', 'disconnect', 'repair'].includes(action)) {
          const body = action === 'repair' ? await readBody(req) : {}
          if (action === 'repair' && body.confirm !== true) return failure(req.res, 400, 'CONFIRMATION_REQUIRED', 'Confirm the repair before replacing the session.')
          const result = await mutation(req, `account.${action}`, id, async () => {
            if (action === 'reconnect') await options.reconnectAccount(id)
            else if (action === 'disconnect') await options.disconnectAccount(id)
            else {
              const mode = body.method === 'qr' ? 'qr' : 'code'
              const account = await stateAccount(id)
              if (account.connected) throw Object.assign(new Error('Disconnect this account before starting a fresh pairing flow.'), { status: 409, code: 'ALREADY_CONNECTED' })
              await options.repairAccount(id, mode)
              return waitForPairingPayload(mode)
            }
            return accountDto(await stateAccount(id))
          })
          return success(req.res, result)
        }
        if (method === 'PATCH' && !action) {
          const body = await readBody(req)
          const keys = Object.keys(body)
          if (keys.length !== 1 || !['name', 'profileId'].includes(keys[0])) return failure(req.res, 400, 'VALIDATION', 'Only one account name or profile assignment can be changed at a time.')
          const result = await mutation(req, body.name !== undefined ? 'account.rename' : 'account.profile-assign', id, async () => {
            if (body.name !== undefined) {
              if (!cleanText(body.name, 80)) throw Object.assign(new Error('Account name cannot be empty.'), { status: 400, code: 'VALIDATION' })
              await options.renameAccount(id, body.name)
            } else {
              if (typeof body.profileId !== 'string') throw Object.assign(new Error('A profile ID is required.'), { status: 400, code: 'VALIDATION' })
              if (id === 'A' && body.profileId !== 'control') throw Object.assign(new Error('Account A is the private control account and must retain the control profile.'), { status: 403, code: 'PRIVATE_ACCOUNT_PROTECTED' })
              if (id !== 'A' && body.profileId === 'control') throw Object.assign(new Error('The private control profile is reserved for Account A.'), { status: 403, code: 'PRIVATE_PROFILE_RESERVED' })
              if (!(current.botProfiles || []).some(profile => profile.id === body.profileId)) throw Object.assign(new Error('Unknown behaviour profile.'), { status: 404, code: 'NOT_FOUND' })
              await options.assignAccountProfile(id, body.profileId)
            }
            return accountDto(await stateAccount(id))
          })
          return success(req.res, result)
        }
        if (method === 'DELETE' && !action) {
          if (url.searchParams.get('confirm') !== 'true') return failure(req.res, 400, 'CONFIRMATION_REQUIRED', 'Confirm account removal.')
          const result = await mutation(req, 'account.remove', id, async () => { await options.removeAccount(id); return { removed: id } })
          return success(req.res, result)
        }
        if (method === 'GET' && action === 'overrides') return success(req.res, { modules: {} })
        if (method === 'PATCH' && action === 'overrides') return failure(req.res, 501, 'NOT_IMPLEMENTED', 'MSCC does not currently store per-account module overrides; choose an account profile instead.')
      }

      if (method === 'GET' && path === '/profiles') return success(req.res, (current.botProfiles || []).map(profileDto))
      const profilePath = path.match(/^\/profiles\/([a-z0-9][a-z0-9._-]{0,63})(?:\/(config))?$/)
      if (profilePath) {
        const profile = (current.botProfiles || []).find(item => item.id === profilePath[1])
        if (!profile) return failure(req.res, 404, 'NOT_FOUND', 'Unknown behaviour profile.')
        if (method === 'GET' && profilePath[2] === 'config') {
          const modules = Object.fromEntries((profile.capabilities || []).map(item => [item.capability, Number(item.priority) > 0]))
          return success(req.res, { modules, capabilities: profile.capabilities || [], universal: profile.universal, basePriority: profile.basePriority })
        }
        if (method === 'PATCH' || method === 'POST' || method === 'DELETE') return failure(req.res, 501, 'READ_ONLY', 'Profile creation and editing are not exposed by the current MSCC control API. Account profile assignment is supported.')
      }
      if (method === 'GET' && path === '/modules') return success(req.res, modulesFromState(current))
      const moduleMatch = path.match(/^\/modules\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})$/)
      if (method === 'PATCH' && moduleMatch) {
        const body = await readBody(req)
        if (typeof body.enabled !== 'boolean' || !Object.hasOwn(current.settings || {}, moduleMatch[1])) return failure(req.res, 400, 'VALIDATION', 'Unknown command availability flag.')
        const result = await mutation(req, 'command-setting.change', moduleMatch[1], async () => {
          await options.setSetting(moduleMatch[1], body.enabled)
          return { id: moduleMatch[1], enabled: body.enabled }
        })
        return success(req.res, result)
      }
      if (method === 'GET' && path === '/settings') {
        return success(req.res, { publicPrefix: cleanText(current.settings?.publicPrefix || '.', 8) || '.' })
      }
      if (method === 'PUT' && path === '/settings') {
        const body = await readBody(req)
        if (Object.keys(body).length !== 1 || typeof body.publicPrefix !== 'string' || !body.publicPrefix.trim() || body.publicPrefix.length > 8 || /\\s/.test(body.publicPrefix)) {
          return failure(req.res, 400, 'VALIDATION', 'Set a non-empty public command prefix of up to 8 characters, without spaces.')
        }
        if (typeof options.setPublicPrefix !== 'function') return failure(req.res, 501, 'NOT_IMPLEMENTED', 'The running MSCC release does not expose public-prefix updates.')
        const result = await mutation(req, 'settings.update', 'public command prefix', async () => {
          const publicPrefix = await options.setPublicPrefix(body.publicPrefix)
          return { publicPrefix: cleanText(publicPrefix || body.publicPrefix, 8) }
        })
        return success(req.res, result)
      }
      if (method === 'GET' && path === '/activity') {
        const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 20))
        const cursor = Math.max(0, Number(url.searchParams.get('cursor')) || 0)
        const accountId = url.searchParams.get('accountId') || 'all'
        const severity = url.searchParams.get('severity') || 'all'
        const query = cleanText(url.searchParams.get('query'), 100).toLowerCase()
        const all = (await options.getActivity(500)).map(eventDto)
          .filter(item => (accountId === 'all' || item.accountId === accountId) && (severity === 'all' || item.severity === severity) && (!query || `${item.title} ${item.detail} ${item.source}`.toLowerCase().includes(query)))
        const items = all.slice(cursor, cursor + limit)
        const nextCursor = cursor + items.length < all.length ? cursor + items.length : null
        return success(req.res, { items, total: all.length, nextCursor })
      }
      if (method === 'POST' && path === '/diagnostics/run') {
        const result = await mutation(req, 'diagnostics.run', 'read-only health checks', async () => {
          const now = Date.now()
          const snapshot = await state()
          const accounts = snapshot.accounts || []
          const online = accounts.filter(item => item.connected).length
          return {
            runAt: new Date(now).toISOString(),
            checks: [
              { id: 'process', label: 'MSCC process', ms: 0, status: 'pass', detail: `Running version ${snapshot.version || 'unknown'}.` },
              { id: 'accounts', label: 'Account registry', ms: 0, status: accounts.length ? 'pass' : 'warn', detail: `${accounts.length} account record(s); ${online} connected.` },
              { id: 'control', label: 'Private control account', ms: 0, status: accounts.some(item => item.id === 'A' && item.role === 'owner') ? 'pass' : 'warn', detail: 'Account A is protected by the MSCC account registry.' },
            ],
          }
        })
        return success(req.res, result)
      }
      if (method === 'GET' && (path === '/system/metrics' || path === '/server/status')) {
        const memory = process.memoryUsage()
        const accounts = current.accounts || []
        const payload = {
          metrics: { cpu: os.loadavg()[0] || 0, memory: Math.round(memory.rss / os.totalmem() * 100), memoryTotal: os.totalmem(), memoryFree: os.freemem(), uptime: process.uptime(), rssBytes: memory.rss, heapUsedBytes: memory.heapUsed },
          services: [{ name: 'MSCC', status: 'healthy', detail: `Node ${process.version}; PID ${process.pid}.` }],
          accountDiagnostics: accounts.map(item => ({ id: item.id, name: cleanText(item.displayName || item.id, 80), status: statusOf(item), latencyMs: null, lastPing: null })),
          runtime: { host: os.hostname(), region: process.env.WEBSITE_REGION || process.env.AZURE_REGION || 'unknown', os: `${os.type()} ${os.release()}`, node: process.version, arch: os.arch() },
          process: { rssMb: Number((memory.rss / 1048576).toFixed(1)), heapMb: Number((memory.heapUsed / 1048576).toFixed(1)), uptimeSeconds: Math.floor(process.uptime()) },
        }
        return success(req.res, payload)
      }
      if (method === 'GET' && path === '/server/logs') {
        const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 40))
        const severity = String(url.searchParams.get('severity') || 'all').toLowerCase()
        const all = (await options.getActivity(500)).map(event => ({ ts: event.at, level: /error/i.test(event.action) ? 'ERROR' : /fail|invalid|disconnect/i.test(event.action) ? 'WARN' : 'INFO', source: 'MSCC activity', message: eventDto(event).title + (eventDto(event).detail ? ': ' + eventDto(event).detail : '') }))
        const filtered = all.filter(item => severity === 'all' || severity === 'warning' && item.level === 'WARN' || severity === 'error' && item.level === 'ERROR' || severity === 'info' && item.level === 'INFO')
        return success(req.res, { items: filtered.slice(0, limit), source: 'MSCC activity ledger' })
      }
      if (method === 'GET' && path === '/server/config') {
        return success(req.res, {
          application: { name: 'MSCC', version: current.version || 'unknown' },
          bot: { prefix: current.settings?.publicPrefix || '.', fixedCcDestination: current.destination || 'A', accountCount: current.accounts?.length || 0 },
          integrations: [
            { name: 'WhatsApp', provider: 'Baileys sessions', status: (current.accounts || []).some(item => item.connected) ? 'configured' : 'not-configured', endpoint: 'Managed by MSCC' },
            { name: 'Cloud storage', provider: 'MEGA', status: Boolean((await options.getCloudDashboard()).configured) ? 'configured' : 'not-configured', endpoint: 'Managed by MSCC' },
          ],
          deployment: { sourceRef: process.env.MSCC_SOURCE_REF || 'managed-release', mode: 'release-based' },
        })
      }
      if (method === 'GET' && path === '/storage') {
        // Passive dashboard read only: never force MEGA authentication on page load.
        const cloud = await options.getCloudDashboard()
        const targets = Array.isArray(cloud?.targets) ? cloud.targets : []
        const finiteOrNull = value => Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null
        return success(req.res, {
          provider: cleanText(cloud?.provider || 'MEGA', 40),
          configured: cloud?.configured === true,
          connected: cloud?.connected === true,
          container: cloud?.configured ? 'Configured storage' : 'Not configured',
          used: finiteOrNull(cloud?.usedBytes ?? cloud?.used),
          total: finiteOrNull(cloud?.totalBytes ?? cloud?.total),
          note: cleanText(cloud?.note || (cloud?.configured ? 'Storage credentials are configured. Provider quota and contents have not been checked.' : 'Cloud storage is not configured.'), 300),
          files: targets.map(item => ({
            id: cleanText(item?.id || '', 100),
            name: cleanText(item?.name || item?.id || 'Storage target', 100),
            role: cleanText(item?.role || (item?.primary ? 'Primary' : 'Shared target'), 40),
            type: 'cloud',
            status: item?.detected === true ? 'Detected' : item?.configured === false ? 'Not detected' : 'Configured',
            detected: item?.detected === true,
            size: finiteOrNull(item?.visibleBytes),
            count: finiteOrNull(item?.fileCount),
            modified: null,
          })),
          mountsAvailable: null,
        })
      }
      if (method === 'GET' && path === '/env') {
        const rows = []
        for (const key of Object.keys(process.env).sort()) {
          if (!APP_ENV_RE.test(key)) continue
          const value = String(process.env[key] || '')
          const isSecret = SECRET_ENV_RE.test(key)
          const row = { key, isSecret, configured: value !== '' }
          if (!isSecret) row.value = cleanText(value, 300)
          rows.push(row)
        }
        return success(req.res, rows)
      }
      if (method === 'PUT' && path.startsWith('/env/')) return failure(req.res, 501, 'READ_ONLY', 'Environment variables are read-only in the control centre. Set them through the protected Azure service configuration, never through the browser.')
      if (method === 'GET' && path === '/files/tree') return success(req.res, await treeNode([], 0, { count: 0 }))
      if (method === 'GET' && path === '/files/preview') {
        const target = await safeFile(url.searchParams.get('path'))
        if (!target.info.isFile()) return failure(req.res, 400, 'NOT_A_FILE', 'Choose a file to preview.')
        if (!SAFE_EXTENSIONS.has(extname(target.full).toLowerCase()) || target.info.size > MAX_PREVIEW) return failure(req.res, 413, 'PREVIEW_NOT_ALLOWED', 'This file type or size is not available for browser preview.')
        const handle = await open(target.full, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0))
        let content
        let info
        try {
          info = await handle.stat()
          if (!info.isFile() || info.size > MAX_PREVIEW) return failure(req.res, 413, 'PREVIEW_NOT_ALLOWED', 'This file changed or exceeds the browser preview limit.')
          content = await handle.readFile('utf8')
        } finally { await handle.close() }
        return success(req.res, { path: target.path, name: basename(target.full), content, size: info.size, modified: info.mtime.toISOString(), language: extname(target.full).slice(1) || 'text', readOnly: true })
      }
      if (path.startsWith('/files/') || path === '/files') return failure(req.res, 403, 'READ_ONLY', 'The release file browser is read-only. Source edits must go through a reviewed MSCC release, never direct writes to a running release.')
      return failure(req.res, 404, 'NOT_FOUND', 'The control-centre API route does not exist.')
    } catch (error) {
      const classified = classifyError(error)
      if (classified.status >= 500) console.error('NIGHT Control Centre API failed:', error?.message || error)
      return failure(req.res, classified.status, classified.code, classified.message)
    }
  }

  return {
    async handle(req, res, url) {
      req.res = res
      if (!url.pathname.startsWith(API_ROOT)) return false
      await handle(req, url)
      return true
    },
  }
}
