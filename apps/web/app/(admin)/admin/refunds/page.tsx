import * as commerce from '@tokslearn/core/commerce'
import { cn } from '@tokslearn/ui/cn'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@tokslearn/ui/table'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { staffErrorState } from '@/components/admin/staff-error'
import { formatDateTime, formatNaira } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Refunds' }

type Search = Promise<{ status?: string }>
const tabs = [
  ['under_review', 'To decide'],
  ['failed', 'Failed at Paystack'],
  ['processing', 'With Paystack'],
  ['processed', 'Refunded'],
  ['denied', 'Declined'],
] as const
type Tab = (typeof tabs)[number][0]

// docs/20 §6 `/admin/refunds` (finance): requests waiting for a decision (the abuse check and
// appeals), oldest first; other states for follow-up.
export default function AdminRefundsPage({ searchParams }: { searchParams: Search }) {
  return (
    <div>
      <AdminPageHeader
        title="Refunds"
        description="Requests the rules sent to you (frequent refunders and appeals), and refunds Paystack is still handling or couldn't send."
      />
      <Suspense fallback={<Skeleton className="mt-6 h-72 w-full rounded-card" />}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Queue({ searchParams }: { searchParams: Search }) {
  const { status: raw } = await searchParams
  const tab: Tab = tabs.some(([t]) => t === raw) ? (raw as Tab) : 'under_review'
  const path = '/admin/refunds'
  const ctx = await requireSignedInCtx(path)
  let items: commerce.RefundView[]
  try {
    items = await commerce.listRefundQueue(ctx, tab === 'under_review' ? {} : { status: tab })
  } catch (error) {
    return <div className="mt-6">{staffErrorState(error, path)}</div>
  }
  return (
    <div className="mt-6 flex flex-col gap-4">
      <nav aria-label="Refund states" className="flex flex-wrap gap-1.5">
        {tabs.map(([t, label]) => (
          <Link
            key={t}
            href={(t === 'under_review' ? path : `${path}?status=${t}`) as Route}
            aria-current={tab === t ? 'page' : undefined}
            className={cn(
              'inline-flex h-9 items-center rounded-full border px-3.5 text-body-sm',
              tab === t
                ? 'border-brand bg-brand-soft text-brand-ink'
                : 'border-border bg-surface text-ink-2 hover:text-ink',
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <EmptyState
          title="Nothing here"
          description="Refund requests in this state show up here."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Request</TableHead>
              <TableHead>Course</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Asked</TableHead>
              <TableHead>Appeal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link
                    href={`/admin/refunds/${r.publicId}` as Route}
                    className="font-mono font-medium text-brand-ink hover:underline"
                  >
                    {r.publicId}
                  </Link>
                </TableCell>
                <TableCell>{r.courseTitle}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNaira(r.amountKobo)}
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatDateTime(r.createdAt)}</TableCell>
                <TableCell>{r.appealedAt ? 'Yes' : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
