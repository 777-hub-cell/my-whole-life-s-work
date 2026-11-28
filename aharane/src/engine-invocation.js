import { randomUUID } from 'node:crypto'
import { EngineExecutionError, ENGINE_LIMITS, assertEngineSource, executeCustomEngine } from './engine-runtime.js'
import { validateEngineManifest } from './engine-contract.js'

/**
 * The single Engine invocation entry point. Workflows, the Scheduler and the Engine Library
 * test action all call this; none of them touch the sandbox or the store directly.
 *
 * Contract version 1.
 * Request:  { engineId, revision?, inputs, source, account?, correlationId? }
 *   - source is one of INVOCATION_SOURCES and is set by trusted server code only, never by a client body.
 *   - revision pins an exact saved snapshot; without it the latest saved revision runs and the
 *     envelope reports which revision that was (`engine.pinned: false`).
 * Envelope: { ok, outcome, contractVersion, correlationId, source, account, engine, ... }
 *   success  -> outputs, durationMs, networkCalls, denials
 *   failure  -> message, denials (message never contains host paths or stack traces)
 * Authorization (Agent 04) is decided by the caller that builds the request; the sandbox then still
 * enforces its own per-call capability checks. Both must pass.
 */
export const INVOCATION_CONTRACT_VERSION = 1
export const INVOCATION_SOURCES = Object.freeze(['workflow', 'scheduler', 'library-test'])
export const OUTCOMES = Object.freeze([
  'success', 'invalid_request', 'not_found', 'revision_unavailable', 'input_invalid', 'invalid_source',
  'policy_denied', 'timeout', 'cancelled', 'resource_exhausted', 'runtime_error', 'infrastructure',
])

const ENGINE_ID = /^[a-z][a-z0-9_-]{0,47}$/
const CORRELATION_ID = /^[A-Za-z0-9._:-]{1,120}$/
const ACCOUNTS = new Set(['private', 'public'])

class InvalidRequest extends Error {}

export function normalizeInvocationRequest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new InvalidRequest('Invocation request must be an object.')
  const engineId = String(raw.engineId ?? '')
  if (!ENGINE_ID.test(engineId)) throw new InvalidRequest('Invalid Engine ID.')
  if (!INVOCATION_SOURCES.includes(raw.source)) throw new InvalidRequest('Unsupported invocation source.')
  let account = null
  if (raw.account != null) {
    if (!ACCOUNTS.has(raw.account)) throw new InvalidRequest('Invalid account.')
    account = raw.account
  }
  let revision = null
  if (raw.revision != null) {
    const wanted = Number(raw.revision)
    if (!Number.isSafeInteger(wanted) || wanted < 1) throw new InvalidRequest('Engine revision must be a positive integer.')
    revision = wanted
  }
  const inputs = raw.inputs === undefined ? {} : raw.inputs
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) throw new InvalidRequest('Engine inputs must be an object.')
  let correlationId
  if (raw.correlationId == null || raw.correlationId === '') correlationId = randomUUID()
  else if (CORRELATION_ID.test(String(raw.correlationId))) correlationId = String(raw.correlationId)
  else throw new InvalidRequest('Invalid correlation ID.')
  return { engineId, revision, inputs, source: raw.source, account, correlationId }
}

function failure(outcome, message, base, extra = {}) {
  return { ok: false, outcome, contractVersion: INVOCATION_CONTRACT_VERSION, ...base, message: String(message).slice(0, 300), denials: [], ...extra }
}

export async function invokeEngine({ store, execute = executeCustomEngine, request, signal, executeOptions = {}, logger } = {}) {
  let req
  try {
    req = normalizeInvocationRequest(request)
  } catch (error) {
    if (!(error instanceof InvalidRequest)) throw error
    return failure('invalid_request', error.message, { correlationId: randomUUID(), source: null, account: null, engine: null })
  }
  const base = { correlationId: req.correlationId, source: req.source, account: req.account }
  const pinned = req.revision != null

  let engine
  try {
    engine = pinned ? await store.getRevision(req.engineId, req.revision) : await store.get(req.engineId)
    if (!engine) {
      const exists = pinned ? await store.get(req.engineId) : null
      return exists
        ? failure('revision_unavailable', 'The referenced Engine revision is not available.', { ...base, engine: { id: req.engineId, revision: req.revision, pinned } })
        : failure('not_found', 'The referenced Engine no longer exists.', { ...base, engine: { id: req.engineId, revision: req.revision, pinned } })
    }
  } catch (error) {
    logger?.warn?.({ event: 'engine.load-failed', engineId: req.engineId, correlationId: req.correlationId })
    return failure('infrastructure', 'The Engine could not be loaded.', { ...base, engine: { id: req.engineId, revision: req.revision, pinned } })
  }
  const ref = { id: engine.manifest.id, version: engine.manifest.version, revision: engine.revision, sourceSha256: engine.sha256, pinned }

  try {
    const result = await execute(engine, req.inputs, { signal, ...executeOptions })
    return {
      ok: true, outcome: 'success', contractVersion: INVOCATION_CONTRACT_VERSION, ...base, engine: ref,
      outputs: result.outputs, durationMs: Number(result.durationMs) || 0,
      networkCalls: Number(result.networkCalls) || 0, denials: result.denials || [],
    }
  } catch (error) {
    if (error instanceof EngineExecutionError) {
      return failure(OUTCOMES.includes(error.outcome) ? error.outcome : 'infrastructure', error.message, { ...base, engine: ref }, { denials: error.denials || [] })
    }
    // Unknown failures are logged by code only; the message may carry host details and is never returned.
    logger?.error?.({ event: 'engine.unexpected-failure', engineId: ref.id, correlationId: req.correlationId })
    return failure('infrastructure', 'The Engine runtime failed unexpectedly.', { ...base, engine: ref })
  }
}

/** Legacy result shape used by the workflow executor and its traces. */
export function envelopeToResult(envelope) {
  return {
    outputs: envelope.outputs, durationMs: envelope.durationMs, engineId: envelope.engine.id,
    engineVersion: envelope.engine.version, engineRevision: envelope.engine.revision, pinned: envelope.engine.pinned,
    sourceSha256: envelope.engine.sourceSha256, outcome: 'success', networkCalls: envelope.networkCalls,
    denials: envelope.denials, correlationId: envelope.correlationId, source: envelope.source,
  }
}

/** Failure envelope as a thrown error, preserving the messages existing workflow traces already show. */
export function envelopeToError(envelope) {
  if (['invalid_request', 'not_found', 'revision_unavailable'].includes(envelope.outcome)) return new Error(envelope.message)
  return new EngineExecutionError(envelope.outcome, envelope.message, { denials: envelope.denials })
}

/** HTTP status for the Engine Library test action. Engine-level failures are 200 with ok:false. */
export function httpStatusForEnvelope(envelope) {
  if (envelope.ok) return 200
  if (envelope.outcome === 'invalid_request') return 400
  if (envelope.outcome === 'not_found' || envelope.outcome === 'revision_unavailable') return 404
  if (envelope.outcome === 'infrastructure') return 503
  return 200
}

/** HTTP status and body for the Library test action; non-200 bodies also carry `error`, which clients read. */
export function httpResponseForEnvelope(envelope) {
  const status = httpStatusForEnvelope(envelope)
  return { status, body: status === 200 ? envelope : { ...envelope, error: envelope.message } }
}

/** Effective grants for one Engine manifest, derived from the same manifest the sandbox enforces. */
export function describeEngineCapabilities(manifestInput) {
  const manifest = validateEngineManifest(manifestInput)
  const hasFetch = manifest.permissions.includes('network.fetch')
  return {
    contractVersion: INVOCATION_CONTRACT_VERSION,
    permissions: [{
      id: 'network.fetch',
      granted: hasFetch && manifest.allowedHosts.length > 0,
      requested: hasFetch,
      hosts: hasFetch ? [...manifest.allowedHosts] : [],
      scheme: 'https', methods: ['GET', 'POST'],
      limits: {
        requestBytes: ENGINE_LIMITS.requestBytes, responseBytes: ENGINE_LIMITS.responseBytes,
        totalResponseBytes: ENGINE_LIMITS.totalResponseBytes, fetchesPerRun: ENGINE_LIMITS.fetchesPerRun,
      },
    }],
    neverGranted: ['filesystem', 'process', 'environment', 'shell', 'module-loader', 'timers', 'whatsapp', 'credentials', 'internal-objects'],
    limits: {
      timeoutMs: manifest.timeoutMs, maxResults: manifest.maxResults, memoryBytes: ENGINE_LIMITS.memoryBytes,
      stackBytes: ENGINE_LIMITS.stackBytes, outputBytes: ENGINE_LIMITS.outputBytes,
      concurrentRuns: ENGINE_LIMITS.concurrentRuns, queuedRuns: ENGINE_LIMITS.queuedRuns,
    },
    outcomes: [...OUTCOMES],
  }
}

const AMBIENT = [
  [/\bprocess\s*\./, 'process'], [/\brequire\s*\(/, 'require'], [/\bimport\s*\(/, 'dynamic import'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'], [/\b(?:setTimeout|setInterval|setImmediate)\s*\(/, 'timers'],
  [/\b(?:localStorage|sessionStorage|indexedDB)\b/, 'browser storage'], [/\bFunction\s*\(|\beval\s*\(/, 'eval/Function'],
]

/**
 * Advisory static diagnostics for the Engine Library. Heuristic by design: the sandbox enforces every
 * rule at run time regardless of what this reports, so a clean result is never a security claim.
 */
export function diagnoseEngine(engine) {
  const findings = []
  const add = (severity, code, message) => findings.push({ severity, code, message })
  let manifest
  try {
    manifest = validateEngineManifest(engine?.manifest)
  } catch (error) {
    add('error', 'manifest_invalid', String(error?.message || error).slice(0, 200))
  }
  const code = String(engine?.code || '')
  try {
    assertEngineSource(code)
  } catch (error) {
    add('error', 'source_invalid', String(error?.message || error).slice(0, 200))
  }
  if (manifest) {
    const hasFetch = manifest.permissions.includes('network.fetch')
    const usesFetch = /\bnetwork\s*\.\s*fetch\b/.test(code)
    if (usesFetch && !hasFetch) add('warning', 'network_not_granted', 'The code calls network.fetch but the manifest does not grant network.fetch; every call will be denied.')
    if (hasFetch && !manifest.allowedHosts.length) add('warning', 'no_hosts', 'network.fetch is granted but no HTTPS host is approved; every call will be denied.')
    if (hasFetch && !usesFetch) add('info', 'permission_unused', 'network.fetch is granted but the code never uses it; remove it to keep the grant minimal.')
    const literalHosts = new Set()
    for (const match of code.matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)) literalHosts.add(match[1].toLowerCase())
    const unapproved = [...literalHosts].filter(host => !manifest.allowedHosts.includes(host)).slice(0, 5)
    if (unapproved.length) add('warning', 'host_not_approved', 'URLs in the code point at hosts that are not approved: ' + unapproved.join(', ') + '.')
    if (/http:\/\//i.test(code)) add('warning', 'non_https', 'Plain http:// URLs are always denied; use https://.')
  }
  for (const [pattern, name] of AMBIENT) {
    if (pattern.test(code)) add('warning', 'ambient_api', 'The code uses ' + name + ', which is not available inside the sandbox.')
  }
  return { ok: !findings.some(item => item.severity === 'error'), findings, advisory: true }
}

/**
 * The function workflows and the Scheduler receive as `runEngine`. Production wires exactly this;
 * tests may inject `execute`/`executeOptions` (for example a fake guest) but never bypass invokeEngine.
 */
export function createEngineRunner({ store, logger, execute, executeOptions } = {}) {
  return async function runStoredEngine(engineId, inputs, runOptions = {}) {
    const envelope = await invokeEngine({
      store, logger, execute, executeOptions,
      signal: runOptions.signal,
      request: {
        engineId, inputs,
        revision: runOptions.revision,
        source: runOptions.source || 'workflow',
        account: runOptions.account,
        correlationId: runOptions.correlationId,
      },
    })
    if (!envelope.ok) throw envelopeToError(envelope)
    return envelopeToResult(envelope)
  }
}
