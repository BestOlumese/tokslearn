// Browser error reporting that costs nothing until something breaks. Everything Sentry-related
// (SDK ~160 KB and its setup) sits in lib/sentry-client.ts, downloaded on the first error only,
// so this file, which ships on every page, stays a few lines (docs/12 §1, ADR-027).
// Server-side Sentry is set up in instrumentation.ts.

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

/**
 * React #419: a streamed Suspense boundary ended on the server with notFound()/redirect() or a
 * server error. The not-found case is normal on catalog pages for unknown slugs, and real server
 * errors are already reported by server-side Sentry, so the browser copy is noise.
 */
export function reportClientError(error: unknown): void {
  if (!dsn || /#419\b/.test(String(error))) return
  void import('./sentry-client').then((m) => m.captureClientError(error))
}

/** Forwards uncaught errors and unhandled promise rejections. Called once from instrumentation-client. */
export function listenForClientErrors(): void {
  if (!dsn) return
  window.addEventListener('error', (event) => reportClientError(event.error ?? event.message))
  window.addEventListener('unhandledrejection', (event) => reportClientError(event.reason))
}
