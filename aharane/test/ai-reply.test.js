import test from 'node:test'
import assert from 'node:assert/strict'
import { createAiReplyService } from '../src/ai-reply.js'

test('AI Reply stays disabled when Aharane has no Groq key', async () => {
  const service = createAiReplyService({ env: {}, fetchImpl: async () => { throw new Error('must not call') } })
  assert.deepEqual(service.availability(), { enabled: false, provider: null, model: null })
  assert.equal(service.environmentRows().find(row => row.key === 'GROQ_API_KEY').value, 'Not configured')
  await assert.rejects(
    service.generate({ message: 'Hello' }),
    error => error.status === 409
  )
})

test('AI Reply uses only the selected message, its explicit quote, tone and user instruction', async () => {
  let request
  const secret = 'groq-test-secret-never-return-this'
  const service = createAiReplyService({
    env: {
      GROQ_API_KEY: secret,
      GROQ_SMART_MODELS: 'openai/gpt-oss-test,openai/gpt-oss-fallback',
    },
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) }
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'Thanks for letting me know. I’ll check and get back to you.' } }] }),
      }
    },
  })

  assert.deepEqual(service.availability(), {
    enabled: true,
    provider: 'Groq',
    model: 'openai/gpt-oss-test',
  })
  assert.equal(JSON.stringify(service.availability()).includes(secret), false)
  assert.equal(JSON.stringify(service.environmentRows()).includes(secret), false)

  const reply = await service.generate({
    message: 'Can you review this today?',
    quotedMessage: 'I will send the draft this morning.',
    tone: 'Professional',
    instruction: 'Say I can review it after lunch.',
  })

  assert.match(reply, /Thanks for letting me know/)
  assert.equal(request.url, 'https://api.groq.com/openai/v1/chat/completions')
  assert.equal(request.options.headers.authorization, 'Bearer ' + secret)
  assert.equal(request.body.model, 'openai/gpt-oss-test')
  assert.equal(request.body.messages.length, 2)
  assert.equal(request.body.messages[1].role, 'user')
  const supplied = JSON.parse(request.body.messages[1].content.slice(request.body.messages[1].content.indexOf('{')))
  assert.deepEqual(supplied, {
    selectedMessage: 'Can you review this today?',
    explicitlyQuotedMessage: 'I will send the draft this morning.',
    requestedTone: 'Professional',
    userInstruction: 'Say I can review it after lunch.',
  })
  assert.equal(request.body.messages.some(row => row.content.includes('chat history')), false)
})

test('AI Reply validates oversized inputs and normalizes unsupported tones', async () => {
  let request
  const service = createAiReplyService({
    env: { GROQ_API_KEY: 'test-key' },
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body)
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'A natural answer.' } }] }) }
    },
  })
  await assert.rejects(
    service.generate({ message: 'x'.repeat(8001) }),
    error => error.status === 400
  )
  await service.generate({ message: 'Hi', tone: 'Invented tone' })
  const supplied = JSON.parse(request.messages[1].content.slice(request.messages[1].content.indexOf('{')))
  assert.equal(supplied.requestedTone, 'Natural')
})

test('AI Reply can be explicitly disabled even when a key is present', () => {
  const service = createAiReplyService({
    env: { AHARANE_AI_ENABLED: 'false', GROQ_API_KEY: 'test-key' },
  })
  assert.equal(service.availability().enabled, false)
})
