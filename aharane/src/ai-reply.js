const ALLOWED_TONES = new Set([
  'Casual', 'Friendly', 'Professional', 'Formal', 'Empathetic', 'Concise',
])
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

function cleanText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function validBaseUrl(value) {
  try {
    const url = new URL(value)
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    return (url.protocol === 'https:' || localHttp) &&
      !url.username && !url.password && !url.search && !url.hash
  } catch {
    return false
  }
}

export function resolveAiReplyConfig(settings = {}, env = process.env) {
  const apiKey = settings.disableEnvironmentKey === true
    ? ''
    : cleanText(settings.apiKey || env.AI_API_KEY || env.OPENAI_API_KEY, 4096)
  const model = cleanText(settings.model || env.AI_MODEL || env.OPENAI_MODEL, 160)
  const apiBaseUrl = cleanText(
    settings.apiBaseUrl || env.AI_API_BASE_URL || env.OPENAI_BASE_URL || DEFAULT_BASE_URL,
    500,
  ).replace(/\/+$/, '')
  return {
    apiKey,
    model,
    apiBaseUrl,
    configured: Boolean(apiKey && model && validBaseUrl(apiBaseUrl)),
  }
}

export function buildAiReplyMessages(request = {}) {
  const selected = request.message && typeof request.message === 'object' ? request.message : {}
  const selectedText = cleanText(selected.text, 8000)
  if (!selectedText) throw Object.assign(new Error('The selected message has no text to reply to.'), { statusCode: 400 })

  const quoted = request.quotedMessage && typeof request.quotedMessage === 'object'
    ? request.quotedMessage
    : null
  const quotedText = quoted ? cleanText(quoted.text, 8000) : ''
  const selectedSender = cleanText(selected.senderName, 80)
  const quotedSender = cleanText(quoted?.senderName, 80)
  const tone = ALLOWED_TONES.has(request.tone) ? request.tone : 'Casual'
  const instructions = cleanText(request.instructions, 1200)

  const context = []
  if (quotedText) {
    context.push(
      'Message explicitly quoted by the selected message:',
      quotedSender ? `${quotedSender}: ${quotedText}` : quotedText,
    )
  }
  context.push(
    'Selected incoming message to reply to:',
    selectedSender ? `${selectedSender}: ${selectedText}` : selectedText,
    `Preferred tone: ${tone}`,
  )
  if (instructions) context.push(`User instructions: ${instructions}`)

  return [
    {
      role: 'system',
      content: [
        'Write one natural text reply to the selected incoming WhatsApp message.',
        'Use only the selected message and, when supplied, the single message explicitly quoted by it.',
        'Do not assume or request access to chat history, other messages, contacts, or other conversations.',
        'Do not invent facts or claim to have seen earlier messages.',
        'Return only the reply text, without a heading, explanation, or quotation marks around the whole reply.',
        'Do not send the reply. This is an editable draft for the user.',
      ].join(' '),
    },
    { role: 'user', content: context.join('\n') },
  ]
}

export async function createAiReplyDraft({
  config,
  request,
  fetchImpl = globalThis.fetch,
}) {
  if (!config?.configured || !config.apiKey || !config.model || !validBaseUrl(config.apiBaseUrl)) {
    throw Object.assign(new Error('AI Reply is not configured. Add an API key and model in ENV first.'), { statusCode: 503 })
  }
  if (typeof fetchImpl !== 'function') {
    throw Object.assign(new Error('This server cannot reach the configured AI provider.'), { statusCode: 503 })
  }

  const messages = buildAiReplyMessages(request)
  const base = config.apiBaseUrl.replace(/\/+$/, '')
  const endpoint = /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`
  let response
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.7,
        max_tokens: 400,
      }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw Object.assign(new Error('Could not reach the configured AI provider. Check the ENV endpoint and try again.'), { statusCode: 502 })
  }

  if (!response?.ok) {
    throw Object.assign(
      new Error(`The AI provider rejected the request (HTTP ${Number(response?.status) || 502}). Check the provider settings in ENV.`),
      { statusCode: 502 },
    )
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw Object.assign(new Error('The AI provider returned an unreadable response.'), { statusCode: 502 })
  }
  const content = payload?.choices?.[0]?.message?.content
  const reply = typeof content === 'string'
    ? content.trim()
    : Array.isArray(content)
      ? content.map(part => typeof part?.text === 'string' ? part.text : '').join('').trim()
      : ''
  if (!reply) {
    throw Object.assign(new Error('The AI provider did not return a reply draft.'), { statusCode: 502 })
  }
  return reply.slice(0, 8000)
}
