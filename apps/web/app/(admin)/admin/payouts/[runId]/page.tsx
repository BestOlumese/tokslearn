import * as commerce from '@tokslearn/core/commerce'
import { hasRole, isDomainError } from '@tokslearn/core/kernel'
import { Badge } from '@tokslearn/ui/badge'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@tokslearn/ui/table'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { anomaly, holdReason, itemStatus, runStatus } from '@/components/admin/payout-labels'
import { PayoutItemAction, PayoutRunActions } from '@/components/admin/payout-run-actions'
import { staffErrorState } from '@/components/admin/staff-error'
import { FormAlert } from '@/components/auth/form-alert'
import { formatDateTime, formatNaira } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Payout run' }

type Params = Promise<{ runId: string }>

// docs/20 §6 `/admin/payouts/[runId]` (finance): who is paid and how much, who is held and why,
// what looks unusual; approve (2FA), co-sign over the limit, retry failures, export (ADR-046).
export default function PayoutRunPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-card" />}>
      <Run params={params} />
    </Suspense>
  )
}

async function Run({ params }: { params: Params }) {
  const { runId } = await params
  const path = `/admin/payouts/${runId}`
  const ctx = await requireSignedInCtx(path)
  let run: commerce.PayoutRunDetail
  try {
    run = await commerce.getPayoutRun(ctx, runId)
  } catch (error) {
    if (isDomainError(error) && error.code === 'PAYOUT_RUN_NOT_FOUND') {
      return <FormAlert tone="error">We couldn’t find that payout run.</FormAlert>
    }
    return staffErrorState(error, path)
  }
  const [tone, label] = runStatus[run.status]
  const isDraft = run.status === 'draft'
  const superAdmin = ctx.actor.kind === 'user' && hasRole(ctx.actor, 'super_admin')
  const flagged = run.items.filter((i) => i.anomalies.length > 0 && i.status === 'queued').length
  const toPay = run.items.filter((i) => i.status !== 'held').length
  const thisMonth =
    new Date(ctx.now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 7) === run.month

  return (
    <div>
      <AdminPageHeader
        title={`${run.label} payout run`}
        description={`Transfers start ${formatDateTime(run.payOn)}. Nothing is sent before then, or before the run is approved.`}
        actions={<Badge tone={tone}>{label}</Badge>}
      />
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="To pay"
          value={formatNaira(run.totalKobo)}
          note={`${toPay} ${toPay === 1 ? 'instructor' : 'instructors'}`}
        />
        <Stat label="Held" value={String(run.counts.held)} note="Not paid this month" />
        <Stat label="Flagged" value={String(flagged)} note="Worth a look before approving" />
        <Stat
          label="Paid so far"
          value={String(run.counts.success)}
          note={`${run.counts.failed + run.counts.reversed} failed`}
        />
      </dl>

      <section
        aria-labelledby="sign-title"
        className="mt-6 rounded-card border border-border bg-surface p-5"
      >
        <h2 id="sign-title" className="text-h3 text-ink">
          Approval
        </h2>
        <p className="mt-1 max-w-prose text-body-sm text-ink-2">
          {run.approvedAt
            ? `Approved by ${run.approvedByName ?? 'finance'} on ${formatDateTime(run.approvedAt)}.`
            : 'Not approved yet. Approving needs the code from your authenticator app.'}{' '}
          {run.cosignRequired
            ? run.cosignedAt
              ? `Co-signed by ${run.cosignedByName ?? 'a super admin'} on ${formatDateTime(run.cosignedAt)}.`
              : 'This run is over the co-sign limit, so a super admin who didn’t approve it must co-sign too.'
            : ''}
        </p>
        {run.lastError ? (
          <div className="mt-3">
            <FormAlert tone="error">
              Paystack refused a batch: {run.lastError}. Top up the Paystack balance if needed, then
              send the failed ones again.
            </FormAlert>
          </div>
        ) : null}
        <div className="mt-4">
          <PayoutRunActions
            runId={run.publicId}
            canApprove={isDraft && !run.approvedAt && run.counts.queued > 0}
            canCosign={isDraft && Boolean(run.approvedAt) && run.cosignRequired && superAdmin}
            canRedraft={isDraft && !run.approvedAt && thisMonth}
          />
        </div>
      </section>

      <section aria-labelledby="items-title" className="mt-8">
        <h2 id="items-title" className="text-h2 text-ink">
          Instructors
        </h2>
        <p className="mt-1 mb-4 max-w-prose text-body-sm text-ink-2">
          Failed transfers first, then flagged and held instructors. Held money stays in the
          instructor’s available balance for next month.
        </p>
        <div className="relative overflow-x-auto rounded-card border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Instructor</TableHead>
                <TableHead>Bank</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {run.items.map((i) => {
                const [itone, ilabel] = itemStatus[i.status]
                const action =
                  isDraft && !run.approvedAt && i.status === 'queued'
                    ? 'hold'
                    : isDraft && !run.approvedAt && i.holdReason === 'finance_hold'
                      ? 'release'
                      : i.status === 'failed' || i.status === 'reversed'
                        ? 'retry'
                        : null
                const notes = [
                  ...(i.holdReason ? [holdReason[i.holdReason]] : []),
                  ...i.anomalies.map((a) => anomaly[a] ?? a),
                  ...(i.nettedKobo > 0n
                    ? [`${formatNaira(i.nettedKobo)} owed back taken off`]
                    : []),
                  ...(i.failureReason ? [i.failureReason] : []),
                ]
                return (
                  <TableRow key={i.id}>
                    <TableCell className="min-w-40 font-medium text-ink">
                      {i.instructorName}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {i.bankName ? `${i.bankName} •••• ${i.last4}` : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNaira(i.amountKobo)}
                    </TableCell>
                    <TableCell>
                      <Badge tone={itone}>{ilabel}</Badge>
                      {i.attempt > 1 ? (
                        <p className="mt-1 text-body-sm text-ink-2">Try {i.attempt}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="min-w-48 text-body-sm text-ink-2">
                      {notes.length > 0 ? notes.join(' · ') : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {action ? (
                        <PayoutItemAction
                          runId={run.publicId}
                          itemId={i.id}
                          action={action}
                          name={i.instructorName}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <dt className="text-body-sm text-ink-2">{label}</dt>
      <dd className="mt-1 text-h2 text-ink tabular-nums">{value}</dd>
      <dd className="mt-1 text-body-sm text-ink-2">{note}</dd>
    </div>
  )
}
