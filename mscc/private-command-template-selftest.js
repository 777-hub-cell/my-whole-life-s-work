import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'

const directory = new URL('./private-commands/', import.meta.url)
const files = (await readdir(directory)).filter(name => name.endsWith('.js') && !name.startsWith('_'))
assert.ok(files.length > 0, 'Private command modules must be present')
for (const file of files) {
  const source = await readFile(new URL(file, directory), 'utf8')
  assert.equal(/\\\$\{/.test(source), false, file + ' still contains a literal escaped template interpolation')
}

const replies = []
let savedSetting = null
const autoCc = (await import('./private-commands/autocc.js')).default
await autoCc.run({args:['invalid'],settings:{autoCc:true},setSetting:async (key,value)=>{savedSetting=[key,value]},reply:async value=>replies.push(String(value))})
assert.match(replies.pop(), /Current: ON/)
await autoCc.run({args:['off'],settings:{autoCc:true},setSetting:async (key,value)=>{savedSetting=[key,value]},reply:async value=>replies.push(String(value))})
assert.deepEqual(savedSetting,['autoCc',false])
assert.equal(replies.pop(),'✅ Auto CC: OFF')

const rename = (await import('./private-commands/renameaccount.js')).default
await rename.run({args:['account-3','Josia'],resolveAccountId:value=>value,renameAccount:async()=>({account:'account-3',displayName:'Josia'}),reply:async value=>replies.push(String(value))})
assert.equal(replies.pop(),'✅ account-3 is now “Josia”.')
console.log('PASS private command template interpolation ('+files.length+' modules scanned; representative replies verified)')
