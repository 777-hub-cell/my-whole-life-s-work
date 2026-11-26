import assert from 'node:assert/strict'
import { proto } from '@itsliaaa/baileys'
import {
  attachSoundStickerMessageSecret,
  installSoundStickerCodec,
  registerPendingSoundSticker,
  scanProtobufFields,
} from './utils/sound-sticker-protocol.js'

installSoundStickerCodec()
const patchedEncoder = proto.Message.encode
installSoundStickerCodec()
assert.equal(proto.Message.encode, patchedEncoder, 'installing the codec twice must be harmless')

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

const audioBytes = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x01])
const unregister = registerPendingSoundSticker(stickerMessage, {
  audioBytes,
  emojis: '🔊',
  premium: 0,
})

try {
  const encoded = proto.Message.encode(message).finish()
  const outer = scanProtobufFields(encoded)
  const soundFields = outer.filter(field => field.fieldNum === 134 && field.wireType === 2)
  assert.equal(soundFields.length, 1, 'the outgoing message must contain one native audioStickerMessage envelope')
  assert.equal(outer.some(field => field.fieldNum === 26), false,
    'the sticker must be wrapped once, not duplicated beside the sound-sticker envelope')

  const futureProofFields = scanProtobufFields(soundFields[0].value)
  const wrappedMessage = futureProofFields.find(field => field.fieldNum === 1 && field.wireType === 2)
  assert.ok(wrappedMessage, 'audioStickerMessage must contain FutureProofMessage.message')

  const decodedOuter = proto.Message.decode(encoded)
  assert.deepEqual(Buffer.from(decodedOuter.messageContextInfo.messageSecret), secretFixture,
    'the 32-byte message secret must survive the sound-sticker wrapper')
  const innerMessageFields = scanProtobufFields(wrappedMessage.value)
  const nestedSticker = innerMessageFields.find(field => field.fieldNum === 26 && field.wireType === 2)
  assert.ok(nestedSticker, 'the inner message must contain StickerMessage')

  const stickerFields = scanProtobufFields(nestedSticker.value)
  const audioField = stickerFields.find(field => field.fieldNum === 26 && field.wireType === 2)
  const emojiField = stickerFields.find(field => field.fieldNum === 25 && field.wireType === 2)
  const premiumField = stickerFields.find(field => field.fieldNum === 24 && field.wireType === 0)
  assert.ok(audioField, 'the sticker payload must carry its linked AudioMessage bytes')
  assert.deepEqual(Buffer.from(audioField.value), audioBytes, 'sound bytes must not be lost during message encoding')
  assert.equal(emojiField?.value.toString('utf8'), '🔊')
  assert.equal(premiumField?.value, 0)
} finally {
  unregister()
}

const afterCleanup = proto.Message.encode(message).finish()
assert.equal(
  scanProtobufFields(afterCleanup).some(field => field.fieldNum === 134),
  false,
  'the pending audio attachment must be cleared after sending',
)

console.log('PASS native sound-sticker protobuf envelope, linked audio bytes, ordinary sticker compatibility and cleanup')
