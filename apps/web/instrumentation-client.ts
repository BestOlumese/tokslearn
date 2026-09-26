// Browser Sentry, loaded as a separate chunk only when a DSN is set, so it never counts
// against the public-page JS budget when unused (docs/12 §1).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  const start = () =>
    import('@sentry/nextjs').then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'local',
        tracesSampleRate: 0.05,
        sendDefaultPii: false,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
      })
    })
  if ('requestIdleCallback' in window) window.requestIdleCallback(() => void start())
  else setTimeout(() => void start(), 2000)
}
