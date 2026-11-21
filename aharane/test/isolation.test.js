import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('the runtime uses Aharane-owned paths and has no MSCC state path', async () => {
  const source = await read('../src/index.js')
  assert.match(source, /\/var\/lib\/aharane/)
  assert.doesNotMatch(source, /\/var\/lib\/mscc|\/opt\/mscc|\/etc\/mscc\.env/)
})

test('the installer creates only the independent Aharane service and paths', async () => {
  const source = await read('../install-azure.sh')
  for (const expected of ['/opt/aharane', '/var/lib/aharane', '/etc/aharane.env', 'aharane.service']) {
    assert.ok(source.includes(expected), `Missing ${expected}`)
  }
  for (const forbidden of ['/opt/mscc', '/var/lib/mscc', '/etc/mscc.env', 'mscc.service']) {
    assert.ok(!source.includes(forbidden), `Unexpected MSCC resource reference: ${forbidden}`)
  }
})

test('Aharane has its own start command, dependencies and private environment', async () => {
  const pkg = JSON.parse(await read('../package.json'))
  const env = await read('../.env.example')
  assert.equal(pkg.name, 'aharane-whatsapp-bot')
  assert.equal(pkg.scripts.start, 'node src/index.js')
  assert.equal(pkg.dependencies['@itsliaaa/baileys'], '0.5.6')
  assert.equal(pkg.dependencies['@whiskeysockets/baileys'], undefined)
  assert.match(env, /AHARANE_DATA_DIR=\/var\/lib\/aharane/)
  assert.doesNotMatch(env, /MSCC_|ACCOUNT_AUTH_ROOT/)
})


test('ZIP deployment stays within the Aharane release and data roots', async () => {
  const runtime = await read('../src/index.js')
  const updater = await read('../src/update-manager.js')
  const installer = await read('../install-azure.sh')
  assert.match(runtime, /\/opt\/aharane/)
  assert.match(runtime, /join\(DATA_DIR, 'updates'\)/)
  assert.match(installer, /ExecStartPost=.*verify-update\.mjs/)
  assert.match(installer, /ReadWritePaths=\/var\/lib\/aharane \/opt\/aharane/)
  for (const source of [runtime, updater, installer]) {
    for (const forbidden of ['/opt/mscc', '/var/lib/mscc', '/etc/mscc.env', 'mscc.service']) {
      assert.ok(!source.includes(forbidden), `Unexpected NIGHT/MSCC reference: ${forbidden}`)
    }
  }
})


test('manual source editor is separate, scoped and protected by backup/apply/rollback', async () => {
  const runtime = await read('../src/index.js')
  const proxy = await read('../control-centre/api/aharane/[...path].js')
  const installer = await read('../install-azure.sh')
  for (const route of [
    "app.get('/api/files/tree'",
    "app.get('/api/files/preview'",
    "app.get('/api/files/draft-status'",
    "app.post('/api/files'",
    "app.put('/api/files/content'",
    "app.post('/api/files/delete'",
    "app.post('/api/files/apply'",
    "app.post('/api/files/discard'",
  ]) assert.ok(runtime.includes(route), `Missing manual file route: ${route}`)
  assert.ok(runtime.includes('manual-edit-workspace-'), 'Manual edits must use a separate staged workspace')
  assert.ok(runtime.includes("execFileAsync('npm', ['run', 'check']"), 'Manual edits must pass the project checks before restart')
  assert.ok(runtime.includes('MANUAL_EDIT_STATE_FILE'), 'Manual edits must remain pending until applied or discarded')
  assert.ok(proxy.includes("['files/content', '/api/files/content']"), 'The Vercel proxy must whitelist manual source editing')
  assert.ok(proxy.includes("!['GET', 'POST', 'PUT'].includes(req.method)"), 'The Vercel proxy must permit same-origin PUT saves')
  assert.ok(installer.includes("state.source === 'manual-files'"), 'Startup verification must clear a successfully rolled-back manual draft')
  for (const forbidden of ['/opt/mscc', '/var/lib/mscc', '/etc/mscc.env', 'mscc.service']) {
    assert.ok(!runtime.includes(forbidden), `Unexpected NIGHT/MSCC reference: ${forbidden}`)
    assert.ok(!proxy.includes(forbidden), `Unexpected NIGHT/MSCC reference: ${forbidden}`)
  }
})


test('manual file changes are staged in a separate release until explicitly applied', async () => {
  const runtime = await read('../src/index.js')
  assert.match(runtime, /async function sourceWorkspaceDirectory\(\)/)
  assert.match(runtime, /workspaceRelease/)
  assert.match(runtime, /manual-edit-workspace-/)
  assert.match(runtime, /previousRelease: current/)
  assert.match(runtime, /candidateRelease: actualWorkspace/)
  assert.match(runtime, /await rename\(nextLink, CURRENT_RELEASE\)/)
  assert.match(runtime, /The running Aharane release was never changed/)
  assert.ok(!runtime.includes("source: 'manual-discard'"), 'Discarding a draft must not trigger a server restart')
})
