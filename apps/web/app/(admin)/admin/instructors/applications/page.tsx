import { listApplications } from '@tokslearn/core/instructors'
import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Skeleton } from '@tokslearn/ui/skeleton'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tokslearn/ui/table'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { KycBadge, PayoutBadge } from '@/components/admin/onboarding-badges'
import { staffErrorState } from '@/components/admin/staff-error'
import { formatDate } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Instructor applications' }

type Search = { status?: string; cursor?: string }
const filters = [
  ['open', 'Waiting'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
] as const

// docs/20 §6 `/admin/instructors/applications` (reviewer+). Oldest waiting first.
export default function ApplicationsPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <div>
      <AdminPageHeader
        title="Instructor applications"
        description="Read the answers, open the sample and check identity before deciding. Aim for 3 working days."
      />
      <Suspense fallback={<Skeleton className="mt-6 h-80 w-full rounded-card" />}>
        <Applications searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Applications({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams
  const path = '/admin/instructors/applications'
  const status = filters.find(([f]) => f === params.status)?.[0] ?? 'open'
  const ctx = await requireSignedInCtx(path)
  let page: Awaited<ReturnType<typeof listApplications>>
  try {
    page = await listApplications(ctx, { status, cursor: params.cursor, limit: 25 })
  } catch (error) {
    return <div className="mt-6">{staffErrorState(error, path)}</div>
  }

  return (
    <>
      <nav aria-label="Filter applications" className="mt-6 flex gap-2">
        {filters.map(([value, label]) => (
          <Link
            key={value}
            href={`${path}?status=${value}` as Route}
            aria-current={status === value ? 'page' : undefined}
            className={buttonClasses({
              variant: status === value ? 'primary' : 'secondary',
              size: 'sm',
            })}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-5">
        {page.items.length === 0 ? (
          <EmptyState
            title={status === 'open' ? 'No applications waiting' : 'Nothing here yet'}
            description={
              status === 'open'
                ? 'New applications appear here as soon as someone submits.'
                : 'Decided applications appear here.'
            }
          />
        ) : (
          <Table>
            <TableCaption>Instructor applications</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Identity</TableHead>
                <TableHead>Bank account</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link
                      href={`${path}/${a.id}` as Route}
                      className="font-medium text-brand underline-offset-4 hover:underline"
                    >
                      {a.name}
                    </Link>
                    {a.headline ? <div className="text-ink-3">{a.headline}</div> : null}
                  </TableCell>
                  <TableCell>
                    <KycBadge status={a.kycStatus} />
                  </TableCell>
                  <TableCell>
                    <PayoutBadge status={a.payoutAccountStatus} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {a.submittedAt ? formatDate(a.submittedAt) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {page.nextCursor ? (
          <div className="mt-4">
            <Link
              href={`${path}?${new URLSearchParams({ status, cursor: page.nextCursor })}` as Route}
              className={buttonClasses({ variant: 'secondary' })}
            >
              Next page
            </Link>
          </div>
        ) : null}
      </div>
    </>
  )
}
