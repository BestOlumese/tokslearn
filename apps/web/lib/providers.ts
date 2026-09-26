import 'server-only'
import type { Providers } from '@tokslearn/core/kernel'
import { createFakeStorage, createR2Storage, type FileStorage } from '@tokslearn/integrations/r2'
import { env } from '@/env'

let storage: FileStorage | undefined

/** R2 when configured; an in-memory stand-in for local development without R2 keys. */
function getStorage(): FileStorage {
  if (storage) return storage
  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
    storage = createR2Storage({
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      buckets: {
        public: env.R2_BUCKET_PUBLIC ?? 'tokslearn-public',
        private: env.R2_BUCKET_PRIVATE ?? 'tokslearn-private',
      },
    })
  } else {
    if (env.NEXT_PUBLIC_APP_ENV === 'production') {
      throw new Error('R2 is not configured in production')
    }
    storage = createFakeStorage()
  }
  return storage
}

/**
 * Providers injected into every core Ctx. `sessions` is added by lib/auth.ts to avoid an import
 * cycle (the auth instance itself needs a Ctx for its hooks).
 */
export function baseProviders(): Omit<Providers, 'sessions'> {
  return {
    storage: getStorage(),
    urls: { app: env.NEXT_PUBLIC_APP_URL, cdn: env.NEXT_PUBLIC_CDN_URL ?? null },
  }
}
