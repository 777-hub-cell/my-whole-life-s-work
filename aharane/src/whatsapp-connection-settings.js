export const DEFAULT_WHATSAPP_CONNECT_TIMEOUT_MS = 60_000
export const MIN_WHATSAPP_CONNECT_TIMEOUT_MS = 15_000
export const MAX_WHATSAPP_CONNECT_TIMEOUT_MS = 90_000
export const WHATSAPP_READY_TIMEOUT_BUFFER_MS = 10_000

export function resolveWhatsAppConnectTimeoutMs(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return DEFAULT_WHATSAPP_CONNECT_TIMEOUT_MS
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) return DEFAULT_WHATSAPP_CONNECT_TIMEOUT_MS
  return Math.min(
    MAX_WHATSAPP_CONNECT_TIMEOUT_MS,
    Math.max(MIN_WHATSAPP_CONNECT_TIMEOUT_MS, parsed),
  )
}

export function resolveWhatsAppReadyTimeoutMs(connectTimeoutMs) {
  return resolveWhatsAppConnectTimeoutMs(connectTimeoutMs) + WHATSAPP_READY_TIMEOUT_BUFFER_MS
}
