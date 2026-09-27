import * as Sentry from '@sentry/nextjs'

// Loaded by lib/report-client-error.ts on the first browser error only (ADR-027).

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'local',
  sendDefaultPii: false,
  tracesSampleRate: 0,
  // Our own listeners forward uncaught errors; Sentry's would double-report them.
  integrations: (defaults) => defaults.filter((i) => i.name !== 'GlobalHandlers'),
})

export function captureClientError(error: unknown): void {
  Sentry.captureException(error)
}
