import * as commerce from '@tokslearn/core/commerce'
import { Badge } from '@tokslearn/ui/badge'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@tokslearn/ui/table'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { runStatus } from '@/components/admin/payout-labels'
import { PreparePayoutRun } from '@/components/admin/payout-run-actions'
import { staffErrorState } from '@/components/admin/staff-error'
import { formatDate, formatNaira } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Payouts' }

// docs/20 §6 `/admin/payouts` (finance): one run a month, drafted on the 1st, paid from the 5th
// once approved (ADR-019, ADR-046).
export default function AdminPayoutsPage() {
  return (
    <div>
      <AdminPageHeader
        title="Payouts"
        description="One run a month. The draft is made on the 1st; once you approve it, transfers go out from the pay day."
      />
      <Suspense fallback={<Skeleton className="h-72 w-full rounded-card" />}>
        <Runs />
      </Suspense>
    </div>
  )
}

const lagosMonth = (d: Date) => new Date(d.getTime() + 60 * 60 * 1000).toISOString().slice(0, 7)

async function Runs() {
  const path = '/admin/payouts'
  const ctx = await requireSignedInCtx(path)
  let runs: commerce.PayoutRunSummary[]
  try {
    runs = await commerce.listPayoutRuns(ctx)
  } catch (error) {
    return staffErrorState(error, path)
  }
  const month = lagosMonth(ctx.now)
  const hasThisMonth = runs.some((r) => r.month === month)
  return (
    <div className="flex flex-col gap-4">
      {hasThisMonth ? null : (
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-prose text-body text-ink-2">
            There’s no run for {commerce.monthLabel(month)} yet. It’s made on the 1st; you can make
            it now to see who would be paid.
          </p>
          <PreparePayoutRun label={`Draft ${commerce.monthLabel(month)}`} />
        </div>
      )}
      {runs.length === 0 ? (
        <EmptyState
          title="No payout runs yet"
          description="The first one appears on the 1st of the month, for instructors with at least ₦5,000 available."
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Pay day</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">To pay</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Held</TableHead>
                <TableHead className="text-right">Failed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => {
                const [tone, label] = runStatus[r.status]
                const toPay = r.counts.queued + r.counts.sending + r.counts.sent
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        href={`/admin/payouts/${r.publicId}` as Route}
                        className="font-medium text-brand-ink hover:underline"
                      >
                        {r.label}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(r.payOn)}</TableCell>
                    <TableCell>
                      <Badge tone={tone}>{label}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNaira(r.totalKobo)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{toPay}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.counts.success}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.counts.held}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.counts.failed + r.counts.reversed}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
