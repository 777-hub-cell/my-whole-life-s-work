/**
 * Custom Engine manifest contract. This module validates metadata only.
 * It deliberately does NOT evaluate user code: execution requires a separately
 * isolated, resource-limited worker and an explicit capability broker.
 */
const ID = /^[a-z][a-z0-9_-]{0,47}$/
const PORT = /^[a-z][a-zA-Z0-9_]{0,31}$/
const TYPES = new Set(['string', 'number', 'boolean', 'json', 'text', 'image', 'media', 'list'])
const PERMISSIONS = new Set(['network.fetch'])
const MAX_PORTS = 16
const MAX_MESSAGE_OUTPUT = 20
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key)

export function validateEngineManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Engine manifest must be an object.')
  const id = String(value.id ?? '')
  const name = String(value.name ?? '').trim()
  const version = Number(value.version)
  const entryPoint = String(value.entryPoint ?? '')
  if (!ID.test(id)) throw new Error('Invalid Engine ID.')
  if (!name || name.length > 80) throw new Error('Engine name must be 1–80 characters.')
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('Engine version must be a positive integer.')
  if (entryPoint !== 'run') throw new Error('Engine entry point must be run; arbitrary module paths are forbidden.')
  const parsePorts = (ports, direction) => {
    if (!Array.isArray(ports) || ports.length > MAX_PORTS) throw new Error('Invalid Engine ' + direction + ' ports.')
    const seen = new Set()
    return ports.map(port => {
      if (!port || typeof port !== 'object' || Array.isArray(port)) throw new Error('Invalid port.')
      const pid = String(port.id ?? '')
      const type = String(port.type ?? '')
      if (!PORT.test(pid) || seen.has(pid) || !TYPES.has(type)) throw new Error('Duplicate or invalid Engine port.')
      seen.add(pid)
      const required = direction === 'input' ? port.required !== false : true
      return { id: pid, type, required }
    })
  }
  const inputs = parsePorts(value.inputs, 'input')
  const outputs = parsePorts(value.outputs, 'output')
  if (!outputs.length) throw new Error('An Engine requires at least one output.')
  if (!Array.isArray(value.permissions)) throw new Error('Engine permissions must be an explicit list.')
  const permissions = [...new Set(value.permissions)]
  if (permissions.some(p => !PERMISSIONS.has(p))) throw new Error('Engine requested an unsupported permission.')
  const timeoutMs = value.timeoutMs ?? 10000
  const maxResults = value.maxResults ?? 10
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) throw new Error('Engine timeout must be 100–30000 ms.')
  if (!Number.isSafeInteger(maxResults) || maxResults < 1 || maxResults > MAX_MESSAGE_OUTPUT) throw new Error('Engine result limit must be 1–20.')
  return Object.freeze({ id, name, version, entryPoint, inputs, outputs, permissions, timeoutMs, maxResults })
}

export function validateEngineInputs(manifest, values) {
  const engine = validateEngineManifest(manifest)
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Engine inputs must be an object.')
  const allowed = new Set(engine.inputs.map(port => port.id))
  if (Object.keys(values).some(k => !allowed.has(k))) throw new Error('Unexpected Engine input.')
  for (const port of engine.inputs) {
    if (!own(values, port.id)) {
      if (port.required) throw new Error('Missing Engine input: ' + port.id)
      continue
    }
    if (!validValue(values[port.id], port.type)) throw new Error('Invalid Engine input: ' + port.id)
  }
  return structuredClone(values)
}

function validValue(value, type) {
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'list') return Array.isArray(value) && value.length <= 100
  if (type === 'json') {
    if (value === undefined) return false
    try { return JSON.stringify(value).length <= 65536 } catch { return false }
  }
  if (type === 'image' || type === 'media') {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
      typeof value.mimeType === 'string' && value.mimeType.length <= 100 &&
      typeof value.uri === 'string' && value.uri.length <= 2048
  }
  return typeof value === 'string' && value.length <= 8192
}

export function validateEngineOutputs(manifest, result) {
  const engine = validateEngineManifest(manifest)
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Engine outputs must be an object.')
  const allowed = new Set(engine.outputs.map(port => port.id))
  if (Object.keys(result).some(k => !allowed.has(k))) throw new Error('Unexpected Engine output.')
  for (const port of engine.outputs) {
    if (!own(result, port.id) || !validValue(result[port.id], port.type)) throw new Error('Invalid Engine output: ' + port.id)
    if (Array.isArray(result[port.id]) && result[port.id].length > engine.maxResults) throw new Error('Engine exceeded its result limit.')
  }
  return structuredClone(result)
}

/** Keep pinned command graphs safe when an Engine's interface evolves. */
export function compareEngineInterfaces(previous, next) {
  const before = validateEngineManifest(previous)
  const after = validateEngineManifest(next)
  if (before.id !== after.id) throw new Error('Cannot compare different Engines.')
  const breaking = []
  for (const old of before.inputs) {
    const replacement = after.inputs.find(port => port.id === old.id)
    if (!replacement || replacement.type !== old.type) breaking.push('Input removed or retyped: ' + old.id)
  }
  for (const newInput of after.inputs) {
    if (newInput.required && !before.inputs.some(port => port.id === newInput.id && port.required)) {
      breaking.push('New required input: ' + newInput.id)
    }
  }
  for (const old of before.outputs) {
    const replacement = after.outputs.find(port => port.id === old.id)
    if (!replacement || replacement.type !== old.type) breaking.push('Output removed or retyped: ' + old.id)
  }
  if (after.version < before.version) breaking.push('Engine version decreased.')
  if (breaking.length && after.version <= before.version) breaking.push('Breaking changes require a new version.')
  return { compatible: breaking.length === 0, breaking }
}
