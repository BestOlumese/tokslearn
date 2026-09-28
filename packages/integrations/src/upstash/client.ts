import 'server-only'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import type { RateLimiter, RateLimitPolicy } from './rate-limiter'

export interface RedisConfig {
  url: string
  token: string
}

export const createRedis = (config: RedisConfig): Redis =>
  new Redis({ url: config.url, token: config.token })

/** Health check for /api/v1/health. */
export async function pingRedis(redis: Redis): Promise<boolean> {
  try {
    return (await redis.ping()) === 'PONG'
  } catch {
    return false
  }
}

/** Sliding-window limiter on Upstash; one Ratelimit instance per distinct policy. */
export function createUpstashRateLimiter(redis: Redis): RateLimiter {
  const limiters = new Map<string, Ratelimit>()
  const limiterFor = (bucket: string, policy: RateLimitPolicy) => {
    const id = `${bucket}:${policy.limit}:${policy.windowSec}`
    let limiter = limiters.get(id)
    if (!limiter) {
      limiter = new Ratelimit({
        redis,
        prefix: `rl:${bucket}`,
        limiter: Ratelimit.slidingWindow(policy.limit, `${policy.windowSec} s`),
        analytics: false,
      })
      limiters.set(id, limiter)
    }
    return limiter
  }
  return {
    async check(bucket, identifier, policy) {
      const result = await limiterFor(bucket, policy).limit(identifier)
      return {
        allowed: result.success,
        retryAfterSec: result.success
          ? 0
          : Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
      }
    },
  }
}

const CLICKS = 'referral:clicks'

/**
 * Referral click counter in one Redis hash. `drain` reads the counts and subtracts exactly what
 * it read, so clicks that land in between are kept for the next drain.
 */
export function createClickCounter(redis: Redis) {
  return {
    async increment(linkId: string): Promise<void> {
      await redis.hincrby(CLICKS, linkId, 1)
    },
    async drain(): Promise<Array<{ linkId: string; clicks: number }>> {
      const all = (await redis.hgetall<Record<string, number>>(CLICKS)) ?? {}
      const out: Array<{ linkId: string; clicks: number }> = []
      for (const [linkId, value] of Object.entries(all)) {
        const clicks = Number(value)
        if (!Number.isFinite(clicks) || clicks <= 0) continue
        await redis.hincrby(CLICKS, linkId, -clicks)
        out.push({ linkId, clicks })
      }
      return out
    },
    async peek(linkIds: ReadonlyArray<string>): Promise<Map<string, number>> {
      const out = new Map<string, number>()
      if (linkIds.length === 0) return out
      const values = await redis.hmget<Record<string, number | null>>(CLICKS, ...linkIds)
      for (const [linkId, value] of Object.entries(values ?? {})) {
        const clicks = Number(value)
        if (Number.isFinite(clicks) && clicks > 0) out.set(linkId, clicks)
      }
      return out
    },
  }
}
