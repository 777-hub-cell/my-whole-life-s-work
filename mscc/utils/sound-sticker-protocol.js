import {
  generateWAMessage,
  prepareWAMessageMedia,
  proto,
} from '@itsliaaa/baileys'

const CODEC_INSTALLED = Symbol.for('mscc.soundStickerCodecInstalled')
const PENDING_TTL_MS = 60_000
const MAX_PENDING = 32
const pendingByObject = new WeakMap()
const pendingByEncryptedHash = new Map()

/**
 * Small protobuf wire reader used by the focused self-test. It only returns
 * field numbers and raw values; it never decodes or logs media payloads.
 */
export function scanProtobufFields(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input || [])
  const fields = []
  let offset = 0

  const readVarint = () => {
    let value = 0
    let shift = 0
    for (let count = 0; offset < bytes.length && count < 10; count += 1) {
      const byte = bytes[offset++]
      value += (byte & 0x7f) * (2 ** shift)
      if ((byte & 0x80) === 0) return value
      shift += 7
    }
    throw new Error('Invalid protobuf varint in sound-sticker message.')
  }

  while (offset < bytes.length) {
    const start = offset
    const tag = readVarint()
    const fieldNum = Math.floor(tag / 8)
    const wireType = tag & 7
    if (!fieldNum) throw new Error('Invalid protobuf field number in sound-sticker message.')

    if (wireType === 0) {
      const value = readVarint()
      fields.push({ fieldNum, wireType, value, start, end: offset })
    } else if (wireType === 1) {
      if (offset + 8 > bytes.length) throw new Error('Truncated fixed64 protobuf field.')
      const value = bytes.subarray(offset, offset + 8)
      offset += 8
      fields.push({ fieldNum, wireType, value, start, end: offset })
    } else if (wireType === 2) {
      const length = readVarint()
      if (!Number.isSafeInteger(length) || length < 0 || offset + length > bytes.length) {
        throw new Error('Truncated length-delimited protobuf field.')
      }
      const value = bytes.subarray(offset, offset + length)
      offset += length
      fields.push({ fieldNum, wireType, value, start, end: offset })
    } else if (wireType === 5) {
      if (offset + 4 > bytes.length) throw new Error('Truncated fixed32 protobuf field.')
      const value = bytes.subarray(offset, offset + 4)
      offset += 4
      fields.push({ fieldNum, wireType, value, start, end: offset })
    } else {
      throw new Error(`Unsupported protobuf wire type ${wireType}.`)
    }
  }

  return fields
}

function cloneWithout(source, omitted) {
  const clone = Object.create(Object.getPrototypeOf(source) || Object.prototype)
  for (const key of Object.keys(source || {})) {
    if (!omitted.has(key)) clone[key] = source[key]
  }
  return clone
}

function encryptedHash(stickerMessage) {
  const value = stickerMessage?.fileEncSha256
  if (!value || (!Buffer.isBuffer(value) && !(value instanceof Uint8Array))) return ''
  return Buffer.from(value).toString('hex')
}

function prunePending() {
  const now = Date.now()
  for (const [key, entry] of pendingByEncryptedHash) {
    if (now - entry.createdAt > PENDING_TTL_MS) pendingByEncryptedHash.delete(key)
  }
  while (pendingByEncryptedHash.size > MAX_PENDING) {
    const oldest = pendingByEncryptedHash.keys().next().value
    pendingByEncryptedHash.delete(oldest)
  }
}

export function registerPendingSoundSticker(stickerMessage, {
  audioBytes,
  emojis = '🔊',
  premium = 0,
} = {}) {
  if (!stickerMessage || typeof stickerMessage !== 'object') {
    throw new Error('A prepared sticker message is required.')
  }
  if (!audioBytes || !audioBytes.length) {
    throw new Error('The encoded sticker audio payload is empty.')
  }

  const entry = {
    audioBytes: Buffer.isBuffer(audioBytes) ? audioBytes : Buffer.from(audioBytes),
    emojis: String(emojis || '🔊'),
    premium: Number.isInteger(premium) && premium >= 0 ? premium : 0,
    createdAt: Date.now(),
  }

  pendingByObject.set(stickerMessage, entry)
  const hash = encryptedHash(stickerMessage)
  if (hash) {
    prunePending()
    pendingByEncryptedHash.set(hash, entry)
  }

  return () => {
    if (pendingByObject.get(stickerMessage) === entry) pendingByObject.delete(stickerMessage)
    if (hash && pendingByEncryptedHash.get(hash) === entry) pendingByEncryptedHash.delete(hash)
  }
}

function pendingAttachment(stickerMessage) {
  if (!stickerMessage || typeof stickerMessage !== 'object') return null
  const direct = pendingByObject.get(stickerMessage)
  if (direct) return direct

  const hash = encryptedHash(stickerMessage)
  if (!hash) return null
  const cached = pendingByEncryptedHash.get(hash)
  if (!cached) return null
  if (Date.now() - cached.createdAt > PENDING_TTL_MS) {
    pendingByEncryptedHash.delete(hash)
    return null
  }
  return cached
}

function writeStickerWithAudio(writer, stickerMessage, attachment) {
  // Message.stickerMessage = field 26; StickerMessage's new sound fields are
  // fields 24 (premium), 25 (emoji), and 26 (AudioMessage).
  writer.uint32((26 << 3) | 2).fork()

  const cleanSticker = cloneWithout(
    stickerMessage,
    new Set(['premium', 'emojis', 'audioMessage']),
  )
  proto.Message.StickerMessage.encode(cleanSticker, writer)

  writer.uint32((24 << 3) | 0).uint32(attachment.premium)
  if (attachment.emojis) {
    writer.uint32((25 << 3) | 2).string(attachment.emojis)
  }
  writer.uint32((26 << 3) | 2).bytes(attachment.audioBytes)
  writer.ldelim()
}

/**
 * Baileys 0.3.18-final predates the WhatsApp sound-sticker envelope.
 * Add field 134 at encode time without editing node_modules or emitting a
 * separate audio/voice-note message.
 */
export function installSoundStickerCodec() {
  const messageType = proto?.Message
  if (!messageType?.encode || !messageType?.StickerMessage?.encode || !messageType?.AudioMessage?.encode) {
    throw new Error('This Baileys build cannot encode the required sound-sticker message fields.')
  }
  if (messageType[CODEC_INSTALLED]) return

  const originalEncode = messageType.encode
  messageType.encode = function encodeWithSoundSticker(message, writer) {
    const attachment = pendingAttachment(message?.stickerMessage)
    if (!attachment) return originalEncode.call(this, message, writer)

    // Keep ordinary Message metadata on the outer object, then wrap the
    // prepared sticker as FutureProofMessage.message (field 134 -> field 1).
    const outer = cloneWithout(message, new Set(['stickerMessage', 'audioStickerMessage']))
    const output = originalEncode.call(this, outer, writer)

    output.uint32((134 << 3) | 2).fork()
    output.uint32((1 << 3) | 2).fork()
    writeStickerWithAudio(output, message.stickerMessage, attachment)
    output.ldelim()
    output.ldelim()
    return output
  }

  Object.defineProperty(messageType, CODEC_INSTALLED, {
    value: true,
    enumerable: false,
  })
}

export async function sendSoundSticker(sock, chat, {
  stickerBuffer,
  audioBuffer,
  audioSeconds,
  quoted,
  emojis = '🔊',
} = {}) {
  if (!sock || typeof sock.relayMessage !== 'function' || typeof sock.waUploadToServer !== 'function') {
    throw new Error('The connected WhatsApp account cannot send sound stickers.')
  }
  if (!chat) throw new Error('The target WhatsApp chat is missing.')
  if (!Buffer.isBuffer(stickerBuffer) || !stickerBuffer.length) {
    throw new Error('The animated sticker payload is empty.')
  }
  if (!Buffer.isBuffer(audioBuffer) || !audioBuffer.length) {
    throw new Error('The sticker audio payload is empty.')
  }

  installSoundStickerCodec()

  const userJid = sock.authState?.creds?.me?.id || sock.user?.id
  if (!userJid) throw new Error('The WhatsApp connection has no authenticated user identity.')

  // Upload the soundtrack as an ordinary Opus media attachment. It is only
  // embedded in StickerMessage below; ptt is deliberately false.
  const preparedAudio = await prepareWAMessageMedia({
    audio: audioBuffer,
    mimetype: 'audio/ogg; codecs=opus',
    ptt: false,
    ...(Number.isFinite(audioSeconds) && audioSeconds > 0
      ? { seconds: Math.max(1, Math.ceil(audioSeconds)) }
      : {}),
  }, {
    upload: sock.waUploadToServer,
    logger: sock.logger,
    jid: chat,
  })

  if (!preparedAudio?.audioMessage) {
    throw new Error('WhatsApp did not prepare the sticker audio attachment.')
  }

  const fullMessage = await generateWAMessage(chat, {
    sticker: stickerBuffer,
    mimetype: 'image/webp',
    isAnimated: true,
    width: 512,
    height: 512,
  }, {
    userJid,
    upload: sock.waUploadToServer,
    logger: sock.logger,
    quoted,
  })

  const stickerMessage = fullMessage?.message?.stickerMessage
  if (!stickerMessage) {
    throw new Error('WhatsApp did not prepare the animated sticker.')
  }

  const audioBytes = proto.Message.AudioMessage.encode(preparedAudio.audioMessage).finish()
  const unregister = registerPendingSoundSticker(stickerMessage, {
    audioBytes,
    emojis,
    premium: 0,
  })

  try {
    // One protocol message: the sticker and its Opus soundtrack are linked
    // inside audioStickerMessage (field 134). Never send a second audio/PTT.
    await sock.relayMessage(chat, fullMessage.message, {
      messageId: fullMessage.key?.id,
    })
  } finally {
    unregister()
  }

  return fullMessage
}
