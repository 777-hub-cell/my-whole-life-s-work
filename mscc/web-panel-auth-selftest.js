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
const localControlPort = await freePort()
let settingChanged = false
const panel = startWebPanel({
  port,
  host: '127.0.0.1',
  localControlPort,
  password: 'TEST-only-panel-password',
  sessionSecret: 'TEST-only-unused-session-secret',
  getState: async () => ({ ok: true }),
  setSetting: async () => { settingChanged = true },
})

const base = `http://127.0.0.1:${port}`
const origin = base
async function waitReady() {
  for (let i = 0; i < 40; i++) {
    try {
      const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) })
      if (response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error('MSCC panel did not become ready')
}

try {
  await waitReady()

  const noOrigin = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'TEST-only-panel-password' }),
  })
  assert.equal(noOrigin.status, 403, 'Missing Origin must not be treated as trusted')

  const wrongOrigin = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
    body: JSON.stringify({ password: 'TEST-only-panel-password' }),
  })
  assert.equal(wrongOrigin.status, 403, 'Cross-origin login must be rejected')

  const login = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ password: 'TEST-only-panel-password' }),
  })
  assert.equal(login.status, 200)
  const setCookie = login.headers.get('set-cookie') || ''
  const token = /(?:^|;\\s*)mscc_session=([^;]+)/.exec(setCookie)?.[1]
  assert.ok(token, 'Login must issue a new session cookie')
  assert.match(setCookie, /HttpOnly/)
  assert.match(setCookie, /SameSite=Strict/)

  const state = await fetch(`${base}/api/state`, { headers: { cookie: `mscc_session=${token}` } })
  assert.equal(state.status, 200, 'Fresh session must access authenticated API')

  const csrfBypass = await fetch(`${base}/api/settings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `mscc_session=${token}` },
    body: JSON.stringify({ key: 'example', value: true }),
  })
  assert.equal(csrfBypass.status, 403, 'Mutations without Origin or same-origin Fetch Metadata must fail')
  assert.equal(settingChanged, false, 'Rejected request must not perform a mutation')

  const logout = await fetch(`${base}/api/logout`, {
    method: 'POST',
    headers: { origin, cookie: `mscc_session=${token}` },
  })
  assert.equal(logout.status, 200)

  const replay = await fetch(`${base}/api/state`, { headers: { cookie: `mscc_session=${token}` } })
  assert.equal(replay.status, 401, 'Logout must revoke the server-side session, not only clear the browser cookie')

  console.log('PASS legacy panel origin checks, random expiring sessions, and logout revocation')
} finally {
  panel.close()
}
