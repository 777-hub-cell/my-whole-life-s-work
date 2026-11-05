import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dispatchNamespacedCommand, loadCommands, mergeCommandRegistries } from './command-registry.js'

const native = { commands: new Map(), canonical: [
  { name: 'help', aliases: ['commands'], capability: 'general', run: async () => {} },
  { name: 'ping', capability: 'general', run: async () => {} },
] }
for (const command of native.canonical) for (const key of [command.name, ...(command.aliases || [])]) native.commands.set(key, command)
const extension = { commands: new Map(), canonical: [
  { name: 'hello', aliases: ['hi'], capability: 'general', run: async ctx => { ctx.runs.push(ctx.rawArgs) } },
] }
const merged = mergeCommandRegistries(native, extension)
assert.equal(merged.commands.get('hello'), extension.canonical[0])
assert.equal(merged.commands.get('hi'), extension.canonical[0])
assert.equal(merged.commands.get('help'), native.canonical[0])
assert.equal(merged.canonical.length, 3)
assert.throws(() => mergeCommandRegistries(native, { canonical: [{ name: 'hello', aliases: ['ping'], run: async () => {} }] }), /conflicts with an existing MSCC command or alias: ping/)
assert.throws(() => mergeCommandRegistries(native, { canonical: [{ name: 'commands', run: async () => {} }] }), /conflicts with an existing MSCC command or alias: commands/)

const packageDir = dirname(fileURLToPath(import.meta.url))
const tempRoot = await mkdtemp(join(packageDir, '.custom-command-test-'))
try {
  const generalDir = join(tempRoot, 'general')
  await mkdir(generalDir, { recursive: true })
  const commandFile = join(generalDir, 'sample.js')
  await writeFile(commandFile, `export default { name: 'sample', aliases: ['s'], description: 'test', async run(ctx) { ctx.runs.push('first:' + ctx.rawArgs) } }\n`)
  const dirUrl = pathToFileURL(tempRoot + sep)
  const loaded = await loadCommands(dirUrl, { cacheBust: 'first', capabilityFromDirectory: true })
  assert.equal(loaded.commands.get('sample').capability, 'general')
  assert.equal(loaded.commands.get('s'), loaded.commands.get('sample'))
  const runs = []
  const handled = await dispatchNamespacedCommand({
    privateRegistry: { commands: new Map(), canonical: [] },
    publicRegistry: mergeCommandRegistries(native, loaded),
    rawText: '.sample hello custom command',
    context: { publicPrefix: '.', publicCommandsEnabled: true, botProfile: { id: 'josiah' }, shouldExecutePublicCommand: async command => command.capability === 'general', runs },
  })
  assert.equal(handled, true)
  assert.deepEqual(runs, ['first:hello custom command'])
  await writeFile(commandFile, `export default { name: 'sample', async run(ctx) { ctx.runs.push('reloaded') } }\n`)
  const reloaded = await loadCommands(dirUrl, { cacheBust: 'second', capabilityFromDirectory: true })
  const reloadedRuns = []
  await dispatchNamespacedCommand({
    privateRegistry: { commands: new Map(), canonical: [] },
    publicRegistry: mergeCommandRegistries(native, reloaded),
    rawText: '.sample',
    context: { publicPrefix: '.', publicCommandsEnabled: true, botProfile: { id: 'josiah' }, shouldExecutePublicCommand: async () => true, runs: reloadedRuns },
  })
  assert.deepEqual(reloadedRuns, ['reloaded'])
} finally { await rm(tempRoot, { recursive: true, force: true }) }
console.log('PASS persistent custom command loading, capability routing, cache-busted reload and built-in collision protection')
