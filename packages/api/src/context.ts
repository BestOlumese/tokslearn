import type { Actor, CacheAdapter, Providers } from '@tokslearn/core/kernel'
import type { Db } from '@tokslearn/db'
import type { RateLimiter } from '@tokslearn/integrations/upstash'

/**
 * Initial context the web route handlers pass to oRPC for each request. Everything
 * framework- or provider-specific is injected here so procedures stay thin and testable.
 */
export interface ApiContext {
  db: Db
  requestId: string
  headers: Headers
  /** Salted hash of the client IP (rate limits, audit). Null when unknown. */
  ipHash: string | null
  /** Better Auth session (cookie on web, bearer on mobile) → Actor. */
  resolveActor: () => Promise<Actor>
  /** File storage, session revocation and absolute URLs for core services. */
  providers: Partial<Providers>
  cache: CacheAdapter
  rateLimiter: RateLimiter
  onOutboxWritten?: () => Promise<void>
  pingRedis?: () => Promise<boolean>
  version: string
  environment: string
}
