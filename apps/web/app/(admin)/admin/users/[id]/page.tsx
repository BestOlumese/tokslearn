import type { AdminUserDetail } from '@tokslearn/contract'
import { canBanUsers, canManageRole, getUserDetail } from '@tokslearn/core/identity'
import { isUser, NotFoundError, roles } from '@tokslearn/core/kernel'
import { Badge } from '@tokslearn/ui/badge'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { staffErrorState } from '@/components/admin/staff-error'
import { UserActions } from '@/components/admin/user-actions'
import { formatDateTime } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'User' }

// docs/20 §6 `/admin/users/[id]`. Orders, enrollments and refunds join here in Phases 4 and 10.
export default function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div>
      <Link
        href="/admin/users"
        className="inline-flex min-h-11 items-center text-body-sm text-brand underline-offset-4 hover:underline"
      >
        All users
      </Link>
      <Suspense fallback={<Skeleton className="mt-4 h-96 w-full rounded-card" />}>
        <UserDetail params={params} />
      </Suspense>
    </div>
  )
}

async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const path = `/admin/users/${id}`
  const ctx = await requireSignedInCtx(path)
  let d: Awaited<ReturnType<typeof getUserDetail>>
  try {
    // A malformed id can't match any user; don't send it to Postgres as a uuid.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new NotFoundError('USER_NOT_FOUND')
    }
    d = await getUserDetail(ctx, id)
  } catch (error) {
    return <div className="mt-4">{staffErrorState(error, path)}</div>
  }

  const actor = ctx.actor
  const dto: AdminUserDetail = {
    ...d,
    deletionScheduledFor: d.deletionScheduledFor?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    sessions: d.sessions.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
      lastActiveAt: s.lastActiveAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
    })),
    audit: d.audit.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
  }
  const self = isUser(actor) && actor.userId === d.id
  const grantable = isUser(actor) && !self ? roles.filter((r) => canManageRole(actor, r)) : []

  return (
    <div className="mt-2 flex flex-col gap-10">
      <header>
        <h1 className="text-h1-sm text-ink sm:text-h1">{d.name}</h1>
        <p className="mt-1 text-body text-ink-2">
          {d.email}
          {d.username ? ` · @${d.username}` : ''}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {d.banned ? (
            <Badge tone="danger">Suspended{d.banReason ? `: ${d.banReason}` : ''}</Badge>
          ) : null}
          {d.deletionScheduledFor ? (
            <Badge tone="warning">Deletion on {formatDateTime(d.deletionScheduledFor)}</Badge>
          ) : null}
          <Badge tone={d.emailVerified ? 'brand' : 'neutral'}>
            {d.emailVerified ? 'Email confirmed' : 'Email not confirmed'}
          </Badge>
          <Badge tone={d.twoFactorEnabled ? 'brand' : 'neutral'}>
            {d.twoFactorEnabled ? '2FA on' : '2FA off'}
          </Badge>
        </div>
        <p className="mt-3 text-body-sm text-ink-3">Joined {formatDateTime(d.createdAt)}</p>
      </header>

      {self ? (
        <p className="text-body-sm text-ink-2">
          This is your account. Change it from your own settings; staff tools don't act on yourself.
        </p>
      ) : (
        <UserActions
          user={dto}
          canBan={isUser(actor) && canBanUsers(actor)}
          grantable={grantable}
        />
      )}

      <section aria-labelledby="sessions-title">
        <h2 id="sessions-title" className="text-h3 text-ink">
          Active sessions ({d.sessions.length})
        </h2>
        {d.sessions.length === 0 ? (
          <p className="mt-2 text-body-sm text-ink-2">Not signed in anywhere.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-card border border-border bg-surface">
            {d.sessions.map((s) => (
              <li key={s.id} className="px-4 py-3 text-body-sm">
                <p className="font-medium text-ink">{s.device}</p>
                <p className="text-ink-3">
                  Last active {formatDateTime(s.lastActiveAt)}
                  {s.ipHint ? ` · ${s.ipHint}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="audit-title">
        <h2 id="audit-title" className="text-h3 text-ink">
          Audit trail
        </h2>
        {d.audit.length === 0 ? (
          <p className="mt-2 text-body-sm text-ink-2">No staff actions on this account yet.</p>
        ) : (
          <ol className="mt-3 divide-y divide-border rounded-card border border-border bg-surface">
            {d.audit.map((a) => (
              <li key={a.id} className="px-4 py-3 text-body-sm">
                <p className="text-ink">
                  <span className="font-mono">{a.action}</span> by {a.actorName ?? a.actorKind}
                </p>
                <p className="text-ink-3">{formatDateTime(a.createdAt)}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
