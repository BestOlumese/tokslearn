import { searchUsers } from '@tokslearn/core/identity'
import { roles } from '@tokslearn/core/kernel'
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
import { staffErrorState } from '@/components/admin/staff-error'
import { formatDate, roleLabel } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Users' }

type Search = { q?: string; role?: string; cursor?: string }

// docs/20 §6 `/admin/users` (support+). Search, role filter, cursor pages.
export default function AdminUsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <div>
      <AdminPageHeader
        title="Users"
        description="Find an account to see its roles, sessions and history."
      />
      <Suspense fallback={<UsersSkeleton />}>
        <Users searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Users({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams
  const path = '/admin/users'
  const ctx = await requireSignedInCtx(path)
  const role = roles.find((r) => r === params.role)
  let page: Awaited<ReturnType<typeof searchUsers>>
  try {
    page = await searchUsers(ctx, {
      q: params.q?.slice(0, 100) || undefined,
      role,
      cursor: params.cursor,
      limit: 25,
    })
  } catch (error) {
    return <div className="mt-6">{staffErrorState(error, path)}</div>
  }

  const nextHref = page.nextCursor
    ? (`${path}?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), ...(role ? { role } : {}), cursor: page.nextCursor })}` as Route)
    : null

  return (
    <>
      <form
        aria-label="Search users"
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        action={path}
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="q" className="text-body-sm font-medium text-ink">
            Email, name or username
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
        <div className="flex flex-col gap-1.5 sm:w-48">
          <label htmlFor="role" className="text-body-sm font-medium text-ink">
            Role
          </label>
          <Select id="role" name="role" defaultValue={role ?? ''}>
            <option value="">Any role</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabel[r]}
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
            title="No users match"
            description="Try part of the email, or clear the role filter."
            action={
              <Link href={path} className={buttonClasses({ variant: 'secondary' })}>
                Clear search
              </Link>
            }
          />
        ) : (
          <Table>
            <TableCaption>Users matching your search</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <Link
                      href={`/admin/users/${u.id}` as Route}
                      className="font-medium text-brand underline-offset-4 hover:underline"
                    >
                      {u.name}
                    </Link>
                    <div className="text-ink-3">{u.email}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <Badge key={r} tone={r === 'learner' ? 'neutral' : 'info'}>
                          {roleLabel[r]}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.banned ? <Badge tone="danger">Suspended</Badge> : null}
                      {u.deletionScheduledFor ? (
                        <Badge tone="warning">Deletion pending</Badge>
                      ) : null}
                      {!u.emailVerified ? <Badge>Email not confirmed</Badge> : null}
                      {u.twoFactorEnabled ? <Badge tone="brand">2FA</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatDate(u.createdAt)}
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
          Next 25 users
        </Link>
      ) : null}
    </>
  )
}

function UsersSkeleton() {
  return (
    <div className="mt-6 flex flex-col gap-3" aria-hidden>
      <Skeleton className="h-10 w-full" />
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}
