'use client'
// Error boundaries must be client components (Next.js). Sentry captures via onRequestError
// on the server and the browser SDK on the client.

import { Button } from '@tokslearn/ui/button'

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto max-w-page px-4 pt-10 sm:px-6 sm:pt-16 lg:px-8">
      <h1 className="text-h1-sm text-ink sm:text-h1">This page didn't load</h1>
      <p className="mt-3 max-w-prose text-body-lg text-ink-2">
        Something went wrong on our side. Try again; if it keeps happening, email
        support@tokslearn.com
        {error.digest ? (
          <>
            {' '}
            with code <span className="font-mono tabular-nums">{error.digest}</span>
          </>
        ) : null}
        .
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
