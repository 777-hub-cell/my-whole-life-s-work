import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('the uploaded Local Studio preview is the served production UI', async () => {
  const html = await read('../control-centre/index.html')
  const bridge = await read('../control-centre/production-bridge.js')
  assert.ok(html.includes('<title>Aharane Local Studio</title>'))
  assert.ok(html.includes('/aharane/studio/production-bridge.js'))
  assert.ok(bridge.includes('let filesBase, openFileBase, actBase, moreBase, homeBase, bubBase, openChatBase, bindBase;'), 'The strict-mode bridge must declare its shared preview callbacks before installBridgeP runs.')
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
  assert.ok(sw.includes('aharane-local-studio-shell-v10'))
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
  assert.ok(bridge.includes("!/ ^" + slash + "d{7,15}$/.test(ownerValue)") === false)
  assert.ok(bridge.includes("!/" + slash + "d{7,15}$/.test(ownerValue)"))
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
