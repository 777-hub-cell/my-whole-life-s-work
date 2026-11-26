import assert from 'node:assert/strict'
import {
  DEFAULT_STICKER_PACK_NAME,
  DEFAULT_STICKER_PUBLISHER,
  applyStickerMetadata,
  buildStickerExif,
  readStickerMetadata,
  stickerMetadata,
  stickerPackNameForCommand,
} from './utils/sticker-metadata.js'
import { takeStickerPackName } from './commands/media/take.js'

assert.equal(DEFAULT_STICKER_PACK_NAME, 'MSCC')
assert.equal(DEFAULT_STICKER_PUBLISHER, '『N I G H T』')
assert.equal(DEFAULT_STICKER_PUBLISHER.includes('༺'), false)
assert.equal(DEFAULT_STICKER_PUBLISHER.includes('༻'), false)
assert.equal(stickerPackNameForCommand({ message:{ pushName:'Patrick' }, userKey:'234000000000' }), 'Patrick')
assert.equal(stickerPackNameForCommand({ message:{}, userKey:'234000000000' }), '234000000000')
assert.equal(stickerPackNameForCommand({
  rawArgs: 'My Favourite Pack',
  senderName: 'Original Author',
}), 'My Favourite Pack', 'text after .sticker/.s sets the pack name')
assert.equal(stickerPackNameForCommand({
  args: ['My', 'Favourite', 'Pack'],
  senderName: 'Original Author',
}), 'My Favourite Pack', 'command arguments are joined into one pack name')
assert.equal(stickerPackNameForCommand({
  rawArgs: '  Night   Collection  ',
  message: { pushName: 'Original Author' },
}), 'Night Collection', 'spaces are normalized but words are retained')
assert.equal(stickerPackNameForCommand({
  rawArgs: '  ',
  message: { pushName: 'Original Author' },
}), 'Original Author', 'empty command text keeps the sender as default')
assert.equal(stickerPackNameForCommand({ rawArgs: 'N'.repeat(140) }).length, 128)

const inside = DEFAULT_STICKER_PUBLISHER.slice(1, -1)
assert.equal(inside, 'N I G H T')
const separators = [...inside].filter(ch => ch === ' ')
assert.equal(separators.length, 4)
assert.equal(' '.codePointAt(0), 0x2002)

const metadata = stickerMetadata({
  packName: 'Teletubis',
  packId: 'test-pack-id',
  emojis: ['🙂'],
})
assert.deepEqual(metadata, {
  'sticker-pack-id': 'test-pack-id',
  'sticker-pack-name': 'Teletubis',
  'sticker-pack-publisher': '『N I G H T』',
  emojis: ['🙂'],
})

const exif = buildStickerExif({
  packName: 'Filename Pack',
  packId: 'fixture-id',
  emojis: ['🖼️'],
})
const jsonLength = exif.readUIntLE(14, 4)
const decoded = JSON.parse(exif.subarray(22, 22 + jsonLength).toString('utf8'))
assert.equal(decoded['sticker-pack-name'], 'Filename Pack')
assert.equal(decoded['sticker-pack-publisher'], '『N I G H T』')
assert.deepEqual(decoded.emojis, ['🖼️'])

// .take must change the name the sender can see, not just return the same
// sticker or silently substitute a phone number/LID for missing profile data.
assert.equal(takeStickerPackName({ message:{ pushName:'𝙏𝞗𝞛𝞢𝞦' } }), '𝙏𝞗𝞛𝞢𝞦')
assert.equal(takeStickerPackName({ message:{ pushName:'Old' }, rawArgs:'My New Pack' }), 'My New Pack')
assert.equal(takeStickerPackName({ message:{ pushName:'Old' }, args:['New','Pack'] }), 'New Pack')
assert.equal(takeStickerPackName({ message:{ pushName:'Old' }, rawArgs:'Pack\nName' }), 'Pack Name')
assert.throws(() => takeStickerPackName({ userKey:'jid:123456@lid', message:{} }), /profile name/)
assert.equal(takeStickerPackName({ rawArgs:'✨'.repeat(129) }).length, 128)

// Tiny valid lossless-independent 1x1 VP8 WebP. Exercise actual encode, save,
// reload and overwrite: checking EXIF options alone misses .take no-op bugs.
const webp = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64')
assert.equal(await readStickerMetadata(webp), null)
const original = await applyStickerMetadata(webp, { packName:'Original Owner' })
const originalTag = await readStickerMetadata(original)
assert.equal(originalTag['sticker-pack-name'], 'Original Owner')
const renamed = await applyStickerMetadata(original, { packName:'𝙏𝞗𝞛𝞢𝞦' })
const renamedTag = await readStickerMetadata(renamed)
assert.equal(renamedTag['sticker-pack-name'], '𝙏𝞗𝞛𝞢𝞦')
assert.equal(renamedTag['sticker-pack-publisher'], DEFAULT_STICKER_PUBLISHER)
assert.notEqual(renamedTag['sticker-pack-id'], originalTag['sticker-pack-id'], 'avoid stale pack identity')
assert.deepEqual(renamedTag.emojis, ['✨'])

const soundMetadata = {
  packName: 'NIGHT Sound',
  packId: 'sound-fixture',
  emojis: ['🔊'],
  soundSha256: 'c29tZS1hdWRpby1oYXNo',
}
const soundExif = buildStickerExif(soundMetadata)
assert.equal(soundExif.subarray(0, 2).toString('ascii'), 'MM',
  'sound sticker EXIF must use the WhatsApp big-endian TIFF marker')
const soundLength = soundExif.readUInt32BE(14)
assert.equal(soundExif.readUInt32BE(18), 26,
  'sound sticker EXIF must point to JSON at byte 26')
const soundDecoded = JSON.parse(soundExif.subarray(26, 26 + soundLength).toString('utf8'))
assert.equal(soundDecoded['sound-sha256'], soundMetadata.soundSha256)
assert.deepEqual(soundDecoded.emojis, ['🔊'])

const soundWebp = await applyStickerMetadata(webp, soundMetadata)
const reloadedSoundMetadata = await readStickerMetadata(soundWebp)
assert.equal(reloadedSoundMetadata?.['sound-sha256'], soundMetadata.soundSha256,
  'saved WebP must retain the Opus digest that binds its audio')
assert.equal(reloadedSoundMetadata?.['sticker-pack-name'], 'NIGHT Sound')

console.log('sticker metadata self-test passed')
