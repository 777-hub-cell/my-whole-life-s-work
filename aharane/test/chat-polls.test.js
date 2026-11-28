import test from 'node:test'
import assert from 'node:assert/strict'
import { createPollVoteEnvelope, decryptIncomingPollVote, pollOptionHash } from '../src/chat-polls.js'
import { decryptPollVote } from '@itsliaaa/baileys'

function samplePoll() {
  const secret = Buffer.alloc(32, 0x3a)
  return {
    id: 'POLL_MESSAGE_123',
    key: {
      remoteJid: '2348000000001@s.whatsapp.net',
      id: 'POLL_MESSAGE_123',
      fromMe: true,
    },
    sourceMessage: {
      key: {
        remoteJid: '2348000000001@s.whatsapp.net',
        id: 'POLL_MESSAGE_123',
        fromMe: true,
      },
      messageContextInfo: { messageSecret: secret },
      message: {
        pollCreationMessageV3: {
          name: 'Lunch?',
          selectableOptionsCount: 2,
          options: [
            { optionName: 'Jollof rice' },
            { optionName: 'Fried rice' },
            { optionName: 'Pasta' },
          ],
        },
      },
    },
  }
}

test('encrypted poll vote decrypts with Baileys to the exact selected option hashes', () => {
  const pollMessage = samplePoll()
  const voterJid = '2348000000002@s.whatsapp.net'
  const result = createPollVoteEnvelope({
    pollMessage,
    selectedOptions: ['Jollof rice', 'Pasta'],
    voterJid,
  })
  const decoded = decryptPollVote(result.vote, {
    pollCreatorJid: result.pollCreatorJid,
    pollMsgId: pollMessage.id,
    pollEncKey: pollMessage.sourceMessage.messageContextInfo.messageSecret,
    voterJid,
  })
  const hashes = decoded.selectedOptions.map(value => Buffer.from(value).toString('hex'))
  assert.deepEqual(hashes, [
    pollOptionHash('Jollof rice').toString('hex'),
    pollOptionHash('Pasta').toString('hex'),
  ])
})

test('received votes decrypt and ignore hashes not present in the original poll', () => {
  const pollMessage = samplePoll()
  const voterJid = '2348000000002@s.whatsapp.net'
  const result = createPollVoteEnvelope({
    pollMessage,
    selectedOptions: ['Fried rice'],
    voterJid,
  })
  assert.deepEqual(
    decryptIncomingPollVote({ pollMessage, vote: result.vote, voterJid }),
    [pollOptionHash('Fried rice').toString('hex')]
  )
})

test('vote creation rejects choices outside the poll and invalid selection counts', () => {
  const pollMessage = samplePoll()
  assert.throws(
    () => createPollVoteEnvelope({
      pollMessage, selectedOptions: ['Burger'], voterJid: '2348000000002@s.whatsapp.net',
    }),
    /do not belong to this poll/
  )
  assert.throws(
    () => createPollVoteEnvelope({
      pollMessage, selectedOptions: ['Jollof rice', 'Fried rice', 'Pasta'],
      voterJid: '2348000000002@s.whatsapp.net',
    }),
    /Choose between 1 and 2/
  )
})

test('vote creation fails closed when messageSecret is missing', () => {
  const pollMessage = samplePoll()
  delete pollMessage.sourceMessage.messageContextInfo.messageSecret
  assert.throws(
    () => createPollVoteEnvelope({
      pollMessage, selectedOptions: ['Jollof rice'], voterJid: '2348000000002@s.whatsapp.net',
    }),
    /encryption secret is unavailable/
  )
})
