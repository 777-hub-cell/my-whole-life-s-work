import assert from 'node:assert/strict'
import { dispatchCommand, dispatchNamespacedCommand } from './command-registry.js'

const runLog = []
const replies = []
const movie = {
  name:'movie',
  capability:'movies',
  async run() { runLog.push('movie'); },
}
const publicRegistry = {
  commands:new Map([['movie', movie]]),
  canonical:[movie],
}
const privateRegistry = { commands:new Map(), canonical:[] }

const directContext = {
  publicPrefix:'.',
  publicCommandsEnabled:true,
  message:{ key:{ remoteJid:'user@s.whatsapp.net' } },
  botProfile:{ id:'unassigned', displayName:'Unassigned' },
  shouldExecutePublicCommand:async () => false,
  reply:async value => { replies.push(String(value)); return value },
}
const directHandled = await dispatchNamespacedCommand({
  privateRegistry,
  publicRegistry,
  rawText:'.movie The Matrix',
  context:directContext,
})
assert.equal(directHandled, true, 'direct-message capability denial should be handled visibly')
assert.deepEqual(runLog, [], 'a mismatched profile must not execute a specialist command')
assert.equal(replies.length, 1, 'direct-message denial should explain why no command ran')
assert.match(replies[0], /Unassigned/)
assert.match(replies[0], /movies/)
assert.match(replies[0], /bot account assigned to that capability/)

// Never send the same diagnostic from every linked account in a group.
replies.length = 0
const groupHandled = await dispatchNamespacedCommand({
  privateRegistry,
  publicRegistry,
  rawText:'.movie The Matrix',
  context:{
    ...directContext,
    message:{ key:{ remoteJid:'test-group@g.us' } },
  },
})
assert.equal(groupHandled, false, 'wrong specialist should stay silent in groups')
assert.deepEqual(replies, [], 'group capability mismatch must not spam the chat')
assert.deepEqual(runLog, [])

// A correctly assigned profile must execute normally with no diagnostic.
const allowedHandled = await dispatchNamespacedCommand({
  privateRegistry,
  publicRegistry,
  rawText:'.movie The Matrix',
  context:{
    ...directContext,
    botProfile:{ id:'mimi', displayName:'MiMi' },
    shouldExecutePublicCommand:async () => true,
  },
})
assert.equal(allowedHandled, true)
assert.deepEqual(runLog, ['movie'])
assert.deepEqual(replies, [])

// Hidden commands remain callable by their designated public owner but are
// omitted from the command list passed to help/menu consumers.
let visibleNames = []
let hiddenRuns = 0
const catalogProbe = {
  name:'catalogprobe',
  async run(ctx) { visibleNames = ctx.commandList().map(command => command.name) },
}
const hiddenProbe = {
  name:'stickerinspect',
  hidden:true,
  ownerOnly:true,
  publicOwnerOnly:true,
  async run() { hiddenRuns += 1 },
}
const hiddenRegistry = {
  commands:new Map([['catalogprobe', catalogProbe], ['stickerinspect', hiddenProbe]]),
  canonical:[catalogProbe, hiddenProbe],
}
const publicContext = {
  publicCommandsEnabled:true,
  isPublicOwner:false,
  isSessionOwner:false,
  isSupremeOwner:false,
  reply:async value => { replies.push(String(value)); return value },
}
assert.equal(await dispatchCommand(hiddenRegistry, '.catalogprobe', publicContext, { scope:'public' }), true)
assert.deepEqual(visibleNames, ['catalogprobe'], 'hidden commands must not appear in normal command lists')
assert.equal(await dispatchCommand(hiddenRegistry, '.stickerinspect', publicContext, { scope:'public' }), false)
assert.equal(hiddenRuns, 0, 'non-owners must not run the hidden owner command')
assert.equal(await dispatchCommand(hiddenRegistry, '.stickerinspect', {
  ...publicContext,
  isPublicOwner:true,
}, { scope:'public' }), true)
assert.equal(hiddenRuns, 1, 'the verified public owner can run the hidden command')

console.log('PASS specialist routing, public-owner-only hidden commands, and command-list filtering')
