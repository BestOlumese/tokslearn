import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

const optional = z.string().min(1).optional()

/**
 * Every environment variable, validated at boot and build (docs/22 §3).
 * Provider keys are optional until the phase that needs them. Server values never reach the
 * browser; NEXT_PUBLIC_* values must not be secrets.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_VERSION: z.string().default('dev'),
    DATABASE_URL: z.url(),
    DATABASE_URL_DIRECT: z.url().optional(),
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: optional,
    BETTER_AUTH_SECRET: z.string().min(32).optional(),
    BETTER_AUTH_URL: z.url().optional(),
    GOOGLE_CLIENT_ID: optional,
    GOOGLE_CLIENT_SECRET: optional,
    PAYSTACK_SECRET_KEY: optional,
    DOJAH_APP_ID: optional,
    DOJAH_SECRET_KEY: optional,
    DOJAH_BASE_URL: z.url().optional(),
    DOJAH_WEBHOOK_SECRET: optional,
    BUNNY_STREAM_LIBRARY_ID: optional,
    BUNNY_STREAM_API_KEY: optional,
    BUNNY_STREAM_TOKEN_AUTH_KEY: optional,
    BUNNY_STREAM_CDN_HOSTNAME: optional,
    BUNNY_WEBHOOK_SECRET: optional,
    DAILY_API_KEY: optional,
    DAILY_DOMAIN: optional,
    DAILY_WEBHOOK_SECRET: optional,
    R2_ACCOUNT_ID: optional,
    R2_ACCESS_KEY_ID: optional,
    R2_SECRET_ACCESS_KEY: optional,
    R2_BUCKET_PUBLIC: optional,
    R2_BUCKET_PRIVATE: optional,
    INNGEST_EVENT_KEY: optional,
    INNGEST_SIGNING_KEY: optional,
    INNGEST_DEV: z.enum(['0', '1']).optional(),
    RESEND_API_KEY: optional,
    EMAIL_FROM: optional,
    EMAIL_REPLY_TO: z.email().optional(),
    SUPPORT_EMAIL: z.email().optional(),
    FINANCE_ALERT_EMAIL: z.email().optional(),
    SENTRY_AUTH_TOKEN: optional,
    SENTRY_ORG: optional,
    SENTRY_PROJECT: optional,
    IP_HASH_SALT: z.string().min(16).optional(),
    CRON_ADMIN_TOKEN: z.string().min(24).optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.url(),
    NEXT_PUBLIC_APP_ENV: z.enum(['local', 'preview', 'staging', 'production']),
    NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: optional,
    NEXT_PUBLIC_DOJAH_WIDGET_ID: optional,
    NEXT_PUBLIC_CDN_URL: z.url().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
    NEXT_PUBLIC_POSTHOG_KEY: optional,
    NEXT_PUBLIC_POSTHOG_HOST: z.url().optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
    NEXT_PUBLIC_DOJAH_WIDGET_ID: process.env.NEXT_PUBLIC_DOJAH_WIDGET_ID,
    NEXT_PUBLIC_CDN_URL: process.env.NEXT_PUBLIC_CDN_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  },
  // Empty strings from .env files count as unset.
  emptyStringAsUndefined: true,
  // CI builds without real secrets set SKIP_ENV_VALIDATION=1; runtime still validates on Vercel.
  skipValidation: process.env.SKIP_ENV_VALIDATION === '1',
})
