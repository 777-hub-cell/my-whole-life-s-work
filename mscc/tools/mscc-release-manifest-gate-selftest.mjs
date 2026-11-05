import assert from 'node:assert/strict'
import { evaluateReleaseGate } from './mscc-release-manifest-gate.mjs'

const parentSha = 'a'.repeat(40)
const manifest = {
  releaseId: 'night-batch-test',
  baseBranch: 'mscc-azure',
  baseCommit: parentSha,
  pullRequests: [241, 242],
  preparedAt: '2026-11-05T05:00:00.000Z',
}

assert.deepEqual(
  evaluateReleaseGate({ eventName: 'push', manifestChanged: true, manifest, parentSha }),
  { ready: true, reason: 'release manifest matches the current production base' },
)
assert.equal(evaluateReleaseGate({ eventName: 'pull_request', manifestChanged: true, manifest, parentSha }).ready, false)
assert.equal(evaluateReleaseGate({ eventName: 'push', manifestChanged: false, manifest, parentSha }).ready, false)
assert.equal(evaluateReleaseGate({ eventName: 'push', manifestChanged: true, manifest: { ...manifest, baseCommit: 'b'.repeat(40) }, parentSha }).ready, false)
assert.equal(evaluateReleaseGate({ eventName: 'push', manifestChanged: true, manifest: { ...manifest, baseBranch: 'main' }, parentSha }).ready, false)
assert.equal(evaluateReleaseGate({ eventName: 'push', manifestChanged: true, manifest: { ...manifest, pullRequests: [] }, parentSha }).ready, false)
assert.equal(evaluateReleaseGate({ eventName: 'push', manifestChanged: true, manifest: { ...manifest, preparedAt: 'not-a-date' }, parentSha }).ready, false)
assert.equal(evaluateReleaseGate({ eventName: 'workflow_dispatch', manifestChanged: false, manifest: null, parentSha: '' }).ready, true)

const migratedSnapshotManifest = {
  releaseId: 'night-mscc-youtube-provider-diagnostics-20261104',
  baseBranch: 'mscc-azure',
  baseCommit: '444bf2cbf865d491375cb9a786b23f0689bdd030',
  pullRequests: [633],
  preparedAt: '2026-11-04T21:59:46.797Z',
}
const currentMigrationTarget = '3968a622fad52f4458b9d9e2d36ed6cc4b2111ca'
assert.equal(evaluateReleaseGate({ eventName: 'push', manifestChanged: true, manifest: migratedSnapshotManifest, parentSha: currentMigrationTarget }).ready, false)

console.log('PASS release manifest gate rejects stale-base automatic deploys and retains explicit manual dispatch')
