import { readdir } from 'node:fs/promises'
import { relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const VALID_NAME = /^[a-z][a-z0-9_-]{0,63}$/

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

export function parseCommand(rawText, prefix = '!') {
  const text = String(rawText || '').trim()
  const marker = String(prefix || '!')
  if (!marker || !text.startsWith(marker)) return null
  const body = text.slice(marker.length).trim()
  if (!body) return null
  const [rawName, ...args] = body.split(/\s+/)
  const rawArgs = body.slice(rawName.length).replace(/^\s+/u, '')
  const name = rawName.toLowerCase()
  if (!VALID_NAME.test(name)) return null
  return { name, args, rawArgs }
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
 * Registries are deliberately not interchangeable:
 * - private commands only run for the verified private self-chat session;
 * - public commands only run on the public session;
 * - public ownerOnly checks the Public Owner identity only.
 */
export async function dispatchCommand({ registry, rawText, context, prefix = '!' } = {}) {
  if (!registry?.commands || !context) return false
  const parsed = parseCommand(rawText, prefix)
  if (!parsed) return false
  const command = registry.commands.get(parsed.name)
  if (!command) return false

  if (registry.scope === 'private') {
    if (context.sessionId !== 'private' || context.privateControl !== true) return false
  } else if (registry.scope === 'public') {
    if (context.sessionId !== 'public') return false
    if (command.ownerOnly === true && context.isPublicOwner !== true) return false
  } else {
    return false
  }

  await command.run({
    ...context,
    command,
    args: parsed.args,
    rawArgs: parsed.rawArgs,
    name: parsed.name,
    prefix,
    commandList: () => registry.canonical.slice(),
  })
  return true
}
