import 'server-only'
import type { ApiContext } from '@tokslearn/api'
import { getDb } from '@tokslearn/db'
import { requestOutboxDispatch } from '@tokslearn/jobs'
import { env } from '@/env'
import { resolveActor } from './actor'
import { getProviders } from './auth'
import { nextCache } from './next-cache'
import { getRateLimiter, getRedisPing } from './redis'
import { ipHashFrom, requestIdFrom } from './request'

/** Per-request context for the oRPC handlers in app/api/rpc and app/api/v1. */
export function createApiContext(request: Request): ApiContext {
  const pingRedis = getRedisPing()
  return {
    db: getDb(),
    requestId: requestIdFrom(request.headers),
    headers: request.headers,
    ipHash: ipHashFrom(request.headers),
    resolveActor: () => resolveActor(request.headers),
    cache: nextCache,
    providers: getProviders(),
    rateLimiter: getRateLimiter(),
    onOutboxWritten: requestOutboxDispatch,
    ...(pingRedis ? { pingRedis } : {}),
    version: env.APP_VERSION,
    environment: env.NEXT_PUBLIC_APP_ENV,
  }
}
