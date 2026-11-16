import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('Aharane exposes an authenticated WebSocket endpoint only on its private listener', async () => {
  const runtime = await read('../src/index.js')
  assert.match(runtime, /import \{ WebSocket, WebSocketServer \} from 'ws'/)
  assert.match(runtime, /server\.on\('upgrade'/)
  assert.match(runtime, /pathname !== '\/ws'/)
  assert.match(runtime, /tokenMatches\(match\[1\]\)/)
  assert.match(runtime, /maxPayload: 64 \* 1024/)
  assert.match(runtime, /message\?\.type === 'ping'/)
  assert.match(runtime, /message\?\.type === 'status\.get'/)
  assert.match(runtime, /Unsupported message type/)
  assert.match(runtime, /publishStudioEvent\('whatsapp\.status'/)
  assert.doesNotMatch(runtime, /AHARANE_HOST.*0\.0\.0\.0/)
})

test('the Vercel WebSocket bridge keeps the admin token server-side and validates origin/session', async () => {
  const bridge = await read('../control-centre/api/studio/socket.js')
  assert.match(bridge, /aharane_cc_session/)
  assert.match(bridge, /sameOrigin\(req\)/)
  assert.match(bridge, /getCookie\(req, SESSION_COOKIE\)/)
  assert.match(bridge, /Authorization: 'Bearer ' \+ token/)
  assert.match(bridge, /\/aharane\/api\/status/)
  assert.match(bridge, /\/aharane\/ws/)
  assert.match(bridge, /CF-Access-Client-Secret/)
})

test('the Control Centre API proxy exposes the authenticated studio snapshot', async () => {
  const proxy = await read('../control-centre/api/aharane/[...path].js')
  assert.match(proxy, /\['studio\/snapshot', '\/api\/studio\/snapshot'\]/)
})
