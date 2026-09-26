import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { env } from '@/env'

/** Vercel's request id when present (matches its logs), otherwise a fresh UUID. */
export const requestIdFrom = (headers: Headers): string =>
  headers.get('x-vercel-id') ?? headers.get('x-request-id') ?? randomUUID()

const clientIp = (headers: Headers): string | null =>
  headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip')

/**
 * Salted SHA-256 of the client IP (docs/14 §2: hash IPs with a rotating salt).
 * Raw IPs are never stored or logged.
 */
export function ipHashFrom(headers: Headers): string | null {
  const ip = clientIp(headers)
  if (!ip) return null
  const salt = env.IP_HASH_SALT ?? 'local-dev-salt-not-for-production'
  return createHash('sha256').update(salt).update(ip).digest('hex').slice(0, 32)
}
