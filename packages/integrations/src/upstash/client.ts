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
