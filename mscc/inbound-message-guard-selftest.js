import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { SharedStorage } from './shared-storage.js'
import { createInboundMessageGuard, isOwnerSelfControlCommand, matchesDisplayedChoice } from './inbound-message-guard.js'

const entries = [
  { id:'18kami', title:'18Kami' },
  { id:'comix', title:'Comix' },
  { id:'mangadex', title:'MangaDex' },
  { id:'weebcentral', title:'WeebCentral' },
]

assert.equal(matchesDisplayedChoice('1', entries), true)
assert.equal(matchesDisplayedChoice('4', entries), true)
assert.equal(matchesDisplayedChoice('3', entries), true)
assert.equal(matchesDisplayedChoice('MangaDex', entries), true)
assert.equal(matchesDisplayedChoice('  mangadex ', entries), true)
assert.equal(matchesDisplayedChoice('weebcentral', entries), true)
assert.equal(matchesDisplayedChoice('0', entries), false)
assert.equal(matchesDisplayedChoice('5', entries), false)
assert.equal(matchesDisplayedChoice('.manga', entries), false)
assert.equal(matchesDisplayedChoice('I could not match that choice. Reply with one of the displayed numbers.', entries), false)
assert.equal(matchesDisplayedChoice('Manga source', entries), false)
assert.equal(matchesDisplayedChoice('Some unrelated conversation', entries), false)
assert.equal(matchesDisplayedChoice('', entries), false)
assert.equal(matchesDisplayedChoice('A'.repeat(130), entries), false)

const accept = createInboundMessageGuard({ maxEntries:3, ttlMs:2000 })
const msg = (id, text, fromMe=false, chat='group@g.us') => ({
  key:{ id, remoteJid:chat, fromMe },
  message:{ conversation:text },
})

const owner = { id:'A', role:'owner', number:'2348012345678' }
const ownerJid = owner.number + '@s.whatsapp.net'
const privateCommands = new Map([
  ['status', {}],
  ['accounts', {}],
  ['sessions', {}],
  ['restart', {}],
])
const selfCommand = (id, text, overrides={}) => ({
  ...msg(id, text, true, ownerJid),
  ...overrides,
})
const ownerSelfArgs = (message, overrides={}) => ({
  account:owner,
  mainAccountId:'A',
  message,
  chatJid:message.key.remoteJid,
  ownJid:ownerJid,
  text:message.message.conversation,
  privateCommands,
  ...overrides,
})
assert.equal(isOwnerSelfControlCommand(ownerSelfArgs(selfCommand('owner-status','.status'))), true,
  'Account A must be able to run a registered private command from its own chat')
assert.equal(isOwnerSelfControlCommand(ownerSelfArgs(selfCommand('owner-alias','.sessions'))), true,
  'registered private aliases must work in the owner self-chat')
assert.equal(isOwnerSelfControlCommand(ownerSelfArgs(selfCommand('owner-restart','.restart now'))), true)
assert.equal(isOwnerSelfControlCommand(ownerSelfArgs(selfCommand('owner-public','.movie Dune'))), false,
  'public commands must not enter through the self-control exception')
assert.equal(isOwnerSelfControlCommand(ownerSelfArgs(selfCommand('owner-unknown','.notaprivatecommand'))), false)
assert.equal(isOwnerSelfControlCommand(ownerSelfArgs(selfCommand('owner-text','status'))), false)
assert.equal(isOwnerSelfControlCommand(ownerSelfArgs(selfCommand('owner-group','.status'), {
  chatJid:'group@g.us', ownJid:ownerJid,
})), false)
assert.equal(isOwnerSelfControlCommand(ownerSelfArgs(selfCommand('owner-other-dm','.status'), {
  chatJid:'2348099999999@s.whatsapp.net', ownJid:ownerJid,
})), false)
assert.equal(isOwnerSelfControlCommand(ownerSelfArgs(selfCommand('owner-lid','.status'), {
  chatJid:'9988776655@lid', ownJid:'9988776655@lid',
})), false, 'opaque LID self chats must fail closed')
assert.equal(isOwnerSelfControlCommand(ownerSelfArgs(selfCommand('owner-other-account','.status'), {
  account:{ id:'B', role:'linked', number:'2348012345678' },
})), false)
assert.equal(isOwnerSelfControlCommand(ownerSelfArgs(selfCommand('owner-not-selected','.status'), {
  mainAccountId:'B',
})), false)
assert.equal(isOwnerSelfControlCommand(ownerSelfArgs({
  ...selfCommand('not-from-me','.status'),
  key:{ ...selfCommand('not-from-me','.status').key, fromMe:false },
})), false)

const ownerSelfGuard = createInboundMessageGuard({
  allowSelf:(accountId, incoming) => isOwnerSelfControlCommand(ownerSelfArgs(incoming, {
    account:accountId === 'A' ? owner : { id:accountId, role:'linked' },
  })),
})
assert.equal(ownerSelfGuard('A', selfCommand('owner-command-1','.status'), 20000), true)
assert.equal(ownerSelfGuard('A', selfCommand('owner-command-1','.status'), 20001), false,
  'owner self-chat command receipts must still be de-duplicated')
assert.equal(ownerSelfGuard('A', selfCommand('owner-reply-1','Here is your status.'), 20002), false,
  'ordinary bot replies from Account A must remain blocked')
assert.equal(ownerSelfGuard('A', selfCommand('owner-public-2','.movie Dune'), 20003), false)
assert.equal(ownerSelfGuard('B', selfCommand('linked-account-command','.status'), 20004), false,
  'linked account self-chat commands must remain blocked')
assert.equal(accept('A', msg('user-1','1'), 10000), true)
assert.equal(accept('A', msg('user-1','1'), 10000), false, 'duplicated notify must not execute twice')
assert.equal(accept('A', msg('user-1','1',true), 10001), false, 'self-authored commands must not dispatch')
assert.equal(accept('A', msg('user-2','I could not match that choice. Reply with one of the displayed numbers.',true), 10002), false)
assert.equal(accept('account-3', msg('user-1','1'), 10003), true, 'account identity must isolate dedupe')
assert.equal(accept('A', msg('user-1','1',false,'different@g.us'), 10004), true, 'chat identity must isolate dedupe')
assert.equal(accept('A', msg('user-1','1'), 10005), false)
assert.equal(accept('A', msg('user-1','1'), 12010), true, 'TTL should release genuinely new deliveries')

const guard = createInboundMessageGuard()
const original = msg('incoming-command','.manga')
assert.equal(guard('A', original), true)
let sentWarnings = 0
// Simulate the original incident: 500 bot-authored feedback messages
// arrive while a selection is pending. None may invoke manga ~choice.
for (let i=0; i<500; i++) {
  const botReply = msg('bot-error-' + i,
    'I could not match that choice. Reply with one of the displayed numbers.', true)
  if (guard('A', botReply) && matchesDisplayedChoice(botReply.message.conversation, entries)) sentWarnings++
}
assert.equal(sentWarnings, 0, 'self-reply flood must never trigger a new invalid-choice warning')
assert.equal(guard('A', original), false, 'same user command cannot process twice')

// Simulate an Azure process restart while preserving the SQLite state.
const receiptDb = new DatabaseSync(':memory:')
const receiptStore = new SharedStorage(receiptDb, {
  file:':memory:', ttlMs:86400000, maxMessagesPerAccount:100,
})
receiptStore.initialize()
const claim = (accountId, incoming, now) => receiptStore.claimInboundMessage({
  accountId,
  chatJid:incoming.key.remoteJid,
  messageId:incoming.key.id,
  now,
})
const firstProcess = createInboundMessageGuard({ claim })
const request = msg('sticker-message-id', '.sticker')
assert.equal(firstProcess('A', request, 100000), true)
assert.equal(firstProcess('A', request, 100001), false)
const afterRestart = createInboundMessageGuard({ claim })
assert.equal(afterRestart('A', request, 150000), false,
  'restart must not replay an already executed sticker request')
assert.equal(afterRestart('A', {
  ...request, key:{ ...request.key, participant:'replaced-user@lid' },
}, 150001), false, 'sender LID change must not bypass de-duplication')
assert.equal(afterRestart('B', request, 150002), true, 'another bot account is distinct')
assert.equal(afterRestart('A', msg('next-sticker-request', '.sticker'), 150003), true,
  'a newly sent command is allowed')
assert.equal(receiptDb.prepare('SELECT COUNT(*) AS count FROM inbound_message_receipts').get().count, 3)
assert.equal(receiptStore.pruneInboundReceipts({ now:100000 + 8 * 86400000 }), 3)
assert.equal(receiptDb.prepare('SELECT COUNT(*) AS count FROM inbound_message_receipts').get().count, 0)
receiptStore.close()

const index = await readFile(new URL('./index.js', import.meta.url), 'utf8')
const inboundGate = index.indexOf('if (msg.key.fromMe === true && !ownerSelfControl)')
const dedupeGate = index.search(/if \(!acceptInboundCommand\(account\.id, msg\)\) (?:return|continue)/)
const dispatcher = index.indexOf('const commandHandled = await dispatchNamespacedCommand(', inboundGate)
assert(index.includes('isOwnerSelfControlCommand(account, msg)'), 'Main Account A self-chat exception must be explicitly allowlisted')
assert(index.includes('allowSelf:(accountId, msg) => isOwnerSelfControlCommand(accounts.get(accountId), msg)'), 'Production inbound guard must use the narrow owner-self predicate')
assert(inboundGate >= 0 && dedupeGate > inboundGate && dispatcher > dedupeGate,
  'Main Baileys upsert handler must allow only a verified private-owner self-command and reject other self/duplicate messages before dispatch')
assert(index.includes("if (type === 'append') return"),
  'Baileys historical append events must not redispatch old commands')
assert(index.includes('sharedStorage.claimInboundMessage({'),
  'Production inbound guard must use durable message claims')
assert(index.includes('matchesDisplayedChoice(text, pendingReply.entries)'),
  'Pending choice routing must accept only displayed options')

console.log('PASS bot-message guard, SQLite replay prevention across restarts, historical append filtering, and scoped choices')
