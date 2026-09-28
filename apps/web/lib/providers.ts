import 'server-only'
import type { Providers } from '@tokslearn/core/kernel'
import {
  createBunnyStream,
  createFakeBunny,
  type VideoProvider,
} from '@tokslearn/integrations/bunny'
import { createDojahKyc, createFakeKyc, type KycProvider } from '@tokslearn/integrations/dojah'
import {
  createFakePayouts,
  createFakePaystack,
  createPaystackPayments,
  createPaystackPayouts,
  type PaymentProvider,
  type PayoutProvider,
} from '@tokslearn/integrations/paystack'
import { createFakeStorage, createR2Storage, type FileStorage } from '@tokslearn/integrations/r2'
import { createClickCounter } from '@tokslearn/integrations/upstash'
import { env } from '@/env'
import { getRedis } from './redis'

/** Real provider when its keys are set; a test double elsewhere, never in production. */
function realOrFake<T>(name: string, real: (() => T) | null, fake: () => T): T {
  if (real) return real()
  if (env.NEXT_PUBLIC_APP_ENV === 'production')
    throw new Error(`${name} is not configured in production`)
  return fake()
}

let kyc: KycProvider | undefined
let payouts: PayoutProvider | undefined
let video: VideoProvider | undefined
let payments: PaymentProvider | undefined

/**
 * Paystack transactions. Without keys (local development) a fake that approves every payment,
 * so checkout can be tried end to end; never outside development and previews without keys.
 */
function getPayments(): PaymentProvider {
  const secretKey = env.PAYSTACK_SECRET_KEY
  payments ??= realOrFake(
    'Paystack',
    secretKey ? () => createPaystackPayments({ secretKey }) : null,
    () => createFakePaystack().provider,
  )
  return payments
}

function getKyc(): KycProvider {
  const { DOJAH_APP_ID: appId, DOJAH_SECRET_KEY: secretKey, DOJAH_BASE_URL: baseUrl } = env
  kyc ??= realOrFake(
    'Dojah',
    appId && secretKey && baseUrl ? () => createDojahKyc({ appId, secretKey, baseUrl }) : null,
    () => createFakeKyc().provider,
  )
  return kyc
}

function getPayouts(): PayoutProvider {
  const secretKey = env.PAYSTACK_SECRET_KEY
  payouts ??= realOrFake(
    'Paystack',
    secretKey ? () => createPaystackPayouts({ secretKey }) : null,
    () => createFakePayouts().provider,
  )
  return payouts
}

function getVideo(): VideoProvider {
  const {
    BUNNY_STREAM_LIBRARY_ID: libraryId,
    BUNNY_STREAM_API_KEY: apiKey,
    BUNNY_STREAM_TOKEN_AUTH_KEY: tokenAuthKey,
    BUNNY_STREAM_CDN_HOSTNAME: cdnHostname,
    BUNNY_WEBHOOK_SECRET: webhookSecret,
  } = env
  video ??= realOrFake(
    'Bunny Stream',
    libraryId && apiKey && tokenAuthKey && cdnHostname && webhookSecret
      ? () => createBunnyStream({ libraryId, apiKey, tokenAuthKey, cdnHostname, webhookSecret })
      : null,
    () => createFakeBunny().provider,
  )
  return video
}

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
    get kyc() {
      return getKyc()
    },
    get payouts() {
      return getPayouts()
    },
    get video() {
      return getVideo()
    },
    get payments() {
      return getPayments()
    },
    get clickCounter() {
      const redis = getRedis()
      return redis ? createClickCounter(redis) : undefined
    },
    urls: { app: env.NEXT_PUBLIC_APP_URL, cdn: env.NEXT_PUBLIC_CDN_URL ?? null },
  }
}
