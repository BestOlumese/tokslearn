import type { PayoutItemStatus } from '@tokslearn/contract'
import { monthLabel } from '@tokslearn/core/commerce'
import * as instructors from '@tokslearn/core/instructors'
import { hasRole, NotFoundError } from '@tokslearn/core/kernel'
import { Badge } from '@tokslearn/ui/badge'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { itemStatus } from '@/components/admin/payout-labels'
import { staffErrorState } from '@/components/admin/staff-error'
import { IssueStrikeForm, RevokeStrike } from '@/components/admin/strike-actions'
import { FormAlert } from '@/components/auth/form-alert'
import { formatDate, formatDateTime, formatNaira } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Instructor' }

type Params = Promise<{ id: string }>

// docs/20 §6 `/admin/instructors/[id]` (reviewer+): courses, money, bank and identity, payouts,
// strikes. Suspending is on the user page; commission overrides on the commission page (ADR-047).
export default function AdminInstructorPage({ params }: { params: Params }) {
  return (
    <div>
      <Link
        href="/admin/instructors"
        className="inline-flex min-h-11 items-center text-body-sm text-brand underline-offset-4 hover:underline"
      >
        All instructors
      </Link>
      <Suspense fallback={<Skeleton className="mt-4 h-96 w-full rounded-card" />}>
        <Detail params={params} />
      </Suspense>
    </div>
  )
}

const kycLabel: Record<string, string> = {
  verified: 'Identity verified',
  manual_review: 'Identity in manual review',
  pending: 'Identity check pending',
  failed: 'Identity check failed',
}

async function Detail({ params }: { params: Params }) {
  const { id } = await params
  const path = `/admin/instructors/${id}`
  const ctx = await requireSignedInCtx(path)
  let d: instructors.InstructorDetail
  try {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError('USER_NOT_FOUND')
    d = await instructors.getInstructorDetail(ctx, id)
  } catch (error) {
    return <div className="mt-4">{staffErrorState(error, path)}</div>
  }
  const actor = ctx.actor.kind === 'user' ? ctx.actor : null
  const canIssue = actor ? hasRole(actor, 'reviewer', 'admin', 'super_admin') : false
  const canRevoke = actor ? hasRole(actor, 'admin', 'super_admin') : false
  const isSuperAdmin = actor ? hasRole(actor, 'super_admin') : false

  return (
    <div className="mt-2 flex flex-col gap-10">
      <header>
        <h1 className="text-h1-sm text-ink sm:text-h1">{d.name}</h1>
        <p className="mt-1 text-body text-ink-2">
          {d.email} ·{' '}
          <Link href={`/instructors/${d.slug}` as Route} className="text-brand-ink hover:underline">
            /instructors/{d.slug}
          </Link>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {d.suspended ? (
            <Badge tone="danger">Suspended{d.banReason ? `: ${d.banReason}` : ''}</Badge>
          ) : null}
          <Badge tone={d.kycStatus === 'verified' ? 'brand' : 'warning'}>
            {d.kycStatus ? (kycLabel[d.kycStatus] ?? d.kycStatus) : 'No identity check'}
          </Badge>
          <Badge tone={d.twoFactorEnabled ? 'brand' : 'neutral'}>
            {d.twoFactorEnabled ? '2FA on' : '2FA off'}
          </Badge>
          {d.activeStrikes > 0 ? (
            <Badge tone={d.activeStrikes >= instructors.STRIKE_LIMIT ? 'danger' : 'warning'}>
              {d.activeStrikes} of {instructors.STRIKE_LIMIT} strikes
            </Badge>
          ) : null}
        </div>
        <p className="mt-3 text-body-sm text-ink-3">
          Teaching since {formatDate(d.approvedAt)} ·{' '}
          <Link
            href={`/admin/users/${d.userId}` as Route}
            className="text-brand-ink hover:underline"
          >
            Account, roles and suspension
          </Link>
          {isSuperAdmin ? (
            <>
              {' · '}
              <Link href="/admin/settings/commission" className="text-brand-ink hover:underline">
                {d.commissionOverrideId ? 'Commission override set' : 'Commission override'}
              </Link>
            </>
          ) : null}
        </p>
      </header>

      {d.activeStrikes >= instructors.STRIKE_LIMIT ? (
        <FormAlert tone="error">
          {d.name} has {d.activeStrikes} strikes in the last 12 months. The content policy says
          instructor privileges are removed at {instructors.STRIKE_LIMIT}: an admin can remove the
          instructor role or suspend the account from the account page.
        </FormAlert>
      ) : null}

      <section aria-labelledby="money-title">
        <h2 id="money-title" className="text-h3 text-ink">
          Money
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Pending" value={formatNaira(d.money.pendingKobo)} />
          <Stat label="Available" value={formatNaira(d.money.availableKobo)} />
          <Stat label="On its way" value={formatNaira(d.money.inTransitKobo)} />
          <Stat label="Owed back" value={formatNaira(d.money.receivableKobo)} />
          <Stat label="Paid out, all time" value={formatNaira(d.money.paidKobo)} />
        </dl>
        <p className="mt-3 text-body-sm text-ink-2">
          {d.payoutAccount
            ? `Bank: ${d.payoutAccount.bankName} •••• ${d.payoutAccount.last4} (${d.payoutAccount.status === 'active' ? 'active' : 'waiting for review'}${d.payoutAccount.payoutsAllowedFrom > ctx.now ? `, payouts from ${formatDateTime(d.payoutAccount.payoutsAllowedFrom)}` : ''}).`
            : 'No bank account yet.'}
        </p>
        {d.payouts.length > 0 ? (
          <ul className="mt-3 flex flex-col divide-y divide-border rounded-card border border-border bg-surface text-body-sm">
            {d.payouts.map((p) => (
              <li key={p.month} className="flex justify-between gap-3 px-4 py-2.5">
                <span className="text-ink">
                  {monthLabel(p.month)} ·{' '}
                  {itemStatus[p.status as PayoutItemStatus]?.[1] ?? p.status}
                </span>
                <span className="text-ink tabular-nums">{formatNaira(p.amountKobo)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="courses-title">
        <h2 id="courses-title" className="text-h3 text-ink">
          Courses ({d.courses.length})
        </h2>
        {d.courses.length === 0 ? (
          <p className="mt-2 text-body-sm text-ink-2">No courses yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
            {d.courses.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:justify-between"
              >
                <div>
                  <p className="text-body text-ink">{c.title}</p>
                  <p className="text-body-sm text-ink-2">
                    {c.status} · {formatNaira(c.priceKobo)} · {c.learners.toLocaleString('en-NG')}{' '}
                    {c.learners === 1 ? 'learner' : 'learners'}
                    {c.rating !== null ? ` · ${c.rating.toFixed(1)} from ${c.ratings}` : ''}
                  </p>
                </div>
                {c.status === 'published' ? (
                  <Link
                    href={`/courses/${c.slug}` as Route}
                    className="text-body-sm text-brand-ink hover:underline"
                  >
                    Course page
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="strikes-title">
        <h2 id="strikes-title" className="text-h3 text-ink">
          Strikes
        </h2>
        <p className="mt-1 max-w-prose text-body-sm text-ink-2">
          Content-policy strikes. {instructors.STRIKE_LIMIT} within 12 months remove instructor
          privileges. The instructor is emailed when one is recorded.
        </p>
        {d.strikes.length === 0 ? (
          <p className="mt-3 text-body-sm text-ink-2">None.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
            {d.strikes.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body font-medium text-ink">{s.rule}</span>
                  {s.revokedAt ? (
                    <Badge tone="neutral">Revoked</Badge>
                  ) : s.active ? (
                    <Badge tone="warning">Counts</Badge>
                  ) : (
                    <Badge tone="neutral">Over 12 months old</Badge>
                  )}
                </div>
                <p className="text-body-sm text-ink">{s.reason}</p>
                <p className="text-body-sm text-ink-3">
                  {formatDateTime(s.createdAt)} by {s.issuedByName ?? 'staff'}
                  {s.courseTitle ? ` · ${s.courseTitle}` : ''}
                  {s.revokedAt
                    ? ` · revoked ${formatDateTime(s.revokedAt)} by ${s.revokedByName ?? 'an admin'}: ${s.revokeReason ?? ''}`
                    : ''}
                </p>
                {canRevoke && !s.revokedAt ? <RevokeStrike strikeId={s.id} /> : null}
              </li>
            ))}
          </ul>
        )}
        {canIssue ? (
          <div className="mt-4 rounded-card border border-border bg-surface p-4">
            <h3 className="mb-3 text-body font-semibold text-ink">Record a strike</h3>
            <IssueStrikeForm
              instructorId={d.userId}
              courses={d.courses.map((c) => ({ id: c.id, title: c.title }))}
            />
          </div>
        ) : null}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <dt className="text-body-sm text-ink-2">{label}</dt>
      <dd className="mt-1 text-h3 text-ink tabular-nums">{value}</dd>
    </div>
  )
}
