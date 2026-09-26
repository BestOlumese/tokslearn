import type { RateLimitPolicy } from '@tokslearn/integrations/upstash'

/**
 * Per-procedure rate limits (docs/06 §3.4). Keys match a full procedure path (`admin.setFeatureFlag`)
 * or a namespace (`auth`). The most specific key wins. Identifier: user id, else IP hash.
 */
export const rateLimits: Readonly<Record<string, RateLimitPolicy>> = {
  default: { limit: 120, windowSec: 60 },
  auth: { limit: 10, windowSec: 60 },
  checkout: { limit: 10, windowSec: 60 },
  search: { limit: 60, windowSec: 60 },
  'progress.heartbeat': { limit: 6, windowSec: 60 },
  health: { limit: 60, windowSec: 60 },
  admin: { limit: 60, windowSec: 60 },
  me: { limit: 60, windowSec: 60 },
  media: { limit: 20, windowSec: 60 },
  users: { limit: 60, windowSec: 60 },
}

export function policyFor(path: ReadonlyArray<string>): {
  bucket: string
  policy: RateLimitPolicy
} {
  for (let i = path.length; i > 0; i--) {
    const bucket = path.slice(0, i).join('.')
    const policy = rateLimits[bucket]
    if (policy) return { bucket, policy }
  }
  return { bucket: 'default', policy: rateLimits.default ?? { limit: 120, windowSec: 60 } }
}

/**
 * Procedures that create money or irreversible state accept an Idempotency-Key (docs/06 §3.5).
 * Phase 4+ adds `checkout.start`, `refunds.request`, `assignments.submit`, `exams.submit`.
 */
export const idempotentProcedures: ReadonlySet<string> = new Set<string>([])
