import { readdir } from 'node:fs/promises'
import { relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { VALID_NAME, parseCommand } from './command-parser.js'
import { resolveExecutionAuthorization } from './authorization.js'

// Re-exported so existing importers keep working; the parser lives in its own
// module so authorization.js can use it without a circular import.
export { parseCommand }

async function commandFiles(rootPath, directoryPath = rootPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('_')) continue
    const fullPath = directoryPath + sep + entry.name
    if (entry.isDirectory()) files.push(...await commandFiles(rootPath, fullPath))
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath)
  }
  return files
}

export async function loadCommandRegistry(directoryUrl, { scope, cacheBust = Date.now() } = {}) {
  if (!['private', 'public'].includes(scope)) throw new Error('Command registry scope must be private or public.')
  const directory = directoryUrl instanceof URL ? directoryUrl : new URL(directoryUrl, import.meta.url)
  const rootPath = fileURLToPath(directory)
  const files = await commandFiles(rootPath)
  const commands = new Map()
  const canonical = []

  for (const file of files) {
    const relativePath = relative(rootPath, file)
    const url = pathToFileURL(file)
    url.searchParams.set('v', String(cacheBust))
    const module = await import(url.href)
    const command = module.default
    if (!command || !VALID_NAME.test(String(command.name || '').trim().toLowerCase()) ||
        typeof command.run !== 'function') {
      throw new Error('Invalid ' + scope + ' command module: ' + relativePath)
    }
    const normalized = { ...command, name: String(command.name).trim().toLowerCase(), scope }
    const names = [normalized.name, ...(Array.isArray(normalized.aliases) ? normalized.aliases : [])]
      .map(value => String(value).trim().toLowerCase())
    for (const name of names) {
      if (!VALID_NAME.test(name)) throw new Error('Invalid command name or alias in ' + relativePath + ': ' + name)
      if (commands.has(name)) throw new Error('Duplicate ' + scope + ' command or alias: ' + name)
      commands.set(name, normalized)
    }
    canonical.push(normalized)
  }

  return { scope, commands, canonical }
}

/**
 * Registries are deliberately not interchangeable, and dispatch never trusts
 * caller-supplied privilege flags. Every run is authorised here by the one
 * canonical evaluator from the verified `auth` proof:
 * - private commands need verified Private Owner control (own self-chat);
 * - public commands need a direct, non-self public message;
 * - public ownerOnly commands additionally need the configured Public Owner.
 * Any `privateControl`/`isPublicOwner`/`isPrivateOwner` in `context` is
 * overwritten with the evaluator's result. Missing `auth` denies.
 */
export async function dispatchCommand({ registry, rawText, context = {}, prefix = '!', auth, onDenied } = {}) {
  if (!registry?.commands) return false
  const parsed = parseCommand(rawText, prefix)
  if (!parsed) return false
  const command = registry.commands.get(parsed.name)
  if (!command) return false

  const resolved = resolveExecutionAuthorization(auth || {})
  let decision
  if (registry.scope === 'private') {
    decision = resolved.decisions.privateControl
  } else if (registry.scope === 'public') {
    decision = resolved.decisions.publicCommand
    if (decision.allow && command.ownerOnly === true) decision = resolved.decisions.publicOwner
  } else {
    return false
  }
  if (!decision.allow) {
    try { onDenied?.(decision, { command: command.name }) } catch { /* audit hook must never affect dispatch */ }
    return false
  }

  await command.run({
    ...context,
    sessionId: auth.sessionId,
    privateControl: resolved.privateControl,
    isPrivateOwner: resolved.privateControl,
    isPublicOwner: resolved.isPublicOwner,
    command,
    args: parsed.args,
    rawArgs: parsed.rawArgs,
    name: parsed.name,
    prefix,
    commandList: () => registry.canonical.slice(),
  })
  return true
}
