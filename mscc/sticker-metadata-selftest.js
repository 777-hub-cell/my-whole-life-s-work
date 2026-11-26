import assert from 'node:assert/strict'
import {
  DEFAULT_STICKER_PACK_NAME,
  DEFAULT_STICKER_PUBLISHER,
  applyStickerMetadata,
  buildStickerExif,
  readStickerMetadata,
  stickerMetadata,
  stickerPackNameForCommand,
  stickerPackNameFromCommandArgs,
} from './utils/sticker-metadata.js'
import { takeStickerPackName } from './commands/media/take.js'

assert.equal(DEFAULT_STICKER_PACK_NAME, 'MSCC')
assert.equal(DEFAULT_STICKER_PUBLISHER, '『N I G H T』')
assert.equal(DEFAULT_STICKER_PUBLISHER.includes('༺'), false)
assert.equal(DEFAULT_STICKER_PUBLISHER.includes('༻'), false)
assert.equal(stickerPackNameForCommand({ message:{ pushName:'Patrick' }, userKey:'234000000000' }), 'Patrick')
assert.equal(stickerPackNameForCommand({ rawArgs:'My Favourite Pack', message:{ pushName:'Patrick' } }), 'Patrick')
assert.equal(stickerPackNameFromCommandArgs({ rawArgs:'My Favourite Pack', message:{ pushName:'Patrick' } }), 'My Favourite Pack')
assert.equal(stickerPackNameFromCommandArgs({ args:['Night', 'Collection'], message:{ pushName:'Patrick' } }), 'Night Collection')
assert.equal(stickerPackNameFromCommandArgs({ rawArgs:'  My ' + String.fromCharCode(10) + '  Pack  ', message:{ pushName:'Patrick' } }), 'My Pack')
assert.equal(stickerPackNameFromCommandArgs({ rawArgs:'   ', args:[], message:{ pushName:'Patrick' } }), 'Patrick')
assert.equal(stickerPackNameFromCommandArgs({ rawArgs:'✨'.repeat(129) }).length, 128)
assert.equal(stickerPackNameForCommand({ message:{}, userKey:'234000000000' }), '234000000000')

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
}
const soundExif = buildStickerExif(soundMetadata)
assert.equal(soundExif.subarray(0, 2).toString('ascii'), 'II',
  'sound stickers must use the same WhatsApp little-endian EXIF marker as ordinary stickers')
const soundLength = soundExif.readUInt32LE(14)
assert.equal(soundExif.readUInt32LE(18), 22,
  'the TIFF data pointer must address the JSON immediately after the 22-byte header')
const soundDecoded = JSON.parse(soundExif.subarray(22, 22 + soundLength).toString('utf8'))
assert.equal(soundDecoded['sound-sha256'], undefined,
  'unknown custom fields must not be inserted into WhatsApp sticker EXIF')
assert.deepEqual(soundDecoded.emojis, ['🔊'])

const soundWebp = await applyStickerMetadata(webp, soundMetadata)
const reloadedSoundMetadata = await readStickerMetadata(soundWebp)
assert.equal(reloadedSoundMetadata?.['sticker-pack-name'], 'NIGHT Sound')
assert.equal(reloadedSoundMetadata?.['sound-sha256'], undefined)

console.log('sticker metadata self-test passed')
