import { createHmac, timingSafeEqual } from 'node:crypto'

/** Daily webhook signature: base64 HMAC-SHA256 of `{timestamp}.{body}` with the decoded secret. */
export const dailySignature = (secretBase64: string, timestamp: string, rawBody: string) =>
  createHmac('sha256', Buffer.from(secretBase64, 'base64'))
    .update(`${timestamp}.${rawBody}`)
    .digest('base64')

export function isValidDailySignature(
  secretBase64: string,
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
): boolean {
  if (!secretBase64 || !timestamp || !signature) return false
  const a = Buffer.from(dailySignature(secretBase64, timestamp, rawBody), 'utf8')
  const b = Buffer.from(signature, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}
