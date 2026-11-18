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

test('the offline service worker caches the bridge and invalidates the previous shell', async () => {
  const sw = await read('../control-centre/sw.js')
  assert.ok(sw.includes('aharane-local-studio-shell-v10'))
  assert.ok(sw.includes('/aharane/studio/production-bridge.js'))
  assert.ok(sw.includes("['/aharane/studio/production-bridge.js','production-bridge.js']"))
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
