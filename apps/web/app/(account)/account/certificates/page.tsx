import * as certificates from '@tokslearn/core/certificates'
import { Badge } from '@tokslearn/ui/badge'
import { buttonClasses } from '@tokslearn/ui/button'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { CertificateActions } from '@/components/account/certificate-actions'
import { PageHeader } from '@/components/site/page-header'
import { formatDate } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Certificates', robots: { index: false } }

// docs/20 `/account/certificates`: every certificate with download, LinkedIn, the check link and a
// one-time name correction. Revoked ones stay listed with the reason.
export default function CertificatesPage() {
  return (
    <>
      <PageHeader
        title="Certificates"
        width="catalog"
        eyebrow={
          <Link href="/account" className="hover:underline">
            My learning
          </Link>
        }
      />
      <div className="mx-auto max-w-catalog px-4 pt-8 pb-16 sm:px-6 lg:px-8">
        <Suspense fallback={<div className="h-48 animate-pulse rounded-card bg-surface-sunken" />}>
          <List />
        </Suspense>
      </div>
    </>
  )
}

async function List() {
  const ctx = await requireSignedInCtx('/account/certificates')
  const mine = await certificates.listMyCertificates(ctx)
  if (mine.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-dialog border border-border bg-surface p-8 sm:p-10">
        <h2 className="text-h3 text-ink">No certificates yet</h2>
        <p className="max-w-prose text-body text-ink-2">
          Courses with a certificate say on their page how you earn it: finish every lesson, pass
          the final exam, or pass an exam run by another organisation. It appears here the moment
          you do, and we email you.
        </p>
        <Link href="/courses" className={buttonClasses()}>
          Browse courses
        </Link>
      </div>
    )
  }
  return (
    <ul className="flex max-w-[880px] flex-col gap-4">
      {mine.map((c) => (
        <li
          key={c.id}
          className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-h4 text-ink">
                {c.courseSlug ? (
                  <Link
                    href={`/courses/${c.courseSlug}` as Route}
                    className="hover:text-brand-ink hover:underline"
                  >
                    {c.courseTitle}
                  </Link>
                ) : (
                  c.courseTitle
                )}
              </h2>
              <p className="mt-1 text-body-sm text-ink-2">
                {c.recipientName} · {c.basisText} · issued {formatDate(c.issuedAt)}
              </p>
              <p className="mt-1 text-body-sm text-ink-2">
                Code <span className="font-mono tracking-wide text-ink">{c.code}</span> ·{' '}
                <Link
                  href={`/verify/${c.code}` as Route}
                  className="text-brand-ink hover:underline"
                >
                  See the check page
                </Link>
              </p>
            </div>
            {c.status === 'revoked' ? <Badge tone="danger">Revoked</Badge> : null}
          </div>
          {c.status === 'revoked' ? (
            <p className="rounded-control bg-danger-soft p-3 text-body-sm text-ink">
              This certificate was revoked{c.revokedReason ? `: ${c.revokedReason}` : '.'} If you
              think that’s wrong, write to support@tokslearn.com with the code.
            </p>
          ) : (
            <CertificateActions
              cert={{
                id: c.id,
                status: c.status,
                recipientName: c.recipientName,
                canCorrectName: c.canCorrectName,
                verifyUrl: c.verifyUrl,
                linkedInUrl: c.linkedInUrl,
              }}
            />
          )}
        </li>
      ))}
    </ul>
  )
}
