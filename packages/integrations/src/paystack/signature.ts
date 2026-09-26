import { createHmac, timingSafeEqual } from 'node:crypto'

/** Paystack signs webhooks with HMAC SHA-512 of the raw body using the secret key (docs/06 §7). */
export function isValidPaystackSignature(
  secretKey: string,
  rawBody: string,
  signature: string | null,
): boolean {
  if (!signature || !secretKey) return false
  const expected = createHmac('sha512', secretKey).update(rawBody).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}
