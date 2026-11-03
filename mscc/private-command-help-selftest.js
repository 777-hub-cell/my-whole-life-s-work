import assert from 'node:assert/strict'
import helpCommand from './private-commands/help.js'
import { dispatchNamespacedCommand } from './command-registry.js'
import { isOwnerSelfControlCommand } from './inbound-message-guard.js'

const commandList = [
  helpCommand,
  {
    name: 'health',
    aliases: ['check'],
    description: 'Service health status.',
    usage: '.health',
    async run() {},
  },
  {
    name: 'version',
    description: '',
    async run() {},
  },
  {
    name: 'secret',
    description: 'Hidden internal command.',
    hidden: true,
    async run() {},
  },
]

const commands = new Map()
for (const command of commandList) {
  for (const name of [command.name, ...(command.aliases || [])]) {
    commands.set(String(name).toLowerCase(), command)
  }
}
const privateRegistry = { commands, canonical: commandList }
const publicRegistry = { commands: new Map(), canonical: [] }
const selfJid = '2348012345678@s.whatsapp.net'

for (const [index, shortcut] of ['.menu', '.commands', '.help'].entries()) {
  const message = {
    key: {
      fromMe: true,
      id: `private-help-${index}`,
      remoteJid: selfJid,
    },
    message: { conversation: shortcut },
  }

  assert.equal(isOwnerSelfControlCommand({
    account: { id: 'A', role: 'owner' },
    mainAccountId: 'A',
    message,
    chatJid: selfJid,
    ownJid: selfJid,
    text: shortcut,
    privateCommands: commands,
  }), true, `${shortcut} should be accepted in Account A self-chat`)

  const replies = []
  const handled = await dispatchNamespacedCommand({
    privateRegistry,
    publicRegistry,
    rawText: shortcut,
    context: {
      privateControl: true,
      reply: async value => replies.push(String(value)),
    },
  })

  assert.equal(handled, true, `${shortcut} should dispatch to private help`)
  assert.equal(replies.length, 1)
  assert(replies[0].includes('🔐 MSCC private control'))
  assert(replies[0].includes('Shortcuts: .menu, .commands, .privatehelp, .control'))
  assert(replies[0].includes('.health — Service health status.'))
  assert(replies[0].includes('.version — No description'))
  assert(!replies[0].includes('Hidden internal command.'))
  assert(!replies[0].includes('${command.name}'))
  assert(!replies[0].includes('${command.description'))
}

const detailReplies = []
await helpCommand.run({
  args: ['check'],
  commandList: () => commandList,
  reply: async value => detailReplies.push(String(value)),
})
assert.equal(detailReplies[0], '.health\nService health status.\nAliases: .check\nUsage: .health')

const unknownReplies = []
await helpCommand.run({
  args: ['does-not-exist'],
  commandList: () => commandList,
  reply: async value => unknownReplies.push(String(value)),
})
assert.equal(unknownReplies[0], 'Unknown private command: .does-not-exist\nTry .help')

console.log('PASS private help interpolation, command aliases, self-chat admission, details, and hidden-command filtering')
