import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_WHATSAPP_CONNECT_TIMEOUT_MS,
  MIN_WHATSAPP_CONNECT_TIMEOUT_MS,
  MAX_WHATSAPP_CONNECT_TIMEOUT_MS,
  resolveWhatsAppConnectTimeoutMs,
  resolveWhatsAppReadyTimeoutMs,
} from '../src/whatsapp-connection-settings.js'

test('WhatsApp WebSocket timeout defaults to 60 seconds', () => {
  assert.equal(resolveWhatsAppConnectTimeoutMs(undefined), 60_000)
  assert.equal(resolveWhatsAppConnectTimeoutMs(''), DEFAULT_WHATSAPP_CONNECT_TIMEOUT_MS)
})

test('WhatsApp WebSocket timeout accepts and bounds configured values', () => {
  assert.equal(resolveWhatsAppConnectTimeoutMs('45000'), 45_000)
  assert.equal(resolveWhatsAppConnectTimeoutMs(1), MIN_WHATSAPP_CONNECT_TIMEOUT_MS)
  assert.equal(resolveWhatsAppConnectTimeoutMs(120_000), MAX_WHATSAPP_CONNECT_TIMEOUT_MS)
  assert.equal(resolveWhatsAppConnectTimeoutMs('invalid'), DEFAULT_WHATSAPP_CONNECT_TIMEOUT_MS)
})

test('pairing readiness wait outlasts the underlying WebSocket handshake timeout', () => {
  assert.equal(resolveWhatsAppReadyTimeoutMs(60_000), 70_000)
  assert.equal(resolveWhatsAppReadyTimeoutMs(MAX_WHATSAPP_CONNECT_TIMEOUT_MS), 100_000)
})
