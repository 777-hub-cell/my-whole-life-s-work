const SESSION_COOKIE = 'aharane_cc_session'
const SESSION_MAX_AGE = 60 * 60 * 12
const ROUTES = new Map([
  ['status', '/api/status'],
  ['pair-code', '/api/pair-code'],
  ['update/status', '/api/update/status'],
  ['files/packages', '/api/files/packages'],
  ['files/packages/remove', '/api/files/packages/remove'],
  ['files/tree', '/api/files/tree'],
  ['files/preview', '/api/files/preview'],
  ['files/content', '/api/files/content'],
  ['files', '/api/files'],
  ['files/delete', '/api/files/delete'],
  ['files/apply', '/api/files/apply'],
  ['files/discard', '/api/files/discard'],
  ['files/draft-status', '/api/files/draft-status'],
  ['update/upload/start', '/api/update/upload/start'],
  ['update/upload/chunk', '/api/update/upload/chunk'],
  ['update/validate', '/api/update/validate'],
  ['update/deploy', '/api/update/deploy'],
])

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.end(JSON.stringify(payload))
}

function sameOrigin(req) {
  const origin = req.headers.origin
  const host = String(req.headers.host || '').toLowerCase()
  if (!origin || !host) return false
  try {
    const parsed = new URL(origin)
    const expectedProtocol = host.startsWith('localhost:') || host.startsWith('127.0.0.1:') ? 'http:' : 'https:'
    return parsed.host.toLowerCase() === host && parsed.protocol === expectedProtocol
  } catch { return false }
}

function getCookie(req, name) {
  const raw = String(req.headers.cookie || '')
  for (const part of raw.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) {
      try { return decodeURIComponent(value.join('=')) } catch { return '' }
    }
  }
  return ''
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}`)
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`)
}

function getUpstream() {
  const raw = String(process.env.AHARANE_API_UPSTREAM || '').trim()
  if (!raw) throw new Error('The secure Aharane API upstream has not been configured for this Vercel project.')
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('AHARANE_API_UPSTREAM must be an HTTPS origin without credentials or a path.')
  }
  const clientId = String(process.env.AHARANE_API_ACCESS_CLIENT_ID || '')
  const clientSecret = String(process.env.AHARANE_API_ACCESS_CLIENT_SECRET || '')
  if (Boolean(clientId) !== Boolean(clientSecret)) throw new Error('Both Cloudflare Access service-token variables must be configured, or neither.')
  return { url, clientId, clientSecret }
}

async function upstreamRequest(path, token, body, method = 'GET', search = '') {
  const { url, clientId, clientSecret } = getUpstream()
  const headers = {
    Accept: 'application/json',
    Authorization: 'Bearer ' + token,
    'ngrok-skip-browser-warning': '1',
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (clientId && clientSecret) {
    headers['CF-Access-Client-Id'] = clientId
    headers['CF-Access-Client-Secret'] = clientSecret
  }
  const target = new URL(path + search, url.origin)
  const response = await fetch(target, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  })
  const text = await response.text()
  return { status: response.status, text, contentType: response.headers.get('content-type') || 'application/json' }
}

export const config = {
  api: {
    bodyParser: { sizeLimit: '2mb' },
    responseLimit: false,
  },
  maxDuration: 60,
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (!['GET', 'POST', 'PUT'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PUT')
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' })
  }

  const routeParts = Array.isArray(req.query.path) ? req.query.path : [req.query.path].filter(Boolean)
  const route = routeParts.join('/')
  if (!route || route.includes('..') || route.includes('\\')) {
    return sendJson(res, 404, { ok: false, error: 'Not found.' })
  }

  if (req.method !== 'GET' && !sameOrigin(req)) {
    return sendJson(res, 403, { ok: false, error: 'Cross-origin requests are not allowed.' })
  }

  if (route === 'login' && req.method === 'POST') {
    const token = String(req.body?.token || '')
    if (token.length < 32 || token.length > 512) return sendJson(res, 400, { ok: false, error: 'Enter a valid Aharane admin token.' })
    try {
      const result = await upstreamRequest('/api/status', token)
      if (result.status !== 200) return sendJson(res, 401, { ok: false, error: 'The Aharane admin token was rejected or the API could not be reached.' })
      setSessionCookie(res, token)
      return sendJson(res, 200, { ok: true })
    } catch (error) {
      return sendJson(res, 503, { ok: false, error: error.message || 'Aharane is not reachable.' })
    }
  }

  if (route === 'logout' && req.method === 'POST') {
    clearSessionCookie(res)
    return sendJson(res, 200, { ok: true })
  }

  const upstreamPath = ROUTES.get(route)
  if (!upstreamPath) return sendJson(res, 404, { ok: false, error: 'This control-centre action is not available.' })
  if (req.method !== 'GET' && !req.body) return sendJson(res, 400, { ok: false, error: 'A JSON request body is required.' })

  const token = getCookie(req, SESSION_COOKIE)
  if (token.length < 32 || token.length > 512) return sendJson(res, 401, { ok: false, error: 'Sign in to Aharane again.' })

  try {
    const requestUrl = new URL(req.url || '/', 'https://aharane-control-centre.invalid')
    const result = await upstreamRequest(upstreamPath, token, req.method === 'GET' ? undefined : req.body, req.method, requestUrl.search)
    res.statusCode = result.status
    res.setHeader('Content-Type', result.contentType)
    res.end(result.text)
  } catch {
    sendJson(res, 502, { ok: false, error: 'The Aharane API is temporarily unavailable.' })
  }
}
