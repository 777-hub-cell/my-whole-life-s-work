import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { startWebPanel } from './web-panel.js'

process.env.MSCC_ADMIN_AUDIT_FILE = `/tmp/mscc-control-centre-web-panel-audit-${process.pid}.jsonl`

async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
const port = await freePort()
const localControlPort = await freePort()
const password = 'TEST-only-control-centre-password'
const state = {
  version: '2.3.1-test', destination: 'A', settings: { publicPrefix: '.', song: true },
  botProfiles: [
    { id: 'control', displayName: 'Control', capabilities: [] },
    { id: 'unassigned', displayName: 'Unassigned', capabilities: [] },
    { id: 'josiah', displayName: 'Josiah', universal: true, basePriority: 100, capabilities: [] },
  ],
  accounts: [ { id: 'A', displayName: 'Private', role: 'owner', profile: 'control', connected: true, numberMasked: '+234***0001' } ],
}
let ownerConfig = { ownerNumberConfigured:true, ownerNumberMasked:'+234••••0001', ownerName:'Panel Owner' }
let managedTtl = '24'
const panel = startWebPanel({
  port, localControlPort, host: '127.0.0.1', password, sessionSecret: 'TEST-only-session-secret',
  getState: async () => state,
  getActivity: async () => [],
  getCloudDashboard: async () => ({ configured: false, provider: 'MEGA', targets: [] }),
  getCloudMounts: async () => [],
  createAccount: async () => ({}), renameAccount: async () => ({}), assignAccountProfile: async () => ({}),
  pairAccount: async () => ({}), reconnectAccount: async () => ({}), disconnectAccount: async () => ({}),
  repairAccount: async () => ({}), removeAccount: async () => ({}), setSetting: async (key, value) => { state.settings[key] = value },
  setPublicPrefix: async value => { state.settings.publicPrefix = value; return value },
  getOwnerConfig: () => ({ ...ownerConfig }),
  setOwnerConfig: async ({ ownerNumber, ownerName }) => {
    ownerConfig = { ownerNumberConfigured:true, ownerNumberMasked:'+234••••' + ownerNumber.slice(-4), ownerName }
    return { ...ownerConfig }
  },
  getManagedEnv: async () => [
    { key:'MESSAGE_TTL_HOURS', label:'Message retention (hours)', value:managedTtl, isSecret:false, configured:true, editable:true, applyMode:'restart', requiresRestart:true, min:1, max:168 },
  ],
  setManagedEnv: async (key, value) => {
    managedTtl = String(value)
    return { key, label:'Message retention (hours)', value:managedTtl, isSecret:false, configured:true, editable:true, applyMode:'restart', requiresRestart:true }
  },
  listCommandModules: () => [{ id:'general', name:'General', category:'Public command modules', description:'General public commands', commands:['help','ping'], commandCount:2 }],
  setProfileCapability: async (profileId, moduleId, enabled) => {
    const profile = state.botProfiles.find(item => item.id === profileId)
    profile.universal = false
    profile.capabilities = enabled ? [{ capability:moduleId, priority:100 }] : []
    return profile
  },
})

const base = `http://127.0.0.1:${port}`
const websiteOrigin = `https://127.0.0.1:${port}`
// Simulate the HTTPS scheme forwarded by the separate website host. The test
// listener remains the Host value; production Nginx passes its public $host.
const proxyHeaders = { 'X-Forwarded-Proto': 'https' }
const apiCookies = new Map()
const legacyCookies = new Map()
function applyCookies(store, response) {
  const rows = response.headers.getSetCookie?.() || [response.headers.get('set-cookie') || '']
  for (const row of rows) {
    const pair = row.split(';', 1)[0]
    const at = pair.indexOf('=')
    if (at < 1) continue
    const name = pair.slice(0, at), value = pair.slice(at + 1)
    if (/Max-Age=0/i.test(row)) store.delete(name); else store.set(name, value)
  }
}
function cookieHeader(store) { return [...store].map(([k, v]) => `${k}=${v}`).join('; ') }

try {
  let ready = false
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(base + '/health')).ok) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  assert(ready, 'MSCC web panel did not start')

  // Website files are not served by the bot server. The separate host owns the UI.
  // The legacy panel intentionally requires its own login before unknown routes
  // are exposed as 404, so verify this after authenticating below.
  const legacyPage = await fetch(base + '/')
  assert.equal(legacyPage.status, 200)
  assert.match(await legacyPage.text(), /MSCC|app/)

  const anonymous = await fetch(base + '/api/control-centre/accounts')
  assert.equal(anonymous.status, 401)

  // Simulate the website server's same-origin HTTPS reverse proxy. The forwarded
  // scheme and browser Origin must match for origin checks and Secure cookies.
  const pre = await fetch(base + '/api/control-centre/auth/session', { headers: proxyHeaders })
  applyCookies(apiCookies, pre)
  const preData = (await pre.json()).data
  assert.equal(preData.authenticated, false)
  assert.ok(preData.csrfToken)
  assert.match(pre.headers.get('set-cookie') || '', /HttpOnly/)
  assert.match(pre.headers.get('set-cookie') || '', /SameSite=Strict/)
  assert.match(pre.headers.get('set-cookie') || '', /Secure/)
  const login = await fetch(base + '/api/control-centre/auth/login', {
    method: 'POST', headers: { ...proxyHeaders, Origin: websiteOrigin, Cookie: cookieHeader(apiCookies), 'Content-Type': 'application/json', 'X-CSRF-Token': preData.csrfToken },
    body: JSON.stringify({ password }),
  })
  applyCookies(apiCookies, login)
  assert.equal(login.status, 200)
  const loginData = (await login.json()).data
  assert.equal(loginData.authenticated, true)

  const liveAccounts = await fetch(base + '/api/control-centre/accounts', { headers: { ...proxyHeaders, Cookie: cookieHeader(apiCookies) } })
  assert.equal(liveAccounts.status, 200)
  assert.equal((await liveAccounts.json()).data[0].session, 'Private control')

  const noCsrf = await fetch(base + '/api/control-centre/settings', {
    method: 'PUT', headers: { ...proxyHeaders, Origin: websiteOrigin, Cookie: cookieHeader(apiCookies), 'Content-Type': 'application/json' },
    body: JSON.stringify({ song: false }),
  })
  assert.equal(noCsrf.status, 403)

  const wrongOrigin = await fetch(base + '/api/control-centre/settings', {
    method: 'PUT', headers: { ...proxyHeaders, Origin: 'https://attacker.example.test', Cookie: cookieHeader(apiCookies), 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrfToken },
    body: JSON.stringify({ song: false }),
  })
  assert.equal(wrongOrigin.status, 403)

  const update = await fetch(base + '/api/control-centre/settings', {
    method: 'PUT', headers: { ...proxyHeaders, Origin: websiteOrigin, Cookie: cookieHeader(apiCookies), 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrfToken },
    body: JSON.stringify({ publicPrefix: '!' }),
  })
  assert.equal(update.status, 200)
  assert.equal(state.settings.publicPrefix, '!')
  assert.equal(state.settings.song, true)

  // New configurable owner and real per-profile module callbacks must survive
  // the web-panel -> Control Centre API handoff.
  const ownerBefore = await fetch(base + '/api/control-centre/settings/owner', { headers:{ ...proxyHeaders, Cookie:cookieHeader(apiCookies) } })
  assert.equal(ownerBefore.status, 200)
  assert.equal((await ownerBefore.json()).data.ownerNumberMasked, '+234••••0001')
  const ownerUpdate = await fetch(base + '/api/control-centre/settings/owner', {
    method:'PUT', headers:{ ...proxyHeaders, Origin:websiteOrigin, Cookie:cookieHeader(apiCookies), 'Content-Type':'application/json', 'X-CSRF-Token':loginData.csrfToken },
    body:JSON.stringify({ ownerNumber:'2348012345678', ownerName:'Updated Owner' }),
  })
  assert.equal(ownerUpdate.status, 200)
  assert.equal(ownerConfig.ownerName, 'Updated Owner')
  const envRowsResponse = await fetch(base + '/api/control-centre/env', { headers:{ ...proxyHeaders, Cookie:cookieHeader(apiCookies) } })
  assert.equal(envRowsResponse.status, 200)
  assert.equal((await envRowsResponse.json()).data.find(item => item.key === 'MESSAGE_TTL_HOURS').editable, true)
  const envSave = await fetch(base + '/api/control-centre/env/MESSAGE_TTL_HOURS', {
    method:'PUT', headers:{ ...proxyHeaders, Origin:websiteOrigin, Cookie:cookieHeader(apiCookies), 'Content-Type':'application/json', 'X-CSRF-Token':loginData.csrfToken },
    body:JSON.stringify({ value:'48' }),
  })
  assert.equal(envSave.status, 200)
  assert.equal(managedTtl, '48')
  const moduleRows = await fetch(base + '/api/control-centre/modules?profileId=josiah', { headers:{ ...proxyHeaders, Cookie:cookieHeader(apiCookies) } })
  assert.equal(moduleRows.status, 200)
  assert.equal((await moduleRows.json()).data[0].enabled, true)
  const moduleUpdate = await fetch(base + '/api/control-centre/profiles/josiah/config', {
    method:'PATCH', headers:{ ...proxyHeaders, Origin:websiteOrigin, Cookie:cookieHeader(apiCookies), 'Content-Type':'application/json', 'X-CSRF-Token':loginData.csrfToken },
    body:JSON.stringify({ moduleId:'general', enabled:false }),
  })
  assert.equal(moduleUpdate.status, 200)
  assert.equal(state.botProfiles.find(item => item.id === 'josiah').universal, false)

  // The pre-existing panel API remains separately protected and functional.
  const legacyUnauth = await fetch(base + '/api/state')
  assert.equal(legacyUnauth.status, 401)
  const legacyLogin = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
  applyCookies(legacyCookies, legacyLogin)
  assert.equal(legacyLogin.status, 200)
  const legacyState = await fetch(base + '/api/state', { headers: { Cookie: cookieHeader(legacyCookies) } })
  assert.equal(legacyState.status, 200)
  const siteRoute = await fetch(base + '/control-centre/', { headers: { Cookie: cookieHeader(legacyCookies) } })
  assert.equal(siteRoute.status, 404)

  console.log('PASS separate-host MSCC integration: API-only backend, HTTPS reverse-proxy origin/cookies, CSRF, protected API and legacy panel compatibility')
} finally {
  panel.close()
}
