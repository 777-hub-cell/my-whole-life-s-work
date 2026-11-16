import { createServer } from 'node:http'
import WebSocket, { WebSocketServer } from 'ws'

const SESSION_COOKIE = 'aharane_cc_session'

function sendUpgradeError(transport, status, message) {
  if (transport.destroyed) return
  const body = String(message || 'WebSocket connection rejected.')
  transport.end(
    'HTTP/1.1 ' + status + '\r\n' +
    'Connection: close\r\n' +
    'Content-Type: text/plain; charset=utf-8\r\n' +
    'Content-Length: ' + Buffer.byteLength(body) + '\r\n' +
    '\r\n' + body
  )
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

function sameOrigin(req) {
  const origin = String(req.headers.origin || '')
  const host = String(req.headers.host || '').toLowerCase()
  if (!origin || !host) return false
  try {
    const parsed = new URL(origin)
    return parsed.protocol === 'https:' && parsed.host.toLowerCase() === host
  } catch {
    return false
  }
}

function getUpstream() {
  const raw = String(process.env.AHARANE_API_UPSTREAM || '').trim()
  if (!raw) throw new Error('Aharane API upstream is not configured.')
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Aharane API upstream must be an HTTPS origin.')
  }
  const clientId = String(process.env.AHARANE_API_ACCESS_CLIENT_ID || '')
  const clientSecret = String(process.env.AHARANE_API_ACCESS_CLIENT_SECRET || '')
  if (Boolean(clientId) !== Boolean(clientSecret)) throw new Error('Cloudflare Access credentials are incomplete.')
  return { url, clientId, clientSecret }
}

const server = createServer((_req, res) => {
  res.writeHead(426, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    Upgrade: 'websocket',
  })
  res.end('WebSocket upgrade required.')
})

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 64 * 1024,
  perMessageDeflate: false,
})

server.on('upgrade', (req, transport, head) => {
  void (async () => {
    let pathname = ''
    try { pathname = new URL(req.url || '/', 'https://local.invalid').pathname } catch {}
    if (pathname !== '/api/studio/socket') {
      sendUpgradeError(transport, '404 Not Found', 'Not found.')
      return
    }
    if (!sameOrigin(req)) {
      sendUpgradeError(transport, '403 Forbidden', 'Cross-origin WebSocket requests are not allowed.')
      return
    }

    const token = getCookie(req, SESSION_COOKIE)
    if (token.length < 32 || token.length > 512) {
      sendUpgradeError(transport, '401 Unauthorized', 'Sign in to Aharane again.')
      return
    }

    const upstream = getUpstream()
    const headers = {
      Accept: 'application/json',
      Authorization: 'Bearer ' + token,
      'ngrok-skip-browser-warning': '1',
    }
    if (upstream.clientId && upstream.clientSecret) {
      headers['CF-Access-Client-Id'] = upstream.clientId
      headers['CF-Access-Client-Secret'] = upstream.clientSecret
    }

    const check = await fetch(new URL('/aharane/api/status', upstream.url.origin), {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (!check.ok) {
      sendUpgradeError(transport, '401 Unauthorized', 'Aharane rejected this session.')
      return
    }
    await check.body?.cancel().catch(() => {})

    wss.handleUpgrade(req, transport, head, client => {
      wss.emit('connection', client, req, { token, upstream })
    })
  })().catch(() => {
    sendUpgradeError(transport, '502 Bad Gateway', 'Aharane is temporarily unavailable.')
  })
})

wss.on('connection', (client, _req, context) => {
  const target = new URL('/aharane/ws', context.upstream.url.origin)
  target.protocol = 'wss:'
  const headers = {
    Authorization: 'Bearer ' + context.token,
    'ngrok-skip-browser-warning': '1',
  }
  if (context.upstream.clientId && context.upstream.clientSecret) {
    headers['CF-Access-Client-Id'] = context.upstream.clientId
    headers['CF-Access-Client-Secret'] = context.upstream.clientSecret
  }

  const upstream = new WebSocket(target, {
    headers,
    handshakeTimeout: 10_000,
    maxPayload: 64 * 1024,
    perMessageDeflate: false,
  })

  upstream.on('message', (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(data, { binary: isBinary }) } catch {}
    }
  })

  client.on('message', (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) {
      try { upstream.send(data, { binary: isBinary }) } catch {}
    }
  })

  upstream.on('error', () => {
    if (client.readyState === WebSocket.OPEN) client.close(1011, 'Aharane upstream unavailable')
  })
  upstream.on('close', () => {
    if (client.readyState === WebSocket.OPEN) client.close(1011, 'Aharane connection closed')
  })
  client.on('close', () => {
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
      upstream.close(1000, 'Control Centre client disconnected')
    }
  })
  client.on('error', () => {
    try { upstream.terminate() } catch {}
  })
})

export const config = { maxDuration: 60 }
export default server
