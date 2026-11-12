import { readdir } from 'node:fs/promises'
import { relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const emptyRegistry = () => ({ commands: new Map(), canonical: [] })

async function commandFiles(rootPath, directoryPath = rootPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('_')) continue
    const path = directoryPath + sep + entry.name
    if (entry.isDirectory()) files.push(...await commandFiles(rootPath, path))
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(path)
  }
  return files
}

export async function loadCommands(directoryUrl, {
  cacheBust = '',
  allowMissing = false,
  capabilityFromDirectory = false,
} = {}) {
  const directory = directoryUrl instanceof URL ? directoryUrl : new URL(directoryUrl, import.meta.url)
  const rootPath = fileURLToPath(directory)

  let files
  try {
    files = await commandFiles(rootPath)
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') return emptyRegistry()
    throw error
  }

  const commands = new Map()
  for (const file of files) {
    const relativePath = relative(rootPath, file)
    const parts = relativePath.split(sep).filter(Boolean)
    if (capabilityFromDirectory && parts.length < 2) {
      throw new Error(`Public command must live inside a capability folder: ${relativePath}`)
    }

    const url = pathToFileURL(file)
    if (cacheBust) url.searchParams.set('v', String(cacheBust))
    const module = await import(url.href)
    const sourceCommand = module.default
    if (!sourceCommand?.name || typeof sourceCommand.run !== 'function') {
      throw new Error(`Invalid command module: ${relativePath}`)
    }

    const command = capabilityFromDirectory
      ? {
          ...sourceCommand,
          capability: String(parts[0]).trim().toLowerCase(),
          modulePath: relativePath.split(sep).join('/'),
        }
      : sourceCommand

    const keys = [command.name, ...(command.aliases || [])]
      .map(value => String(value).trim().toLowerCase())
      .filter(Boolean)

    for (const key of keys) {
      if (commands.has(key)) throw new Error(`Duplicate MSCC command in namespace: ${key}`)
      commands.set(key, command)
    }
  }

  return { commands, canonical: [...new Set(commands.values())] }
}

/**
 * Combine built-in public commands with administrator-owned extensions.
 * Built-ins always win: custom modules may not shadow a command or alias.
 */
export function mergeCommandRegistries(baseRegistry, extensionRegistry) {
  const commands = new Map(baseRegistry?.commands || [])
  const canonical = [...(baseRegistry?.canonical || [])]

  for (const command of extensionRegistry?.canonical || []) {
    const keys = [command.name, ...(Array.isArray(command.aliases) ? command.aliases : [])]
      .map(value => String(value).trim().toLowerCase())
      .filter(Boolean)
    for (const key of keys) {
      if (commands.has(key)) {
        throw new Error(`Custom command conflicts with an existing MSCC command or alias: ${key}`)
      }
    }
    canonical.push(command)
    for (const key of keys) commands.set(key, command)
  }

  return { commands, canonical: [...new Set(canonical)] }
}

function parseCommand(rawText, prefix = '.') {
  const text = String(rawText || '').trim()
  const normalizedPrefix = String(prefix || '.')
  if (!normalizedPrefix || !text.startsWith(normalizedPrefix)) return null

  const body = text.slice(normalizedPrefix.length).trim()
  if (!body) return null
  const [rawName, ...args] = body.split(/\s+/)
  // Keep exact whitespace/line breaks for rich-text commands like .tweet.
  const rawArgs = body.slice(rawName.length).replace(/^\s+/u, '')
  return { name: rawName.toLowerCase(), args, rawArgs }
}

function normalizeUsage(usage, prefix, commandName) {
  const raw = String(usage || `${prefix}${commandName}`).trim()
  if (raw.startsWith('.') && prefix !== '.') return `${prefix}${raw.slice(1)}`
  return raw
}

function commandHelp(command, prefix = '.') {
  const lines = [`*${prefix}${command.name}*`]
  if (command.description) lines.push(String(command.description))
  lines.push(`Usage: ${normalizeUsage(command.usage, prefix, command.name)}`)
  const aliases = Array.isArray(command.aliases)
    ? command.aliases.map(value => String(value).trim()).filter(Boolean)
    : []
  if (aliases.length) lines.push(`Aliases: ${aliases.map(alias => `${prefix}${alias}`).join(', ')}`)
  if (command.help) lines.push('', String(command.help))
  return lines.join('\n')
}

async function runResolvedCommand(registry, parsed, context, { prefix = '.' } = {}) {
  const command = registry.commands.get(parsed.name)
  if (!command) return false

  if (String(parsed.args[0] || '').trim().toLowerCase() === 'help') {
    await context.reply(commandHelp(command, prefix))
    return true
  }

  await command.run({
    ...context,
    command,
    args: parsed.args,
    rawArgs: parsed.rawArgs,
    name: parsed.name,
    capability: String(command.capability || 'general').trim().toLowerCase() || 'general',
    commandList: () => registry.canonical,
  })
  return true
}

async function publicCommandAllowed(command, context) {
  if (context.publicCommandsEnabled === false) return false

  const requiredProfile = String(command.profileOnly || '').trim().toLowerCase()
  const activeProfile = String(context.botProfile?.id || '').trim().toLowerCase()
  if (requiredProfile && requiredProfile !== activeProfile) return false

  if (command.ownerOnly === true && !(
    context.isPublicOwner === true ||
    context.isSessionOwner === true ||
    context.isSupremeOwner === true
  )) {
    if (command.notifyOnPermissionDenied === true &&
        typeof context.reply === 'function' &&
        String(command.permissionDeniedMessage || '').trim()) {
      await context.reply(String(command.permissionDeniedMessage).trim())
    }
    return false
  }

  if (command.adminOnly === true) {
    const admin = typeof context.isGroupAdmin === 'function'
      ? await context.isGroupAdmin()
      : context.isGroupAdmin === true
    if (!admin) return false
  }

  if (typeof context.shouldExecutePublicCommand === 'function') {
    if (!(await context.shouldExecutePublicCommand(command))) return false
  }

  return true
}

export async function dispatchCommand(registry, rawText, context, { scope = 'private', prefix = '.' } = {}) {
  const parsed = parseCommand(rawText, prefix)
  if (!parsed) return false
  const command = registry.commands.get(parsed.name)
  if (!command) return false

  if (scope === 'private') {
    if (!context.privateControl) return false
  } else if (scope === 'public') {
    if (!(await publicCommandAllowed(command, context))) return false
  } else {
    throw new Error(`Unknown command scope: ${scope}`)
  }

  return runResolvedCommand(registry, parsed, context, { prefix })
}

export async function dispatchNamespacedCommand({ privateRegistry, publicRegistry, rawText, context }) {
  const privateParsed = parseCommand(rawText, '.')
  if (privateParsed && context.privateControl && privateRegistry?.commands?.has(privateParsed.name)) {
    return runResolvedCommand(privateRegistry, privateParsed, context, { prefix: '.' })
  }

  const publicParsed = parseCommand(rawText, String(context.publicPrefix || '.'))
  if (!publicParsed || !publicRegistry?.commands?.has(publicParsed.name)) return false

  const command = publicRegistry.commands.get(publicParsed.name)
  if (!(await publicCommandAllowed(command, context))) {
    // In a direct chat, an assigned specialist mismatch otherwise looks like
    // a dead command because dispatch silently returns false. Explain the
    // profile/capability boundary without changing specialist routing. Groups
    // stay silent here because every linked account receives the same message.
    const message = context?.message
    const chat = String(message?.key?.remoteJid || '')
    const capability = String(command.capability || 'general').trim().toLowerCase() || 'general'
    const profile = context?.botProfile || {}
    const capabilityDenied = context.publicCommandsEnabled !== false &&
      command.profileOnly == null &&
      command.ownerOnly !== true &&
      command.adminOnly !== true &&
      typeof context.shouldExecutePublicCommand === 'function'
    if (capabilityDenied && chat && !chat.endsWith('@g.us') && typeof context.reply === 'function') {
      const profileName = String(profile.displayName || profile.id || 'this bot account').trim()
      await context.reply(
        'I received this command, but this bot account is assigned to *' + profileName +
        '*, which is not enabled for *' + capability + '* commands. Send it to the bot account assigned to that capability, or use a group where that specialist is connected.'
      )
      return true
    }
    return false
  }
  return runResolvedCommand(publicRegistry, publicParsed, context, { prefix: String(context.publicPrefix || '.') })
}
