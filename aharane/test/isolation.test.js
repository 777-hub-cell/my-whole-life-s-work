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
  assert.equal(pkg.dependencies['@whiskeysockets/baileys'], '7.0.0-rc14')
  assert.equal(pkg.dependencies['@itsliaaa/baileys'], undefined)
  assert.match(env, /AHARANE_DATA_DIR=\/var\/lib\/aharane/)
  assert.doesNotMatch(env, /MSCC_|ACCOUNT_AUTH_ROOT/)
})


test('ZIP deployment stays within the Aharane release and data roots', async () => {
  const runtime = await read('../src/index.js')
  const updater = await read('../src/update-manager.js')
  const installer = await read('../install-azure.sh')
  assert.match(runtime, /\/opt\/aharane/)
  assert.match(runtime, /\/var\/lib\/aharane\/updates/)
  assert.match(installer, /ExecStartPost=.*verify-update\.mjs/)
  assert.match(installer, /ReadWritePaths=\/var\/lib\/aharane \/opt\/aharane/)
  for (const source of [runtime, updater, installer]) {
    for (const forbidden of ['/opt/mscc', '/var/lib/mscc', '/etc/mscc.env', 'mscc.service']) {
      assert.ok(!source.includes(forbidden), `Unexpected NIGHT/MSCC reference: ${forbidden}`)
    }
  }
})
