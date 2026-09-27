import { type AdminCourseFilter, listAdminCourses } from '@tokslearn/core/courses'
import { Badge } from '@tokslearn/ui/badge'
import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Input } from '@tokslearn/ui/input'
import { Select } from '@tokslearn/ui/select'
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
import { CourseListingActions } from '@/components/admin/course-listing-actions'
import { staffErrorState } from '@/components/admin/staff-error'
import { CourseStatusBadge } from '@/components/studio/course-status-badge'
import { formatDate, formatNaira } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Courses' }

type Search = { q?: string; status?: string; cursor?: string }

const filters: ReadonlyArray<[AdminCourseFilter, string]> = [
  ['all', 'Any status'],
  ['published', 'Live'],
  ['in_review', 'In review'],
  ['changes_requested', 'Changes requested'],
  ['draft', 'Draft'],
  ['unlisted', 'Unlisted'],
  ['archived', 'Unpublished'],
]

// docs/20 §6 `/admin/courses` (reviewer+). Status filter, search, feature, unpublish/restore.
export default function AdminCoursesPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <div>
      <AdminPageHeader
        title="Courses"
        description="Every course on Tokslearn. Pick what the home page features, or take a course off sale."
      />
      <Suspense fallback={<CoursesSkeleton />}>
        <Courses searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Courses({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams
  const path = '/admin/courses'
  const ctx = await requireSignedInCtx(path)
  const status = filters.find(([f]) => f === params.status)?.[0] ?? 'all'
  let page: Awaited<ReturnType<typeof listAdminCourses>>
  try {
    page = await listAdminCourses(ctx, {
      status,
      q: params.q?.slice(0, 100) || undefined,
      cursor: params.cursor,
      limit: 25,
    })
  } catch (error) {
    return <div className="mt-6">{staffErrorState(error, path)}</div>
  }

  const nextHref = page.nextCursor
    ? (`${path}?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), ...(status !== 'all' ? { status } : {}), cursor: page.nextCursor })}` as Route)
    : null

  return (
    <>
      <form
        aria-label="Search courses"
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        action={path}
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="q" className="text-body-sm font-medium text-ink">
            Title or URL slug
          </label>
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={params.q ?? ''}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-52">
          <label htmlFor="status" className="text-body-sm font-medium text-ink">
            Status
          </label>
          <Select id="status" name="status" defaultValue={status}>
            {filters.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <button type="submit" className={buttonClasses({ variant: 'secondary' })}>
          Search
        </button>
      </form>

      <div className="mt-5">
        {page.items.length === 0 ? (
          <EmptyState
            title="No courses match"
            description="Try part of the title, or set the status to any."
            action={
              <Link href={path} className={buttonClasses({ variant: 'secondary' })}>
                Clear search
              </Link>
            }
          />
        ) : (
          <Table>
            <TableCaption>Courses matching your search, most recently changed first</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Published</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    {c.status === 'published' || c.status === 'unlisted' ? (
                      <Link
                        href={`/courses/${c.slug}` as Route}
                        className="font-medium text-brand underline-offset-4 hover:underline"
                      >
                        {c.title}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink">{c.title}</span>
                    )}
                    <div className="text-ink-3">{c.instructorName}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {c.status === 'archived' ? (
                        <Badge tone="warning">Unpublished</Badge>
                      ) : (
                        <CourseStatusBadge status={c.status} />
                      )}
                      {c.featuredAt ? <Badge tone="info">Featured</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {c.priceKobo === 0n ? 'Free' : formatNaira(c.priceKobo)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {c.publishedAt ? formatDate(c.publishedAt) : '—'}
                  </TableCell>
                  <TableCell>
                    <CourseListingActions
                      course={{
                        id: c.id,
                        title: c.title,
                        status: c.status,
                        featured: c.featuredAt !== null,
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      {nextHref ? (
        <Link
          href={nextHref}
          className={buttonClasses({ variant: 'secondary', className: 'mt-4' })}
        >
          Next 25 courses
        </Link>
      ) : null}
    </>
  )
}

function CoursesSkeleton() {
  return (
    <div className="mt-6 flex flex-col gap-3" aria-hidden>
      <Skeleton className="h-10 w-full" />
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}
