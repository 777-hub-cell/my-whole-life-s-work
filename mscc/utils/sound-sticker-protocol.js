import { randomBytes } from 'node:crypto'
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

export function attachSoundStickerMessageSecret(message, secret = randomBytes(32)) {
  if (!message || typeof message !== 'object') {
    throw new Error('A WhatsApp message is required for a sound sticker.')
  }
  const bytes = Buffer.from(secret)
  if (bytes.length !== 32) {
    throw new Error('A sound-sticker message secret must contain exactly 32 bytes.')
  }
  message.messageContextInfo = {
    ...(message.messageContextInfo && typeof message.messageContextInfo === 'object'
      ? message.messageContextInfo
      : {}),
    messageSecret: bytes,
  }
  return message
}

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

/**
 * The sound clip is an embedded StickerMessage.audioMessage field (26).
 * Patch the StickerMessage encoder itself so the outgoing message remains a
 * normal top-level Message.stickerMessage; do not invent a field-134 wrapper.
 */
export function installSoundStickerCodec() {
  const stickerType = proto?.Message?.StickerMessage
  if (!stickerType?.encode || !proto?.Message?.AudioMessage?.encode) {
    throw new Error('This Baileys build cannot encode the required sound-sticker message fields.')
  }
  if (stickerType[CODEC_INSTALLED]) return

  const originalEncode = stickerType.encode
  stickerType.encode = function encodeWithSoundSticker(stickerMessage, writer) {
    const attachment = pendingAttachment(stickerMessage)
    if (!attachment) return originalEncode.call(this, stickerMessage, writer)

    const cleanSticker = cloneWithout(
      stickerMessage,
      new Set(['premium', 'emojis', 'audioMessage']),
    )
    const output = originalEncode.call(this, cleanSticker, writer)
    output.uint32((24 << 3) | 0).uint32(attachment.premium)
    if (attachment.emojis) {
      output.uint32((25 << 3) | 2).string(attachment.emojis)
    }
    output.uint32((26 << 3) | 2).bytes(attachment.audioBytes)
    return output
  }

  Object.defineProperty(stickerType, CODEC_INSTALLED, {
    value: true,
    enumerable: false,
  })
}

export async function sendSoundSticker(sock, chat, {
  stickerBuffer,
  audioBuffer,
  audioSeconds,
  audioWaveform,
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
  if (!(Buffer.isBuffer(audioWaveform) || audioWaveform instanceof Uint8Array) ||
      audioWaveform.byteLength !== 64 || [...audioWaveform].some(value => value > 100)) {
    throw new Error('The sound sticker requires a valid 64-bar audio waveform.')
  }

  installSoundStickerCodec()

  const userJid = sock.authState?.creds?.me?.id || sock.user?.id
  if (!userJid) throw new Error('The WhatsApp connection has no authenticated user identity.')

  // Prepare the embedded Opus clip as a voice-style AudioMessage. WhatsApp
  // uses ptt, seconds and a 64-byte waveform for sound-sticker playback.
  const durationSeconds = Math.max(1, Math.ceil(Number(audioSeconds) || 0))
  const waveform = Buffer.from(audioWaveform)
  const preparedAudio = await prepareWAMessageMedia({
    audio: audioBuffer,
    mimetype: 'audio/ogg; codecs=opus',
    ptt: true,
    seconds: durationSeconds,
    waveform,
  }, {
    upload: sock.waUploadToServer,
    logger: sock.logger,
    jid: chat,
  })

  if (!preparedAudio?.audioMessage) {
    throw new Error('WhatsApp did not prepare the sticker audio attachment.')
  }
  preparedAudio.audioMessage.ptt = true
  preparedAudio.audioMessage.seconds = durationSeconds
  preparedAudio.audioMessage.waveform = waveform
  if (preparedAudio.audioMessage.ptt !== true ||
      Number(preparedAudio.audioMessage.seconds) !== durationSeconds ||
      Buffer.from(preparedAudio.audioMessage.waveform || []).length !== 64) {
    throw new Error('WhatsApp audio preparation did not preserve sound-sticker voice metadata.')
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

  attachSoundStickerMessageSecret(fullMessage.message)
  stickerMessage.stickerSentTs = Date.now()

  const audioBytes = proto.Message.AudioMessage.encode(preparedAudio.audioMessage).finish()
  const unregister = registerPendingSoundSticker(stickerMessage, {
    audioBytes,
    emojis,
    premium: 0,
  })

  try {
    // One normal sticker message with its Opus clip embedded in
    // StickerMessage.audioMessage (field 26). No separate audio message.
    await sock.relayMessage(chat, fullMessage.message, {
      messageId: fullMessage.key?.id,
    })
  } finally {
    unregister()
  }

  return fullMessage
}
