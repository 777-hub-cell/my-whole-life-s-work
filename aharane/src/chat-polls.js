import { createHash, randomBytes } from 'node:crypto'
import {
  aesEncryptGCM,
  decryptPollVote,
  getKeyAuthor,
  hmacSign,
  jidNormalizedUser,
  proto,
} from '@itsliaaa/baileys'

const POLL_CREATION_KEYS = [
  'pollCreationMessageV6',
  'pollCreationMessageV5',
  'pollCreationMessageV3',
  'pollCreationMessageV2',
  'pollCreationMessage',
]

function pollBody(sourceMessage) {
  for (const key of POLL_CREATION_KEYS) {
    const value = sourceMessage?.message?.[key]
    if (value) return value
  }
  return null
}

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (Array.isArray(value)) return Buffer.from(value)
  return null
}

export function pollOptionHash(optionName) {
  return createHash('sha256').update(Buffer.from(String(optionName), 'utf8')).digest()
}

/**
 * Encrypt a poll vote using the exact Baileys poll-vote derivation.
 *
 * The returned envelope is round-tripped through Baileys' own decryptPollVote
 * before it is accepted. This protects against subtle option-hash, JID, AAD,
 * or protobuf-shape mistakes.
 */
export function createPollVoteEnvelope({ pollMessage, selectedOptions, voterJid } = {}) {
  const source = pollMessage?.sourceMessage
  const creation = pollBody(source)
  const messageId = String(source?.key?.id || pollMessage?.id || '')
  if (!source?.key || !messageId || !creation) {
    throw Object.assign(new Error('The original WhatsApp poll message is unavailable.'), { status: 410 })
  }

  const secret = asBuffer(source?.messageContextInfo?.messageSecret)
  if (!secret || secret.length !== 32) {
    throw Object.assign(new Error('The original poll encryption secret is unavailable.'), { status: 410 })
  }

  const voter = jidNormalizedUser(String(voterJid || ''))
  if (!voter || !voter.includes('@')) {
    throw Object.assign(new Error('The connected WhatsApp account has no usable voter identity.'), { status: 503 })
  }
  const creator = getKeyAuthor(source.key, voter)
  if (!creator || !creator.includes('@')) {
    throw Object.assign(new Error('The poll creator identity could not be resolved.'), { status: 422 })
  }

  const options = Array.isArray(creation.options) ? creation.options
    .map(option => String(option?.optionName || '').trim())
    .filter(Boolean) : []
  if (options.length < 2) {
    throw Object.assign(new Error('This poll does not contain usable options.'), { status: 422 })
  }

  const selectableCount = Math.max(1, Math.min(
    options.length,
    Number(creation.selectableOptionsCount || creation.selectableCount || 1) || 1
  ))
  if (!Array.isArray(selectedOptions) || selectedOptions.length < 1 || selectedOptions.length > selectableCount) {
    throw Object.assign(new Error('Choose between 1 and ' + selectableCount + ' poll option(s).'), { status: 400 })
  }

  const chosen = selectedOptions.map(value => String(value || '').trim())
  if (chosen.some(value => !value) || new Set(chosen).size !== chosen.length) {
    throw Object.assign(new Error('Poll selections must be non-empty and unique.'), { status: 400 })
  }
  if (chosen.some(value => !options.includes(value))) {
    throw Object.assign(new Error('One or more selected options do not belong to this poll.'), { status: 400 })
  }

  const selectedHashes = chosen.map(pollOptionHash)
  const pollVoteBytes = proto.Message.PollVoteMessage.encode({
    selectedOptions: selectedHashes,
  }).finish()

  const sign = Buffer.concat([
    Buffer.from(messageId, 'utf8'),
    Buffer.from(creator, 'utf8'),
    Buffer.from(voter, 'utf8'),
    Buffer.from('Poll Vote', 'utf8'),
    Buffer.from([1]),
  ])
  const key0 = hmacSign(secret, Buffer.alloc(32), 'sha256')
  const encryptionKey = hmacSign(sign, key0, 'sha256')
  const aad = Buffer.from(messageId + '\u0000' + voter, 'utf8')
  const iv = randomBytes(12)
  const encPayload = aesEncryptGCM(pollVoteBytes, encryptionKey, iv, aad)
  const vote = { encPayload, encIv: iv }

  const verified = decryptPollVote(vote, {
    pollCreatorJid: creator,
    pollMsgId: messageId,
    pollEncKey: secret,
    voterJid: voter,
  })
  const verifiedHashes = (verified.selectedOptions || []).map(value => asBuffer(value))
  if (verifiedHashes.length !== selectedHashes.length ||
      verifiedHashes.some((value, index) => !value?.equals(selectedHashes[index]))) {
    throw Object.assign(new Error('The generated WhatsApp poll vote failed cryptographic verification.'), { status: 500 })
  }

  return {
    vote,
    pollCreatorJid: creator,
    voterJid: voter,
    selectedOptionNames: chosen,
    selectedOptionHashes: selectedHashes.map(value => value.toString('hex')),
    selectableCount,
  }
}

/** Decode a received vote and return only known option hashes. */
export function decryptIncomingPollVote({ pollMessage, vote, voterJid } = {}) {
  const source = pollMessage?.sourceMessage
  const creation = pollBody(source)
  const messageId = String(source?.key?.id || pollMessage?.id || '')
  const secret = asBuffer(source?.messageContextInfo?.messageSecret)
  const voter = jidNormalizedUser(String(voterJid || ''))
  if (!source?.key || !creation || !messageId || !secret || secret.length !== 32 || !voter) {
    throw new Error('The original poll context is unavailable for vote decryption.')
  }
  const creator = getKeyAuthor(source.key, voter)
  const decoded = decryptPollVote(vote, {
    pollCreatorJid: creator,
    pollMsgId: messageId,
    pollEncKey: secret,
    voterJid: voter,
  })
  const allowed = new Set((creation.options || [])
    .map(option => pollOptionHash(String(option?.optionName || '').trim()).toString('hex')))
  return (decoded.selectedOptions || [])
    .map(option => asBuffer(option)?.toString('hex') || '')
    .filter(hash => allowed.has(hash))
}
