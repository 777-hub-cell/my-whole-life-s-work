import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverEnvironmentRows } from '../src/environment-discovery.js'

test('environment keys are discovered from current executable source and sorted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aharane-env-discovery-'))
  try {
    await mkdir(join(root, 'src'), { recursive: true })
    await mkdir(join(root, 'commands'), { recursive: true })
    await mkdir(join(root, 'test'), { recursive: true })
    await mkdir(join(root, 'node_modules', 'example'), { recursive: true })
    await writeFile(join(root, 'src', 'index.js'), [
      "const port = process.env.AHARANE_PORT",
      "const token = process.env['AHARANE_ADMIN_TOKEN']",
      "const aiKey = env.GROQ_API_KEY",
    ].join('\n'))
    await writeFile(join(root, 'commands', 'ping.js'), "const mode = process.env.AHARANE_RUNTIME_MODE")
    await writeFile(join(root, 'test', 'ignored.test.js'), "const bad = process.env.TEST_ONLY_SECRET")
    await writeFile(join(root, 'node_modules', 'example', 'index.js'), "const bad = process.env.DEPENDENCY_ONLY")
    
    const rows = await discoverEnvironmentRows(root, {
      AHARANE_PORT: '8790',
      AHARANE_ADMIN_TOKEN: 'never-return-this',
      GROQ_API_KEY: 'never-return-this-either',
      AHARANE_RUNTIME_MODE: 'production',
    })
    assert.deepEqual(rows.map(row => row.key), [
      'AHARANE_ADMIN_TOKEN',
      'AHARANE_PORT',
      'AHARANE_RUNTIME_MODE',
      'GROQ_API_KEY',
    ])
    const adminToken = rows.find(row => row.key === 'AHARANE_ADMIN_TOKEN')
    assert.equal(adminToken.value, 'Configured')
    assert.equal(adminToken.secret, true)
    assert.equal(adminToken.readOnly, true)
    assert.equal(rows.find(row => row.key === 'GROQ_API_KEY').value, 'Configured')
    assert.equal(rows.find(row => row.key === 'AHARANE_PORT').value, '8790')
    assert.equal(JSON.stringify(rows).includes('never-return-this'), false)
    assert.equal(rows.some(row => row.key.includes('TEST_ONLY') || row.key.includes('DEPENDENCY_ONLY')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
