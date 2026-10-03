import * as commerce from '@tokslearn/core/commerce'
import { Badge } from '@tokslearn/ui/badge'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { RefundDecision } from '@/components/admin/refund-decision'
import { staffErrorState } from '@/components/admin/staff-error'
import { formatDateTime, formatNaira } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Refund request' }

type Params = Promise<{ refundId: string }>

const reasonLabel: Record<string, string> = {
  not_as_described: 'Not what the course page described',
  quality: 'Teaching or videos not good enough',
  technical: 'Videos or files didn’t work',
  duplicate: 'Bought it twice',
  changed_mind: 'Changed their mind',
  other: 'Something else',
}
const eventLabel: Record<string, string> = {
  resource_download: 'Downloaded',
  exam_started: 'Started the exam',
  certificate_issued: 'Certificate issued',
}

// docs/20 §6 `/admin/refunds/[id]` (finance): eligibility snapshot, the buyer's reasons and
// appeal, how much they watched, the download/exam/certificate timeline, and the decision.
export default function AdminRefundPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-card" />}>
      <Detail params={params} />
    </Suspense>
  )
}

async function Detail({ params }: { params: Params }) {
  const { refundId } = await params
  const path = `/admin/refunds/${refundId}`
  const ctx = await requireSignedInCtx(path)
  let r: commerce.RefundReview
  try {
    r = await commerce.getRefundForReview(ctx, refundId)
  } catch (error) {
    return staffErrorState(error, path)
  }
  const snap = r.eligibility as { decision?: string; code?: string | null }
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <AdminPageHeader
        title={`Refund ${r.publicId}`}
        description={`${r.courseTitle} · ${formatNaira(r.amountKobo)} · order ${r.orderPublicId}`}
      />
      <Link
        href={'/admin/refunds' as Route}
        className="w-fit text-body-sm text-brand-ink hover:underline"
      >
        Back to the queue
      </Link>
      <dl className="grid gap-x-6 gap-y-3 rounded-card border border-border bg-surface p-5 text-body-sm sm:grid-cols-2">
        <div>
          <dt className="text-ink-3">Buyer</dt>
          <dd className="text-ink">
            {r.buyerName} · {r.buyerEmail}
          </dd>
        </div>
        <div>
          <dt className="text-ink-3">Status</dt>
          <dd>
            <Badge>{r.status.replace('_', ' ')}</Badge>
          </dd>
        </div>
        <div>
          <dt className="text-ink-3">Paid</dt>
          <dd className="text-ink">{r.paidAt ? formatDateTime(r.paidAt) : '—'}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Refund window until</dt>
          <dd className="text-ink">
            {r.refundableUntil ? formatDateTime(r.refundableUntil) : 'No window'}
          </dd>
        </div>
        <div>
          <dt className="text-ink-3">Video watched</dt>
          <dd className="text-ink">{r.watchedPct}%</dd>
        </div>
        <div>
          <dt className="text-ink-3">The rules said</dt>
          <dd className="text-ink">
            {snap.decision === 'review'
              ? 'Review: frequent refunds'
              : snap.decision === 'deny'
                ? `Decline (${snap.code})`
                : 'Approve'}
          </dd>
        </div>
      </dl>
      <section className="flex flex-col gap-2">
        <h2 className="text-h4 text-ink">What the buyer said</h2>
        <p className="text-body text-ink">{reasonLabel[r.reasonCode] ?? r.reasonCode}</p>
        {r.reasonText ? (
          <p className="whitespace-pre-line text-body text-ink-2">{r.reasonText}</p>
        ) : null}
        {r.appealText ? (
          <div className="rounded-control border-l-2 border-brand bg-canvas px-4 py-3">
            <p className="text-body-sm font-medium text-ink">Appeal</p>
            <p className="mt-1 whitespace-pre-line text-body-sm text-ink-2">{r.appealText}</p>
          </div>
        ) : null}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-h4 text-ink">Timeline</h2>
        {r.timeline.length === 0 ? (
          <p className="text-body-sm text-ink-2">No downloads, exam starts or certificates.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-body-sm">
            {r.timeline.map((t) => (
              <li key={`${t.kind}-${t.at.toISOString()}`} className="text-ink">
                {formatDateTime(t.at)} · {eventLabel[t.kind] ?? t.kind}
                {t.label ? `: ${t.label}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
      {r.status === 'under_review' ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-h4 text-ink">Decide</h2>
          <p className="text-body-sm text-ink-2">
            Approving ends the learner’s access and sends the money back through Paystack. If the
            instructor was already paid, their share becomes a balance to recover.
          </p>
          <RefundDecision refundId={r.publicId} mode="decide" />
        </section>
      ) : r.status === 'failed' ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-h4 text-ink">Paystack couldn’t send it</h2>
          <RefundDecision refundId={r.publicId} mode="retry" />
        </section>
      ) : r.decisionReason ? (
        <p className="text-body-sm text-ink-2">Decision: {r.decisionReason}</p>
      ) : null}
    </div>
  )
}
