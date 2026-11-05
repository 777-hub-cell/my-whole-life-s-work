import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { startWebPanel } from './web-panel.js'

async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

const port = await freePort()
const controlPort = await freePort()
const panel = startWebPanel({
  port, localControlPort: controlPort,
  host: '127.0.0.1',
  password: 'TEST-secret-no-real-password',
  sessionSecret: 'TEST-secret-no-real-session',
  getState: async () => ({ accounts: [] }),
})

try {
  const url = `http://127.0.0.1:${port}/api/login`
  let ready = false
  for (let i = 0; i < 30; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) })
      if (response.ok) { ready = true; break }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 30))
  }
  assert(ready, 'MSCC panel failed to listen')

  for (let i = 0; i < 10; i++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'origin': `http://127.0.0.1:${port}`,
        'x-forwarded-for': `198.51.100.${i+1}`,
        'x-real-ip': `203.0.113.${i+1}`,
      },
      body: JSON.stringify({ password: 'definitely-incorrect-' + i }),
    })
    assert.equal(response.status, 401, 'Each failed login must be recorded')
  }

  // A changed X-Forwarded-For header must not reset the failure count.
  // A correct password also remains blocked for the existing 10-minute window.
  const bypass = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': `http://127.0.0.1:${port}`,
      'x-forwarded-for': '192.0.2.99',
      'x-real-ip': '192.0.2.100',
    },
    body: JSON.stringify({ password: 'TEST-secret-no-real-password' }),
  })
  assert.equal(bypass.status, 429, 'Forwarded headers must never bypass panel login throttling')
  console.log('PASS MSCC panel prevents forged X-Forwarded-For login-throttle bypass')
} finally {
  panel.close()
}
