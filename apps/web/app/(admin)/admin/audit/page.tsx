import { listAuditLog } from '@tokslearn/core/admin'
import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Input } from '@tokslearn/ui/input'
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
import { staffErrorState } from '@/components/admin/staff-error'
import { formatDateTime } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Audit log' }

type Search = {
  action?: string
  targetType?: string
  targetId?: string
  actorId?: string
  cursor?: string
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// docs/20 §6 `/admin/audit` (admin). Newest first.
export default function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <div>
      <h1 className="text-h1-sm text-ink sm:text-h1">Audit log</h1>
      <p className="mt-2 text-body text-ink-2">
        Every staff action and every change that affects money, newest first.
      </p>
      <Suspense fallback={<Skeleton className="mt-6 h-96 w-full rounded-card" />}>
        <Audit searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Audit({ searchParams }: { searchParams: Promise<Search> }) {
  const p = await searchParams
  const path = '/admin/audit'
  const ctx = await requireSignedInCtx(path)
  const filters = {
    action: p.action?.slice(0, 60) || undefined,
    targetType: p.targetType?.slice(0, 40) || undefined,
    targetId: p.targetId?.slice(0, 100) || undefined,
    actorId: p.actorId && UUID.test(p.actorId) ? p.actorId : undefined,
  }
  let page: Awaited<ReturnType<typeof listAuditLog>>
  try {
    page = await listAuditLog(ctx, { ...filters, cursor: p.cursor, limit: 25 })
  } catch (error) {
    return <div className="mt-6">{staffErrorState(error, path)}</div>
  }
  const query = Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as Record<
    string,
    string
  >

  return (
    <>
      <form
        aria-label="Filter the audit log"
        action={path}
        className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end"
      >
        {(
          [
            ['action', 'Action', 'e.g. user.ban'],
            ['targetType', 'Target type', 'e.g. user'],
            ['targetId', 'Target id', ''],
          ] as const
        ).map(([name, label, hint]) => (
          <div key={name} className="flex flex-col gap-1.5">
            <label htmlFor={name} className="text-body-sm font-medium text-ink">
              {label}
            </label>
            <Input
              id={name}
              name={name}
              defaultValue={filters[name] ?? ''}
              placeholder={hint}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        ))}
        <button type="submit" className={buttonClasses({ variant: 'secondary' })}>
          Filter
        </button>
      </form>

      <div className="mt-6">
        {page.items.length === 0 ? (
          <EmptyState
            title="No entries match"
            description="Staff actions appear here as soon as they happen."
            action={
              <Link href={path} className={buttonClasses({ variant: 'secondary' })}>
                Clear filters
              </Link>
            }
          />
        ) : (
          <Table>
            <TableCaption>Audit entries</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatDateTime(e.createdAt)}
                  </TableCell>
                  <TableCell>{e.actorName ?? e.actorKind}</TableCell>
                  <TableCell className="font-mono">{e.action}</TableCell>
                  <TableCell>
                    {e.targetType === 'user' ? (
                      <Link
                        href={`/admin/users/${e.targetId}` as Route}
                        className="text-brand underline-offset-4 hover:underline"
                      >
                        user {e.targetId.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="font-mono">
                        {e.targetType} {e.targetId}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[320px] font-mono text-caption break-words text-ink-2">
                    {JSON.stringify(e.after ?? e.before ?? {})}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      {page.nextCursor ? (
        <Link
          href={`${path}?${new URLSearchParams({ ...query, cursor: page.nextCursor })}` as Route}
          className={buttonClasses({ variant: 'secondary', className: 'mt-4' })}
        >
          Older entries
        </Link>
      ) : null}
    </>
  )
}
