import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const read=p=>readFile(new URL(p,import.meta.url),'utf8')
test('Aharane serves Local Studio PWA from its private listener',async()=>{
 const s=await read('../src/index.js')
 for(const x of ["app.use('/studio',","new URL('../control-centre/',import.meta.url)","app.use('/studio/api'","app.get('/api/status', requireAdmin","app.get('/api/auth/status'","app.post('/api/auth/setup'","app.post('/api/auth/login'","app.post('/api/auth/logout'","HOST !== '127.0.0.1'"])assert.ok(s.includes(x),x)
})
test('owner password is salted and sessions are long-lived HttpOnly cookies',async()=>{
 const s=await read('../src/index.js')
 for(const x of ["scryptAsync","randomBytes(16)","ADMIN_SESSION_COOKIE = 'aharane_admin_session'","30 * 24 * 60 * 60","HttpOnly; Secure; SameSite=Strict","Path=/aharane/","ADMIN_AUTH_FILE","ADMIN_SETUP_CODE_FILE","timingSafeEqual(actual, expected)"])assert.ok(s.includes(x),x)
 assert.ok(!s.includes("ADMIN_SESSION_SECONDS=12*60*60"))
})
test('password change rotates the session key and logout clears the scoped cookie',async()=>{
 const s=await read('../src/index.js')
 assert.ok(s.includes("app.post('/api/auth/change-password'"))
 assert.ok(s.includes('sessionKey: randomBytes(32)'))
 assert.ok(s.includes("Max-Age=0"))
 assert.ok(s.includes("writeJsonAtomic(ADMIN_AUTH_FILE, updated)"))
})
test('HttpOnly session cookies authenticate same-origin GETs and WebSocket upgrades',async()=>{
 const s=await read('../src/index.js')
 assert.ok(s.includes("adminSessionMatches(requestCookie(req, ADMIN_SESSION_COOKIE), auth)"))
 assert.ok(s.includes("sameOriginRequest(req) && adminSessionMatches(cookie, auth)"))
 assert.ok(s.includes("async (req, transport, head)"))
})
test('browser uses same-origin API and WebSocket, not Vercel relay',async()=>{
 const s=await read('../control-centre/app.js')
 for(const x of ["fetch('/aharane/api/' + path.replace","location.host + '/aharane/ws'","navigator.serviceWorker.register('/aharane/studio/sw.js'","api('auth/login'","api('auth/setup'","api('auth/change-password'"])assert.ok(s.includes(x),x)
 assert.ok(!s.includes('/api/aharane/'));assert.ok(!s.includes('/api/studio/socket'))
})
test('whole app opens offline; remote views require login',async()=>{
 const s=await read('../control-centre/app.js')
 assert.ok(s.includes("localStudioMode('overview')"))
 assert.ok(s.includes("['pairing', 'deploy', 'files'].includes(name)"))
})
test('user can edit, apply, back up and recover app source',async()=>{
 const a=await read('../control-centre/app.js'),w=await read('../control-centre/sw.js'),h=await read('../control-centre/index.html'),r=await read('../control-centre/recover.html')
 for(const f of ['index.html','styles.css','app.js','manifest.webmanifest'])assert.ok(a.includes("'"+f+"'"))
 assert.ok(h.includes('studio-edit-app-source'));assert.ok(a.includes('appOverrides'));assert.ok(h.includes('Apply to this phone'))
 assert.ok(w.includes('SOURCE_PATHS'));assert.ok(w.includes('aharane-local-studio-shell-v4'));assert.ok(w.includes('readOverride'));assert.ok(r.includes("objectStore('appOverrides').clear()"))
 assert.ok(w.includes("u.pathname.startsWith('/aharane/api/')"))
})
test('WebSocket stays protected and exposes only status and ping actions',async()=>{
 const s=await read('../src/index.js')
 for(const x of ["server.on('upgrade'","pathname !== '/ws'","adminSessionMatches(cookie, auth)","message?.type === 'ping'","message?.type === 'status.get'","Unsupported message type"])assert.ok(s.includes(x),x)
})