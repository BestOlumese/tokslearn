import * as commerce from '@tokslearn/core/commerce'
import { buttonClasses } from '@tokslearn/ui/button'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { EarningLines } from '@/components/studio/earnings/earning-lines'
import { StatementDownload } from '@/components/studio/earnings/statement-download'
import { NotInstructor } from '@/components/studio/not-instructor'
import { formatDate, formatDateTime, formatDayMonth, formatNaira } from '@/lib/format'
import { studioCtx } from '@/lib/require-instructor'

export const metadata: Metadata = { title: 'Earnings' }

// docs/20 §5 `/teach/earnings`: balances, the next payout, what blocks it, every sale, and the
// monthly statements (docs/08 §8–9, ADR-044).
export default function EarningsPage() {
  return (
    <div>
      <h1 className="text-h1-sm text-ink">Earnings</h1>
      <p className="mt-1 max-w-prose text-body text-ink-2">
        Each sale stays pending until its refund window closes. Then it becomes available, and we
        pay out everything available once a month.
      </p>
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-card" />}>
          <Earnings />
        </Suspense>
      </div>
    </div>
  )
}

const fixes: Record<
  commerce.PayoutProblem,
  { text: (s: commerce.EarningsSummary) => string; href: Route; action: string }
> = {
  no_payout_account: {
    text: () => 'Add the bank account we should pay you into.',
    href: '/teach/settings#step-bank-title' as Route,
    action: 'Add bank account',
  },
  payout_account_in_review: {
    text: () =>
      'The name on your bank account doesn’t match your verified identity, so a reviewer is checking it. Payouts start once it’s approved.',
    href: '/teach/settings#step-bank-title' as Route,
    action: 'See bank account',
  },
  payout_account_on_hold: {
    text: (s) =>
      `You changed your bank account recently. To protect you, payouts to it start after ${s.payoutAccount ? formatDateTime(s.payoutAccount.allowedFrom) : '72 hours'}.`,
    href: '/teach/settings#step-bank-title' as Route,
    action: 'See bank account',
  },
  kyc_not_verified: {
    text: () => 'Verify your identity with your BVN or NIN. We can’t send money until we have.',
    href: '/teach/settings#step-identity-title' as Route,
    action: 'Verify identity',
  },
  two_factor_off: {
    text: () => 'Turn on two-factor authentication, so nobody else can move your earnings.',
    href: '/account/settings/security',
    action: 'Set up two-factor',
  },
}

async function Earnings() {
  const { ctx, isInstructor } = await studioCtx('/teach/earnings')
  if (!isInstructor) return <NotInstructor />
  const [s, statements, payouts] = await Promise.all([
    commerce.earningsSummary(ctx),
    commerce.listStatements(ctx),
    commerce.listMyPayouts(ctx),
  ])
  const holding = s.problems.filter((p) => p !== 'payout_account_on_hold').length > 0

  return (
    <div className="flex flex-col gap-10">
      {s.problems.length > 0 ? (
        <section
          aria-labelledby="fix-title"
          className="rounded-card border border-warning/40 bg-warning-soft p-5"
        >
          <h2 id="fix-title" className="text-h3 text-ink">
            {holding ? 'We can’t pay you yet' : 'Your next payout is on hold'}
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {s.problems.map((p) => (
              <li
                key={p}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="max-w-prose text-body text-ink">{fixes[p].text(s)}</p>
                <Link
                  href={fixes[p].href}
                  className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                >
                  {fixes[p].action}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="balances-title">
        <h2 id="balances-title" className="sr-only">
          Balances
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Balance
            label="Pending"
            value={s.pendingKobo}
            note={
              s.upcomingReleases[0]
                ? `${formatNaira(s.upcomingReleases[0].amountKobo)} becomes available on ${formatDayMonth(s.upcomingReleases[0].on)}`
                : 'Nothing waiting on a refund window'
            }
          />
          <Balance
            label="Available"
            value={s.availableKobo}
            strong
            note={
              s.availableKobo >= s.minPayoutKobo
                ? `Paid out on ${formatDate(s.nextPayoutOn)}`
                : `Paid out once it reaches ${formatNaira(s.minPayoutKobo)}`
            }
          />
          <Balance label="On its way" value={s.inTransitKobo} note="Sent to your bank" />
          <Balance
            label="Paid this year"
            value={s.paidThisYearKobo}
            note={
              s.payoutAccount
                ? `To ${s.payoutAccount.bankName} •••• ${s.payoutAccount.last4}`
                : 'No bank account yet'
            }
          />
        </dl>
        {s.receivableKobo > 0n ? (
          <p className="mt-3 max-w-prose text-body-sm text-ink-2">
            A learner was refunded after we had paid you for their purchase. We’ll take{' '}
            {formatNaira(s.receivableKobo)} off your next payout.
          </p>
        ) : null}
        {s.upcomingReleases.length > 1 ? (
          <div className="mt-5">
            <h3 className="text-body font-semibold text-ink">Coming up</h3>
            <ul className="mt-2 flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
              {s.upcomingReleases.map((u) => (
                <li key={u.on.toISOString()} className="flex justify-between px-4 py-2.5 text-body">
                  <span className="text-ink-2">{formatDayMonth(u.on)}</span>
                  <span className="text-ink tabular-nums">{formatNaira(u.amountKobo)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {payouts.length > 0 ? (
        <section aria-labelledby="payouts-title">
          <h2 id="payouts-title" className="text-h2 text-ink">
            Payouts
          </h2>
          <ul className="mt-4 flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
            {payouts.map((p) => (
              <li
                key={p.month}
                className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-body font-medium text-ink">{p.label}</p>
                  <p className="text-body-sm text-ink-2">{payoutNote(p)}</p>
                </div>
                <span className="text-body font-semibold text-ink tabular-nums">
                  {formatNaira(p.amountKobo)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="sales-title">
        <h2 id="sales-title" className="text-h2 text-ink">
          Sales
        </h2>
        <p className="mt-1 mb-4 max-w-prose text-body-sm text-ink-2">
          Your share is what’s left after Tokslearn’s commission and your part of the Paystack fee.
          Sales through your own links and coupons keep 97%.
        </p>
        <EarningLines />
      </section>

      <section aria-labelledby="statements-title">
        <h2 id="statements-title" className="text-h2 text-ink">
          Monthly statements
        </h2>
        <p className="mt-1 mb-4 max-w-prose text-body-sm text-ink-2">
          A PDF for each month you had sales, refunds or payouts, ready on the 1st of the next
          month. Useful for your accountant or a loan application.
        </p>
        {statements.length === 0 ? (
          <p className="text-body text-ink-2">
            Your first statement arrives on the 1st of next month.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
            {statements.map((st) => (
              <li
                key={st.month}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-body font-medium text-ink">{st.label}</p>
                  <p className="text-body-sm text-ink-2">
                    {st.totals.sales} {st.totals.sales === 1 ? 'sale' : 'sales'} · you earned{' '}
                    {formatNaira(st.totals.shareEarnedKobo)}
                    {st.totals.refunds > 0
                      ? ` · ${st.totals.refunds} ${st.totals.refunds === 1 ? 'refund' : 'refunds'}`
                      : ''}
                  </p>
                </div>
                <StatementDownload month={st.month} label={st.label} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function payoutNote(p: commerce.MyPayout): string {
  const bank = p.bankName ? `${p.bankName} •••• ${p.last4}` : 'your bank'
  const netted =
    p.nettedKobo > 0n ? ` ${formatNaira(p.nettedKobo)} owed back from refunds was taken off.` : ''
  switch (p.status) {
    case 'paid':
      return `Paid to ${bank} on ${formatDate(p.settledAt ?? p.payOn)}.${netted}`
    case 'failed':
      return `Didn’t go through to ${bank}. The money is back in your available balance.`
    case 'held':
      return 'Not paid this month. Check the box at the top of this page for what to fix.'
    case 'sending':
      return `On its way to ${bank}.${netted}`
    default:
      return `Goes to ${bank} on ${formatDate(p.payOn)}.`
  }
}

function Balance({
  label,
  value,
  note,
  strong = false,
}: {
  label: string
  value: bigint
  note: string
  strong?: boolean
}) {
  return (
    <div
      className={`rounded-card border p-4 ${strong ? 'border-brand/40 bg-brand-soft' : 'border-border bg-surface'}`}
    >
      <dt className="text-body-sm text-ink-2">{label}</dt>
      <dd className="mt-1 text-h2 text-ink tabular-nums">{formatNaira(value)}</dd>
      <dd className="mt-1 text-body-sm text-ink-2">{note}</dd>
    </div>
  )
}
