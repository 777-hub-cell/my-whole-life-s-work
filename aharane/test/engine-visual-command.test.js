import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createVisualCommandStore, createWorkflowDraft, executeVisualWorkflow,
  registerEngineNode, unregisterEngineNode, validateWorkflow,
} from '../src/visual-command-builder.js'

const manifest = {
  id: 'pinterest', name: 'Pinterest image search', version: 1, entryPoint: 'run',
  inputs: [{ id: 'query', type: 'string' }],
  outputs: [{ id: 'images', type: 'list' }],
  permissions: [], allowedHosts: [], timeoutMs: 5000, maxResults: 20,
}
const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pYcAAAAASUVORK5CYII='

test('custom Engine node feeds WhatsApp image output with a command-wide message cap', async t => {
  registerEngineNode(manifest)
  t.after(() => unregisterEngineNode('pinterest'))
  const dir = await mkdtemp(join(tmpdir(), 'aharane-engine-workflow-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const store = createVisualCommandStore(join(dir, 'workflows.json'))
  await store.init()

  const workflow = createWorkflowDraft('private')
  const trigger = workflow.nodes[0]
  trigger.config.command = 'pinterest'
  trigger.config.maxMessagesPerRun = '1'
  const engine = { id: 'engine-node', type: 'engine.pinterest', x: 500, y: 100, config: { engineVersion: '1' } }
  const media = { id: 'media-node', type: 'media.sendImages', x: 760, y: 100, config: { limit: '20', caption: 'Search results' } }
  workflow.nodes = [trigger, engine, media]
  workflow.edges = [
    { id: 'edge-exec-1', from: trigger.id, fromSocket: 'next', to: engine.id, toSocket: 'in' },
    { id: 'edge-query', from: trigger.id, fromSocket: 'arguments', to: engine.id, toSocket: 'query' },
    { id: 'edge-exec-2', from: engine.id, fromSocket: 'next', to: media.id, toSocket: 'in' },
    { id: 'edge-images', from: engine.id, fromSocket: 'images', to: media.id, toSocket: 'images' },
  ]

  const validation = validateWorkflow(workflow)
  assert.equal(validation.valid, true, JSON.stringify(validation.errors))

  const sent = []
  const result = await executeVisualWorkflow(workflow, {
    store,
    context: {
      sessionId: 'private',
      privateControl: true,
      remoteJid: '2348012345678@s.whatsapp.net',
      sender: '2348012345678@s.whatsapp.net',
      messageText: '.pinterest cats',
      message: { key: { id: 'trigger-message', remoteJid: '2348012345678@s.whatsapp.net', fromMe: true }, message: { conversation: '.pinterest cats' } },
      socket: {
        sendMessage: async (jid, payload) => {
          sent.push({ jid, payload })
          return { key: { id: 'sent-' + sent.length } }
        },
      },
    },
    runEngine: async (id, inputs) => {
      assert.equal(id, 'pinterest')
      assert.equal(inputs.query, 'cats')
      return {
        engineId: id, engineVersion: 1, durationMs: 3,
        outputs: { images: [
          { mimeType: 'image/png', base64: pixel },
          { mimeType: 'image/png', base64: pixel },
        ] },
      }
    },
  })

  assert.equal(result.ok, true, result.error)
  assert.equal(sent.length, 1, 'a single command execution must respect the configured message cap')
  assert.equal(sent[0].jid, '2348012345678@s.whatsapp.net')
  assert.equal(sent[0].payload.caption, 'Search results')
  assert.ok(Buffer.isBuffer(sent[0].payload.image))
})
