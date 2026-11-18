import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('the uploaded Local Studio preview is the served production UI', async () => {
  const html = await read('../control-centre/index.html')
  const bridge = await read('../control-centre/production-bridge.js')
  assert.ok(html.includes('<title>Aharane Local Studio</title>'))
  assert.ok(html.includes('/aharane/studio/production-bridge.js'))
  assert.ok(bridge.includes('let filesBase, openFileBase, actBase, moreBase, homeBase, bubBase, openChatBase, bindBase, openPairBaseP, drawMsgsBaseP;'), 'The strict-mode bridge must declare its shared preview callbacks before installBridgeP runs.')
  assert.ok(bridge.includes("Studio startup failed:"), 'A bridge startup error must be visible instead of leaving a blank screen.')
  for (const marker of [
    "apiP('chats/",
    "apiP('files/preview",
    "apiP('files/content'",
    "apiP('accounts/'",
    "apiP('env'",
    "apiP('activity",
    "apiP('storage'",
    "apiP('update/upload/start'",
    "apiP('auth/login'",
  ]) assert.ok(bridge.includes(marker), 'Missing production bridge integration: ' + marker)
  assert.ok(!bridge.includes('Math.random'), 'The production bridge must not fabricate runtime data.')
})

test('Export Bot Source uses a real browser download instead of the preview-only host API', async () => {
 const app=await read('../control-centre/app.js')
 const bridge=await read('../control-centre/production-bridge.js')
 assert.ok(app.includes('id="export-bot-source"'))
 assert.ok(bridge.includes("fetch(API+'/files/export'"))
 assert.ok(bridge.includes("downloadP('aharane-source.zip',blob)"))
 assert.ok(!bridge.includes("claude.use('downloads')"))
})

test('the offline service worker caches the bridge and invalidates the previous shell', async () => {
  const sw = await read('../control-centre/sw.js')
  assert.ok(sw.includes('aharane-local-studio-shell-v11'))
  assert.ok(sw.includes('/aharane/studio/production-bridge.js'))
  assert.ok(sw.includes("['/aharane/studio/production-bridge.js','production-bridge.js']"))
})

test('Files toolbar groups Export Bot Source with the creation and upload actions', async () => {
  const app = await read('../control-centre/app.js')
  const start = app.indexOf('<div class="btns" style="margin:12px 0 0')
  const end = app.indexOf('<div class="crumbs"', start)
  const toolbar = app.slice(start, end)
  assert.ok(toolbar.includes('New file'))
  assert.ok(toolbar.includes('Upload'))
  assert.ok(toolbar.includes('New folder'))
  assert.ok(toolbar.includes('id="export-bot-source"'))
  assert.ok(toolbar.includes('flex-wrap:wrap'))
  const crumbStart = app.indexOf('<div class="crumbs"', end)
  const crumbEnd = app.indexOf('${selBar(d,ks)}', crumbStart)
  assert.ok(!app.slice(crumbStart, crumbEnd).includes('export-bot-source'))
  assert.ok(app.includes("dir?'Open folder':"), 'Unopened folders should not be labelled as empty.')
})

test('Configuration owner-number validation strips formatting before checking 7–15 digits', async () => {
  const bridge = await read('../control-centre/production-bridge.js')
  const slash = String.fromCharCode(92)
  assert.ok(bridge.includes("replace(/" + slash + "D/g,'' )") || bridge.includes("replace(/" + slash + "D/g,'')"))
  assert.ok(bridge.includes("!/^" + slash + "d{7,15}$/.test(ownerValue)"))
})
test('Configuration and ENV remain separate production screens', async () => {
  const app = await read('../control-centre/app.js')
  const bridge = await read('../control-centre/production-bridge.js')
  assert.ok(app.includes("S.sub==='cfg'?cfgV()"), 'Home must retain its dedicated Configuration view.')
  assert.ok(app.includes("files:filesV,env:envV,chats:chatsV"), 'ENV must remain its own bottom-navigation tab.')
  assert.ok(bridge.includes('async function saveConfigP()'), 'Configuration must save through the account settings APIs.')
  assert.ok(bridge.includes('function envViewP()'), 'ENV must keep its own environment-values view.')
  assert.ok(!bridge.includes("openCfg=function(){go('env')}"), 'Configuration must not redirect to ENV.')
  assert.ok(!bridge.includes("cfgFor=function(){go('env')}"), 'Account-specific Configuration must not redirect to ENV.')
})

test('individual and group chat visibility is configurable per account', async () => {
  const bridge = await read('../control-centre/production-bridge.js')
  const runtime = await read('../src/index.js')
  const settings = await read('../src/studio-settings.js')
  for (const marker of [
    'function openChatVisibilityP',
    'Individual chats',
    'Group conversations',
    'Show all',
    'Only selected',
    'data-vis-jid',
    "apiP('chats/'+account+'/visibility'",
    'id="chat-visibility"',
  ]) assert.ok(bridge.includes(marker), 'Missing inbox visibility UI: ' + marker)
  for (const marker of [
    "app.get('/api/chats/:accountId/visibility'",
    "app.put('/api/chats/:accountId/visibility'",
    'isChatVisible(studioSettings[accountId]',
  ]) assert.ok(runtime.includes(marker), 'Missing inbox visibility API: ' + marker)
  assert.ok(settings.includes('export function normalizeChatVisibility'))
  assert.ok(settings.includes('export function isChatVisible'))
})

test('pairing uses saved Private and Public numbers and is always user-requested', async () => {
 const bridge=await read('../control-centre/production-bridge.js')
 const pair=bridge.slice(bridge.indexOf('function pairViewP(){'),bridge.indexOf('async function getPairCodeP(){'))
 const bind=bridge.slice(bridge.indexOf('function bindProductionP(){'),bridge.indexOf('function homeViewP(){'))
 assert.ok(pair.includes('P.owners.privateOwnerNumber'))
 assert.ok(pair.includes('P.owners.publicBotNumber'))
 assert.ok(!pair.includes('id="pair-phone"'))
 assert.ok(pair.includes('id="prod-pair-code"'))
 assert.ok(pair.includes('id="prod-qr-request"'))
 assert.ok(pair.includes('id="prod-pair-repair"'))
 assert.ok(bind.includes('requestQrP'))
 assert.ok(bind.includes('repairPairP'))
 assert.ok(bind.includes('reconnectPairP'))
 assert.ok(!bind.includes('startQrP()'), 'Entering or rendering the Pair screen must not start QR polling.')
 assert.ok(bridge.includes("C.owner=profile==='private'?(P.owners.privateOwnerNumber||''):(P.owners.publicBotNumber||'')"))
})

test('Configuration drafts are not redrawn by background status polling', async () => {
 const bridge=await read('../control-centre/production-bridge.js')
 const refresh=bridge.slice(bridge.indexOf('async function refreshRuntimeP(){'),bridge.indexOf('async function refreshActivityP(){'))
 assert.ok(refresh.includes("if(S.tab==='home'&&!S.sub){render()}"))
 assert.ok(!refresh.includes("if(S.tab==='home'){render()}"))
 assert.ok(bridge.includes("P.statusTimer=setInterval(()=>{if(!document.hidden)refreshRuntimeP().catch(()=>{})},20000)"))
})

test('Home exposes service health and separate Private/Public WhatsApp status', async () => {
 const bridge=await read('../control-centre/production-bridge.js')
 const home=bridge.slice(bridge.indexOf('function homeViewP(){'),bridge.indexOf('function installBridgeP(){'))
 assert.ok(home.includes('Aharane service'))
 assert.ok(home.includes('Private WhatsApp'))
 assert.ok(home.includes('Public WhatsApp'))
 assert.ok(home.includes('data-action="stop"'))
 assert.ok(!home.includes("svc('stop')"))
})

test('Chats search updates in place and preserves message reading position', async () => {
 const bridge=await read('../control-centre/production-bridge.js')
 assert.ok(bridge.includes("apiP('chats/'+account+'/search?q='"))
 assert.ok(bridge.includes("id=\"chat-search-results\"") || bridge.includes("'<div id=\"chat-search-results\">'"))
 assert.ok(bridge.includes('function updateChatSearchPanelP()'))
 assert.ok(bridge.includes('drawMsgsBaseP();'))
 assert.ok(bridge.includes('el.scrollTop=top'))
 assert.ok(bridge.includes('},15000);'))
 assert.ok(!bridge.includes("setInterval(()=>refreshChatsP().then(()=>{if(S.chat!==null)loadMessagesP()}).catch(()=>{}),6000)"))
})

test('folder downloads create a ZIP and ZIP uploads display in-place progress', async () => {
 const bridge=await read('../control-centre/production-bridge.js')
 const menu=bridge.slice(bridge.indexOf('function fileMenuP(name,button){'),bridge.indexOf('function packageMenuP'))
 assert.ok(menu.includes("['Rename','Move','Download as ZIP']"))
 assert.ok(menu.includes("exportSelectionZipP([path],name+'.zip')"))
 const upload=bridge.slice(bridge.indexOf('function updateUploadProgressP(){'),bridge.indexOf('async function pollUpdateP(){'))
 assert.ok(upload.includes("id='prod-upload-progress'"))
 assert.ok(upload.includes("stage:'preparing'"))
 assert.ok(upload.includes("stage='validating'"))
 assert.ok(upload.includes("holder?.remove()"))
})

test('account and source downloads do not depend on the Claude preview host', async () => {
 const app=await read('../control-centre/app.js')
 const bridge=await read('../control-centre/production-bridge.js')
 assert.ok(!app.includes("claude.use('downloads')"))
 assert.ok(!bridge.includes("claude.use('downloads')"))
 assert.ok(bridge.includes("fetch(API+'/files/export-selection'"))
 assert.ok(bridge.includes("files/download?item="))
})



test('pairing refreshes the selected account state before navigation and after failed requests', async () => {
 const bridge = await read('../control-centre/production-bridge.js')
 const openPair = bridge.slice(bridge.indexOf('openPairBaseP=openPair;'), bridge.indexOf('const chatsBaseP=chatsV;'))
 assert.ok(openPair.includes('await refreshRuntimeP()'), 'Opening Pair must refresh the selected account status first.')
 const pair = bridge.slice(bridge.indexOf('function pairViewP(){'), bridge.indexOf('async function getPairCodeP(){'))
 assert.ok(pair.includes("a.state==='needs-pairing'"))
 assert.ok(pair.includes('pairStatusLabelP(a)'), 'Pair status must use readable labels.')
 const refresh = bridge.slice(bridge.indexOf('async function refreshPairViewAfterFailureP(){'), bridge.indexOf('async function getPairCodeP(){'))
 assert.ok(refresh.includes('before.state!==after.state'))
 const code = bridge.slice(bridge.indexOf('async function getPairCodeP(){'), bridge.indexOf('let qrSeenP='))
 assert.ok(code.includes('refreshPairViewAfterFailureP()'))
 const qr = bridge.slice(bridge.indexOf('async function requestQrP(){'), bridge.indexOf('async function repairPairP(){'))
 assert.ok(qr.includes('refreshPairViewAfterFailureP()'))
 assert.ok(bridge.includes('WhatsApp closed the pairing connection.'))
})
