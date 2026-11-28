export const VALID_NAME = /^[a-z][a-z0-9_-]{0,63}$/

export function parseCommand(rawText, prefix = '!') {
  const text = String(rawText || '').trim()
  const marker = String(prefix || '!')
  if (!marker || !text.startsWith(marker)) return null
  const body = text.slice(marker.length).trim()
  if (!body) return null
  const [rawName, ...args] = body.split(/\s+/)
  const rawArgs = body.slice(rawName.length).replace(/^\s+/u, '')
  const name = rawName.toLowerCase()
  if (!VALID_NAME.test(name)) return null
  return { name, args, rawArgs }
}
