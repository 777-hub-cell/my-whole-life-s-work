import { readdir, readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

const SOURCE_DIRECTORIES = Object.freeze([
  'src',
  'commands',
  'private-commands',
  'public',
  'plugins',
  'scripts',
  'control-centre',
])
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'])
const IGNORED_DIRECTORIES = new Set([
  '.git', 'node_modules', 'test', 'tests', '__tests__', 'fixtures',
  'dist', 'build', 'coverage', '.next', '.cache', 'vendor',
])
const PROCESS_ENV = /\\bprocess\\s*\\.\\s*env\\s*(?:\\.\\s*([A-Z_][A-Z0-9_]*)|\\[\\s*['"]([A-Z_][A-Z0-9_]*)['"]\\s*\\])/g
const PASSED_ENV = /\\benv\\s*\\.\\s*([A-Z_][A-Z0-9_]*)\\b/g
const SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE|COOKIE|SIGNING|CERT)/i

async function collectSourceFiles(directory) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const files = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        files.push(...await collectSourceFiles(join(directory, entry.name)))
      }
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      files.push(join(directory, entry.name))
    }
  }
  return files
}

/**
 * Discover environment keys actually referenced by executable source.
 * This intentionally returns values only for non-secret variables; secret
 * values are reduced to a configured/not-configured state and are never sent
 * to the Studio client.
 */
export async function discoverEnvironmentRows(sourceRoot, environment = process.env) {
  const keys = new Set()
  for (const directory of SOURCE_DIRECTORIES) {
    const files = await collectSourceFiles(join(sourceRoot, directory))
    for (const file of files) {
      const source = await readFile(file, 'utf8')
      for (const match of source.matchAll(PROCESS_ENV)) {
        const key = match[1] || match[2]
        if (key) keys.add(key)
      }
      for (const match of source.matchAll(PASSED_ENV)) {
        if (match[1]) keys.add(match[1])
      }
    }
  }

  return [...keys].sort((a, b) => a.localeCompare(b)).map(key => {
    const configuredValue = environment?.[key]
    const configured = configuredValue !== undefined && String(configuredValue).trim() !== ''
    const secret = SECRET_NAME.test(key)
    return {
      key,
      value: secret ? (configured ? 'Configured' : 'Not configured') : String(configuredValue ?? ''),
      readOnly: true,
      secret,
      type: 'runtime',
    }
  })
}
