import { getApplicationDetail } from '@tokslearn/core/instructors'
import { isDomainError } from '@tokslearn/core/kernel'
import { Badge } from '@tokslearn/ui/badge'
import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata } from 'next'
import Link from 'next/link'
import { type ReactNode, Suspense } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { ApplicationDecision } from '@/components/admin/application-decision'
import { KycBadge, PayoutBadge } from '@/components/admin/onboarding-badges'
import { staffErrorState } from '@/components/admin/staff-error'
import { formatDate, formatDateTime } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Instructor application' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const statusLabel = {
  draft: 'Draft',
  submitted: 'Waiting',
  in_review: 'In review',
  approved: 'Approved',
  rejected: 'Rejected',
} as const

// docs/20 §6 `/admin/instructors/applications/[id]`: answers, sample, KYC result (status, score,
// name on record — never ID numbers), bank name match, decision.
export default function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div>
      <Link
        href="/admin/instructors/applications"
        className="inline-flex min-h-11 items-center text-body-sm text-brand underline-offset-4 hover:underline"
      >
        All applications
      </Link>
      <Suspense fallback={<Skeleton className="mt-4 h-96 w-full rounded-card" />}>
        <Detail params={params} />
      </Suspense>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-body-sm text-ink-2">{label}</dt>
      <dd className="min-w-0 break-words text-body text-ink">{children}</dd>
    </div>
  )
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const path = `/admin/instructors/applications/${id}`
  const ctx = await requireSignedInCtx(path)
  let d: Awaited<ReturnType<typeof getApplicationDetail>>
  try {
    if (!UUID.test(id)) throw new Error('bad id')
    d = await getApplicationDetail(ctx, id)
  } catch (error) {
    if (!isDomainError(error) || error.code === 'APPLICATION_NOT_FOUND') {
      return (
        <EmptyState
          className="mt-6"
          title="We couldn't find that application."
          description="The link may be wrong, or it's still a draft."
          action={
            <Link
              href="/admin/instructors/applications"
              className={buttonClasses({ variant: 'secondary' })}
            >
              Back to applications
            </Link>
          }
        />
      )
    }
    return <div className="mt-6">{staffErrorState(error, path)}</div>
  }

  const open = d.status === 'submitted' || d.status === 'in_review'
  const score = (n: number | null, pct = false) =>
    n === null ? '—' : pct ? `${Math.round(n * 100)}%` : `${n.toFixed(1)} / 100`

  return (
    <div className="mt-2 flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-h1-sm text-ink">{d.name}</h1>
            <Badge
              tone={d.status === 'approved' ? 'brand' : d.status === 'rejected' ? 'danger' : 'info'}
            >
              {statusLabel[d.status]}
            </Badge>
          </div>
          <p className="mt-1 text-body text-ink-2">
            {d.headline ?? 'No headline'} · {d.email}
          </p>
          <p className="mt-1 text-body-sm text-ink-3">
            {d.submittedAt ? `Submitted ${formatDateTime(d.submittedAt)}` : null}
            {d.decidedAt
              ? ` · Decided ${formatDateTime(d.decidedAt)}${d.reviewerName ? ` by ${d.reviewerName}` : ''}`
              : null}
          </p>
        </div>
        {open ? <ApplicationDecision id={d.id} name={d.name} /> : null}
      </div>

      {d.decisionReason && !open ? (
        <SettingsPanel id="decision" title="Decision note">
          <p className="whitespace-pre-line text-body text-ink">{d.decisionReason}</p>
        </SettingsPanel>
      ) : null}

      <SettingsPanel id="answers" title="Answers" description="What the applicant told us.">
        <dl className="divide-y divide-border">
          <Row label="Topics">{d.about.topics?.join(', ') ?? '—'}</Row>
          <Row label="Experience">
            <span className="whitespace-pre-line">{d.about.experience ?? '—'}</span>
          </Row>
          <Row label="First course">
            <span className="whitespace-pre-line">{d.expertise ?? '—'}</span>
          </Row>
          <Row label="Sample">
            {d.sampleUrl ? (
              <a
                href={d.sampleUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-brand underline underline-offset-4"
              >
                {d.sampleUrl}
              </a>
            ) : (
              '—'
            )}
          </Row>
        </dl>
      </SettingsPanel>

      <SettingsPanel
        id="identity"
        title="Identity"
        description="The result of the BVN or NIN check. We never store the number."
      >
        {d.kyc ? (
          <dl className="divide-y divide-border">
            <Row label="Result">
              <KycBadge status={d.kyc.status} />
            </Row>
            <Row label="Checked with">{d.kyc.method === 'bvn' ? 'BVN' : 'NIN'}</Row>
            <Row label="Name on the record">
              <span className="flex flex-wrap items-center gap-2">
                {d.kyc.matchedName ?? '—'}
                {d.kyc.nameMatchesAccount === false ? (
                  <Badge tone="warning">Differs from account name ({d.name})</Badge>
                ) : null}
              </span>
            </Row>
            <Row label="Selfie match">{score(d.kyc.faceMatchScore)}</Row>
            <Row label="Attempts">{d.kyc.attempts}</Row>
            <Row label="Last checked">{formatDateTime(d.kyc.checkedAt)}</Row>
          </dl>
        ) : (
          <p className="text-body text-ink-2">No identity check yet.</p>
        )}
      </SettingsPanel>

      <SettingsPanel
        id="bank"
        title="Bank account"
        description="The name the bank holds for this account, compared with the verified identity."
      >
        {d.payoutAccount ? (
          <dl className="divide-y divide-border">
            <Row label="Name match">
              <PayoutBadge status={d.payoutAccount.status} />
            </Row>
            <Row label="Bank">{d.payoutAccount.bankName}</Row>
            <Row label="Account">•••• {d.payoutAccount.accountNumberLast4}</Row>
            <Row label="Name at the bank">{d.payoutAccount.accountName}</Row>
            <Row label="Similarity">{score(d.payoutAccount.nameMatchScore, true)}</Row>
          </dl>
        ) : (
          <p className="text-body text-ink-2">No bank account added.</p>
        )}
      </SettingsPanel>

      {d.previousApplications.length > 0 ? (
        <SettingsPanel id="history" title="Earlier applications">
          <ul className="divide-y divide-border">
            {d.previousApplications.map((p) => (
              <li key={p.id} className="flex justify-between gap-4 py-3 text-body">
                <span>{statusLabel[p.status]}</span>
                <span className="text-ink-2">{p.decidedAt ? formatDate(p.decidedAt) : '—'}</span>
              </li>
            ))}
          </ul>
        </SettingsPanel>
      ) : null}
    </div>
  )
}
