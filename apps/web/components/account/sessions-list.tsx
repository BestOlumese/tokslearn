'use client'
// Client component: lists and revokes sessions through me.sessions.* (works for app tokens too).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { Laptop, Smartphone } from 'lucide-react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { orpc } from '@/lib/orpc'

const lagos = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

export function SessionsList() {
  const queryClient = useQueryClient()
  const sessions = useQuery(orpc.me.sessions.list.queryOptions())
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.me.sessions.list.key() })
  const revoke = useMutation(orpc.me.sessions.revoke.mutationOptions({ onSuccess: refresh }))
  const revokeOthers = useMutation(
    orpc.me.sessions.revokeOthers.mutationOptions({ onSuccess: refresh }),
  )

  if (sessions.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-hidden>
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-[76px] w-full rounded-card" />
        ))}
      </div>
    )
  }
  if (sessions.isError) {
    return (
      <FormAlert tone="error">
        {apiErrorMessage(sessions.error)}{' '}
        <button
          type="button"
          className="font-medium underline"
          onClick={() => void sessions.refetch()}
        >
          Try again
        </button>
      </FormAlert>
    )
  }

  const items = sessions.data.items
  const mutationError = revoke.error ?? revokeOthers.error
  return (
    <div className="flex flex-col gap-4">
      {mutationError ? <FormAlert tone="error">{apiErrorMessage(mutationError)}</FormAlert> : null}
      <ul className="divide-y divide-border rounded-card border border-border bg-surface">
        {items.map((s) => (
          <li key={s.id} className="flex items-center gap-4 px-4 py-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-2">
              {/Android|iPhone|app/.test(s.device) ? (
                <Smartphone aria-hidden strokeWidth={1.75} className="size-5" />
              ) : (
                <Laptop aria-hidden strokeWidth={1.75} className="size-5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                {s.device}
                {s.current ? <Badge tone="brand">This device</Badge> : null}
              </p>
              <p className="text-body-sm text-ink-3">
                Last active {lagos.format(new Date(s.lastActiveAt))}
                {s.ipHint ? ` · ${s.ipHint}` : ''}
              </p>
            </div>
            {s.current ? null : (
              <Button
                variant="secondary"
                size="sm"
                loading={revoke.isPending && revoke.variables?.sessionId === s.id}
                onClick={() => revoke.mutate({ sessionId: s.id })}
              >
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>
      {items.length > 1 ? (
        <Button
          variant="tertiary"
          className="self-start"
          loading={revokeOthers.isPending}
          onClick={() => revokeOthers.mutate({})}
        >
          Sign out all other devices
        </Button>
      ) : null}
    </div>
  )
}
