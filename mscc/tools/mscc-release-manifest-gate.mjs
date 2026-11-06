import { appendFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const COMMIT_SHA = /^[0-9a-f]{40}$/

export function evaluateReleaseGate({ eventName, manifestChanged, manifest, parentSha }) {
  if (eventName !== 'push' && eventName !== 'workflow_dispatch') {
    return { ready: false, reason: 'event is not authorized to prepare production release' }
  }
  if (manifestChanged !== true) {
    return { ready: false, reason: 'release manifest must change in the validated commit' }
  }
  if (!manifest || manifest.baseBranch !== 'mscc-azure') {
    return { ready: false, reason: 'release manifest baseBranch must be mscc-azure' }
  }
  if (!COMMIT_SHA.test(parentSha || '') || manifest.baseCommit !== parentSha) {
    return { ready: false, reason: 'release manifest baseCommit does not match the current production branch parent' }
  }
  if (typeof manifest.releaseId !== 'string' || !manifest.releaseId.trim()) {
    return { ready: false, reason: 'release manifest is missing releaseId' }
  }
  if (!Array.isArray(manifest.pullRequests) || manifest.pullRequests.length === 0 ||
      manifest.pullRequests.some(number => !Number.isSafeInteger(number) || number <= 0)) {
    return { ready: false, reason: 'release manifest must contain one or more valid pull request numbers' }
  }
  if (typeof manifest.preparedAt !== 'string' || Number.isNaN(Date.parse(manifest.preparedAt))) {
    return { ready: false, reason: 'release manifest preparedAt timestamp is invalid' }
  }
  return { ready: true, reason: 'release manifest matches the current production base' }
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url))
  const manifestPath = resolve(here, '../release-batch.json')
  const eventName = process.env.GITHUB_EVENT_NAME || ''
  const manifestChanged = process.env.MSCC_RELEASE_MANIFEST_CHANGED === 'true'
  let manifest = null
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) } catch {}
  let parentSha = ''
  if ((eventName === 'push' || eventName === 'workflow_dispatch') && manifestChanged) {
    try { parentSha = execFileSync('git', ['rev-parse', 'HEAD^'], { encoding: 'utf8' }).trim() } catch {}
  }
  const result = evaluateReleaseGate({ eventName, manifestChanged, manifest, parentSha })
  const output = `release_ready=${result.ready}\n`
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output)
  console.log(`${output.trim()} (${result.reason})`)
  if (!result.ready && process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `### Production release gate\n\nAzure deployment was not queued: ${result.reason}.\n`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
