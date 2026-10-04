import * as analytics from '@tokslearn/core/analytics'
import { cn } from '@tokslearn/ui/cn'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { staffErrorState } from '@/components/admin/staff-error'
import { formatDateTime, formatNaira } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Dashboard' }

type Search = Promise<{ period?: string }>
const periods: ReadonlyArray<[analytics.DashboardPeriod, string]> = [
  ['today', 'Today'],
  ['7d', 'Last 7 days'],
  ['30d', 'Last 30 days'],
]

// docs/20 §6 `/admin` (any staff): money and activity for a period, and what needs attention
// now (ADR-047). Numbers come from our database, not analytics.
export default function AdminHomePage({ searchParams }: { searchParams: Search }) {
  return (
    <div>
      <AdminPageHeader
        title="Dashboard"
        description="Times are Lagos time. Today starts at midnight."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-card" />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Dashboard({ searchParams }: { searchParams: Search }) {
  const { period: raw } = await searchParams
  const period: analytics.DashboardPeriod = periods.some(([p]) => p === raw)
    ? (raw as analytics.DashboardPeriod)
    : 'today'
  const ctx = await requireSignedInCtx('/admin')
  let d: analytics.PlatformDashboard
  try {
    d = await analytics.platformDashboard(ctx, { period })
  } catch (error) {
    return staffErrorState(error, '/admin')
  }
  return (
    <div className="flex flex-col gap-8">
      {d.alerts.length > 0 ? (
        <section aria-labelledby="alerts-title" className="flex flex-col gap-2">
          <h2 id="alerts-title" className="text-h3 text-ink">
            Needs attention
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
            {d.alerts.map((a) => {
              const [text, href, tone] = alertCopy(a)
              return (
                <li
                  key={JSON.stringify(a)}
                  className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="flex items-start gap-2 text-body text-ink">
                    <span
                      aria-hidden
                      className={cn(
                        'mt-2 size-2 shrink-0 rounded-full',
                        tone === 'danger' ? 'bg-danger' : 'bg-warning',
                      )}
                    />
                    {text}
                  </p>
                  <Link
                    href={href as Route}
                    className="text-body-sm font-medium text-brand-ink underline-offset-4 hover:underline"
                  >
                    Open
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ) : (
        <p className="rounded-card border border-border bg-surface p-4 text-body text-ink-2">
          Nothing needs attention right now: background jobs are moving, the books balanced at the
          last check, and no refunds or payout runs are waiting.
        </p>
      )}

      <section aria-labelledby="numbers-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="numbers-title" className="text-h3 text-ink">
            Numbers
          </h2>
          <nav aria-label="Period" className="flex flex-wrap gap-1.5">
            {periods.map(([p, label]) => (
              <Link
                key={p}
                href={(p === 'today' ? '/admin' : `/admin?period=${p}`) as Route}
                aria-current={period === p ? 'page' : undefined}
                className={cn(
                  'inline-flex h-9 items-center rounded-full border px-3.5 text-body-sm',
                  period === p
                    ? 'border-brand bg-brand-soft text-brand-ink'
                    : 'border-border bg-surface text-ink-2 hover:text-ink',
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Orders" value={d.orders.toLocaleString('en-NG')} note="Paid in the period" />
          <Kpi label="Sales (GMV)" value={formatNaira(d.gmvKobo)} note="What learners paid" />
          <Kpi
            label="Tokslearn revenue"
            value={formatNaira(d.revenueKobo)}
            note="Commission and fee recoveries, less refunds"
          />
          <Kpi
            label="Refunds"
            value={`${d.refundRatePct}%`}
            note={`${d.refunds} refunded, ${formatNaira(d.refundedKobo)}`}
          />
          <Kpi
            label="Failed payments"
            value={d.failedPayments.toLocaleString('en-NG')}
            note="Checkouts the bank or card declined"
          />
          <Kpi
            label="New instructors"
            value={d.newInstructors.toLocaleString('en-NG')}
            note="Applications approved"
          />
          <Kpi
            label="Active learners"
            value={d.activeLearners.toLocaleString('en-NG')}
            note="Watched or opened a lesson"
          />
        </dl>
      </section>
    </div>
  )
}

function alertCopy(a: analytics.DashboardAlert): [string, string, 'danger' | 'warning'] {
  switch (a.kind) {
    case 'ledger_integrity':
      return [
        `The books didn’t balance at the last check (${formatDateTime(a.at)}). Finance should look before the next payout.`,
        '/admin/ledger',
        'danger',
      ]
    case 'ledger_never_checked':
      return ['The nightly ledger check hasn’t run yet.', '/admin/ledger', 'warning']
    case 'outbox_stuck':
      return [
        `${a.stale + a.failed} background events are stuck (${a.failed} failed for good).`,
        '/admin/jobs',
        a.failed > 0 ? 'danger' : 'warning',
      ]
    case 'webhooks_failing':
      return [
        `${a.failed + a.stale} provider notifications (Paystack, Bunny, Daily) failed or are waiting.`,
        '/admin/jobs',
        'danger',
      ]
    case 'video_failures':
      return [
        `${a.count} ${a.count === 1 ? 'video' : 'videos'} failed to process this week.`,
        '/admin/courses',
        'warning',
      ]
    case 'refunds_waiting':
      return [
        `${a.count} refund ${a.count === 1 ? 'request is' : 'requests are'} waiting for finance.`,
        '/admin/refunds',
        'warning',
      ]
    case 'payout_run_waiting':
      return [
        `The ${a.label} payout run is waiting for approval.`,
        `/admin/payouts/${a.runId}`,
        'warning',
      ]
    case 'payout_run_failed':
      return [
        `Some transfers in the ${a.label} payout run failed.`,
        `/admin/payouts/${a.runId}`,
        'danger',
      ]
  }
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <dt className="text-body-sm text-ink-2">{label}</dt>
      <dd className="mt-1 text-h2 text-ink tabular-nums">{value}</dd>
      <dd className="mt-1 text-body-sm text-ink-2">{note}</dd>
    </div>
  )
}
