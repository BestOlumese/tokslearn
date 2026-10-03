import * as commerce from '@tokslearn/core/commerce'
import { Badge, type BadgeTone } from '@tokslearn/ui/badge'
import { EmptyState } from '@tokslearn/ui/empty-state'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { AppealForm } from '@/components/refunds/appeal-form'
import { PageHeader } from '@/components/site/page-header'
import { formatDate, formatNaira } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Refunds', robots: { index: false } }

const status: Record<commerce.RefundView['status'], [string, BadgeTone]> = {
  under_review: ['With our team', 'info'],
  approved: ['Approved', 'brand'],
  processing: ['On its way', 'brand'],
  processed: ['Refunded', 'neutral'],
  denied: ['Declined', 'neutral'],
  failed: ['Delayed', 'warning'],
}

// docs/20 `/account/refunds`: refund requests and where they stand; one appeal per decline.
export default function RefundsPage() {
  return (
    <>
      <PageHeader
        title="Refunds"
        eyebrow={
          <Link href="/account/orders" className="hover:underline">
            Orders
          </Link>
        }
      />
      <div className="mx-auto max-w-page px-4 pt-8 pb-16 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <Suspense
            fallback={<div className="h-48 animate-pulse rounded-card bg-surface-sunken" />}
          >
            <List />
          </Suspense>
        </div>
      </div>
    </>
  )
}

async function List() {
  const ctx = await requireSignedInCtx('/account/refunds')
  const items = await commerce.listMyRefunds(ctx)
  if (items.length === 0) {
    return (
      <EmptyState
        title="No refund requests"
        description="You can ask for a refund from the receipt of any order, while the course’s refund window is open."
      />
    )
  }
  return (
    <ul className="divide-y divide-border rounded-card border border-border bg-surface">
      {items.map((r) => {
        const [label, tone] = status[r.status]
        return (
          <li key={r.id} className="flex flex-col gap-2 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/account/orders/${r.orderPublicId}` as Route}
                className="text-body font-medium text-ink hover:text-brand-ink hover:underline"
              >
                {r.courseTitle}
              </Link>
              <Badge tone={tone}>{label}</Badge>
            </div>
            <p className="text-body-sm text-ink-2">
              {formatNaira(r.amountKobo)} · asked {formatDate(r.createdAt)}
              {r.processedAt ? ` · sent back ${formatDate(r.processedAt)}` : ''}
              {r.appealedAt ? ' · appealed' : ''}
            </p>
            {r.status === 'processed' ? (
              <p className="text-body-sm text-ink-2">
                Banks usually take 5 to 10 working days to show it on your statement.
              </p>
            ) : null}
            {r.decisionReason && (r.status === 'denied' || r.status === 'approved') ? (
              <p className="text-body-sm text-ink">{r.decisionReason}</p>
            ) : null}
            {r.canAppeal ? <AppealForm refundId={r.publicId} /> : null}
          </li>
        )
      })}
    </ul>
  )
}
