export interface RateLimitPolicy {
  /** Requests allowed per window. */
  limit: number
  /** Window length in seconds. */
  windowSec: number
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSec: number
}

export interface RateLimiter {
  check(bucket: string, identifier: string, policy: RateLimitPolicy): Promise<RateLimitResult>
}

/** Fixed-window limiter in process memory: tests and local dev without Upstash. */
export function createMemoryRateLimiter(now: () => number = Date.now): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>()
  return {
    async check(bucket, identifier, policy) {
      const key = `${bucket}:${identifier}`
      const t = now()
      const current = windows.get(key)
      if (!current || current.resetAt <= t) {
        windows.set(key, { count: 1, resetAt: t + policy.windowSec * 1000 })
        return { allowed: true, retryAfterSec: 0 }
      }
      current.count++
      if (current.count <= policy.limit) return { allowed: true, retryAfterSec: 0 }
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((current.resetAt - t) / 1000)) }
    },
  }
}

/** Allows everything. Used when Redis is not configured outside production. */
export const allowAllRateLimiter: RateLimiter = {
  check: async () => ({ allowed: true, retryAfterSec: 0 }),
}
