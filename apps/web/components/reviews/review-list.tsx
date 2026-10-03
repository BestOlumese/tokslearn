import type { ReviewPageDto } from '@tokslearn/contract'
import type { ReactNode } from 'react'
import { formatDate } from '@/lib/format'
import { Stars } from './stars'

type Review = ReviewPageDto['items'][number]

/** Average, count and the share of each star (docs/10 §12): only from 3 reviews. */
export function ReviewSummary({ summary }: { summary: ReviewPageDto['summary'] }) {
  if (summary.avg === null || !summary.stars) {
    return summary.count > 0 ? (
      <p className="text-body text-ink-2">
        {summary.count} {summary.count === 1 ? 'review' : 'reviews'} so far. The average shows once
        there are 3.
      </p>
    ) : null
  }
  const stars = summary.stars
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
      <div>
        <p className="text-display-sm font-semibold text-ink tabular-nums">
          {summary.avg.toFixed(1)}
        </p>
        <Stars rating={summary.avg} className="text-body" />
        <p className="text-body-sm text-ink-2">
          {summary.count} {summary.count === 1 ? 'review' : 'reviews'}
        </p>
      </div>
      <ul className="flex w-full max-w-sm flex-col gap-1.5" aria-label="Reviews by stars">
        {[5, 4, 3, 2, 1].map((n) => {
          const count = stars[n - 1] ?? 0
          const pct = summary.count ? Math.round((count / summary.count) * 100) : 0
          return (
            <li key={n} className="flex items-center gap-2 text-body-sm text-ink-2">
              <span className="w-12 shrink-0 tabular-nums">{n} star</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
              </span>
              <span className="w-10 shrink-0 text-right tabular-nums">{pct}%</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** One review with the instructor's reply. `actions` is the helpful/report island, if any. */
export function ReviewItem({
  review: r,
  instructorName,
  actions,
}: {
  review: Review
  instructorName: string
  actions?: ReactNode
}) {
  return (
    <article className="flex flex-col gap-2 border-b border-border py-5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars rating={r.rating} />
        <span className="text-body-sm font-medium text-ink">{r.authorName}</span>
        <span className="text-body-sm text-ink-3">
          {r.finished ? 'Finished the course' : 'Verified learner'} · {formatDate(r.createdAt)}
          {r.editedAt ? ' · edited' : ''}
        </span>
      </div>
      {r.body ? <p className="whitespace-pre-line text-body text-ink">{r.body}</p> : null}
      {r.instructorReply ? (
        <div className="mt-1 rounded-control border-l-2 border-brand bg-canvas px-4 py-3">
          <p className="text-body-sm font-medium text-ink">
            {instructorName} replied · {formatDate(r.instructorReply.at)}
          </p>
          <p className="mt-1 whitespace-pre-line text-body-sm text-ink-2">
            {r.instructorReply.body}
          </p>
        </div>
      ) : null}
      {actions ??
        (r.helpfulCount > 0 ? (
          <p className="text-body-sm text-ink-3">
            {r.helpfulCount} {r.helpfulCount === 1 ? 'person' : 'people'} found this helpful
          </p>
        ) : null)}
    </article>
  )
}
