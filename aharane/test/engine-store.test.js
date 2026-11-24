import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEngineStore } from '../src/engine-store.js'

const base = {
  id: 'pinterest', name: 'Pinterest lookup', version: 1,
  entryPoint: 'run', inputs: [{ id: 'query', type: 'string' }],
  outputs: [{ id: 'results', type: 'list' }],
  permissions: ['network.fetch'], timeoutMs: 5000, maxResults: 10,
}
const code = 'export async function run(inputs) { return { results: [inputs.query] } }'

test('Engine code persists separately and is never executed by the store', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-engine-'))
  try {
    const library = createEngineStore({ dataDir: dir })
    await library.save(base, code)
    const reopened = createEngineStore({ dataDir: dir })
    const actual = await reopened.get('pinterest')
    assert.equal(actual.code, code)
    assert.equal(actual.manifest.version, 1)
    assert.equal((await reopened.list())[0].name, 'Pinterest lookup')
    assert.deepEqual(Object.keys(actual).sort(), ['code', 'createdAt', 'manifest', 'updatedAt'])
    assert.equal(await reopened.remove('pinterest', { confirm: true }), true)
    assert.equal(await reopened.get('pinterest'), null)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('Engine edits require optimistic version and breaking changes require increment', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-engine-edit-'))
  try {
    const library = createEngineStore({ dataDir: dir })
    await library.save(base, code)
    await assert.rejects(library.save(base, code), /changed since/)
    await assert.rejects(
      library.save({ ...base, outputs: [{ id: 'photos', type: 'list' }] }, code, 1),
      /newer version/
    )
    const next = { ...base, version: 2, outputs: [{ id: 'photos', type: 'list' }] }
    assert.equal((await library.save(next, code, 1)).manifest.version, 2)
    await assert.rejects(library.remove('pinterest', { confirm: true, usedBy: ['a-workflow'] }), /referenced/)
    assert.equal((await library.get('pinterest')).manifest.version, 2)
    await assert.rejects(library.save({ ...next, id: '../whatsapp-auth' }, code), /Invalid Engine ID/)
    await assert.rejects(library.save({ ...next, id: 'another' }, 'require("fs")'), /declare export/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
