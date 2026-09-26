import { createHash } from 'node:crypto'
import type { SecondaryStorage } from 'better-auth'

// Per-account lockout (docs/07 §6): 10 failed passwords in 15 minutes locks the email for
// 15 minutes; each further lock within a day doubles the wait (15 → 30 → 60 … capped at 24 h).
// Keys hold a hash of the email, never the address itself.

const MAX_FAILURES = 10
const WINDOW_SEC = 15 * 60
const BASE_LOCK_SEC = 15 * 60
const MAX_LOCK_SEC = 24 * 60 * 60

type Store = Pick<SecondaryStorage, 'get' | 'set' | 'delete' | 'increment'>

function memoryStore(): Store {
  const values = new Map<string, { value: string; expiresAt: number }>()
  const live = (key: string) => {
    const hit = values.get(key)
    if (hit && hit.expiresAt > Date.now()) return hit
    values.delete(key)
    return undefined
  }
  return {
    get: async (key) => live(key)?.value ?? null,
    set: async (key, value, ttl) => {
      values.set(key, { value, expiresAt: Date.now() + (ttl ?? WINDOW_SEC) * 1000 })
    },
    delete: async (key) => {
      values.delete(key)
    },
    increment: async (key, ttl) => {
      const hit = live(key)
      const next = Number(hit?.value ?? 0) + 1
      values.set(key, { value: String(next), expiresAt: hit?.expiresAt ?? Date.now() + ttl * 1000 })
      return next
    },
  }
}

export function createLockout(storage?: Store, now: () => number = Date.now) {
  const store = storage ?? memoryStore()
  const hash = (email: string) =>
    createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32)

  return {
    /** Seconds until this email may try again; 0 when not locked. */
    async retryAfter(email: string): Promise<number> {
      if (!email) return 0
      const until = Number((await store.get(`lock:${hash(email)}`)) ?? 0)
      return Math.max(0, Math.ceil((until - now()) / 1000))
    },

    async recordFailure(email: string): Promise<void> {
      if (!email) return
      const h = hash(email)
      const failures = await store.increment(`fail:${h}`, WINDOW_SEC)
      if (failures < MAX_FAILURES) return
      const level = await store.increment(`locks:${h}`, MAX_LOCK_SEC)
      const lockSec = Math.min(BASE_LOCK_SEC * 2 ** (level - 1), MAX_LOCK_SEC)
      await store.set(`lock:${h}`, String(now() + lockSec * 1000), lockSec)
      await store.delete(`fail:${h}`)
    },

    async reset(email: string): Promise<void> {
      if (!email) return
      await store.delete(`fail:${hash(email)}`)
    },
  }
}
