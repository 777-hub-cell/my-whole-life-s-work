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

test('the offline service worker caches the bridge and the new workspace shell', async () => {
  const sw = await read('../control-centre/sw.js')
  assert.ok(sw.includes('aharane-local-studio-shell-v15'))
  assert.ok(sw.includes("k.startsWith('aharane-local-studio-shell-')&&k!==CACHE_NAME"))
  assert.ok(sw.includes('/aharane/studio/production-bridge.js'))
  assert.ok(sw.includes("['/aharane/studio/production-bridge.js','production-bridge.js']"))
  assert.ok(sw.includes('/aharane/studio/web-workspace.js'))
  assert.ok(sw.includes("['/aharane/studio/web-workspace.js','web-workspace.js']"))
})
test('web conversations render encrypted on-device cache before fetching server history', async () => {
  const html = await read('../control-centre/index.html')
  const bridge = await read('../control-centre/production-bridge.js')
  assert.ok(html.includes('/aharane/studio/web-workspace.js'))
  assert.ok(bridge.includes("const CHAT_CACHE_DB_P='aharane-encrypted-chat-cache-v1'"))
  assert.ok(bridge.includes("crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt'])"))
  assert.ok(bridge.includes('crypto.subtle.encrypt({name:\'AES-GCM\',iv},key,clear)'))
  assert.ok(bridge.includes('crypto.subtle.decrypt({name:\'AES-GCM\',iv:new Uint8Array(record.iv)},key,record.ciphertext)'))
  assert.ok(bridge.includes("readChatCacheP(account,'messages',jid)"))
  assert.ok(bridge.includes("await writeChatCacheP(account,'messages',jid,"))
  assert.ok(bridge.includes("function cacheableChatMessageP(message)"))
  assert.ok(bridge.includes("CHAT_CACHE_MAX_MESSAGE_CHATS_P=150"))
  assert.ok(bridge.includes("CHAT_CACHE_MAX_BYTES_P=20*1024*1024"))
  const sanitizer = bridge.slice(bridge.indexOf("function cacheableChatMessageP(message)"), bridge.indexOf("async function writeChatCacheP", bridge.indexOf("function cacheableChatMessageP(message)")))
  assert.ok(sanitizer.includes("viewOnce:true"))
  assert.ok(!sanitizer.includes("text:"))
  assert.ok(!sanitizer.includes("mediaUrl"))
  assert.ok(bridge.includes("crypto.getRandomValues(new Uint8Array(12))"))
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
 const code=bridge.slice(bridge.indexOf('async function getPairCodeP(){'),bridge.indexOf('let qrSeenP='))
 const qrRequest=bridge.slice(bridge.indexOf('async function requestQrP(){'),bridge.indexOf('async function repairPairP(){'))
 assert.ok(pair.includes('P.owners.privateOwnerNumber'))
 assert.ok(pair.includes('P.owners.publicBotNumber'))
 assert.ok(!pair.includes('id="pair-phone"'))
 assert.ok(pair.includes('id="prod-pair-code"'))
 assert.ok(pair.includes('id="prod-qr-request"'))
 assert.ok(pair.includes('id="prod-cancel-pairing"'))
 assert.ok(pair.includes('id="prod-pair-back"'))
 assert.ok(pair.includes('current WhatsApp session stays available'))
 assert.ok(bind.includes('requestQrP'))
 assert.ok(bind.includes('cancelPairingP'))
 assert.ok(bind.includes('prod-pair-back'))
 assert.ok(bind.includes('reconnectPairP'))
 assert.ok(code.includes('startPairMonitorP()'), 'Pairing code requests monitor the candidate lifecycle.')
 assert.ok(qrRequest.includes('startQrP()'), 'QR polling starts only after the explicit QR request.')
 assert.ok(bridge.includes("C.owner=profile==='private'?(P.owners.ownerNumber||P.owners.privateOwnerNumber||''):(P.owners.publicBotNumber||'')"))
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

test('Base Studio Files and Chats render contextual empty states without dead selection controls', async () => {
 const app=await read('../control-centre/app.js')
 assert.ok(app.includes("if(!ks.length&&!n)return ''"))
 assert.ok(app.includes('This folder is empty'))
 assert.ok(app.includes('Create file'))
 assert.ok(app.includes("CH.length===0?'No conversations yet':'No chats in this filter'"))
 assert.ok(app.includes("q?'No chats match your search'"))
 assert.ok(app.includes("id=\"clear-chat-search\""))
 const css=await read('../control-centre/styles.css')
 assert.ok(css.includes('.files-empty,.chats-empty'))
 const bridge=await read('../control-centre/production-bridge.js')
 const chats=bridge.slice(bridge.indexOf('const chatsBaseP=chatsV;'),bridge.indexOf('filesV=filesScreenP'))
 assert.ok(chats.includes("let title='Link your '+accountName"))
 assert.ok(chats.includes('data-pair-account='))
 assert.ok(chats.includes('data-action="reconnect"'))
 assert.ok(chats.includes('Re-pair account'))
 assert.ok(chats.includes('Continue pairing'))
})
 
test('ENV and Home display useful empty states instead of blank panels', async () => {
 const bridge=await read('../control-centre/production-bridge.js')
 const env=bridge.slice(bridge.indexOf('function envViewP(){'),bridge.indexOf('async function saveEnvP(){'))
 const home=bridge.slice(bridge.indexOf('function homeViewP(){'),bridge.indexOf('function installFileSaveLifecycleP(){'))
 assert.ok(env.includes('No environment values are available yet.'))
 assert.ok(env.includes('id="prod-save-env"'))
 assert.ok(env.includes("const save=P.env.length?"))
 assert.ok(env.includes("P.env.length?'':'"))
 assert.ok(home.includes('No recent activity yet.'))
 assert.ok(home.includes("a.registered?'Paired · offline':'Not paired'"))
 assert.ok(home.includes("['needs-pairing','reconnect-exhausted'].includes(a.state)?'Needs re-pairing'"))
 assert.ok(home.includes('white-space:normal'))
 const more=bridge.slice(bridge.indexOf('function moreViewP(){'),bridge.indexOf('function changePasswordP(){'))
 assert.ok(more.includes('Manage both sessions with one shared Owner identity'))
 assert.ok(!more.includes('separate Owner identities'))
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
 assert.ok(pair.includes('a.pairingError'))
 assert.ok(pair.includes('a.registered'))
 assert.ok(pair.includes('replacement link has connected successfully'))
 assert.ok(pair.includes('pairStatusLabelP(a)'), 'Pair status must use readable labels.')
 const refresh = bridge.slice(bridge.indexOf('async function refreshPairViewAfterFailureP(){'), bridge.indexOf('async function getPairCodeP(){'))
 assert.ok(refresh.includes('before.state!==after.state'))
 const code = bridge.slice(bridge.indexOf('async function getPairCodeP(){'), bridge.indexOf('let qrSeenP='))
 assert.ok(code.includes('refreshPairViewAfterFailureP()'))
 const qr = bridge.slice(bridge.indexOf('async function requestQrP(){'), bridge.indexOf('async function repairPairP(){'))
 assert.ok(qr.includes('refreshPairViewAfterFailureP()'))
 assert.ok(bridge.includes('WhatsApp closed the pairing connection.'))
})


test('the Files editor verifies server content before showing a successful autosave', async () => {
 const bridge=await read('../control-centre/production-bridge.js')
 const start=bridge.indexOf('async function flushFileAutosavePathP(path)')
 const end=bridge.indexOf('async function saveLiveFileP()',start)
 const save=bridge.slice(start,end)
 const immediate=bridge.slice(end,bridge.indexOf('function createLiveFileP',end))
 assert.ok(save.includes("apiP('files/content'"))
 assert.ok(save.includes("apiP('files/preview?item='"))
 assert.ok(save.includes('verified.content!==job.content||verified.sha256!==saveResult.sha256'))
 assert.ok(save.includes('Autosaved to server (staged)'))
 assert.ok(immediate.includes('This will replace the existing file with an empty file. Continue?'))
})

test('the production Files screen renders the real editor before exposing server save controls', async () => {
 const bridge=await read('../control-centre/production-bridge.js')
 const app=await read('../control-centre/app.js')
 const screen=bridge.slice(bridge.indexOf('function filesScreenP(){'),bridge.indexOf('function filePathP',bridge.indexOf('function filesScreenP(){')))
 const bind=bridge.slice(bridge.indexOf('function bindProductionP(){'),bridge.indexOf('function homeViewP(){'))
 assert.ok(app.includes('function editorOld(){'), 'The editor markup must be available from the base Studio UI.')
 assert.ok(screen.includes('if(S.ed){'))
 assert.ok(screen.includes('const editorMarkup=editorOld()'), 'Opening a source file must render the real textarea editor.')
 assert.ok(screen.includes('return conflictLocked+localDraftBannerP()'), 'The real editor must remain visible with device-draft conflict controls.')
 assert.ok(screen.includes('id="prod-file-save"'))
 assert.ok(screen.includes('id="prod-file-download"'))
 assert.ok(bind.includes("const fileEditor=Q('#ed')"))
 assert.ok(bind.includes('scheduleFileAutosaveP(editorPath,fileEditor.value)'), 'Editing must queue the current file for automatic saving.')
 assert.ok(bridge.includes("localOk?'Unsaved changes · autosaving…'"), 'Editing must be marked unsaved until autosave is verified.')
});


test('server file saves use valid exclusive-write options and nested folders remain browsable', async () => {
 const runtime=await read('../src/index.js')
 const start=runtime.indexOf("app.put('/api/files/content'")
 const end=runtime.indexOf("app.post('/api/files/rename'",start)
 const save=runtime.slice(start,end)
 assert.ok(save.includes("mode: 0o640, flag: 'wx'"), 'The save handler must use numeric file permissions and keep wx as the open flag.')
 assert.ok(!save.includes("mode: 'wx'"), 'wx is a file-open flag, not a permission mode.')
 assert.ok(save.includes("await readFile(target.full, 'utf8')"), 'The server must verify the on-disk content after saving.')
 const pathStart=runtime.indexOf('async function safeSourceTarget')
 const pathEnd=runtime.indexOf('async function listSourceFiles',pathStart)
 const pathGuard=runtime.slice(pathStart,pathEnd)
 assert.ok(pathGuard.includes('if (info?.isFile() && parts.length > 1'), 'Approved-extension checks must not reject nested folders.')
 assert.ok(runtime.includes("['.json', '.webmanifest'].includes(extension)"), 'Web app manifests must be validated as JSON before saving.')
})


test('stale empty Files drafts are safely cleared and stale non-empty drafts can be discarded', async () => {
 const runtime=await read('../src/index.js')
 const bridge=await read('../control-centre/production-bridge.js')
 assert.ok(runtime.includes('async function clearEmptyStaleManualEdits(currentRelease, manual)'))
 assert.ok(runtime.includes('if (await clearEmptyStaleManualEdits(current, manual)) return current'))
 const discard=runtime.slice(runtime.indexOf("app.post('/api/files/discard'"),runtime.indexOf("app.get('/api/files/packages'"))
 assert.ok(discard.includes('actualWorkspace === current'), 'Discard must never remove the active release.')
 assert.ok(!discard.includes('current !== manual.currentRelease'), 'A safely contained stale draft must still be discardable.')
 assert.ok(bridge.includes("apiP('files/discard'"), 'The Files screen must expose a discard action for stale drafts.')
 assert.ok(bridge.includes('id="prod-discard-files"'))
})

// Keep the regression suite synchronized with the final save-count UI change.


test('Files editor automatically saves after typing pauses and verifies the server read-back', async () => {
 const bridge=await read('../control-centre/production-bridge.js')
 const screen=bridge.slice(bridge.indexOf('function filesScreenP(){'),bridge.indexOf('function filePathP',bridge.indexOf('function filesScreenP(){')))
 const save=bridge.slice(bridge.indexOf('function setFileEditorStatusP'),bridge.indexOf('function createLiveFileP'))
 const bind=bridge.slice(bridge.indexOf('function bindProductionP(){'),bridge.indexOf('function homeViewP(){'))
 assert.ok(screen.includes('Autosave on'))
 assert.ok(screen.includes('Save now'))
 assert.ok(save.includes('function scheduleFileAutosaveP(path, content, delay=1000, options={})'))
 assert.ok(save.includes('fileAutosaveQueuedP.set(path,job)'), 'Autosave queues must be keyed by file path.')
 assert.ok(save.includes("apiP('files/content'"))
 assert.ok(save.includes("apiP('files/preview?item='"))
 assert.ok(save.includes('verified.content!==job.content||verified.sha256!==saveResult.sha256'))
 assert.ok(bind.includes('scheduleFileAutosaveP(editorPath,fileEditor.value)'))
 assert.ok(bind.includes('fileEditor.onblur'))
})

test('autosave can store incomplete code drafts and Apply validates edited JS and JSON before activation', async () => {
 const runtime=await read('../src/index.js')
 const saveStart=runtime.indexOf("app.put('/api/files/content'")
 const saveEnd=runtime.indexOf("app.post('/api/files/rename'",saveStart)
 const save=runtime.slice(saveStart,saveEnd)
 const applyStart=runtime.indexOf("app.post('/api/files/apply'")
 const applyEnd=runtime.indexOf("app.post('/api/files/discard'",applyStart)
 const apply=runtime.slice(applyStart,applyEnd)
 assert.ok(save.includes('validateSourceContent(target.path, content, { syntax: false })'))
 assert.ok(runtime.includes('async function validateManualEditWorkspaceFiles(workspace, modifiedPaths)'))
 assert.ok(apply.includes('await validateManualEditWorkspaceFiles(actualWorkspace, manual.modifiedPaths)'))
})

test('stale Files drafts remain writable and can be rebased onto the current release', async () => {
 const runtime=await read('../src/index.js')
 const bridge=await read('../control-centre/production-bridge.js')
 const backup=runtime.slice(runtime.indexOf('async function ensureManualEditBackup()'),runtime.indexOf('async function recoverStaleManualEditWorkspace()'))
 assert.ok(backup.includes('The older source draft is missing or cannot be safely opened.'))
 assert.ok(backup.includes('return existing'), 'A valid stale workspace must remain editable instead of blocking autosave and deletion.')
 const recovery=runtime.slice(runtime.indexOf('async function recoverStaleManualEditWorkspace()'),runtime.indexOf('async function recordManualEdits'))
 assert.ok(recovery.includes('await cp(currentRelease, newWorkspace'))
 assert.ok(recovery.includes('manual.modifiedPaths'), 'Recovery must carry forward the saved file operations.')
 assert.ok(recovery.includes('await writeJsonAtomic(MANUAL_EDIT_STATE_FILE, recovered)'))
 assert.ok(runtime.includes("app.post('/api/files/recover'"), 'The server must expose explicit stale-draft recovery.')
 assert.ok(runtime.includes("stale: manual?.status === 'pending' && manual.currentRelease !== await currentReleaseDirectory()"))
 assert.ok(bridge.includes('function staleDraftBannerP()'))
 assert.ok(bridge.includes('id="prod-recover-files"'), 'Recovery must be visible from nested folders and the editor.')
 assert.ok(bridge.includes("apiP('files/recover'"), 'The visible recovery control must call the recovery API.')
 assert.ok(bridge.includes('editorContent=editor?editor.value:null'), 'Recovery must preserve any text still open in the editor.')
})

test('autosave keeps independent per-file queues and a device-side draft through app suspension', async () => {
 const bridge=await read('../control-centre/production-bridge.js')
 assert.ok(bridge.includes('const fileAutosaveTimersP=new Map(),fileAutosaveBusyP=new Set(),fileAutosaveQueuedP=new Map()'))
 assert.ok(bridge.includes('const fileLocalDraftsP=new Map(),fileAutosaveConflictsP=new Set()'))
 assert.ok(bridge.includes("localStorage.setItem(FILE_LOCAL_DRAFTS_KEY,raw)"))
 assert.ok(bridge.includes("window.addEventListener('pagehide',()=>{void flushAllFileAutosavesP()})"))
 assert.ok(bridge.includes("document.addEventListener('visibilitychange'"))
 assert.ok(bridge.includes("window.addEventListener('online',()=>{void flushAllFileAutosavesP()})"))
 assert.ok(bridge.includes('fileAutosaveQueuedP.set(path,job)'), 'An edit in another file must not replace a queued save.')
 assert.ok(bridge.includes('size:new Blob([content]).size'), 'The live file size must be refreshed after a verified save.')
})

test('empty-file autosaves require explicit confirmation and failed responses are checked against server read-back', async () => {
 const bridge=await read('../control-centre/production-bridge.js')
 const start=bridge.indexOf('async function flushFileAutosavePathP')
 const end=bridge.indexOf('async function flushFileAutosaveP(path)',start)
 const save=bridge.slice(start,end)
 assert.ok(save.includes("job.content===''&&data.content!==''&&!job.allowEmpty"))
 assert.ok(save.includes('Autosaved to server (staged)'))
 assert.ok(save.includes("const observed=await apiP('files/preview?item='+encodeURIComponent(path))"))
 assert.ok(save.includes('fileAutosaveQueuedP.set(path,job)'), 'Failed edits must stay queued for retry.')
 assert.ok(bridge.includes("confirm('This will replace the existing file with an empty file. Continue?')"))
})

test('server file writes are version-checked, verified before replacement, and restore old bytes on failed read-back', async () => {
 const runtime=await read('../src/index.js')
 const start=runtime.indexOf("app.put('/api/files/content'")
 const end=runtime.indexOf("app.post('/api/files/rename'",start)
 const save=runtime.slice(start,end)
 assert.ok(save.includes("if (!/^[a-f0-9]{64}$/.test(expectedSha256))"))
 assert.ok(save.includes("const stagedContent = await readFile(temporary, 'utf8')"))
 assert.ok(save.includes('await rename(restore, target.full)'))
 assert.ok(save.includes('The previous content was restored.'))
})

test('all server file mutations are serialized and Apply locks writes before validation', async () => {
 const runtime=await read('../src/index.js')
 assert.ok(runtime.includes("app.use('/api/files', serializeSourceMutations)"))
 const start=runtime.indexOf("app.post('/api/files/apply'")
 const end=runtime.indexOf("app.post('/api/files/discard'",start)
 const apply=runtime.slice(start,end)
 assert.ok(apply.indexOf('updateInProgress = true')<apply.indexOf('await validateManualEditWorkspaceFiles'))
 assert.ok(apply.includes('updateInProgress = false'), 'Validation failures must release the deploy lock.')
})

test('bulk Delete and Move use server APIs instead of changing the preview-only file tree', async () => {
 const runtime=await read('../src/index.js')
 const bridge=await read('../control-centre/production-bridge.js')
 assert.ok(bridge.includes('bindSel=bindLiveSelectionP'))
 assert.ok(bridge.includes("apiP('files/delete'"))
 assert.ok(bridge.includes("apiP('files/move'"))
 assert.ok(runtime.includes("const rawPaths = Array.isArray(req.body?.paths) ? req.body.paths : [req.body?.path]"))
 assert.ok(runtime.includes("target.info.isDirectory() ? 'deleted-folder' : 'deleted-file'"))
 assert.ok(runtime.includes('const plans = []'))
})

test('stale-draft recovery treats folder moves as complete recursive operations', async () => {
 const runtime=await read('../src/index.js')
 const start=runtime.indexOf('async function recoverStaleManualEditWorkspace()')
 const end=runtime.indexOf('async function recordManualEdits',start)
 const recovery=runtime.slice(start,end)
 assert.ok(recovery.includes('const movePairs = []'))
 assert.ok(recovery.includes('const covers = path => path === source.path'))
 assert.ok(recovery.includes("['deleted-file', 'deleted-folder', 'renamed-from', 'moved-from']"))
 assert.ok(recovery.includes("pair.isDirectory ? 'folder' : 'file'"))
})

test('ZIP activation shares the source-mutation lock so it cannot race an editor save', async () => {
 const runtime=await read('../src/index.js')
 assert.ok(runtime.includes("app.use('/api/update/deploy', serializeSourceMutations)"))
 const middleware=runtime.slice(runtime.indexOf('function serializeSourceMutations'),runtime.indexOf("app.get('/api/files/export'"))
 assert.ok(middleware.includes('if (updateInProgress)'))
})

test('Files help explains autosave, Save now and separate staged activation', async () => {
 const app=await read('../control-centre/app.js')
 assert.ok(app.includes('Changes autosave to staging after you pause typing.'))
 assert.ok(app.includes('Use Save now for an immediate save'))
 assert.ok(app.includes('Apply staged changes validates and activates the edits.'))
})

test('local device drafts block bulk operations and are reconciled before Apply', async () => {
 const bridge=await read('../control-centre/production-bridge.js')
 const paths=bridge.slice(bridge.indexOf('async function flushFilePathsP'),bridge.indexOf('async function flushAllFileAutosavesP'))
 const all=bridge.slice(bridge.indexOf('async function flushAllFileAutosavesP'),bridge.indexOf('async function restoreDeviceDraftP'))
 assert.ok(paths.includes('fileLocalDraftsP.keys()'))
 assert.ok(paths.includes('queueDeviceDraftForSaveP(path)'))
 assert.ok(paths.includes('fileAutosaveConflictsP'))
 assert.ok(all.includes('fileLocalDraftsP.size===0&&fileAutosaveConflictsP.size===0'))
 assert.ok(bridge.includes('readonly aria-readonly="true"'), 'An unresolved conflict must lock the editor until an explicit choice is made.')
 assert.ok(bridge.includes('id="prod-restore-device-draft"'))
 assert.ok(bridge.includes('id="prod-keep-server-version"'))
})

test('keeping the server version cancels the failed autosave so it cannot overwrite the chosen copy later', async () => {
 const bridge=await read('../control-centre/production-bridge.js')
 const start=bridge.indexOf('function keepServerFileP()')
 const end=bridge.indexOf('async function saveLiveFileP()',start)
 const keep=bridge.slice(start,end)
 assert.ok(keep.includes('clearFileAutosaveTimerP(path)'))
 assert.ok(keep.includes('fileAutosaveQueuedP.delete(path)'))
 assert.ok(keep.includes('removeFileLocalDraftP(path)'))
})

test('keeping the server version redraws the editor from the verified server content', async () => {
 const bridge=await read('../control-centre/production-bridge.js')
 const start=bridge.indexOf('function keepServerFileP()')
 const end=bridge.indexOf('async function saveLiveFileP()',start)
 const keep=bridge.slice(start,end)
 assert.ok(keep.includes('const server=P.fileData.get(path)'))
 assert.ok(keep.includes('updateSourceMemoryP(path,server.content)'))
 assert.ok(keep.includes('fileAutosaveQueuedP.delete(path)'))
 assert.ok(keep.includes('removeFileLocalDraftP(path)'))
})


test('update monitoring tolerates restart-time API failures for up to twelve minutes', async () => {
 const bridge=await read('../control-centre/production-bridge.js')
 const start=bridge.indexOf('async function pollUpdateP()')
 const end=bridge.indexOf('async function deployPackageP',start)
 const poll=bridge.slice(start,end)
 assert.ok(poll.includes('i<360'))
 assert.ok(poll.includes('lastError=error'))
 assert.ok(poll.includes('error.status===401||error.status===403'))
 assert.ok(poll.includes('the deployment may still have completed'))
})


test('web Builder and Engine Library use native Home and Files entry points, not bottom tabs', async () => {
  const workspace = await read('../control-centre/web-workspace.js')
  const css = await read('../control-centre/styles.css')
  assert.ok(workspace.includes("Object.assign(T,{home:'Home',files:'Files',chats:'Chats',env:'ENV',more:'More'})"))
  assert.ok(workspace.includes('function injectHomeEntry()'))
  assert.ok(workspace.includes('function wrappedRender()'))
  assert.ok(workspace.includes('window.render=wrappedRender;'))
  assert.ok(workspace.includes('function injectEnginesFolder()'))
  assert.ok(workspace.includes("openWorkspace('web-builder','home')"))
  assert.ok(workspace.includes("openWorkspace('web-engines',W.returnTab)"))
  assert.ok(!/builder:'Builder'|library:'Engine Library'/.test(workspace))
  assert.ok(workspace.includes('data-wb-drag'))
  assert.ok(workspace.includes('data-wb-socket'))
  assert.ok(workspace.includes('data-wb-open-config'))
  assert.ok(workspace.includes('function configDialogMarkup()'))
  assert.ok(workspace.includes('data-wb-apply-config'))
  assert.ok(workspace.includes('data-engine-save'))
  assert.ok(css.includes('body.aharane-workspace-open .nav'))
  assert.ok(!/\\.app\\{max-width:1440px/.test(css))
})


test('Builder node configuration preserves typed values and command aliases', async () => {
  const workspace = await read('../control-centre/web-workspace.js')
  assert.ok(workspace.includes("aliases:[],chatScope:'direct',maxMessagesPerRun:10,requireQuoted:false,requireReply:false"))
  assert.ok(workspace.includes("type==='boolean'?target.checked:type==='number'?(target.value===''?'':Number(target.value)):target.value"))
  assert.ok(workspace.includes("config.aliases=(Array.isArray(config.aliases)?config.aliases:String(config.aliases||'').split("))
  assert.ok(workspace.includes(".map(value=>String(value).trim()).filter(Boolean)"))
  assert.ok(workspace.includes("config.maxMessagesPerRun=Number(config.maxMessagesPerRun==null?10:config.maxMessagesPerRun)"))
})


test('Builder node dragging keeps canvas coordinates aligned and the config backdrop closes the dialog', async () => {
  const workspace = await read('../control-centre/web-workspace.js')
  assert.ok(workspace.includes("card.style.left=node.x+'px';card.style.top=node.y+'px'"))
  assert.ok(workspace.includes("Math.max(0,minX*W.zoom-60)"))
  assert.ok(workspace.includes("Math.max(0,minY*W.zoom-50)"))
  assert.ok(workspace.includes('[data-wb-modal-close]'))
  assert.ok(workspace.includes('event.target===button'))
})


test('web workspace declares only one renderer and one Builder event handler', async () => {
  const workspace = await read('../control-centre/web-workspace.js')
  assert.equal((workspace.match(/function renderWorkspace\\(\\)\\{/g) || []).length, 1)
  assert.equal((workspace.match(/function bindBuilder\\(\\)\\{/g) || []).length, 1)
  assert.ok(workspace.includes('if(button.dataset.wbScope){W.configDraft.chatScope=button.dataset.wbScope;renderWorkspace();return}'))
})
