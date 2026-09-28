import * as commerce from '@tokslearn/core/commerce'
import type * as ledger from '@tokslearn/core/ledger'
import { buttonClasses } from '@tokslearn/ui/button'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { JournalEntryList } from '@/components/admin/journal-entry-list'
import { staffErrorState } from '@/components/admin/staff-error'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Ledger' }

type Search = Promise<{ cursor?: string; kind?: string }>

const kinds: ReadonlyArray<[ledger.JournalKind | 'all', string]> = [
  ['all', 'All'],
  ['sale', 'Sales'],
  ['release', 'Releases'],
  ['refund', 'Refunds'],
  ['payout', 'Payouts'],
  ['adjustment', 'Adjustments'],
]

// Read-only ledger explorer (Phase 4 acceptance: balanced entries for each test order), with the
// same integrity check the nightly job runs. Finance and admins.
export default function LedgerPage({ searchParams }: { searchParams: Search }) {
  return (
    <div>
      <AdminPageHeader
        title="Ledger"
        description="Every money movement as balanced journal entries. Read-only: corrections are new adjustment entries."
      />
      <Suspense fallback={<Skeleton className="mt-6 h-96 w-full rounded-card" />}>
        <Entries searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Entries({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const path = '/admin/ledger'
  const ctx = await requireSignedInCtx(path)
  const kind = kinds.find(([k]) => k === params.kind)?.[0] ?? 'all'
  let overview: Awaited<ReturnType<typeof commerce.ledgerOverview>>
  try {
    overview = await commerce.ledgerOverview(ctx, {
      kind: kind === 'all' ? undefined : kind,
      cursor: params.cursor,
      limit: 20,
    })
  } catch (error) {
    return <div className="mt-6">{staffErrorState(error, path)}</div>
  }
  const { page, integrity: check } = overview
  const ok = check.ok
  return (
    <div className="mt-6 flex flex-col gap-6">
      <div
        role="status"
        className={`rounded-card border px-4 py-3 text-body-sm ${ok ? 'border-border bg-surface text-ink' : 'border-danger/40 bg-danger-soft text-danger'}`}
      >
        {ok
          ? 'Books check out: every entry balances, balances match their lines, and every paid order has its sale entry and enrollments.'
          : `Check failed: ${check.unbalancedEntries.length} unbalanced entries, ${check.balanceMismatches.length} balance mismatches, ${check.ordersWithoutSaleEntry.length} paid orders without a sale entry, ${check.ordersWithoutEnrollment.length} without enrollments.`}
      </div>
      <nav aria-label="Entry kinds" className="flex flex-wrap gap-2">
        {kinds.map(([k, label]) => (
          <Link
            key={k}
            href={(k === 'all' ? path : `${path}?kind=${k}`) as Route}
            aria-current={k === kind ? 'page' : undefined}
            className={buttonClasses({ variant: k === kind ? 'primary' : 'secondary', size: 'sm' })}
          >
            {label}
          </Link>
        ))}
      </nav>
      <JournalEntryList entries={page.items} />
      {page.nextCursor ? (
        <Link
          href={
            `${path}?${new URLSearchParams({ ...(kind === 'all' ? {} : { kind }), cursor: page.nextCursor })}` as Route
          }
          className={buttonClasses({ variant: 'secondary', className: 'self-start' })}
        >
          Older entries
        </Link>
      ) : null}
    </div>
  )
}
