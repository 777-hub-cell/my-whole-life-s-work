const WRAPPER_KEYS = new Set([
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'documentWithCaptionMessage',
  'editedMessage',
  'audioStickerMessage',
])

const SAFE_FIELDS = new Set([
  'mimetype',
  'fileLength',
  'fileLengthBytes',
  'seconds',
  'ptt',
  'isAnimated',
  'gifPlayback',
  'width',
  'height',
  'fileName',
])

function isByteArray(value) {
  return Buffer.isBuffer(value) || value instanceof Uint8Array
}

function findQuotedMessage(root, seen = new Set(), depth = 0) {
  if (!root || typeof root !== 'object' || isByteArray(root) || seen.has(root) || depth > 10) return null
  seen.add(root)

  const context = root.contextInfo
  if (context?.quotedMessage && typeof context.quotedMessage === 'object') {
    return context.quotedMessage
  }

  for (const [key, value] of Object.entries(root)) {
    if (key === 'contextInfo' || !value || typeof value !== 'object' || isByteArray(value)) continue
    const found = findQuotedMessage(value, seen, depth + 1)
    if (found) return found
  }
  return null
}

function unwrapMessage(root) {
  let current = root
  const wrappers = []
  for (let i = 0; i < 8 && current && typeof current === 'object'; i += 1) {
    const wrapper = [...WRAPPER_KEYS].find(key => current[key]?.message)
    if (!wrapper) break
    wrappers.push(wrapper)
    current = current[wrapper].message
  }
  return { content: current, wrappers }
}

function describeValue(value) {
  if (value === null) return 'null'
  if (isByteArray(value)) return `<bytes:${value.byteLength}>`
  if (Array.isArray(value)) return `<array:${value.length}>`
  if (typeof value === 'object') return '<object>'
  if (typeof value === 'string') return JSON.stringify(value.length > 90 ? value.slice(0, 87) + '…' : value)
  return String(value)
}

function inspectStructure(root, maxLines = 55) {
  const lines = []
  const seen = new Set()
  const visit = (value, path, depth) => {
    if (!value || typeof value !== 'object' || isByteArray(value) || seen.has(value) || depth > 7 || lines.length >= maxLines) return
    seen.add(value)

    const keys = Object.keys(value)
    const label = path || 'message'
    lines.push(`${label}: ${keys.join(', ') || '(empty object)'}`)

    for (const key of keys) {
      if (SAFE_FIELDS.has(key)) {
        lines.push(`  ${label}.${key} = ${describeValue(value[key])}`)
      }
    }

    for (const [key, child] of Object.entries(value)) {
      if (lines.length >= maxLines) break
      if (child && typeof child === 'object' && !isByteArray(child)) {
        visit(child, `${label}.${key}`, depth + 1)
      }
    }
  }

  visit(root, 'message', 0)
  if (lines.length >= maxLines) lines.push('…output capped')
  return lines
}

export default {
  name: 'stickerinspect',
  aliases: ['soundstickerinspect', 'sinspect'],
  description: 'Inspect the raw structure of a replied-to WhatsApp sticker or sound sticker.',
  usage: '.stickerinspect (reply to a sticker)',
  async run(ctx) {
    if (ctx.isSupremeOwner !== true) {
      await ctx.reply('Only the verified NIGHT supreme owner can inspect raw WhatsApp message structures.')
      return
    }

    const current = ctx.message?.message
    const quoted = findQuotedMessage(current)
    const target = quoted || current
    if (!target) {
      await ctx.reply('Reply to the sticker with .stickerinspect so I can inspect its incoming message structure.')
      return
    }

    const { content, wrappers } = unwrapMessage(target)
    const keys = Object.keys(content || {})
    const hasSticker = keys.includes('stickerMessage') ||
      keys.includes('audioStickerMessage') ||
      keys.some(key => /sticker/i.test(key))
    const hasAudio = wrappers.includes('audioStickerMessage') ||
      keys.includes('audioMessage') ||
      keys.includes('audioStickerMessage') ||
      Boolean(content?.stickerMessage?.audioMessage)

    const report = [
      '🔬 NIGHT sticker message inspection',
      `Target: ${quoted ? 'quoted message' : 'current message (no quoted message found)'}`,
      `Wrapper chain: ${wrappers.length ? wrappers.join(' → ') : 'none'}`,
      `Top-level content keys: ${keys.join(', ') || '(none)'}`,
      `Sticker field detected: ${hasSticker ? 'YES' : 'NO'}`,
      `Audio field detected: ${hasAudio ? 'YES' : 'NO'}`,
      `Nested stickerMessage.audioMessage: ${content?.stickerMessage?.audioMessage ? 'YES' : 'NO'}`,
      `audioStickerMessage wrapper: ${wrappers.includes('audioStickerMessage') || content?.audioStickerMessage ? 'YES' : 'NO'}`,
      '',
      'STRUCTURE (sensitive URLs and binary media are not printed):',
      ...inspectStructure(content),
    ].join('\n')

    await ctx.reply(report.slice(0, 6500))
  },
}
