import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('Aharane serves the Local Studio PWA from its private listener', async () => {
 const s=await read('../src/index.js')
 for(const marker of ["app.use('/studio',","new URL('../control-centre/',import.meta.url)","app.use('/studio/api'","app.get('/api/status', requireAdmin","app.get('/api/auth/status'","app.post('/api/auth/setup'","app.post('/api/auth/login'","app.post('/api/auth/logout'","HOST !== '127.0.0.1'"])assert.ok(s.includes(marker),marker)
})

test('owner password is salted and sessions are long-lived HttpOnly cookies', async () => {
 const s=await read('../src/index.js')
 for(const marker of ["scryptAsync","randomBytes(16)","ADMIN_SESSION_COOKIE = 'aharane_admin_session'","30 * 24 * 60 * 60","HttpOnly; Secure; SameSite=Strict","Path=/aharane/","ADMIN_AUTH_FILE","ADMIN_SETUP_CODE_FILE","timingSafeEqual(actual, expected)"])assert.ok(s.includes(marker),marker)
 assert.ok(!s.includes("ADMIN_SESSION_SECONDS=12*60*60"))
})

test('password change rotates the session key and logout clears the scoped cookie', async () => {
 const s=await read('../src/index.js')
 assert.ok(s.includes("app.post('/api/auth/change-password'"))
 assert.ok(s.includes('sessionKey: randomBytes(32)'))
 assert.ok(s.includes("Max-Age=0"))
 assert.ok(s.includes("writeJsonAtomic(ADMIN_AUTH_FILE, updated)"))
})

test('HttpOnly session cookies authenticate same-origin GETs and WebSocket upgrades', async () => {
 const s=await read('../src/index.js')
 assert.ok(s.includes("adminSessionMatches(requestCookie(req, ADMIN_SESSION_COOKIE), auth)"))
 assert.ok(s.includes("sameOriginRequest(req) && adminSessionMatches(cookie, auth)"))
 assert.ok(s.includes("async (req, transport, head)"))
})


test('both accounts pair from their saved configuration number without a duplicate phone input', async () => {
 const s=await read('../src/index.js')
 const start=s.indexOf("app.post('/api/accounts/:accountId/pair-code'")
 const end=s.indexOf("app.get('/api/accounts/:accountId/qr'",start)
 const route=s.slice(start,end)
 assert.ok(route.includes("accountId === 'private' ? ownerConfig.privateOwnerNumber : ownerConfig.publicBotNumber"))
 assert.ok(route.includes("session.registered || session.state === 'connected'"))
 assert.ok(route.includes('accountRuntime.requestPairingCode(accountId, phoneNumber)'))
 assert.ok(!route.includes('req.body?.phoneNumber'))
 assert.ok(!route.includes('ownerConfig.publicOwnerNumber'))
})

test('QR reads are passive and a QR socket starts only after an explicit POST request', async () => {
 const s=await read('../src/index.js')
 const start=s.indexOf("app.get('/api/accounts/:accountId/qr'")
 const end=s.indexOf("app.post('/api/accounts/:accountId/reconnect'",start)
 const routes=s.slice(start,end)
 const getRoute=routes.slice(0,routes.indexOf("app.post('/api/accounts/:accountId/qr'"))
 const postRoute=routes.slice(routes.indexOf("app.post('/api/accounts/:accountId/qr'"))
 assert.ok(!getRoute.includes('accountRuntime.start('), 'GET must never start a pairing socket.')
 assert.ok(postRoute.includes('await accountRuntime.start(accountId)'), 'Only explicit POST starts a QR session.')
 assert.ok(getRoute.includes("session.registered || session.state === 'connected'"))
})

test('the backend exposes protected full-history chat search and browser file downloads', async () => {
 const s=await read('../src/index.js')
 assert.ok(s.includes("app.get('/api/chats/:accountId/search'"))
 assert.ok(s.includes('chatStore.searchMessages(accountId'))
 assert.ok(s.includes("app.get('/api/files/download'"))
 assert.ok(s.includes("app.post('/api/files/export-selection'"))
 assert.ok(s.includes("Content-Disposition', `attachment; filename*=UTF-8''"))
})

test('Files root enumerates the deployed release and exposes only allowlisted source entries', async () => {
 const s=await read('../src/index.js')
 const start=s.indexOf("async function listSourceFiles(relativePath = '')")
 const end=s.indexOf("\nasync function ensureManualEditBackup()",start)
 const fn=s.slice(start,end)
 assert.ok(fn.includes('const base = await sourceWorkspaceDirectory()'))
 assert.ok(fn.includes('readdir(base, { withFileTypes: true })'))
 assert.ok(fn.includes('SOURCE_DIRS.has(row.name)'))
 assert.ok(fn.includes('SOURCE_ROOT_FILES.has(row.name)'))
 assert.ok(fn.includes('row.isSymbolicLink()'))
})

test('source ZIP export is protected and only includes allowlisted source files', async () => {
 const s=await read('../src/index.js')
 const module=await read('../src/source-export.js')
 const route=s.slice(s.indexOf("app.get('/api/files/export'"),s.indexOf("app.get('/api/files/tree'"))
 assert.ok(route.includes('requireAdmin'))
 assert.ok(route.includes('listSourceFiles(directory)'))
 assert.ok(route.includes('safeSourceTarget(path)'))
 assert.ok(route.includes("Content-Type', 'application/zip'"))
 assert.ok(route.includes(String.raw`Content-Disposition', 'attachment; filename="aharane-source.zip"'`))
 assert.ok(route.includes('createSourceZip(files)'))
 assert.ok(module.includes('0x04034b50'))
 assert.ok(module.includes('0x02014b50'))
 assert.ok(module.includes('0x06054b50'))
})

test('the supplied Studio preview uses protected same-origin APIs', async () => {
 const html=await read('../control-centre/index.html')
 const bridge=await read('../control-centre/production-bridge.js')
 assert.ok(html.includes('src="/aharane/studio/app.js"'))
 assert.ok(html.includes('src="/aharane/studio/production-bridge.js"'))
 assert.ok(bridge.includes("const API='/aharane/api'"))
 assert.ok(bridge.includes("credentials:'same-origin'"))
 for(const marker of ["apiP('auth/status'","apiP('auth/login'","apiP('auth/setup'","apiP('owners'","apiP('env'","apiP('storage'","apiP('activity","apiP('files/tree","apiP('files/content'","apiP('update/upload/start'"])assert.ok(bridge.includes(marker),marker)
 assert.ok(!bridge.includes('vercel.app'))
})

test('the production home, accounts, files, ENV and chats use real server data', async () => {
 const bridge=await read('../control-centre/production-bridge.js')
 const runtime=await read('../src/index.js')
 for(const marker of ["apiP('studio/snapshot'","apiP('metrics'","apiP('accounts/'+id+'/qr'","apiP('chats/'+account","apiP('files/preview?item='","apiP('env'","apiP('storage'","apiP('activity?limit="])assert.ok(bridge.includes(marker),marker)
 for(const marker of ["app.get('/api/chats/:accountId'","app.get('/api/chats/:accountId/:jid/messages'","app.post('/api/chats/:accountId/:jid/send'","app.post('/api/chats/:accountId/:jid/media'","app.get('/api/storage'","app.get('/api/activity'"])assert.ok(runtime.includes(marker),marker)
 assert.ok(runtime.includes("!authorizedChat(accountId, media.jid) || !isChatVisible(studioSettings[accountId], media.jid)"), 'Media URLs enforce the same account visibility filter as messages')
})

test('the preview keeps its original mobile file-manager and editor interactions', async () => {
 const html=await read('../control-centre/index.html')
 const app=await read('../control-centre/app.js')
 const css=await read('../control-centre/styles.css')
 const bridge=await read('../control-centre/production-bridge.js')
 assert.ok(html.includes('<main class="app">')||html.includes('class="app"'))
 assert.ok(app.includes('function filesV()'))
 assert.ok(app.includes('function menu('))
 assert.ok(app.includes('function editorOld()'))
 assert.ok(app.includes('placeholder="Search files and folders"'))
 assert.ok(css.includes('.row{'))
 assert.ok(css.includes('.pop{'))
 assert.ok(css.includes('.editor{'))
 for(const marker of ["apiP('files/tree","apiP('files/preview","apiP('files/content'","apiP('files/rename'","apiP('files/move'","apiP('files/delete'","apiP('files/apply'"])assert.ok(bridge.includes(marker),marker)
})

test('the app source editor works on-device and can safely reset its overrides', async () => {
 const html=await read('../control-centre/index.html')
 const bridge=await read('../control-centre/production-bridge.js')
 const worker=await read('../control-centre/sw.js')
 const recovery=await read('../control-centre/recover.html')
 for(const file of ['index.html','styles.css','app.js','production-bridge.js','manifest.webmanifest'])assert.ok(bridge.includes(file))
 for(const marker of ["id=\"open-local-source\"","indexedDB.open('aharane-local-studio',2)","objectStore('appOverrides').put","objectStore('appOverrides').clear","function openAppSourceP","function saveAppSourceP","function resetAppSourceP"])assert.ok(bridge.includes(marker),marker)
 assert.ok(worker.includes('aharane-local-studio-shell-v11'))
 assert.ok(worker.includes('SOURCE_PATHS'))
 assert.ok(worker.includes("['/aharane/studio/production-bridge.js','production-bridge.js']"))
 assert.ok(worker.includes("u.pathname.startsWith('/aharane/api/')"))
 assert.ok(recovery.includes("objectStore('appOverrides').clear()"))
 assert.ok(html.includes('href="/aharane/studio/manifest.webmanifest"'))
})

test('Files menus remain compact floating overlays and staged changes require explicit apply', async () => {
 const app=await read('../control-centre/app.js')
 const bridge=await read('../control-centre/production-bridge.js')
 const css=await read('../control-centre/styles.css')
 assert.ok(app.includes('function menu('))
 assert.ok(app.includes("m.className='pop'"))
 assert.ok(css.includes('.pop{'))
 assert.ok(bridge.includes('function fileMenuP'))
 assert.ok(bridge.includes('files/apply'))
 assert.ok(bridge.includes('Apply staged source changes and restart Aharane?'))
})

test('browser navigation remains driven by the supplied five-tab preview', async () => {
 const app=await read('../control-centre/app.js')
 for(const marker of ["const T={home:'Home',files:'Files',env:'ENV',chats:'Chats',more:'More'}","function nav()","function render()","function go(t)"])assert.ok(app.includes(marker),marker)
})

test('WebSocket stays protected and exposes only status and ping actions', async () => {
 const s=await read('../src/index.js')
 for(const marker of ["server.on('upgrade'","pathname !== '/ws'","adminSessionMatches(cookie, auth)","message?.type === 'ping'","message?.type === 'status.get'","Unsupported message type"])assert.ok(s.includes(marker),marker)
})

test('the source editor view and account identity settings are reachable', async () => {
 const bridge=await read('../control-centre/production-bridge.js')
 assert.ok(bridge.includes("if(S.sub==='source')return appSourceViewP()"))
 assert.ok(bridge.includes("onclick=\"openAcc()\""))
 assert.ok(bridge.includes("const localSource=Q('#offline-open-source')"))
})


test('source path validation imports the shared ZIP path normalizer', async () => {
 const runtime = await read('../src/index.js')
 const updates = await read('../src/update-manager.js')
 assert.ok(runtime.includes("MAX_ARCHIVE_BYTES, normalizeUpdatePath } from './update-manager.js'"), 'The source path helper must be imported from update-manager.js.')
 assert.ok(updates.includes('export function normalizeUpdatePath'))
 assert.ok(runtime.includes('const normalized = normalizeUpdatePath(relativePath)'))
})


test('phone-number pairing uses a canonical browser identity for WhatsApp companion linking', async () => {
 const s = await read('../src/index.js')
 assert.ok(s.includes("browser: Browsers.macOS('Chrome')"), 'Pairing code companion display must use a recognized Chrome/Mac OS identity, not the custom Aharane label.')
})
