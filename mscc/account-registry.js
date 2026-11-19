import { chmod, copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const PHONE_RE = /^\d{7,15}$/
export const ACCOUNT_SLOTS = Object.freeze([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'])

const digits = value => String(value || '').replace(/\D/g, '')

function defaultDisplayName(id, role = 'linked') {
  if (role === 'owner' || id === 'A') return 'Main'
  const match = String(id || '').match(/^account-(\d+)$/i)
  return match ? `Account ${match[1]}` : `Account ${id}`
}

function normalizeRecord(row) {
  const id = String(row?.id || '').trim()
  const phoneNumber = digits(row?.phoneNumber)
  const authDir = String(row?.authDir || '').trim()
  if (!ID_RE.test(id) || !PHONE_RE.test(phoneNumber) || !authDir) return null
  const rawSlot = String(row?.slot || '').trim().toUpperCase()
  if (rawSlot && !ACCOUNT_SLOTS.includes(rawSlot)) throw new Error('Invalid account slot in saved registry')
  const letterId = /^[A-Z]$/i.test(id) ? id.toUpperCase() : ''
  if (letterId && rawSlot && letterId !== rawSlot) {
    throw new Error('Letter account ID and account slot must match')
  }
  return {
    id,
    slot: rawSlot || letterId,
    phoneNumber,
    displayName: String(row?.displayName || '').trim().slice(0, 48),
    authDir: resolve(authDir),
    role: row?.role === 'owner' ? 'owner' : 'linked',
    paused: row?.paused === true,
    createdAt: Number(row?.createdAt) || Date.now(),
  }
}

function assertUniqueAuthDirs(records) {
  const owners = new Map()
  for (const record of records) {
    const previous = owners.get(record.authDir)
    if (previous && previous !== record.id) {
      throw new Error(`Accounts ${previous} and ${record.id} share the same auth directory: ${record.authDir}`)
    }
    owners.set(record.authDir, record.id)
  }
}

export class AccountRegistry {
  constructor({ file, authRoot, maxAccounts = 26, legacy = [] }) {
    this.file = resolve(file)
    this.authRoot = resolve(authRoot)
    this.maxAccounts = Math.max(1, Math.min(26, Number(maxAccounts) || 26))
    this.legacy = legacy
    this.records = new Map()
    this.nextSequence = 1
    this._mutations = Promise.resolve()
    this._saves = Promise.resolve()
  }

  list() {
    return [...this.records.values()].map(row => ({ ...row }))
  }

  main() {
    const accountA = this.records.get('A')
    if (accountA?.role === 'owner') return { ...accountA }
    const owner = [...this.records.values()].find(row => row.role === 'owner')
    return owner ? { ...owner } : null
  }

  resolveId(value) {
    const raw = String(value || '').trim()
    if (this.records.has(raw)) return raw
    const lower = raw.toLowerCase()
    for (const id of this.records.keys()) if (id.toLowerCase() === lower) return id
    const requestedSlot = raw.toUpperCase()
    if (ACCOUNT_SLOTS.includes(requestedSlot)) {
      for (const row of this.records.values()) if (row.slot === requestedSlot) return row.id
    }
    return ''
  }

  get(value) {
    const id = this.resolveId(value)
    return id ? { ...this.records.get(id) } : null
  }

  slots() {
    const occupied = new Map([...this.records.values()].map(row => [row.slot, row]))
    return ACCOUNT_SLOTS.map(slot => {
      const row = occupied.get(slot)
      return {
        slot,
        occupied: Boolean(row),
        id: row?.id || null,
        displayName: row?.displayName || '',
      }
    })
  }

  entitlements() {
    return {
      count: this.records.size,
      maxAccounts: this.maxAccounts,
      canAddAccount: this.records.size < this.maxAccounts,
      availableSlots: this.slots().filter(row => !row.occupied).map(row => row.slot),
    }
  }

  async load() {
    let raw = null
    try {
      raw = JSON.parse(await readFile(this.file, 'utf8'))
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    if (raw !== null && !Array.isArray(raw?.accounts)) {
      throw new Error('Saved account registry has no valid accounts array')
    }

    this.records.clear()
    for (const row of raw?.accounts || []) {
      const record = normalizeRecord(row)
      if (!record) throw new Error('Saved account registry contains an invalid record')
      if (this.records.has(record.id)) throw new Error('Duplicate account ID in saved registry')
      this.records.set(record.id, record)
    }

    let needsSave = false
    if (!this.records.size && raw === null) {
      for (const row of this.legacy) {
        const record = normalizeRecord(row)
        if (record && !this.records.has(record.id)) this.records.set(record.id, record)
      }
      this.nextSequence = this.records.size + 1
      needsSave = this.records.size > 0
    } else {
      this.nextSequence = Math.max(
        Number(raw?.nextSequence) || 1,
        this.records.size + 1,
      )
    }

    if (this.records.size > ACCOUNT_SLOTS.length) {
      throw new Error('Saved registry exceeds 26 personal account slots')
    }
    assertUniqueAuthDirs(this.records.values())
    const phones = new Set()
    for (const row of this.records.values()) {
      if (phones.has(row.phoneNumber)) throw new Error('Duplicate WhatsApp number in saved registry')
      phones.add(row.phoneNumber)
    }

    if (this.records.size) {
      // Never mutate an existing internal ID: shared storage, group routes,
      // messages and auth directory paths are all keyed by this stable ID.
      if (!this.records.has('A')) {
        throw new Error('Account A is missing; refusing an unsafe automatic ID migration')
      }
      const used = new Map()
      for (const row of this.records.values()) {
        if (!row.slot) continue
        if ((row.id === 'A') !== (row.slot === 'A')) {
          throw new Error('Only permanent Account A may occupy slot A')
        }
        if (used.has(row.slot)) throw new Error('Duplicate A–Z account slot in saved registry')
        used.set(row.slot, row.id)
      }
      // Reserve letter-named accounts first, then allocate unassigned legacy
      // account-<sequence> records in saved order. Existing IDs are untouched.
      for (const row of this.records.values()) {
        if (!row.slot) {
          const available = ACCOUNT_SLOTS.slice(1).find(slot => !used.has(slot))
          if (!available) throw new Error('No A–Z account slot available for legacy record')
          row.slot = available
          used.set(available, row.id)
          needsSave = true
        }
        const role = row.id === 'A' ? 'owner' : 'linked'
        if (row.role !== role) {
          row.role = role
          needsSave = true
        }
        if (!row.displayName) {
          row.displayName = defaultDisplayName(row.id, role)
          needsSave = true
        }
      }
      this.nextSequence = Math.max(2, this.nextSequence)
    }

    if (needsSave) {
      if (raw !== null) {
        // Migration recovery copy: no WhatsApp auth file or internal ID moves.
        const backup = this.file + '.pre-az-' + randomUUID() + '.bak'
        await copyFile(this.file, backup)
        await chmod(backup, 0o600)
      }
      await this.save()
    }
    return this.list()
  }

  // Serialize the entire registry mutation, not just its disk write. Without
  // this lock, two overlapping save() calls can write to the same .tmp file or
  // persist an older snapshot after a newer account change.
  _mutate(action) {
    const task = this._mutations.catch(() => {}).then(async () => {
      const before = new Map([...this.records].map(([id, row]) => [id, { ...row }]))
      const sequence = this.nextSequence
      try {
        const result = await action()
        await this.save()
        return result
      } catch (error) {
        // An HTTP/API error must never leave a non-persisted account mutation
        // visible to the running bot. Authentication directories are untouched.
        this.records = before
        this.nextSequence = sequence
        throw error
      }
    })
    this._mutations = task.catch(() => {})
    return task
  }

  save() {
    const content = JSON.stringify({
      version: 3,
      savedAt: Date.now(),
      nextSequence: this.nextSequence,
      accounts: this.list(),
    }, null, 2)
    const task = this._saves.catch(() => {}).then(async () => {
      await mkdir(dirname(this.file), { recursive: true })
      const tmp = this.file + '.' + randomUUID() + '.tmp'
      try {
        await writeFile(tmp, content, { mode: 0o600 })
        await rename(tmp, this.file)
      } finally {
        // A failed rename must not leave sensitive registry snapshots on disk.
        await rm(tmp, { force: true }).catch(() => {})
      }
    })
    this._saves = task.catch(() => {})
    return task
  }

  create({ phoneNumber, displayName = '', slot = '' }) {
    return this._mutate(async () => {
      if (this.records.size >= this.maxAccounts) {
        throw new Error(`Account limit reached (${this.records.size}/${this.maxAccounts})`)
      }
      const number = digits(phoneNumber)
      if (!PHONE_RE.test(number)) throw new Error('Phone number must contain 7 to 15 digits')
      if ([...this.records.values()].some(row => row.phoneNumber === number)) {
        throw new Error('That WhatsApp number is already registered')
      }

      const requested = String(slot || '').trim().toUpperCase()
      if (requested && !ACCOUNT_SLOTS.includes(requested)) {
        throw new Error('Slot must be one letter from A to Z')
      }
      const firstAccount = this.records.size === 0
      if (firstAccount && requested && requested !== 'A') {
        throw new Error('The first account must occupy permanent slot A')
      }
      if (!firstAccount && requested === 'A') {
        throw new Error('Slot A is reserved for the permanent main account')
      }
      const used = new Set([...this.records.values()].map(row => row.slot))
      const selected = firstAccount
        ? 'A'
        : (requested || ACCOUNT_SLOTS.slice(1).find(candidate => !used.has(candidate)))
      if (!selected || used.has(selected) || this.records.has(selected)) {
        throw new Error('The requested account slot is already occupied or unavailable')
      }
      const id = selected
      if (firstAccount) this.nextSequence = Math.max(this.nextSequence, 2)
      // A reused letter must NEVER inherit credentials from an older account.
      // New linked accounts get a distinct random authentication directory.
      const record = {
        id,
        slot: selected,
        phoneNumber: number,
        displayName: String(displayName || '').trim().slice(0, 48) || defaultDisplayName(id, firstAccount ? 'owner' : 'linked'),
        authDir: firstAccount ? join(this.authRoot, 'A') : join(this.authRoot, selected + '-' + randomUUID()),
        role: firstAccount ? 'owner' : 'linked',
        paused: false,
        createdAt: Date.now(),
      }
      await mkdir(record.authDir, { recursive: true, mode: 0o700 })
      this.records.set(id, record)
      return { ...record }
    })
  }

  setPaused(value, paused) {
    return this._mutate(() => {
      const id = this.resolveId(value)
      if (!id) throw new Error('Unknown account')
      const record = this.records.get(id)
      record.paused = paused === true
      return { ...record }
    })
  }

  rename(value, displayName) {
    return this._mutate(() => {
      const id = this.resolveId(value)
      if (!id) throw new Error('Unknown account')
      const record = this.records.get(id)
      const name = String(displayName || '').trim().slice(0, 48)
      if (!name) throw new Error('Friendly name cannot be empty')
      record.displayName = name
      return { ...record }
    })
  }

  remove(value) {
    return this._mutate(() => {
      const id = this.resolveId(value)
      if (!id) throw new Error('Unknown account')
      const record = this.records.get(id)
      if (record.role === 'owner') {
        throw new Error('Account A is the permanent main control account and cannot be removed')
      }
      this.records.delete(id)
      return { ...record, authPreserved: true }
    })
  }
}

export function legacyAccountRecords({
  accountA,
  accountB,
  authA = '/var/lib/mscc/auth',
  authB = '/var/lib/mscc/auth-b',
}) {
  const rows = []
  if (PHONE_RE.test(digits(accountA))) {
    rows.push({
      id: 'A',
      phoneNumber: digits(accountA),
      displayName: 'Main',
      authDir: authA,
      role: 'owner',
    })
  }
  if (PHONE_RE.test(digits(accountB))) {
    rows.push({
      id: 'B',
      phoneNumber: digits(accountB),
      displayName: 'Second',
      authDir: authB,
      role: 'linked',
    })
  }
  return rows
}
