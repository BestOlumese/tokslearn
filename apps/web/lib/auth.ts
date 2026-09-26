import 'server-only'
import { randomUUID } from 'node:crypto'
import { upstashSecondaryStorage } from '@tokslearn/auth/redis-storage'
import { type Auth, createAuth, createSessionAdmin } from '@tokslearn/auth/server'
import type { Providers } from '@tokslearn/core/kernel'
import { createCtx, systemActor } from '@tokslearn/core/kernel'
import { getDb } from '@tokslearn/db'
import { requestAuthEmail, requestOutboxDispatch } from '@tokslearn/jobs'
import { env } from '@/env'
import { nextCache } from './next-cache'
import { baseProviders } from './providers'
import { getRedis } from './redis'

let instance: Auth | undefined
let providers: Providers | undefined

/** The Better Auth instance (lazy so builds never need auth secrets). */
export function getAuth(): Auth {
  if (instance) return instance
  const secret = env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set')
  const db = getDb()
  const redis = getRedis()
  instance = createAuth({
    db,
    secret,
    baseURL: env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_APP_URL,
    // Preview deployments serve auth from their own URL.
    trustedOrigins: [
      env.NEXT_PUBLIC_APP_URL,
      ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
      ...(process.env.VERCEL_BRANCH_URL ? [`https://${process.env.VERCEL_BRANCH_URL}`] : []),
    ],
    production: env.NEXT_PUBLIC_APP_ENV === 'production',
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
        : undefined,
    secondaryStorage: redis ? upstashSecondaryStorage(redis) : undefined,
    sendEmail: requestAuthEmail,
    systemCtx: (reason) =>
      createCtx({
        actor: systemActor(reason),
        db,
        requestId: randomUUID(),
        cache: nextCache,
        providers: getProviders(),
        onOutboxWritten: requestOutboxDispatch,
      }),
  })
  return instance
}

/** All core providers, including session revocation through Better Auth. */
export function getProviders(): Providers {
  providers ??= {
    ...baseProviders(),
    sessions: createSessionAdmin(getAuth(), getDb()),
  }
  return providers
}
