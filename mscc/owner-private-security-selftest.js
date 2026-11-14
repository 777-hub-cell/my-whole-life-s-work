import assert from 'node:assert/strict'
import { resolveOwnerAuthority } from './owner-authority.js'
import { dispatchNamespacedCommand, mergeCommandRegistries } from './command-registry.js'
import { isMainAccountInboundAllowed, isOwnerSelfControlCommand, createInboundMessageGuard } from './inbound-message-guard.js'

const primary = '2348012345678'
const secondary = '2348099999999'
const sudo = '2348077777777'
const normal = '2348066666666'
const controls = new Set([primary, secondary])
const authority = (senderNumber, extra = {}) => resolveOwnerAuthority({
  senderNumber, primaryOwnerNumber:primary, controlNumbers:controls,
  sessionNumber:normal, sudo:senderNumber === sudo, ...extra,
})
assert.deepEqual(authority(primary), { isSupremeOwner:true, isSudo:false, isPublicOwner:true, isSessionOwner:true })
assert.equal(authority(secondary).isSupremeOwner, false, 'legacy CONTROL_NUMBERS must not become supreme owners')
assert.equal(authority(secondary).isPublicOwner, true, 'keep compatible public-control commands')
assert.equal(authority(sudo).isSupremeOwner, false, 'sudo is public delegation, not primary ownership')
assert.equal(authority(sudo).isPublicOwner, true)
assert.equal(authority(normal).isSessionOwner, true, 'linked account ownership keeps existing public semantics')
assert.equal(authority(normal).isSupremeOwner, false)
assert.equal(authority(normal, { primaryOwnerNumber:'' }).isSupremeOwner, false)
assert.equal(authority('999@lid').isSupremeOwner, false, 'never guess phone identity from opaque LIDs')
assert.equal(authority('not a number').isPublicOwner, false)

const calls = []
const create = (name, aliases = []) => ({
  name, aliases, async run() { calls.push(name) },
})
const privateAccounts = create('accounts', ['sessions'])
const privateRestart = create('restart', ['reboot'])
const privateHidden = { ...create('hiddencontrol'), hidden:true }
const privateRegistry = {
  commands:new Map([['accounts',privateAccounts],['sessions',privateAccounts],['restart',privateRestart],['reboot',privateRestart],['hiddencontrol',privateHidden]]),
  canonical:[privateAccounts,privateRestart,privateHidden],
}
const movie = create('movie')
const sudoCommand = { ...create('sudo'), ownerOnly:true }
const publicRegistry = {
  commands:new Map([['movie',movie], ['sudo',sudoCommand]]),
  canonical:[movie,sudoCommand],
}
const makeContext = (permissions = {}, extra = {}) => ({
  ...permissions, publicPrefix:'.', publicCommandsEnabled:true,
  shouldExecutePublicCommand:async () => true,
  message:{ key:{ remoteJid:'user@s.whatsapp.net' } },
  ...extra,
})
async function dispatch(input, context) {
  return dispatchNamespacedCommand({
    privateRegistry, publicRegistry, rawText:input, context,
  })
}
for (const actor of [authority(normal),authority(sudo),authority(secondary),authority(primary)]) {
  for (const forbidden of ['.accounts', '.sessions', '.restart confirm', '.reboot confirm', '.hiddencontrol']) {
    assert.equal(await dispatch(forbidden, makeContext(actor)), false, `${forbidden} must be blocked outside Account A`)
  }
  assert.equal(await dispatch('.movie Dune', makeContext(actor)), true, 'public movie remains available')
}
assert.equal(await dispatch('.accounts', makeContext(authority(primary), {privateControl:true})), true)
assert.equal(await dispatch('.sessions', makeContext(authority(primary), {privateControl:true})), true)
assert.equal(await dispatch('.restart confirm', makeContext(authority(primary), {privateControl:true})), true)
assert.equal(await dispatch('.hiddencontrol', makeContext(authority(primary), {privateControl:true})), true)
assert.equal(await dispatch('.sudo list', makeContext(authority(sudo))), true, 'public sudo owner command remains accessible')
assert.equal(await dispatch('.movie', makeContext(authority(primary), {publicCommandsEnabled:false})), false, 'lockdown applies to owner public commands')
assert.equal(await dispatch('.accounts', makeContext(authority(primary), {privateControl:true,publicCommandsEnabled:false})), true, 'private recovery survives public lockdown')
assert.equal(await dispatch('.movie', makeContext(authority(primary), {shouldExecutePublicCommand:async () => false,message:{key:{remoteJid:'group@g.us'}}})), false, 'specialist profile gate survives owner access')
assert.throws(
  () => mergeCommandRegistries(publicRegistry, {canonical:[create('hello', ['sessions'])]}, {protectedRegistry:privateRegistry}),
  /conflicts/,
  'custom alias must not shadow a private alias',
)
assert.throws(
  () => mergeCommandRegistries(publicRegistry, {canonical:[create('hiddencontrol')]}, {protectedRegistry:privateRegistry}),
  /conflicts/,
  'hidden private commands must remain protected',
)
assert.throws(
  () => mergeCommandRegistries(publicRegistry, {canonical:[create('sudo')]}, {protectedRegistry:privateRegistry}),
  /conflicts/,
  'custom commands cannot shadow public owner commands',
)
assert.equal(mergeCommandRegistries(publicRegistry, {canonical:[create('hello', ['hi'])]}, {protectedRegistry:privateRegistry}).commands.has('hi'), true)

assert.equal(isMainAccountInboundAllowed({id:'A',role:'linked'}, false), false)
assert.equal(isMainAccountInboundAllowed({id:'A',role:'linked'}, true), false)
const jid = primary + '@s.whatsapp.net'
const owner = {id:'A',role:'owner'}
const self = (chat, id) => ({key:{fromMe:true,id,remoteJid:chat},message:{conversation:'.accounts'}})
const selfAllowed = message => isOwnerSelfControlCommand({
  account:owner,mainAccountId:'A',message,chatJid:message.key.remoteJid,
  ownJid:jid,verifiedSelfChat:message.key.remoteJid.endsWith('@lid'),
  text:message.message.conversation,privateCommands:privateRegistry.commands,
})
assert.equal(selfAllowed(self(jid,'1')),true)
assert.equal(selfAllowed(self('opaque@lid','1')),true)
assert.equal(selfAllowed(self('ordinary@g.us','1')),false)
const receiptIds = new Set()
const accept = createInboundMessageGuard({allowSelf:(accountId,msg)=>accountId==='A' && selfAllowed(msg),
  claim:(accountId,msg)=>{const receipt = accountId+'|'+msg.key.remoteJid+'|'+msg.key.id;if(receiptIds.has(receipt))return false;receiptIds.add(receipt);return true},
})
const receipt = message => {
  // Match the canonical receipt used by the production inbound handler.
  const normalized = {...message,key:{...message.key,remoteJid:jid}}
  return accept('A',normalized,5000)
}
assert.equal(receipt(self(jid,'live-1')),true)
assert.equal(receipt(self('opaque@lid','live-1')),false,'verified LID/PN replay must share a receipt')
assert.equal(receipt(self(jid,'live-2')),true)
assert.equal(accept('B',self(jid,'live-3'),5000),false)
assert.equal(calls.filter(x=>x==='movie').length,4)
console.log('PASS MDD02 primary owner isolation, public delegation, aliases, lockdown, LID receipts and Account A role gate')
