import 'server-only'
import { log } from '@tokslearn/core/kernel'

/** 5xx errors from the API: structured log always, Sentry when configured. */
export function reportServerError(error: unknown, requestId: string | undefined): void {
  log('error', 'api request failed', {
    ...(requestId ? { requestId } : {}),
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  })
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return
  void import('@sentry/nextjs').then((Sentry) =>
    Sentry.captureException(error, { tags: requestId ? { requestId } : {} }),
  )
}
