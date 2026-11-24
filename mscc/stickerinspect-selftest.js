import assert from 'node:assert/strict'
import command from './commands/general/stickerinspect.js'
import { dispatchCommand } from './command-registry.js'

assert.equal(command.name, 'stickerinspect')
assert.equal(command.hidden, true)
assert.notEqual(command.ownerOnly, true)
assert.notEqual(command.publicOwnerOnly, true)

const replies = []
const privateUrl = 'https://example.invalid/private-media'
const quotedSticker = {
  stickerMessage: {
    mimetype: 'image/webp',
    fileLength: 4096,
    fileName: 'sticker.webp',
    url: privateUrl,
    directPath: '/private/media/path',
  },
}
const registry = {
  commands: new Map([['stickerinspect', command]]),
  canonical: [command],
}
const context = {
  publicCommandsEnabled: true,
  isPublicOwner: false,
  isSessionOwner: false,
  isSupremeOwner: false,
  message: {
    message: {
      extendedTextMessage: {
        text: '.stickerinspect',
        contextInfo: { quotedMessage: quotedSticker },
      },
    },
  },
  reply: async value => { replies.push(String(value)); return value },
}

assert.equal(
  await dispatchCommand(registry, '.stickerinspect', context, { scope: 'public' }),
  true,
  'a normal public sender must be allowed to run the hidden diagnostic',
)
assert.ok(replies.length >= 1, 'the inspection log must be sent to the WhatsApp chat')
const report = replies.join('\n')
assert.match(report, /NIGHT sticker message inspection/)
assert.match(report, /quoted message/)
assert.match(report, /stickerMessage/)
assert.match(report, /image\/webp/)
assert.match(report, /4096/)
assert.doesNotMatch(report, /example\.invalid/)
assert.doesNotMatch(report, /private\/media\/path/)

console.log('Sticker inspector public access and in-chat report: PASS')
