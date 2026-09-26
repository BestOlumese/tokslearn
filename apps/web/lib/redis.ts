import 'server-only'
import {
  createMemoryRateLimiter,
  createRedis,
  createUpstashRateLimiter,
  pingRedis,
  type RateLimiter,
} from '@tokslearn/integrations/upstash'
import { env } from '@/env'

let redisClient: ReturnType<typeof createRedis> | undefined
let limiter: RateLimiter | undefined
let ping: (() => Promise<boolean>) | undefined
let initialised = false

function init() {
  if (initialised) return
  initialised = true
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    const redis = createRedis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
    redisClient = redis
    limiter = createUpstashRateLimiter(redis)
    ping = () => pingRedis(redis)
  } else {
    // Local dev and CI: per-instance limits. Production must set Upstash (health shows it).
    limiter = createMemoryRateLimiter()
  }
}

export function getRateLimiter(): RateLimiter {
  init()
  return limiter ?? createMemoryRateLimiter()
}

/** Undefined when Redis is not configured; health reports `not_configured`. */
export function getRedisPing(): (() => Promise<boolean>) | undefined {
  init()
  return ping
}

/** Shared Upstash client, or undefined when Redis is not configured (local dev, CI). */
export function getRedis(): ReturnType<typeof createRedis> | undefined {
  init()
  return redisClient
}
