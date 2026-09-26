import type { Redis } from '@upstash/redis'
import type { SecondaryStorage } from 'better-auth'

/** Better Auth secondary storage on Upstash (pattern from the Better Auth database docs). */
export function upstashSecondaryStorage(redis: Redis, prefix = 'ba:'): SecondaryStorage {
  const k = (key: string) => `${prefix}${key}`
  return {
    get: (key) => redis.get<string>(k(key)),
    getAndDelete: (key) => redis.getdel<string>(k(key)),
    async increment(key, ttl) {
      if (!Number.isInteger(ttl) || ttl <= 0) throw new TypeError('TTL must be a positive integer')
      const [value] = await redis
        .multi()
        .incr(k(key))
        .expire(k(key), ttl, 'NX')
        .exec<[number, number]>()
      return value
    },
    async set(key, value, ttl) {
      if (ttl) await redis.set(k(key), value, { ex: ttl })
      else await redis.set(k(key), value)
    },
    async delete(key) {
      await redis.del(k(key))
    },
  }
}
