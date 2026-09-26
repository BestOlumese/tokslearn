'use client'
// Replaces the root layout when it fails, so it cannot rely on app CSS or fonts.

import { useEffect } from 'react'

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return
    void import('@sentry/nextjs').then((Sentry) => Sentry.captureException(error))
  }, [error])

  return (
    <html lang="en-NG">
      <body
        style={{
          margin: 0,
          padding: '64px 16px',
          fontFamily: 'system-ui, sans-serif',
          background: '#F6F7F6',
          color: '#13181D',
        }}
      >
        <main style={{ maxWidth: 560, margin: '0 auto' }}>
          <h1 style={{ fontSize: 28, lineHeight: '36px', margin: 0 }}>Tokslearn didn't load</h1>
          <p style={{ fontSize: 16, lineHeight: '24px', color: '#46505A' }}>
            Something went wrong on our side. Reload the page; if it keeps happening, email
            support@tokslearn.com{error.digest ? ` with code ${error.digest}` : ''}.
          </p>
          <a href="/" style={{ color: '#0E6B4E', fontWeight: 600 }}>
            Reload Tokslearn
          </a>
        </main>
      </body>
    </html>
  )
}
