'use client'
// Client component: `/teach/earnings` sales table (docs/20 §5): one line per course sold, newest
// first, filtered by status, 50 a page, and this year as a CSV for a spreadsheet.

import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import type { EarningLineStatus } from '@tokslearn/contract'
import { Badge, type BadgeTone } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { cn } from '@tokslearn/ui/cn'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@tokslearn/ui/table'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { formatDate, formatDayMonth, formatNaira } from '@/lib/format'
import { api, orpc } from '@/lib/orpc'

const filters = [
  [undefined, 'All sales'],
  ['pending', 'Pending'],
  ['available', 'Available'],
  ['paid', 'Paid out'],
  ['refunded', 'Refunded'],
] as const

const statusBadge: Record<EarningLineStatus, [BadgeTone, string]> = {
  pending: ['neutral', 'Pending'],
  available: ['brand', 'Available'],
  paid: ['info', 'Paid out'],
  refunded: ['danger', 'Refunded'],
  refund_pending: ['warning', 'Refund requested'],
}

const sourceLabel: Record<string, string> = {
  instructor_referral: 'Your referral link',
  instructor_coupon: 'Your coupon',
  platform_organic: 'Found on Tokslearn',
  platform_paid: 'Tokslearn ads',
}

export function EarningLines() {
  const [status, setStatus] = useState<EarningLineStatus | undefined>(undefined)
  const q = useInfiniteQuery(
    orpc.earnings.lines.infiniteOptions({
      input: (before: string | undefined) => ({ ...(status ? { status } : {}), before }),
      initialPageParam: undefined,
      getNextPageParam: (last) => (last.hasMore ? last.items.at(-1)?.orderItemId : undefined),
    }),
  )
  const csv = useMutation({
    mutationFn: () => api.earnings.exportCsv({}),
    onSuccess: ({ filename, csv: text }) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    },
  })
  const items = q.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Show" className="flex flex-wrap gap-1.5">
          {filters.map(([f, label]) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={status === f}
              onClick={() => setStatus(f)}
              className={cn(
                'h-9 rounded-full border px-3.5 text-body-sm',
                status === f
                  ? 'border-brand bg-brand-soft text-brand-ink'
                  : 'border-border bg-surface text-ink-2 hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Button variant="secondary" loading={csv.isPending} onClick={() => csv.mutate()}>
          Download this year (CSV)
        </Button>
      </div>
      {csv.isError ? <FormAlert tone="error">{apiErrorMessage(csv.error)}</FormAlert> : null}

      {q.isPending ? (
        <Skeleton className="h-60 w-full rounded-card" />
      ) : q.isError ? (
        <FormAlert tone="error">{apiErrorMessage(q.error)}</FormAlert>
      ) : items.length === 0 ? (
        <EmptyState
          title={status ? 'No sales with this status.' : 'No sales yet.'}
          description={
            status
              ? 'Try another filter.'
              : 'When someone buys one of your courses, the sale shows here with your share.'
          }
        />
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface sm:hidden">
            {items.map((l) => {
              const [tone, label] = statusBadge[l.status]
              return (
                <li key={l.orderItemId} className="flex flex-col gap-1 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-body text-ink">{l.courseTitle}</p>
                    <span className="font-semibold text-ink tabular-nums">
                      {formatNaira(l.shareKobo)}
                    </span>
                  </div>
                  <p className="text-body-sm text-ink-2">
                    {formatDate(l.paidAt)} · paid {formatNaira(l.pricePaidKobo)} · fee{' '}
                    {formatNaira(l.paymentFeeKobo)}
                  </p>
                  <p className="text-body-sm text-ink-2">
                    {sourceLabel[l.source] ?? l.source} · Order {l.orderPublicId}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tone={tone}>{label}</Badge>
                    {l.releasesOn ? (
                      <span className="text-body-sm text-ink-2">
                        Available {formatDayMonth(l.releasesOn)}
                      </span>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="hidden overflow-x-auto rounded-card border border-border bg-surface sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Your share</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((l) => {
                  const [tone, label] = statusBadge[l.status]
                  return (
                    <TableRow key={l.orderItemId}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatDate(l.paidAt)}
                      </TableCell>
                      <TableCell className="min-w-48">
                        <p className="text-ink">{l.courseTitle}</p>
                        <p className="text-body-sm text-ink-2">
                          {sourceLabel[l.source] ?? l.source} · Order {l.orderPublicId}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNaira(l.pricePaidKobo)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="font-semibold text-ink">{formatNaira(l.shareKobo)}</span>
                        <p className="text-body-sm text-ink-2">
                          Fee {formatNaira(l.paymentFeeKobo)}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge tone={tone}>{label}</Badge>
                        {l.releasesOn ? (
                          <p className="mt-1 text-body-sm text-ink-2">
                            Available {formatDayMonth(l.releasesOn)}
                          </p>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      {q.hasNextPage ? (
        <Button
          variant="secondary"
          className="self-center"
          loading={q.isFetchingNextPage}
          onClick={() => q.fetchNextPage()}
        >
          Show older sales
        </Button>
      ) : null}
    </div>
  )
}
