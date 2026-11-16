import http from 'node:http'

const ROUTER_HOST = '127.0.0.1'
const ROUTER_PORT = Number(process.env.AHARANE_ROUTER_PORT || 8786)
const NIGHT_HOST = '127.0.0.1'
const NIGHT_PORT = Number(process.env.NIGHT_CONTROL_CENTRE_PORT || 8787)
const AHARANE_HOST = '127.0.0.1'
const AHARANE_PORT = Number(process.env.AHARANE_PORT || 8790)
const AHARANE_PREFIX = '/aharane'

function sendText(res, status, message) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(message)
}

function upstreamHeaders(req, port) {
  const targetHost = port === AHARANE_PORT ? AHARANE_HOST : NIGHT_HOST
  const headers = { ...req.headers, host: targetHost + ':' + port }
  delete headers.connection
  delete headers['proxy-connection']
  return headers
}

const server = http.createServer((req, res) => {
  let incoming
  try { incoming = new URL(req.url || '/', 'http://127.0.0.1') } catch {
    sendText(res, 400, 'Invalid request URL')
    return
  }

  const isAharaneApi = incoming.pathname.startsWith(AHARANE_PREFIX + '/api/')
  if (incoming.pathname.startsWith(AHARANE_PREFIX + '/') && !isAharaneApi) {
    sendText(res, 404, 'Not found')
    return
  }

  const port = isAharaneApi ? AHARANE_PORT : NIGHT_PORT
  const hostname = isAharaneApi ? AHARANE_HOST : NIGHT_HOST
  const path = isAharaneApi
    ? incoming.pathname.slice(AHARANE_PREFIX.length) + incoming.search
    : incoming.pathname + incoming.search

  const proxy = http.request({
    hostname,
    port,
    method: req.method,
    path,
    headers: upstreamHeaders(req, port),
  }, upstream => {
    res.writeHead(upstream.statusCode || 502, upstream.headers)
    upstream.pipe(res)
  })

  proxy.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Cache-Control': 'no-store' })
    res.end('Local service unavailable')
  })
  req.pipe(proxy)
})

server.on('upgrade', (req, client, head) => {
  let incoming
  try { incoming = new URL(req.url || '/', 'http://127.0.0.1') } catch {
    client.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
    return
  }

  if (incoming.pathname !== AHARANE_PREFIX + '/ws') {
    client.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
    return
  }

  const proxy = http.request({
    hostname: AHARANE_HOST,
    port: AHARANE_PORT,
    method: 'GET',
    path: '/ws' + incoming.search,
    headers: {
      ...req.headers,
      host: AHARANE_HOST + ':' + AHARANE_PORT,
      connection: 'Upgrade',
      upgrade: 'websocket',
    },
  })

  let upstreamSocket = null
  proxy.on('upgrade', (response, socket, upstreamHead) => {
    upstreamSocket = socket
    const status = response.statusCode || 101
    const reason = response.statusMessage || 'Switching Protocols'
    const headers = Object.entries(response.headers)
      .map(([name, value]) => name + ': ' + (Array.isArray(value) ? value.join(', ') : value) + '\r\n')
      .join('')
    client.write('HTTP/1.1 ' + status + ' ' + reason + '\r\n' + headers + '\r\n')
    if (upstreamHead?.length) client.write(upstreamHead)
    if (head?.length) socket.write(head)
    socket.pipe(client)
    client.pipe(socket)
    socket.on('error', () => client.destroy())
    client.on('error', () => socket.destroy())
    client.on('close', () => socket.destroy())
  })

  proxy.on('response', response => {
    const headers = Object.entries(response.headers)
      .map(([name, value]) => name + ': ' + (Array.isArray(value) ? value.join(', ') : value) + '\r\n')
      .join('')
    client.write('HTTP/1.1 ' + (response.statusCode || 502) + ' ' + (response.statusMessage || 'Bad Gateway') + '\r\n' + headers + '\r\n')
    response.pipe(client)
  })

  proxy.on('error', () => {
    if (!client.destroyed) client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n')
    upstreamSocket?.destroy()
  })
  proxy.end()
})

server.on('error', error => {
  process.stderr.write('Aharane tunnel router failed: ' + (error.code || error.message) + '\n')
  process.exitCode = 1
})

server.listen(ROUTER_PORT, ROUTER_HOST, () => {
  process.stdout.write('Aharane tunnel router listening on ' + ROUTER_HOST + ':' + ROUTER_PORT + '\n')
})
