import { listMyCourses } from '@tokslearn/core/courses'
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
import { CourseStatusBadge } from '@/components/studio/course-status-badge'
import { NotInstructor } from '@/components/studio/not-instructor'
import { formatDate } from '@/lib/format'
import { studioCtx } from '@/lib/require-instructor'

export const metadata: Metadata = { title: 'Your courses' }

// docs/20 §5 `/teach/courses`. Learners, rating and revenue columns arrive with Phases 4–5.
export default function StudioCoursesPage() {
  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-h1-sm text-ink">Your courses</h1>
          <p className="mt-1 text-body text-ink-2">
            Build a course, send it for review, and it goes on sale once approved.
          </p>
        </div>
        <Link href="/teach/courses/new" className={buttonClasses()}>
          New course
        </Link>
      </div>
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-72 w-full rounded-card" />}>
          <Courses />
        </Suspense>
      </div>
    </div>
  )
}

async function Courses() {
  const { ctx, isInstructor } = await studioCtx('/teach/courses')
  if (!isInstructor) return <NotInstructor />
  const rows = await listMyCourses(ctx)
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No courses yet"
        description="Start with a working title and a category. You can change both later."
        action={
          <Link href="/teach/courses/new" className={buttonClasses()}>
            Create your first course
          </Link>
        }
      />
    )
  }
  return (
    <Table>
      <TableCaption>Your courses</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Course</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last changed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => (
          <TableRow key={c.id}>
            <TableCell>
              <Link
                href={`/teach/courses/${c.id}/details` as Route}
                className="font-medium text-brand underline-offset-4 hover:underline"
              >
                {c.title}
              </Link>
            </TableCell>
            <TableCell>
              <CourseStatusBadge
                status={c.status}
                updateInReview={c.hasLive && c.revisionStatus === 'submitted'}
              />
            </TableCell>
            <TableCell className="whitespace-nowrap">{formatDate(c.updatedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
