'use client'
// Client component: the grading queue (docs/20 `/teach/grading`): work waiting (oldest first,
// flagged when it has waited over 5 days), graded work, and flagged exam attempts.

import { useQuery } from '@tanstack/react-query'
import type { QueueItemDto } from '@tokslearn/contract'
import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { cn } from '@tokslearn/ui/cn'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Route } from 'next'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { formatDate, formatDateTime } from '@/lib/format'
import { api, orpc } from '@/lib/orpc'

type Tab = 'waiting' | 'done' | 'flagged'
const tabs: ReadonlyArray<[Tab, string]> = [
  ['waiting', 'Waiting'],
  ['done', 'Graded'],
  ['flagged', 'Flagged exams'],
]
export const reasonText = {
  focus_loss: 'Left the exam often or for long',
  fullscreen_exit: 'Left fullscreen',
  paste: 'Tried to paste',
  network_change: 'Changed network',
  too_fast: 'Passed very fast',
} as const

export function GradingQueue() {
  const params = useSearchParams()
  const tab = (params.get('tab') as Tab | null) ?? 'waiting'
  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Grading" className="flex gap-2">
        {tabs.map(([t, label]) => (
          <Link
            key={t}
            href={(t === 'waiting' ? '/teach/grading' : `/teach/grading?tab=${t}`) as Route}
            aria-current={t === tab ? 'page' : undefined}
            className={cn(
              'inline-flex h-9 items-center rounded-full border px-4 text-body-sm',
              t === tab
                ? 'border-brand bg-brand-soft font-medium text-brand-ink'
                : 'border-border text-ink-2 hover:text-ink',
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === 'flagged' ? <Flagged /> : <Submissions status={tab} />}
    </div>
  )
}

function Submissions({ status }: { status: 'waiting' | 'done' }) {
  const first = useQuery(orpc.grading.queue.queryOptions({ input: { status } }))
  const [more, setMore] = useState<QueueItemDto[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const next = cursor ?? first.data?.nextCursor ?? null
  const items = [...(first.data?.items ?? []), ...more]
  if (first.isPending) return <Skeleton className="h-48 w-full rounded-card" />
  if (first.error) return <FormAlert tone="error">{apiErrorMessage(first.error)}</FormAlert>
  if (items.length === 0) {
    return (
      <p className="rounded-card border border-border bg-surface p-8 text-body text-ink-2">
        {status === 'waiting'
          ? 'Nothing to grade. Work that learners submit in your courses shows up here, oldest first.'
          : 'Nothing graded yet.'}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
        {items.map((i) => (
          <li key={i.submissionId}>
            <Link
              href={`/teach/grading/${i.submissionId}` as Route}
              className="flex flex-col gap-1 p-4 hover:bg-canvas sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="min-w-0">
                <span className="block truncate text-body font-medium text-ink">
                  {i.assignmentTitle} · {i.learnerName}
                  {i.attemptNo > 1 ? ` · attempt ${i.attemptNo}` : ''}
                </span>
                <span className="block truncate text-body-sm text-ink-2">
                  {i.courseTitle} · submitted {formatDateTime(i.submittedAt)}
                </span>
              </span>
              <span className="flex shrink-0 gap-1.5">
                {i.isLate ? <Badge tone="warning">Late</Badge> : null}
                {i.overdue ? <Badge tone="danger">Waiting over 5 days</Badge> : null}
                {i.status === 'returned' ? <Badge tone="info">Sent back</Badge> : null}
                {i.status === 'graded' ? <Badge tone="brand">Graded</Badge> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      {next ? (
        <Button
          variant="secondary"
          className="w-fit"
          loading={loading}
          onClick={async () => {
            setLoading(true)
            try {
              const page = await api.grading.queue({ status, cursor: next })
              setMore((m) => [...m, ...page.items])
              setCursor(page.nextCursor ?? '')
            } catch (e) {
              setError(apiErrorMessage(e))
            } finally {
              setLoading(false)
            }
          }}
        >
          Show more
        </Button>
      ) : null}
    </div>
  )
}

function Flagged() {
  const list = useQuery(orpc.grading.flagged.queryOptions({ input: {} }))
  if (list.isPending) return <Skeleton className="h-48 w-full rounded-card" />
  if (list.error) return <FormAlert tone="error">{apiErrorMessage(list.error)}</FormAlert>
  if (!list.data?.length) {
    return (
      <p className="rounded-card border border-border bg-surface p-8 text-body text-ink-2">
        No flagged exam attempts. Attempts over the recorded-signal thresholds show up here for you
        to review.
      </p>
    )
  }
  return (
    <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
      {list.data.map((a) => (
        <li key={a.attemptId}>
          <Link
            href={`/teach/grading/attempts/${a.attemptId}` as Route}
            className="flex flex-col gap-1 p-4 hover:bg-canvas"
          >
            <span className="text-body font-medium text-ink">
              {a.examTitle} · {a.learnerName} · attempt {a.attemptNo}
            </span>
            <span className="text-body-sm text-ink-2">
              {a.courseTitle}
              {a.submittedAt ? ` · ${formatDate(a.submittedAt)}` : ''}
              {a.score !== null && a.maxScore
                ? ` · ${a.score}/${a.maxScore}${a.passed ? ', passed' : ''}`
                : ''}
            </span>
            <span className="flex flex-wrap gap-1.5">
              {a.reasons.map((r) => (
                <Badge key={r} tone="warning">
                  {reasonText[r]}
                </Badge>
              ))}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
