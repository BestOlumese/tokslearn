'use client'
// Client component: `/account/notifications` (docs/20): every notification, newest first, 20 at a
// time. Opening one marks it read; "Mark all read" clears the bell (a window focus event tells the
// header to recount).

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { NotificationDto } from '@tokslearn/contract'
import { Button } from '@tokslearn/ui/button'
import { cn } from '@tokslearn/ui/cn'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Route } from 'next'
import Link from 'next/link'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { formatDateTime } from '@/lib/format'
import { api, orpc } from '@/lib/orpc'

const recount = () => window.dispatchEvent(new Event('focus'))

export function NotificationList() {
  const client = useQueryClient()
  const q = useInfiniteQuery(
    orpc.notifications.list.infiniteOptions({
      input: (before: string | undefined) => (before ? { before } : {}),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) =>
        last.hasMore ? last.items[last.items.length - 1]?.id : undefined,
    }),
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const items = q.data?.pages.flatMap((p) => p.items) ?? []
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: orpc.notifications.key() })
    recount()
  }

  if (q.isPending) return <Skeleton className="h-72 w-full rounded-card" />
  if (q.isError) return <FormAlert tone="error">{apiErrorMessage(q.error)}</FormAlert>
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing yet"
        description="Replies to your questions, announcements, grades and reminders show up here."
      />
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-ink-2">
          Choose what we email you in{' '}
          <Link href="/account/settings/notifications" className="text-brand-ink hover:underline">
            notification settings
          </Link>
          .
        </p>
        {items.some((n) => !n.read) ? (
          <Button
            size="sm"
            variant="secondary"
            loading={pending}
            onClick={async () => {
              setPending(true)
              setError(null)
              try {
                await api.notifications.markRead({ all: true })
                await refresh()
              } catch (e) {
                setError(apiErrorMessage(e))
              } finally {
                setPending(false)
              }
            }}
          >
            Mark all read
          </Button>
        ) : null}
      </div>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {items.map((n) => (
          <Item key={n.id} n={n} onOpen={() => (n.read ? undefined : markOne(n.id, refresh))} />
        ))}
      </ul>
      {q.hasNextPage ? (
        <Button
          variant="secondary"
          className="w-fit"
          loading={q.isFetchingNextPage}
          onClick={() => q.fetchNextPage()}
        >
          Show older
        </Button>
      ) : null}
    </div>
  )
}

async function markOne(id: string, refresh: () => Promise<void>) {
  try {
    await api.notifications.markRead({ ids: [id] })
    await refresh()
  } catch {
    // Opening the link matters more than the dot.
  }
}

function Item({ n, onOpen }: { n: NotificationDto; onOpen: () => void }) {
  const content = (
    <>
      <span
        aria-hidden
        className={cn('mt-2 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand')}
      />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-body', n.read ? 'text-ink-2' : 'font-medium text-ink')}>
          {n.title}
          {n.read ? null : <span className="sr-only"> (unread)</span>}
        </span>
        {n.body ? (
          <span className="mt-0.5 block truncate text-body-sm text-ink-2">{n.body}</span>
        ) : null}
        <span className="mt-0.5 block text-caption text-ink-3">{formatDateTime(n.createdAt)}</span>
      </span>
    </>
  )
  return (
    <li>
      {n.link ? (
        <Link
          href={n.link as Route}
          onClick={onOpen}
          className="flex gap-3 px-4 py-3.5 hover:bg-canvas sm:px-5"
        >
          {content}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full gap-3 px-4 py-3.5 text-left hover:bg-canvas sm:px-5"
        >
          {content}
        </button>
      )}
    </li>
  )
}
