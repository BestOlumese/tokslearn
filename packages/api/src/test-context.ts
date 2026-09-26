import type { Actor } from '@tokslearn/core/kernel'
import { anonymousActor, noopCache } from '@tokslearn/core/kernel'
import type { Db } from '@tokslearn/db'
import { createMemoryRateLimiter } from '@tokslearn/integrations/upstash'
import type { ApiContext } from './context'

/** A DB stand-in whose queries always fail: proves a code path never touches the database. */
export const unreachableDb = new Proxy({} as Db, {
  get: () => () => {
    throw new Error('database not available in unit tests')
  },
})

export function testContext(overrides: Partial<ApiContext> & { actor?: Actor } = {}): ApiContext {
  const { actor = anonymousActor, ...rest } = overrides
  return {
    db: unreachableDb,
    requestId: 'req-1',
    headers: new Headers(),
    ipHash: 'ip-hash-1',
    resolveActor: async () => actor,
    cache: noopCache,
    rateLimiter: createMemoryRateLimiter(),
    version: 'test',
    environment: 'test',
    ...rest,
  }
}
