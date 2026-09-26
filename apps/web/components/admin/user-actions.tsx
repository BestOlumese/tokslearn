'use client'
// Client component: staff actions on one user through admin.users.* procedures.

import type { AdminUserDetail } from '@tokslearn/contract'
import { Badge } from '@tokslearn/ui/badge'
import { useRouter } from 'next/navigation'
import { apiErrorMessage } from '@/lib/api-error'
import { roleLabel } from '@/lib/format'
import { api } from '@/lib/orpc'
import { ReasonDialog } from './reason-dialog'

type Role = AdminUserDetail['roles'][number]
const manageable: ReadonlyArray<Role> = [
  'instructor',
  'reviewer',
  'finance',
  'support',
  'admin',
  'super_admin',
]

export function UserActions({
  user,
  canBan,
  grantable,
}: {
  user: AdminUserDetail
  canBan: boolean
  grantable: ReadonlyArray<Role>
}) {
  const router = useRouter()
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      router.refresh()
      return null
    } catch (e) {
      return apiErrorMessage(e)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="roles-title">
        <h2 id="roles-title" className="text-h3 text-ink">
          Roles
        </h2>
        <ul className="mt-3 divide-y divide-border rounded-card border border-border bg-surface">
          {manageable.map((role) => {
            const has = user.roles.includes(role)
            const allowed = grantable.includes(role)
            return (
              <li key={role} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="flex items-center gap-2 text-body-sm text-ink">
                  {roleLabel[role]}
                  {has ? <Badge tone="info">Has role</Badge> : null}
                </span>
                {allowed ? (
                  <ReasonDialog
                    trigger={has ? 'Remove' : 'Grant'}
                    triggerLabel={`${has ? 'Remove' : 'Grant'} ${roleLabel[role]}`}
                    triggerVariant={has ? 'tertiary' : 'secondary'}
                    title={`${has ? 'Remove' : 'Grant'} ${roleLabel[role]}`}
                    description={`${user.name} ${has ? 'loses' : 'gets'} ${roleLabel[role]} access straight away.`}
                    confirmLabel={has ? 'Remove role' : 'Grant role'}
                    confirmVariant={has ? 'danger' : 'primary'}
                    onConfirm={(reason) =>
                      run(() =>
                        api.admin.users.setRole({ userId: user.id, role, granted: !has, reason }),
                      )
                    }
                  />
                ) : null}
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="actions-title">
        <h2 id="actions-title" className="text-h3 text-ink">
          Account actions
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <ReasonDialog
            trigger="Sign out everywhere"
            title="Sign this user out everywhere?"
            description="Ends every browser and app session. They can sign in again straight away."
            confirmLabel="Sign out everywhere"
            onConfirm={(reason) =>
              run(() => api.admin.users.revokeSessions({ userId: user.id, reason }))
            }
          />
          {canBan ? (
            <ReasonDialog
              trigger={user.banned ? 'Restore account' : 'Suspend account'}
              triggerVariant={user.banned ? 'secondary' : 'danger'}
              title={user.banned ? 'Restore this account?' : 'Suspend this account?'}
              description={
                user.banned
                  ? 'They can sign in again straight away.'
                  : 'They are signed out everywhere and can’t sign in until restored.'
              }
              confirmLabel={user.banned ? 'Restore account' : 'Suspend account'}
              confirmVariant={user.banned ? 'primary' : 'danger'}
              onConfirm={(reason) =>
                run(() =>
                  api.admin.users.setBanned({ userId: user.id, banned: !user.banned, reason }),
                )
              }
            />
          ) : null}
        </div>
      </section>
    </div>
  )
}
