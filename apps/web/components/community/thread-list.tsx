'use client'
// Client component: a list of discussions (docs/20 `/learn/[courseSlug]/community`, the player's
// Q&A and Announcements tabs, the cohort home). Pinned first, then latest activity.

import type { ScopeType, ThreadFilter, ThreadKind } from '@tokslearn/contract'
import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { cn } from '@tokslearn/ui/cn'
import { MessageSquare, Pin } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { listThreads, type ThreadPage } from '@/lib/community-api'
import { formatDate } from '@/lib/format'
import { Composer } from './composer'

const filters: ReadonlyArray<[ThreadFilter, string]> = [
  ['all', 'All'],
  ['questions', 'Questions'],
  ['unanswered', 'Unanswered'],
  ['announcements', 'Announcements'],
]

export function ThreadList({
  courseId,
  courseSlug,
  scope,
  showFilters = false,
  fixedFilter,
  kinds,
  newLabel,
  empty,
}: {
  courseId: string
  courseSlug: string
  /** One scope only (a lesson's Q&A, a cohort); the whole course otherwise. */
  scope?: { type: ScopeType; id: string }
  showFilters?: boolean
  fixedFilter?: ThreadFilter
  /** What the "new" button can start here; announcements are added for instructors. */
  kinds: ReadonlyArray<ThreadKind>
  newLabel: string
  empty: string
}) {
  const router = useRouter()
  const [filter, setFilter] = useState<ThreadFilter>(fixedFilter ?? 'all')
  const [page, setPage] = useState<ThreadPage | null>(null)
  const [more, setMore] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [writing, setWriting] = useState(false)

  const scopeType = scope?.type
  const scopeId = scope?.id
  const load = useCallback(
    async (f: ThreadFilter, n: number) => {
      try {
        const next = await listThreads(courseId, {
          scope: scopeType && scopeId ? { type: scopeType, id: scopeId } : undefined,
          filter: f,
          page: n,
        })
        setPage((prev) =>
          n === 0 || !prev ? next : { ...next, items: [...prev.items, ...next.items] },
        )
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [courseId, scopeType, scopeId],
  )
  useEffect(() => {
    void load(filter, 0)
  }, [load, filter])

  const offered: ThreadKind[] = [
    ...kinds,
    ...(page?.canAnnounce && fixedFilter !== 'questions' && scope?.type !== 'lesson'
      ? (['announcement'] as const)
      : []),
  ].filter((k, i, all) => all.indexOf(k) === i)
  const base = `/learn/${courseSlug}/community`

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {showFilters ? (
          <div role="tablist" aria-label="Show" className="flex flex-wrap gap-1.5">
            {filters.map(([f, label]) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  'h-9 rounded-full border px-3.5 text-body-sm',
                  filter === f
                    ? 'border-brand bg-brand-soft text-brand-ink'
                    : 'border-border bg-surface text-ink-2 hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        {offered.length > 0 && !writing ? (
          <Button size="sm" onClick={() => setWriting(true)}>
            {newLabel}
          </Button>
        ) : null}
      </div>

      {writing ? (
        <Composer
          scope={scope ?? { type: 'course', id: courseId }}
          kinds={offered}
          onCancel={() => setWriting(false)}
          onCreated={(t) => {
            setWriting(false)
            router.push(`${base}/${t.id}` as Route)
          }}
        />
      ) : null}

      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : !page ? (
        <div className="h-24 animate-pulse rounded-card bg-surface-sunken" />
      ) : page.items.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-5 text-body text-ink-2">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
          {page.items.map((t) => (
            <li key={t.id} className="relative flex gap-3 p-4 hover:bg-canvas">
              <span
                aria-hidden
                className={cn(
                  'mt-2 size-2 shrink-0 rounded-full',
                  t.unread ? 'bg-brand' : 'bg-transparent',
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  {t.isPinned ? <Pin aria-label="Pinned" className="size-4 text-ink-3" /> : null}
                  <Link
                    href={`${base}/${t.id}` as Route}
                    className="text-body font-medium text-ink after:absolute after:inset-0 hover:text-brand-ink"
                  >
                    {t.title}
                  </Link>
                  {t.kind === 'announcement' ? <Badge tone="accent">Announcement</Badge> : null}
                  {t.kind === 'question' ? (
                    <Badge tone={t.answered ? 'brand' : 'neutral'}>
                      {t.answered ? 'Answered' : 'Question'}
                    </Badge>
                  ) : null}
                  {t.isHidden ? <Badge tone="warning">Hidden</Badge> : null}
                  {t.isLocked ? <Badge tone="neutral">Closed</Badge> : null}
                </p>
                <p className="mt-0.5 line-clamp-2 text-body-sm text-ink-2">{t.excerpt}</p>
                <p className="mt-1 flex items-center gap-3 text-caption text-ink-3">
                  <span>
                    {t.author.name}
                    {t.author.isTeacher ? ' · Instructor' : ''} · {formatDate(t.lastActivityAt)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare aria-hidden className="size-3.5" />
                    {t.replyCount}
                    <span className="sr-only">{t.replyCount === 1 ? 'reply' : 'replies'}</span>
                  </span>
                  {t.unread ? <span className="sr-only">New activity</span> : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {page?.hasMore ? (
        <Button
          variant="secondary"
          className="w-fit"
          onClick={() => {
            const n = more + 1
            setMore(n)
            void load(filter, n)
          }}
        >
          Show more
        </Button>
      ) : null}
    </div>
  )
}
