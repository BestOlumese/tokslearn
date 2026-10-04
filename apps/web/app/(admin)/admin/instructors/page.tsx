import * as instructors from '@tokslearn/core/instructors'
import { Badge } from '@tokslearn/ui/badge'
import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Input } from '@tokslearn/ui/input'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@tokslearn/ui/table'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { staffErrorState } from '@/components/admin/staff-error'
import { formatDate, formatNaira } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Instructors' }

type Search = Promise<{ q?: string; page?: string }>

// docs/20 §6 `/admin/instructors` (reviewer+): approved instructors with what they sell, what
// they're owed and their strikes (ADR-047).
export default function AdminInstructorsPage({ searchParams }: { searchParams: Search }) {
  return (
    <div>
      <AdminPageHeader
        title="Instructors"
        description="Approved instructors. Applications waiting for a decision are under Applications."
      />
      <Suspense fallback={<Skeleton className="h-72 w-full rounded-card" />}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function List({ searchParams }: { searchParams: Search }) {
  const { q, page: rawPage } = await searchParams
  const page = Math.max(0, Number.parseInt(rawPage ?? '0', 10) || 0)
  const path = '/admin/instructors'
  const ctx = await requireSignedInCtx(path)
  let r: Awaited<ReturnType<typeof instructors.listInstructors>>
  try {
    r = await instructors.listInstructors(ctx, { q, page })
  } catch (error) {
    return staffErrorState(error, path)
  }
  const more = (p: number) =>
    `${path}?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}` as Route
  return (
    <div className="flex flex-col gap-4">
      <search>
        <form className="flex max-w-md gap-2" action={path}>
          <Input
            name="q"
            defaultValue={q ?? ''}
            placeholder="Name, email or profile link"
            aria-label="Search instructors"
          />
          <button type="submit" className={buttonClasses({ variant: 'secondary' })}>
            Search
          </button>
        </form>
      </search>
      {r.items.length === 0 ? (
        <EmptyState
          title={q ? 'No instructor matches that.' : 'No instructors yet.'}
          description={
            q ? 'Try part of their name or email.' : 'Approved applications show up here.'
          }
        />
      ) : (
        <div className="relative overflow-x-auto rounded-card border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Instructor</TableHead>
                <TableHead className="text-right">Live courses</TableHead>
                <TableHead className="text-right">Learners</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead>Strikes</TableHead>
                <TableHead>Since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.items.map((i) => (
                <TableRow key={i.userId}>
                  <TableCell className="min-w-48">
                    <Link
                      href={`/admin/instructors/${i.userId}` as Route}
                      className="font-medium text-brand-ink hover:underline"
                    >
                      {i.name}
                    </Link>
                    <p className="text-body-sm text-ink-2">{i.email}</p>
                    {i.suspended ? <Badge tone="danger">Suspended</Badge> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{i.publishedCourses}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {i.learners.toLocaleString('en-NG')}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNaira(i.availableKobo)}
                  </TableCell>
                  <TableCell>
                    {i.strikes > 0 ? (
                      <Badge tone={i.strikes >= instructors.STRIKE_LIMIT ? 'danger' : 'warning'}>
                        {i.strikes} of {instructors.STRIKE_LIMIT}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(i.approvedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="flex gap-2">
        {page > 0 ? (
          <Link href={more(page - 1)} className={buttonClasses({ variant: 'secondary' })}>
            Newer
          </Link>
        ) : null}
        {r.hasMore ? (
          <Link href={more(page + 1)} className={buttonClasses({ variant: 'secondary' })}>
            Older
          </Link>
        ) : null}
      </div>
    </div>
  )
}
