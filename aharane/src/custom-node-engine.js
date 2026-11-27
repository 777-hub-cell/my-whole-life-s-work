/**
 * Bounded, declarative user-defined workflow nodes.
 * No eval, shell, network or filesystem access is exposed to node authors.
 * Definitions are scoped to the locally authenticated Aharane administrator.
 */
const NODE_ID = /^[a-z][a-z0-9_-]{0,47}$/
const PORT_ID = /^[a-z][a-zA-Z0-9_]{0,31}$/
const TYPES = new Set(['string', 'number', 'boolean', 'list'])
const OPERATORS = new Set([
  'concat', 'uppercase', 'lowercase', 'trim', 'equals', 'contains',
  'add', 'subtract', 'multiply', 'divide', 'and', 'or', 'not',
  'length', 'split', 'join', 'choose',
])
const operators = {
  concat: (a, b) => String(a) + String(b),
  uppercase: a => String(a).toUpperCase(),
  lowercase: a => String(a).toLowerCase(),
  trim: a => String(a).trim(),
  equals: (a, b) => a === b,
  contains: (a, b) => String(a).includes(String(b)),
  add: (a, b) => Number(a) + Number(b),
  subtract: (a, b) => Number(a) - Number(b),
  multiply: (a, b) => Number(a) * Number(b),
  divide: (a, b) => { if (Number(b) === 0) throw new Error('Division by zero.'); return Number(a) / Number(b) },
  and: (a, b) => Boolean(a) && Boolean(b),
  or: (a, b) => Boolean(a) || Boolean(b),
  not: a => !Boolean(a),
  length: a => Array.isArray(a) ? a.length : String(a).length,
  split: (a, b) => String(a).split(String(b)).slice(0, 100),
  join: (a, b) => { if (!Array.isArray(a)) throw new Error('Join requires a list.'); return a.slice(0, 100).join(String(b)) },
  // The third input is the false branch. Keep params.other as a compatibility
  // fallback for older custom nodes created before the third typed port existed.
  choose: (condition, whenTrue, whenFalse, params) =>
    Boolean(condition) ? whenTrue : (whenFalse === undefined ? params?.other : whenFalse),
}
const clone = input => structuredClone(input)

export function validateCustomNodeDefinition(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('A custom node definition is required.')
  const id = String(input.id || '').trim()
  const name = String(input.name || '').trim()
  const version = Number(input.version ?? 1)
  const operator = String(input.operator || '')
  if (!NODE_ID.test(id)) throw new Error('Custom node ID must start with a letter and use only lowercase letters, numbers, - or _.')
  if (!name || name.length > 80) throw new Error('Custom node name must contain 1 to 80 characters.')
  if (!Number.isInteger(version) || version < 1 || version > 1000) throw new Error('Custom node version must be a positive integer up to 1000.')
  if (!OPERATORS.has(operator)) throw new Error('Unsupported custom-node operator. Executable nodes must use a safe registered operator.')
  const ports = Array.isArray(input.inputs) ? input.inputs : []
  if (ports.length > 8) throw new Error('Custom nodes can have at most eight input ports.')
  const seen = new Set()
  const inputs = ports.map(p => {
    const port = { id: String(p?.id || ''), label: String(p?.label || p?.id || '').slice(0, 60), type: String(p?.type || '') }
    if (!PORT_ID.test(port.id) || seen.has(port.id) || !TYPES.has(port.type)) throw new Error('Duplicate or invalid typed custom-node input port.')
    seen.add(port.id)
    return port
  })
  const outputType = String(input.outputType || '')
  if (!TYPES.has(outputType)) throw new Error('Custom nodes need a typed result output.')
  const params = input.parameters && typeof input.parameters === 'object' && !Array.isArray(input.parameters) ? input.parameters : {}
  if (Object.keys(params).length > 12) throw new Error('Too many custom-node parameters.')
  for (const value of Object.values(params)) {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') throw new Error('Custom parameters must be scalar.')
    if (typeof value === 'string' && value.length > 500) throw new Error('Custom parameter is too long.')
  }
  return {
    id, type: 'custom.' + id, name,
    description: String(input.description || '').slice(0, 220),
    category: String(input.category || 'Custom').slice(0, 50),
    version, operator, inputs, outputType,
    parameters: clone(params),
  }
}

function checkType(value, type) {
  if (type === 'list') return Array.isArray(value) && value.length <= 100
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'boolean') return typeof value === 'boolean'
  return typeof value === 'string' && value.length <= 4000
}

export function runCustomNode(definition, inputs = {}, settings = {}) {
  const node = validateCustomNodeDefinition(definition)
  for (const port of node.inputs) {
    if (!checkType(inputs[port.id], port.type)) throw new Error('Input "' + port.id + '" must be a ' + port.type + '.')
  }
  const values = node.inputs.map(port => inputs[port.id])
  const parameters = { ...node.parameters, ...settings }
  const result = node.operator === 'choose'
    ? operators.choose(values[0], values[1], values[2], parameters)
    : operators[node.operator](values[0], values[1], parameters)
  if (!checkType(result, node.outputType)) throw new Error('Custom node result does not match declared type ' + node.outputType + '.')
  return { result }
}
