import dns from 'node:dns/promises'
import tls from 'node:tls'

const hostname = 'web.whatsapp.com'
const port = 443
const timeoutMs = 8_000

function probeAddress(record) {
  return new Promise(resolve => {
    let settled = false
    let response = ''
    const finish = result => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(result)
    }
    const timer = setTimeout(() => finish('timeout'), timeoutMs)
    const socket = tls.connect({
      host: record.address,
      port,
      family: record.family,
      servername: hostname,
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
    })
    socket.setTimeout(timeoutMs)
    socket.once('secureConnect', () => {
      const request = [
        'GET /ws/chat HTTP/1.1',
        'Host: web.whatsapp.com',
        'Origin: https://web.whatsapp.com',
        'Connection: Upgrade',
        'Upgrade: websocket',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\\r\\n')
      socket.write(request)
    })
    socket.on('data', chunk => {
      response += chunk.toString('latin1')
      const firstLine = response.split('\\r\\n', 1)[0]
      if (firstLine.startsWith('HTTP/')) {
        const status = firstLine.match(/^HTTP\\/\\d(?:\\.\\d)?\\s+(\\d{3})/)
        finish(status ? `TLS and WebSocket endpoint responded (HTTP ${status[1]})` : 'TLS connected; endpoint returned an HTTP response')
      } else if (response.length > 4096) {
        finish('TLS connected; endpoint response was not an HTTP status line')
      }
    })
    socket.once('error', error => finish(`failed (${String(error?.code || error?.name || 'network error')})`))
    socket.once('timeout', () => finish('timeout'))
    socket.once('close', () => {
      if (!settled) finish('closed before receiving an HTTP response')
    })
  })
}

try {
  const records = await dns.lookup(hostname, { all: true, verbatim: true })
  const unique = []
  const seen = new Set()
  for (const record of records) {
    const key = `${record.family}:${record.address}`
    if (!seen.has(key)) {
      unique.push(record)
      seen.add(key)
    }
  }
  console.log(`[aharane-netcheck] DNS resolved ${unique.length} address(es) for ${hostname}.`)
  const results = await Promise.all(unique.slice(0, 4).map(async record => ({
    family: record.family,
    result: await probeAddress(record),
  })))
  for (const result of results) {
    console.log(`[aharane-netcheck] IPv${result.family}: ${result.result}.`)
  }
  if (!results.some(result => result.result.startsWith('TLS and WebSocket endpoint responded'))) {
    console.warn('[aharane-netcheck] No tested address returned an HTTP response. Check this host\'s DNS and outbound TCP 443 path.')
  }
} catch (error) {
  console.warn(`[aharane-netcheck] DNS/network probe failed: ${String(error?.code || error?.message || 'unknown error').slice(0, 180)}`)
}
