import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAiReplyMessages,
  createAiReplyDraft,
  resolveAiReplyConfig,
} from '../src/ai-reply.js'

test('AI Reply stays unavailable until an API key, model and valid endpoint exist', () => {
  assert.equal(resolveAiReplyConfig({}, {}).configured, false)
  assert.equal(resolveAiReplyConfig({ apiKey: 'secret' }, {}).configured, false)
  assert.equal(resolveAiReplyConfig({ apiKey: 'secret', model: 'example' }, {}).configured, true)
  assert.equal(resolveAiReplyConfig({ apiKey: 'secret', model: 'example', apiBaseUrl: 'http://example.com' }, {}).configured, false)
})

test('AI Reply prompt contains only the selected message and its directly quoted message', () => {
  const messages = buildAiReplyMessages({
    message: { text: 'Are you coming today?', senderName: 'Friend' },
    quotedMessage: { text: 'We should meet at 5.', senderName: 'You', direction: 'outgoing' },
    tone: 'Friendly',
    instructions: 'Keep it short.',
    chatHistory: [{ text: 'This older message must never be sent.' }],
    conversationId: 'private-secret-jid',
  })
  assert.equal(messages.length, 2)
  const prompt = JSON.stringify(messages)
  assert.match(prompt, /Are you coming today\?/)
  assert.match(prompt, /We should meet at 5\./)
  assert.match(prompt, /Friendly/)
  assert.match(prompt, /Keep it short\./)
  assert.doesNotMatch(prompt, /This older message must never be sent|private-secret-jid/)
  assert.match(messages[0].content, /Do not assume or request access to chat history/)
})

test('AI Reply sends one selected message and its optional quote to an OpenAI-compatible endpoint', async () => {
  const config = resolveAiReplyConfig({
    apiBaseUrl: 'https://provider.example/v1/',
    apiKey: 'private-api-key',
    model: 'reply-model',
  }, {})
  let capturedUrl = ''
  let capturedRequest
  const reply = await createAiReplyDraft({
    config,
    request: {
      message: { text: 'Thanks for checking in.', senderName: 'Alex' },
      tone: 'Empathetic',
    },
    fetchImpl: async (url, options) => {
      capturedUrl = url
      capturedRequest = JSON.parse(options.body)
      assert.equal(options.headers.Authorization, 'Bearer private-api-key')
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'I appreciate you asking.' } }] }),
      }
    },
  })
  assert.equal(capturedUrl, 'https://provider.example/v1/chat/completions')
  assert.equal(capturedRequest.model, 'reply-model')
  assert.equal(capturedRequest.messages.length, 2)
  assert.match(capturedRequest.messages[1].content, /Thanks for checking in\./)
  assert.equal(reply, 'I appreciate you asking.')
})

test('AI Reply rejects a missing selected message and never calls the provider', async () => {
  let called = false
  await assert.rejects(
    createAiReplyDraft({
      config: resolveAiReplyConfig({ apiKey: 'secret', model: 'model' }, {}),
      request: { message: { text: ' ' } },
      fetchImpl: async () => { called = true },
    }),
    /no text to reply to/,
  )
  assert.equal(called, false)
})
