import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCustomNode, validateCustomNodeDefinition } from '../src/custom-node-engine.js'
import { createVisualCommandStore, createWorkflowDraft, executeVisualWorkflow, validateWorkflow } from '../src/visual-command-builder.js'

const upper = {
  id: 'uppercase-reply', name: 'Uppercase reply', version: 1,
  operator: 'uppercase', inputs: [{ id: 'value', label: 'Input', type: 'string' }],
  outputType: 'string', description: 'Convert incoming text to uppercase.', category: 'Text',
}

test('custom nodes reject unsafe operators, invalid types and duplicate ports', () => {
  assert.throws(() => validateCustomNodeDefinition({ ...upper, operator: 'eval' }), /Unsupported/)
  assert.throws(() => validateCustomNodeDefinition({ ...upper, inputs: [{id: 'value', type:'string'}, {id:'value', type:'string'}] }), /Duplicate/)
  assert.throws(() => runCustomNode({ ...upper, operator: 'divide', inputs:[{id:'value', type:'number'}], outputType:'number' }, { value: 3 }), /result|type|number|Division/)
  assert.deepEqual(runCustomNode(upper, { value: 'hello' }), { result: 'HELLO' })
})

test('custom node is persisted and registered on reload, executes in real workflow', async t => {
  const root = await mkdtemp(join(tmpdir(), 'aharane-custom-node-'))
  t.after(() => rm(root, {recursive:true, force:true}))
  const file = join(root, 'visual-commands.json')
  const store = createVisualCommandStore(file)
  await store.init()
  await store.saveCustomNode(upper)
  const draft = createWorkflowDraft('private')
  const trigger = draft.nodes[0]
  draft.nodes = [trigger,
    { id:'uppercase', type:'custom.uppercase-reply', x:250, y:80, config:{nodeVersion:1} },
    { id:'send', type:'message.sendText', x:530, y:80, config:{} },
  ]
  draft.edges = [
    {id:'a', from:trigger.id, fromSocket:'next', to:'uppercase', toSocket:'in'},
    {id:'b', from:trigger.id, fromSocket:'messageText', to:'uppercase', toSocket:'value'},
    {id:'c', from:'uppercase', fromSocket:'next', to:'send', toSocket:'in'},
    {id:'d', from:'uppercase', fromSocket:'result', to:'send', toSocket:'text'},
  ]
  assert.equal(validateWorkflow(draft).valid, true, JSON.stringify(validateWorkflow(draft).errors))
  await store.save(draft)
  const fresh = createVisualCommandStore(file)
  await fresh.init()
  assert.equal(fresh.listCustomNodes()[0].type, 'custom.uppercase-reply')
  const sent=[]
  const result = await executeVisualWorkflow(fresh.get(draft.id), {
    store:fresh,
    context:{
      sessionId:'private', privateControl:true, allowedPublicSender:false,
      remoteJid:'2348012345678@s.whatsapp.net',
      sender:'2348012345678@s.whatsapp.net',
      messageText:'.hello Ada', rawArgs:'Ada', args:['Ada'],
      message:{key:{id:'m1',remoteJid:'2348012345678@s.whatsapp.net',fromMe:true},message:{conversation:'.hello Ada'}},
      socket:{sendMessage:async (_to,body)=>{sent.push(body.text);return {key:{id:'m2'}}}},
    },
  })
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.deepEqual(sent, ['.HELLO ADA'])
  await assert.rejects(fresh.removeCustomNode('uppercase-reply'), /used by/)
})
