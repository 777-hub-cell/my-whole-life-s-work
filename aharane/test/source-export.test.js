import test from 'node:test'
import assert from 'node:assert/strict'
import yauzl from 'yauzl'
import { createSourceZip } from '../src/source-export.js'

function readZip(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error)
      const entries = []
      zip.on('error', reject)
      zip.on('end', () => resolve(entries))
      zip.on('entry', entry => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError)
          const chunks = []
          stream.on('error', reject)
          stream.on('data', chunk => chunks.push(chunk))
          stream.on('end', () => {
            entries.push({ path: entry.fileName, content: Buffer.concat(chunks).toString('utf8') })
            zip.readEntry()
          })
        })
      })
      zip.readEntry()
    })
  })
}

test('source ZIP is a readable archive containing complete nested source files', async () => {
  const archive = createSourceZip([
    { path: 'package.json', content: '{"name":"aharane"}' },
    { path: 'src/index.js', content: 'console.log("Aharane")' },
    { path: 'private-commands/help.js', content: 'export default function help() {}' },
  ])
  assert.equal(archive.readUInt32LE(0), 0x04034b50)
  const entries = await readZip(archive)
  assert.deepEqual(entries, [
    { path: 'package.json', content: '{"name":"aharane"}' },
    { path: 'src/index.js', content: 'console.log("Aharane")' },
    { path: 'private-commands/help.js', content: 'export default function help() {}' },
  ])
})

test('source ZIP refuses hidden, traversal and absolute paths', () => {
  for (const path of ['../secret.txt', '/etc/passwd', 'src/../secret.js', 'src/.env']) {
    assert.throws(() => createSourceZip([{ path, content: 'nope' }]), /unsafe path/)
  }
})

test('source ZIP enforces its file-count and archive-size limits', () => {
  assert.throws(() => createSourceZip([]), /file count/)
  assert.throws(() => createSourceZip(Array.from({ length: 2001 }, (_, i) => ({ path: 'src/' + i + '.js', content: '' }))), /file count/)
  assert.throws(() => createSourceZip([{ path: 'src/large.js', content: Buffer.alloc(45 * 1024 * 1024 + 1) }]), /45 MB/)
})
