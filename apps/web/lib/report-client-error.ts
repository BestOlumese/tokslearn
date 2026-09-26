// Browser error reporting that costs nothing until something breaks. The Sentry SDK (~160 KB)
// is downloaded on the first error only, so normal page loads stay inside the JS budget
// (docs/12 §1, ADR-027). Server-side Sentry is set up in instrumentation.ts.

type SentryModule = typeof import('@sentry/nextjs')

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
let sentry: Promise<SentryModule> | null = null

function loadSentry(): Promise<SentryModule> {
  sentry ??= import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'local',
      sendDefaultPii: false,
      tracesSampleRate: 0,
      // Our own listeners below forward uncaught errors; Sentry's would double-report them.
      integrations: (defaults) => defaults.filter((i) => i.name !== 'GlobalHandlers'),
    })
    return Sentry
  })
  return sentry
}

export function reportClientError(error: unknown): void {
  if (!dsn) return
  void loadSentry().then((Sentry) => Sentry.captureException(error))
}

/** Forwards uncaught errors and unhandled promise rejections. Called once from instrumentation-client. */
export function listenForClientErrors(): void {
  if (!dsn) return
  window.addEventListener('error', (event) => reportClientError(event.error ?? event.message))
  window.addEventListener('unhandledrejection', (event) => reportClientError(event.reason))
}
