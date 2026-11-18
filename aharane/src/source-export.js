import { deflateRawSync } from 'node:zlib'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let value = n
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1)
    table[n] = value >>> 0
  }
  return table
})()

function crc32(buffer) {
  let value = 0xffffffff
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

function zipDateTime(date = new Date()) {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()))
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

export function createSourceZip(files) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 2000) throw new Error('The source ZIP has an invalid file count.')
  const localParts = []
  const centralParts = []
  const stamp = zipDateTime()
  let offset = 0
  let totalBytes = 0

  for (const file of files) {
    const name = String(file?.path || '')
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.'))) {
      throw new Error('The source ZIP contains an unsafe path.')
    }
    const nameBytes = Buffer.from(name, 'utf8')
    if (nameBytes.length > 1024) throw new Error('A source ZIP path is too long.')
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content ?? '')
    totalBytes += content.length
    if (totalBytes > 45 * 1024 * 1024) throw new Error('The source ZIP exceeds the 45 MB limit.')
    const compressed = deflateRawSync(content, { level: 6 })
    const checksum = crc32(content)
    if (compressed.length > 0xffffffff || content.length > 0xffffffff || offset > 0xffffffff) throw new Error('The source ZIP is too large.')

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(stamp.time, 10)
    local.writeUInt16LE(stamp.date, 12)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    localParts.push(local, nameBytes, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(stamp.time, 12)
    central.writeUInt16LE(stamp.date, 14)
    central.writeUInt32LE(checksum, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, nameBytes)
    offset += local.length + nameBytes.length + compressed.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  if (offset + centralDirectory.length + 22 > 0xffffffff) throw new Error('The source ZIP exceeds the ZIP format size limit.')
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...localParts, centralDirectory, end])
}
