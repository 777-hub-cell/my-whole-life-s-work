import { createWriteStream } from 'node:fs'
import { mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import yauzl from 'yauzl'

export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024
export const MAX_UNCOMPRESSED_BYTES = 160 * 1024 * 1024
export const MAX_ARCHIVE_ENTRIES = 1500
const MAX_SINGLE_FILE_BYTES = 32 * 1024 * 1024
const MAX_MANIFEST_BYTES = 16 * 1024

const RESERVED_SEGMENTS = new Set([
  '.git', '.github', 'node_modules', 'whatsapp-auth', 'whatsapp-auth-private',
  'whatsapp-auth-backups', 'data', 'storage', 'backups', 'logs', 'uploads',
  'tmp', '.ssh',
])

function fail(message) {
  throw new Error(message)
}

export function normalizeUpdatePath(fileName) {
  if (typeof fileName !== 'string' || !fileName || fileName.includes('\\') || fileName.startsWith('/')) {
    fail('The ZIP contains an invalid file path.')
  }
  const directory = fileName.endsWith('/')
  const withoutTrailingSlash = directory ? fileName.slice(0, -1) : fileName
  const segments = withoutTrailingSlash.split('/')
  if (!withoutTrailingSlash || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    fail('The ZIP contains an unsafe file path.')
  }
  if (/^[A-Za-z]:/.test(segments[0]) || segments.some(segment => /[\\\u0000-\u001f]/.test(segment))) {
    fail('The ZIP contains an unsafe file path.')
  }
  if (segments.some(segment => RESERVED_SEGMENTS.has(segment.toLowerCase()))) {
    fail('The ZIP contains a protected runtime or persistent-data directory.')
  }
  const base = segments.at(-1).toLowerCase()
  if (
    (base.startsWith('.env') && base !== '.env.example') ||
    base === '.npmrc' ||
    base === 'authorized_keys' ||
    base === 'id_rsa' ||
    /\.(?:pem|key|p12|pfx|sqlite|sqlite3|db)$/i.test(base) ||
    ['install-azure.sh', 'deploy-azure-ssh.sh'].includes(base)
  ) {
    fail('The ZIP contains a protected configuration, credential, or deployment file.')
  }
  return { path: segments.join('/'), directory }
}

export function validateUpdateManifest(manifest, packageJson) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    fail('The ZIP must contain a valid root-level aharane-update.json file.')
  }
  if (manifest.package_type !== 'aharane-bot-update' || manifest.target !== 'aharane') {
    fail('This ZIP is not marked as an Aharane bot update.')
  }
  if (manifest.format_version !== 1) {
    fail('This Aharane update package format is not supported.')
  }
  if (typeof manifest.bot_version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(manifest.bot_version)) {
    fail('The update manifest must declare a valid bot_version.')
  }
  if (!packageJson || packageJson.name !== 'aharane-whatsapp-bot' || packageJson.private !== true) {
    fail('The ZIP must contain Aharane’s private package.json at its root.')
  }
  if (packageJson.version !== manifest.bot_version) {
    fail('The manifest bot_version must match package.json version.')
  }
  if (typeof packageJson.engines?.node !== 'string' || !/(?:^|\s|>)>=\s*24(?:\.0(?:\.0)?)?(?:\s|$)/.test(packageJson.engines.node)) {
    fail('The update must require Node.js 24 or newer.')
  }
  if (packageJson.dependencies?.['@whiskeysockets/baileys'] !== '7.0.0-rc14') {
    fail('The update must keep the reviewed official @whiskeysockets/baileys version 7.0.0-rc14.')
  }
  if (packageJson.dependencies?.['@itsliaaa/baileys'] || packageJson.devDependencies?.['@itsliaaa/baileys']) {
    fail('The unverified third-party Baileys fork is not allowed in Aharane updates.')
  }
  return {
    package_type: manifest.package_type,
    target: manifest.target,
    format_version: manifest.format_version,
    bot_version: manifest.bot_version,
  }
}

function openZip(zipPath) {
  return yauzl.openPromise(zipPath, {
    lazyEntries: true,
    autoClose: true,
    decodeStrings: true,
    strictFileNames: true,
    validateEntrySizes: true,
  })
}

async function readStreamLimited(stream, maxBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of stream) {
    size += chunk.length
    if (size > maxBytes) fail('The ZIP manifest is too large.')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, size)
}

function rejectSpecialFile(entry) {
  // Unix file type bits are present when the ZIP creator platform is Unix (3).
  if ((entry.versionMadeBy & 0xff) !== 3) return
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff
  const type = mode & 0o170000
  if (type !== 0 && type !== 0o100000 && type !== 0o040000) {
    fail('The ZIP contains a link or special filesystem entry; only normal files and directories are allowed.')
  }
}

export async function inspectUpdateArchive(zipPath) {
  const archiveStat = await stat(zipPath)
  if (!archiveStat.isFile() || archiveStat.size < 22 || archiveStat.size > MAX_ARCHIVE_BYTES) {
    fail('The ZIP must be a valid file no larger than 50 MB.')
  }

  const zip = await openZip(zipPath)
  const paths = new Set()
  const files = []
  let manifestBuffer = null
  let packageBuffer = null
  let totalUncompressedBytes = 0

  try {
    if (zip.entryCount > MAX_ARCHIVE_ENTRIES) fail('The ZIP contains too many entries.')
    for await (const entry of zip.eachEntry()) {
      const normalized = normalizeUpdatePath(entry.fileName)
      rejectSpecialFile(entry)
      if (entry.generalPurposeBitFlag & 0x1) fail('Encrypted ZIP entries are not supported.')
      if (![0, 8].includes(entry.compressionMethod)) fail('The ZIP uses an unsupported compression method.')
      if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > MAX_SINGLE_FILE_BYTES) {
        fail('A file in the ZIP is larger than the allowed limit.')
      }
      totalUncompressedBytes += entry.uncompressedSize
      if (totalUncompressedBytes > MAX_UNCOMPRESSED_BYTES) fail('The ZIP expands beyond the 160 MB safety limit.')
      if (entry.uncompressedSize > 1024 * 1024 && entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > 200) {
        fail('The ZIP has an unsafe compression ratio.')
      }
      if (paths.has(normalized.path)) fail('The ZIP contains duplicate file paths.')
      paths.add(normalized.path)
      if (normalized.directory) continue

      files.push({ path: normalized.path, size: entry.uncompressedSize })
      if (normalized.path === 'aharane-update.json' || normalized.path === 'package.json') {
        const limit = normalized.path === 'aharane-update.json' ? MAX_MANIFEST_BYTES : 256 * 1024
        const stream = await zip.openReadStreamPromise(entry)
        const data = await readStreamLimited(stream, limit)
        if (normalized.path === 'aharane-update.json') manifestBuffer = data
        else packageBuffer = data
      }
    }
  } finally {
    if (zip.isOpen) zip.close()
  }

  if (!manifestBuffer || !packageBuffer) {
    fail('The ZIP must contain aharane-update.json and package.json at its root.')
  }
  if (!paths.has('src/index.js')) fail('The ZIP must contain src/index.js at its root.')
  let manifest
  let packageJson
  try {
    manifest = JSON.parse(manifestBuffer.toString('utf8'))
    packageJson = JSON.parse(packageBuffer.toString('utf8'))
  } catch {
    fail('The ZIP manifest or package.json is not valid JSON.')
  }
  const validatedManifest = validateUpdateManifest(manifest, packageJson)
  return {
    manifest: validatedManifest,
    package: { name: packageJson.name, version: packageJson.version },
    fileCount: files.length,
    totalUncompressedBytes,
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  }
}

export async function extractUpdateArchive(zipPath, destination) {
  await mkdir(destination, { recursive: true, mode: 0o750 })
  const zip = await openZip(zipPath)
  try {
    for await (const entry of zip.eachEntry()) {
      const normalized = normalizeUpdatePath(entry.fileName)
      rejectSpecialFile(entry)
      const target = path.resolve(destination, ...normalized.path.split('/'))
      if (target !== destination && !target.startsWith(destination + path.sep)) {
        fail('The ZIP contains a path outside the deployment directory.')
      }
      if (normalized.directory) {
        await mkdir(target, { recursive: true, mode: 0o750 })
        continue
      }
      await mkdir(path.dirname(target), { recursive: true, mode: 0o750 })
      const input = await zip.openReadStreamPromise(entry)
      await pipeline(input, createWriteStream(target, { flags: 'wx', mode: 0o640 }))
    }
  } finally {
    if (zip.isOpen) zip.close()
  }
}

async function collectFiles(root, relative = '') {
  const output = new Map()
  const directory = path.join(root, relative)
  let items
  try { items = await readdir(directory, { withFileTypes: true }) }
  catch { return output }
  for (const item of items) {
    const rel = relative ? path.posix.join(relative, item.name) : item.name
    if (item.name === 'node_modules' || item.name === '.deployed-source-ref') continue
    const absolute = path.join(root, ...rel.split('/'))
    if (item.isDirectory()) {
      const nested = await collectFiles(root, rel)
      for (const [key, value] of nested) output.set(key, value)
    } else if (item.isFile()) {
      const info = await stat(absolute)
      output.set(rel, info.size)
    }
  }
  return output
}

export async function compareUpdateContents(currentRelease, updateFiles) {
  const current = await collectFiles(currentRelease)
  const incoming = new Map(updateFiles.map(file => [file.path, file.size]))
  const added = []
  const replaced = []
  const removed = []
  for (const [filePath, size] of incoming) {
    if (!current.has(filePath)) added.push({ path: filePath, size })
    else replaced.push({ path: filePath, size, previousSize: current.get(filePath) })
  }
  for (const filePath of current.keys()) {
    if (!incoming.has(filePath)) removed.push(filePath)
  }
  return {
    added: added.slice(0, 250),
    replaced: replaced.slice(0, 250),
    removed: removed.slice(0, 250),
    counts: { added: added.length, replaced: replaced.length, removed: removed.length },
  }
}
