import assert from 'node:assert/strict'
import { proto } from '@itsliaaa/baileys'
import {
  attachSoundStickerMessageSecret,
  installSoundStickerCodec,
  registerPendingSoundSticker,
  scanProtobufFields,
} from './utils/sound-sticker-protocol.js'

installSoundStickerCodec()
const patchedEncoder = proto.Message.StickerMessage.encode
installSoundStickerCodec()
assert.equal(proto.Message.StickerMessage.encode, patchedEncoder,
  'installing the codec twice must be harmless')

const stickerMessage = proto.Message.StickerMessage.create({
  mimetype: 'image/webp',
  isAnimated: true,
  width: 512,
  height: 512,
})
const secretFixture = Buffer.alloc(32, 0x5a)
const secretContext = attachSoundStickerMessageSecret({}, secretFixture)
assert.deepEqual(Buffer.from(secretContext.messageContextInfo.messageSecret), secretFixture)
const message = proto.Message.create({
  stickerMessage,
  messageContextInfo: secretContext.messageContextInfo,
})

const plainBytes = proto.Message.encode(message).finish()
assert.equal(
  scanProtobufFields(plainBytes).some(field => field.fieldNum === 134),
  false,
  'ordinary stickers must remain ordinary sticker messages',
)

const waveform = Buffer.alloc(64, 42)
const audioFixture = proto.Message.AudioMessage.create({
  mimetype: 'audio/ogg; codecs=opus',
  ptt: true,
  seconds: 2,
  waveform,
})
const audioBytes = proto.Message.AudioMessage.encode(audioFixture).finish()
const unregister = registerPendingSoundSticker(stickerMessage, {
  audioBytes,
  emojis: '🔊',
  premium: 0,
})

try {
  const encoded = proto.Message.encode(message).finish()
  const outer = scanProtobufFields(encoded)
  const stickerFields = outer.filter(field => field.fieldNum === 26 && field.wireType === 2)
  assert.equal(stickerFields.length, 1, 'the outgoing message must remain one normal top-level sticker message')
  assert.equal(outer.some(field => field.fieldNum === 134), false,
    'do not use the separate, undocumented audioStickerMessage wrapper')

  const decodedOuter = proto.Message.decode(encoded)
  assert.deepEqual(Buffer.from(decodedOuter.messageContextInfo.messageSecret), secretFixture,
    'the 32-byte message secret must survive normal sticker encoding')

  const stickerPayload = scanProtobufFields(stickerFields[0].value)
  const audioField = stickerPayload.find(field => field.fieldNum === 26 && field.wireType === 2)
  const emojiField = stickerPayload.find(field => field.fieldNum === 25 && field.wireType === 2)
  const premiumField = stickerPayload.find(field => field.fieldNum === 24 && field.wireType === 0)
  assert.ok(audioField, 'StickerMessage must directly contain its audioMessage field 26')
  assert.deepEqual(Buffer.from(audioField.value), audioBytes, 'embedded audio bytes must be intact')
  assert.equal(emojiField?.value.toString('utf8'), '🔊')
  assert.equal(premiumField?.value, 0)

  const decodedAudio = proto.Message.AudioMessage.decode(audioField.value)
  assert.equal(decodedAudio.ptt, true)
  assert.equal(Number(decodedAudio.seconds), 2)
  assert.equal(Buffer.from(decodedAudio.waveform).length, 64)
  assert.deepEqual(Buffer.from(decodedAudio.waveform), waveform)
} finally {
  unregister()
}

const afterCleanup = proto.Message.encode(message).finish()
const afterCleanupFields = scanProtobufFields(afterCleanup)
assert.equal(afterCleanupFields.some(field => field.fieldNum === 134), false)
assert.equal(afterCleanupFields.filter(field => field.fieldNum === 26 && field.wireType === 2).length, 1,
  'cleaning up the pending attachment must retain an ordinary sticker message')

console.log('PASS native sound-sticker protobuf envelope, linked audio bytes, ordinary sticker compatibility and cleanup')
