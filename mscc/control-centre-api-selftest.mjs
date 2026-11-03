import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { rm, readFile, stat } from 'node:fs/promises'
import { createControlCentreApi } from './control-centre-api.js'

const auditPath = `/tmp/mscc-control-centre-audit-${process.pid}.jsonl`
process.env.MSCC_ADMIN_AUDIT_FILE = auditPath
process.env.ACCOUNT_A_NUMBER = '2348000000001'
process.env.MESSAGE_TTL_HOURS = '48'
process.env.MSCC_WEB_PORT = '8787'
process.env.GROQ_API_KEYS = 'test-secret-must-not-leak'
process.env.SETTINGS_FILE = '/var/lib/mscc/settings.json'
process.env.BOT_OWNER = 'NIGHT Operator'

const state = {
  version: '2.3.1-test',
  destination: 'A',
  settings: { publicPrefix: '.', song: true, sticker: true },
  botProfiles: [
    { id: 'control', displayName: 'Control', capabilities: [], universal: false, basePriority: 100 },
    { id: 'unassigned', displayName: 'Unassigned', capabilities: [], universal: false, basePriority: 0 },
    { id: 'josiah', displayName: 'Josiah', capabilities: [{ capability: 'general', priority: 100 }], universal: true, basePriority: 100 },
  ],
  accounts: [
    { id: 'A', displayName: 'Private Control', role: 'owner', profile: 'control', connected: true, enabled: true, numberMasked: '+234***0001', lastConnectedAt: Date.now() },
    { id: 'B', displayName: 'Public Session', role: 'linked', profile: 'josiah', connected: false, enabled: true, numberMasked: '+234***0002' },
  ],
}

const repairCalls = []
const pairCalls = []
let passiveDashboardCalls = 0
let activeDashboardCalls = 0
const options = {
  password: 'test-admin-password',
  getState: async () => state,
  getActivity: async () => [
    { id: 'evt-1', at: new Date().toISOString(), action: 'account.created', detail: { account: 'B', displayName: 'Public Session', nested: { apiToken: 'should-not-leak' } } },
  ],
  getCloudDashboard: async () => { passiveDashboardCalls++; return { configured: true, connected: false, provider: 'MEGA', note: 'Passive status: not connected during page load.', targets: [{ id: 'primary', label: 'MSCC Uploads', type: 'primary', detected: false, uploadEnabled: false }] } },
  getCloudDashboardActive: async () => { activeDashboardCalls++; return { configured: true, connected: true, provider: 'MEGA', usedBytes: 8192, totalBytes: 16384, targets: [{ id: 'primary', label: 'MSCC Uploads', type: 'primary', detected: true, uploadEnabled: true, files: 3, visibleBytes: 8192 }] } },
  getCloudMounts: async () => { throw new Error('ESID -15: this should not be called by a passive Storage page read') },
  createAccount: async () => { throw new Error('Not exercised') },
  renameAccount: async (id, name) => { const a = state.accounts.find(item => item.id === id); a.displayName = name },
  assignAccountProfile: async (id, profileId) => {
    if (id === 'A' && profileId !== 'control') throw new Error('Account A must retain the control profile')
    if (id !== 'A' && profileId === 'control') throw new Error('Only Account A can use the control profile')
    state.accounts.find(item => item.id === id).profile = profileId
  },
  pairAccount: async (id, mode) => {
    pairCalls.push([id, mode])
    const account = state.accounts.find(item => item.id === id)
    account.connected = false; account.registered = false; account.invalid = false
    account.pairingMode = mode; account.pairingError = ''
    account.pairingQr = mode === 'qr' ? 'data:image/png;base64,dGVzdA==' : ''
    account.pairingCode = mode === 'code' ? '123-456' : ''
  },
  reconnectAccount: async () => {},
  disconnectAccount: async () => {},
  repairAccount: async (id, mode) => {
    repairCalls.push([id, mode])
    const account = state.accounts.find(item => item.id === id)
    account.connected = false; account.registered = false; account.invalid = false
    account.pairingMode = mode; account.pairingError = ''
    account.pairingQr = mode === 'qr' ? 'data:image/png;base64,dGVzdA==' : ''
    account.pairingCode = mode === 'code' ? '123-456' : ''
  },
  removeAccount: async id => { if (id === 'A') throw new Error('Account A cannot be removed') },
  setSetting: async (key, value) => { state.settings[key] = value },
  setPublicPrefix: async value => { state.settings.publicPrefix = value; return value },
}

const api = createControlCentreApi(options)
const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)
  if (!await api.handle(req, res, url)) { res.writeHead(404); res.end() }
})

function cookieJar() {
  const map = new Map()
  return {
    apply(response) {
      const rows = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie') || '']
      for (const row of rows) {
        const pair = row.split(';', 1)[0]
        const at = pair.indexOf('=')
        if (at < 1) continue
        const key = pair.slice(0, at)
        const value = pair.slice(at + 1)
        if (/Max-Age=0/i.test(row)) map.delete(key)
        else map.set(key, value)
      }
    },
    header() { return [...map].map(([key, value]) => `${key}=${value}`).join('; ') },
  }
}

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
const origin = `http://127.0.0.1:${address.port}`
const jar = cookieJar()

async function call(path, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(origin + path, {
    method,
    headers: {
      ...(jar.header() ? { Cookie: jar.header() } : {}),
      ...(method === 'GET' ? {} : { Origin: origin }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  jar.apply(response)
  const payload = await response.json()
  return { status: response.status, payload, response }
}

try {
  // Protected endpoints reject anonymous callers.
  assert.equal((await call('/api/control-centre/accounts')).status, 401)

  // Bootstrap a pre-auth CSRF token, then sign in.
  const pre = await call('/api/control-centre/auth/session')
  assert.equal(pre.status, 200)
  assert.equal(pre.payload.data.authenticated, false)
  assert.ok(pre.payload.data.csrfToken)
  const login = await call('/api/control-centre/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': pre.payload.data.csrfToken },
    body: { password: 'test-admin-password' },
  })
  assert.equal(login.status, 200)
  assert.equal(login.payload.data.authenticated, true)
  const csrf = login.payload.data.csrfToken
  assert.ok(csrf)

  // The live API is backed by the real MSCC state shape.
  const overview = await call('/api/control-centre/overview')
  assert.equal(overview.status, 200)
  assert.equal(overview.payload.data.fleet.total, 2)
  assert.equal(overview.payload.data.messages24h, null, 'must not fabricate a message count')
  const activity = await call('/api/control-centre/activity')
  assert.equal(activity.status, 200)
  assert.equal(JSON.stringify(activity.payload).includes('should-not-leak'), false, 'nested credential fields must be removed')
  const accounts = await call('/api/control-centre/accounts')
  assert.equal(accounts.payload.data[0].id, 'A')
  assert.equal(accounts.payload.data[0].session, 'Private control')
  assert.equal(accounts.payload.data[0].phone, '+234***0001')

  // Account A stays private, and other linked sessions cannot acquire Control.
  const moveA = await call('/api/control-centre/accounts/A', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: { profileId: 'josiah' },
  })
  assert.equal(moveA.status, 403)
  const giveControlToB = await call('/api/control-centre/accounts/B', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: { profileId: 'control' },
  })
  assert.equal(giveControlToB.status, 403)
  assert.equal(state.accounts.find(item => item.id === 'A').profile, 'control')
  assert.equal(state.accounts.find(item => item.id === 'B').profile, 'josiah')

  // General Settings contains actual bot configuration, not command-enable booleans.
  const settings = await call('/api/control-centre/settings')
  assert.equal(settings.status, 200)
  assert.deepEqual(settings.payload.data, { publicPrefix: '.' })
  const savePrefix = await call('/api/control-centre/settings', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: { publicPrefix: '!' },
  })
  assert.equal(savePrefix.status, 200)
  assert.equal(savePrefix.payload.data.publicPrefix, '!')
  assert.equal(state.settings.song, true, 'general settings must not rewrite command switches')

  // Storage page is passive; provider login happens only after explicit administrator action.
  const storage = await call('/api/control-centre/storage')
  assert.equal(storage.status, 200)
  assert.equal(storage.payload.data.configured, true)
  assert.equal(storage.payload.data.connected, false)
  assert.equal(storage.payload.data.used, null)
  assert.equal(storage.payload.data.files[0].name, 'MSCC Uploads')
  assert.equal(storage.payload.data.files[0].status, 'Not checked')
  assert.equal(activeDashboardCalls, 0)
  const configCallsBefore = passiveDashboardCalls
  const serverConfig = await call('/api/control-centre/server/config')
  assert.equal(serverConfig.status, 200)
  assert.equal(serverConfig.payload.data.integrations.find(x => x.name === 'Cloud storage').status, 'not-configured')
  assert.equal(passiveDashboardCalls, configCallsBefore, 'configuration view must not authenticate with MEGA')
  const storageRefresh = await call('/api/control-centre/storage/refresh', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: {},
  })
  assert.equal(storageRefresh.status, 200)
  assert.equal(storageRefresh.payload.data.connected, true)
  assert.equal(storageRefresh.payload.data.used, 8192)
  assert.equal(storageRefresh.payload.data.files[0].name, 'MSCC Uploads')
  assert.equal(storageRefresh.payload.data.files[0].count, 3)
  assert.equal(activeDashboardCalls, 1)

  // Existing global command-setting booleans are changed through MSCC callback.
  const update = await call('/api/control-centre/modules/song', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: { enabled: false },
  })
  assert.equal(update.status, 200)
  assert.equal(state.settings.song, false)

  // CSRF and origin guards reject unsafe mutations.
  const noCsrf = await call('/api/control-centre/modules/song', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: { enabled: true },
  })
  assert.equal(noCsrf.status, 403)
  const wrongOrigin = await fetch(origin + '/api/control-centre/modules/song', {
    method: 'PATCH', headers: { Cookie: jar.header(), Origin: 'https://attacker.invalid', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify({ enabled: true }),
  })
  assert.equal(wrongOrigin.status, 403)

  // Repair and removal require explicit confirmation; Account A cannot be removed.
  const repairNoConfirm = await call('/api/control-centre/accounts/B/repair', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: {},
  })
  assert.equal(repairNoConfirm.status, 400)
  const repairQr = await call('/api/control-centre/accounts/B/repair', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: { confirm: true, method: 'qr' },
  })
  assert.equal(repairQr.status, 200)
  assert.equal(repairQr.payload.data.method, 'qr')
  assert.match(repairQr.payload.data.qr, /^data:image\/png;base64,/)
  assert.deepEqual(repairCalls.at(-1), ['B', 'qr'], 're-pair must use the selected mode and existing backup-before-repair callback')
  state.accounts.find(item => item.id === 'B').registered = true
  const unsafePair = await call('/api/control-centre/accounts/B/pair', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: { method: 'code' },
  })
  assert.equal(unsafePair.status, 409, 'ordinary pair must not overwrite existing saved auth')
  state.accounts.find(item => item.id === 'B').registered = false
  const firstPair = await call('/api/control-centre/accounts/B/pair', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: { method: 'code' },
  })
  assert.equal(firstPair.status, 200)
  assert.equal(firstPair.payload.data.code, '123-456')
  assert.deepEqual(pairCalls.at(-1), ['B', 'code'])
  const removeA = await call('/api/control-centre/accounts/A?confirm=true', {
    method: 'DELETE', headers: { 'X-CSRF-Token': csrf },
  })
  assert.equal(removeA.status, 403)

  // Read-only filesystem browser does not allow path traversal or mutations.
  const tree = await call('/api/control-centre/files/tree')
  assert.equal(tree.status, 200)
  assert.ok(tree.payload.data.children.some(item => item.name === 'index.js'))
  const traversal = await call('/api/control-centre/files/preview?path=../../etc/passwd')
  assert.equal(traversal.status, 403)
  const fileWrite = await call('/api/control-centre/files/content', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: { path: 'index.js', content: 'oops' },
  })
  assert.equal(fileWrite.status, 403)

  // Environment output includes metadata only for secrets.
  const env = await call('/api/control-centre/env')
  assert.equal(env.status, 200)
  for (const entry of env.payload.data) {
    if (entry.isSecret) assert.equal(Object.hasOwn(entry, 'value'), false)
  }

  // Full managed environment inventory: non-secrets are visible and sensitive values are masked.
  const envRows = env.payload.data
  const accountNumber = envRows.find(row => row.key === 'ACCOUNT_A_NUMBER')
  const messageTtl = envRows.find(row => row.key === 'MESSAGE_TTL_HOURS')
  const settingsFile = envRows.find(row => row.key === 'SETTINGS_FILE')
  const botOwner = envRows.find(row => row.key === 'BOT_OWNER')
  const megaSecret = envRows.find(row => row.key === 'GROQ_API_KEYS')
  assert.equal(accountNumber?.isSecret, true)
  assert.equal(Object.hasOwn(accountNumber || {}, 'value'), false)
  assert.equal(messageTtl?.value, '48')
  assert.equal(settingsFile?.value, '/var/lib/mscc/settings.json')
  assert.equal(botOwner?.value, 'NIGHT Operator')
  assert.equal(megaSecret?.isSecret, true)
  assert.equal(Object.hasOwn(megaSecret || {}, 'value'), false)

  // Audit log is created with restrictive permissions.
  const audit = await readFile(auditPath, 'utf8')
  assert.match(audit, /command-setting\.change/)
  assert.match(audit, /account\.profile-assign/)
  assert.equal((await stat(auditPath)).mode & 0o777, 0o600)

  console.log('PASS MSCC control-centre API: auth, CSRF, origin, private Account A, profile guard, safe pair/re-pair, split settings, passive storage, full env inventory, readonly paths, secret redaction, audit log')
} finally {
  await new Promise(resolve => server.close(resolve))
  await rm(auditPath, { force: true })
  delete process.env.ACCOUNT_A_NUMBER
  delete process.env.MESSAGE_TTL_HOURS
  delete process.env.MSCC_WEB_PORT
  delete process.env.GROQ_API_KEYS
  delete process.env.SETTINGS_FILE
  delete process.env.BOT_OWNER
}
