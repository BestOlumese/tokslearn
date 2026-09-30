import * as community from '@tokslearn/core/community'
import { Badge } from '@tokslearn/ui/badge'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { ReportActions } from '@/components/admin/report-actions'
import { staffErrorState } from '@/components/admin/staff-error'
import { formatDateTime } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Moderation' }

// docs/20 §6 `/admin/moderation` (support+): reported discussions and replies, oldest first.
// Reviews join in Phase 9.
export default function ModerationPage() {
  return (
    <div>
      <AdminPageHeader
        title="Moderation"
        description="Posts learners reported. Hiding one takes it off the course for learners; the course's teachers still see it."
      />
      <Suspense fallback={<Skeleton className="mt-6 h-72 w-full rounded-card" />}>
        <Queue />
      </Suspense>
    </div>
  )
}

async function Queue() {
  const path = '/admin/moderation'
  const ctx = await requireSignedInCtx(path)
  let items: community.ReportView[]
  try {
    items = await community.listOpenReports(ctx)
  } catch (error) {
    return <div className="mt-6">{staffErrorState(error, path)}</div>
  }
  if (items.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState title="Nothing reported" description="New reports show up here." />
      </div>
    )
  }
  return (
    <ul className="mt-6 flex flex-col gap-3">
      {items.map((r) => (
        <li
          key={r.id}
          className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 sm:flex-row sm:items-start"
        >
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink-2">
              <Badge tone="warning">
                {r.reports} {r.reports === 1 ? 'report' : 'reports'}
              </Badge>
              {r.targetType === 'thread' ? 'Discussion' : 'Reply'} by {r.authorName} in{' '}
              {r.courseTitle} · {formatDateTime(r.createdAt)}
            </p>
            <p className="mt-2 text-body text-ink">{r.excerpt}</p>
            <p className="mt-2 text-body-sm text-ink-2">Reason given: {r.reason}</p>
            <Link
              href={`/learn/${r.courseSlug}/community/${r.threadId}` as Route}
              className="mt-1 inline-block text-body-sm text-brand-ink hover:underline"
            >
              Open the discussion
            </Link>
          </div>
          <ReportActions reportId={r.id} />
        </li>
      ))}
    </ul>
  )
}
