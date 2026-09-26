import { listReviewQueue } from '@tokslearn/core/courses'
import { Badge } from '@tokslearn/ui/badge'
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
import { staffErrorState } from '@/components/admin/staff-error'
import { formatDateTime } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Course reviews' }

// docs/20 §6 `/admin/reviews/courses` (reviewer+). Oldest first; target 3 working days.
export default function CourseReviewsPage() {
  return (
    <div>
      <AdminPageHeader
        title="Course reviews"
        description="New courses and updates to live ones. Check them against the content rules before they go on sale."
      />
      <Suspense fallback={<Skeleton className="mt-6 h-72 w-full rounded-card" />}>
        <Queue />
      </Suspense>
    </div>
  )
}

async function Queue() {
  const path = '/admin/reviews/courses'
  const ctx = await requireSignedInCtx(path)
  let rows: Awaited<ReturnType<typeof listReviewQueue>>
  try {
    rows = await listReviewQueue(ctx)
  } catch (error) {
    return <div className="mt-6">{staffErrorState(error, path)}</div>
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        className="mt-6"
        title="Nothing waiting for review"
        description="Courses appear here as soon as an instructor submits them."
      />
    )
  }
  return (
    <div className="mt-6">
      <Table>
        <TableCaption>Courses waiting for review</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Course</TableHead>
            <TableHead>Instructor</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Submitted</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.revisionId}>
              <TableCell>
                <Link
                  href={`${path}/${r.revisionId}` as Route}
                  className="font-medium text-brand underline-offset-4 hover:underline"
                >
                  {r.title}
                </Link>
              </TableCell>
              <TableCell>{r.instructorName}</TableCell>
              <TableCell>
                <Badge tone={r.isUpdate ? 'info' : 'brand'}>
                  {r.isUpdate ? 'Update' : 'New course'}
                </Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {r.submittedAt ? formatDateTime(r.submittedAt) : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
