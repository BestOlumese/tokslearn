'use client'
// Client component: "Helpful" and "Report" under one review (docs/10 §12), on the reviews page
// only. Signed-out visitors are sent to sign in. Deliberately dependency-free (no UI kit, no
// shop helpers): this public page has about 2 KB of JS left in its budget (docs/12 §1).

import { useState } from 'react'

const signedIn = () => document.cookie.split('; ').includes('tl_signed_in=1')

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/v1${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error("We couldn't reach Tokslearn. Check your connection and try again.")
  }
  const data = (await res.json().catch(() => null)) as (T & { message?: string }) | null
  if (!res.ok) throw new Error(data?.message ?? 'Something went wrong. Try again.')
  return data as T
}

const textButton = 'min-h-9 text-body-sm text-ink-2 hover:text-ink hover:underline'

export function ReviewActions({
  reviewId,
  helpfulCount,
  signInHref,
}: {
  reviewId: string
  helpfulCount: number
  signInHref: string
}) {
  const [count, setCount] = useState(helpfulCount)
  const [voted, setVoted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)
  const guard = () => {
    if (signedIn()) return true
    window.location.assign(signInHref)
    return false
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm">
      <button
        type="button"
        aria-pressed={voted}
        className={textButton}
        onClick={async () => {
          if (!guard()) return
          setError(null)
          try {
            const r = await post<{ helpfulCount: number; votedByMe: boolean }>(
              `/reviews/${reviewId}/helpful`,
              { reviewId, on: !voted },
            )
            setCount(r.helpfulCount)
            setVoted(r.votedByMe)
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
          }
        }}
      >
        {voted ? 'You found this helpful' : 'Helpful'}
        {count > 0 ? ` (${count})` : ''}
      </button>
      <button
        type="button"
        aria-expanded={reporting}
        className={textButton}
        onClick={() => guard() && setReporting(!reporting)}
      >
        Report
      </button>
      {error ? (
        <span role="alert" className="text-danger">
          {error}
        </span>
      ) : null}
      {reporting ? <ReportForm reviewId={reviewId} onClose={() => setReporting(false)} /> : null}
    </div>
  )
}

function ReportForm({ reviewId, onClose }: { reviewId: string; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (done) {
    return (
      <p role="status" className="basis-full text-body-sm text-ink">
        Thanks. Tokslearn staff will take a look.
      </p>
    )
  }
  return (
    <form
      className="flex basis-full flex-col gap-2 rounded-control border border-border bg-canvas p-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setPending(true)
        setError(null)
        try {
          await post(`/reviews/${reviewId}/report`, { reviewId, reason })
          setDone(true)
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          setPending(false)
        }
      }}
    >
      <label htmlFor={`report-${reviewId}`} className="text-body-sm font-medium text-ink">
        What’s wrong with this review? The learner isn’t told who reported it.
      </label>
      <textarea
        id={`report-${reviewId}`}
        value={reason}
        required
        minLength={3}
        maxLength={500}
        rows={2}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-body text-ink focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />
      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-4">
        <button
          type="submit"
          disabled={pending}
          className="min-h-9 text-body-sm font-medium text-brand-ink hover:underline disabled:opacity-40"
        >
          {pending ? 'Sending…' : 'Send report'}
        </button>
        <button type="button" className={textButton} onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}
