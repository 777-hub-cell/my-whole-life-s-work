import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateEngineManifest, validateEngineInputs, validateEngineOutputs, compareEngineInterfaces,
} from '../src/engine-contract.js'

const manifest = {
  id: 'pinterest', name: 'Pinterest image search', version: 1,
  entryPoint: 'run', permissions: ['network.fetch'], allowedHosts: ['images.example.com'], timeoutMs: 5000, maxResults: 10,
  inputs: [{ id: 'query', type: 'string' }],
  outputs: [{ id: 'images', type: 'list' }],
}
test('accepts valid versioned Engine contracts without executing code', () => {
  assert.equal(validateEngineManifest(manifest).id, 'pinterest')
  assert.deepEqual(validateEngineInputs(manifest, { query: 'street photography' }), { query: 'street photography' })
  assert.deepEqual(validateEngineOutputs(manifest, { images: ['https://example.test/a.jpg'] }), { images: ['https://example.test/a.jpg'] })
})
test('rejects arbitrary entry points, unknown capabilities and invalid ports', () => {
  assert.throws(() => validateEngineManifest({ ...manifest, entryPoint: '../auth/creds.json' }), /entry point/)
  assert.throws(() => validateEngineManifest({ ...manifest, permissions: ['filesystem.read'] }), /unsupported permission/)
  assert.throws(() => validateEngineManifest({ ...manifest, allowedHosts: ['127.0.0.1'] }), /public DNS hostnames/)
  assert.throws(() => validateEngineManifest({ ...manifest, allowedHosts: ['*.example.com'] }), /public DNS hostnames/)
  assert.throws(() => validateEngineManifest({ ...manifest, outputs: [{ id: 'bad space', type: 'text' }] }), /port/)
})
test('enforces outputs, results and input limits', () => {
  assert.throws(() => validateEngineInputs(manifest, {}), /Missing/)
  assert.throws(() => validateEngineInputs(manifest, { query: 'a', extra: 'secret' }), /Unexpected/)
  assert.throws(() => validateEngineOutputs(manifest, { images: Array(11).fill('x') }), /result limit/)
  assert.throws(() => validateEngineOutputs(manifest, { images: [], token: 'secret' }), /Unexpected/)
  assert.throws(() => validateEngineManifest({ ...manifest, maxResults: 100000 }), /result limit/)
})
test('detects breaking Engine changes before graph activation', () => {
  const changed = { ...manifest, version: 2, outputs: [{ id: 'photos', type: 'list' }] }
  assert.equal(compareEngineInterfaces(manifest, changed).compatible, false)
  assert.match(compareEngineInterfaces(manifest, changed).breaking.join(' '), /images/)
  assert.equal(compareEngineInterfaces(manifest, { ...manifest, version: 2 }).compatible, true)
  assert.match(compareEngineInterfaces(manifest, { ...changed, version: 1 }).breaking.join(' '), /new version/)
})
