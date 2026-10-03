'use client'
// Client component: `/teach/reviews` (docs/20): reviews of the courses you teach, newest first,
// with your one (editable) reply. TAs read only.

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { StudioReviewDto } from '@tokslearn/contract'
import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { cn } from '@tokslearn/ui/cn'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Label } from '@tokslearn/ui/label'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { Textarea } from '@tokslearn/ui/textarea'
import type { Route } from 'next'
import Link from 'next/link'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { Stars } from '@/components/reviews/stars'
import { apiErrorMessage } from '@/lib/api-error'
import { formatDate } from '@/lib/format'
import { api, orpc } from '@/lib/orpc'

type Filter = 'all' | 'unreplied'

export function StudioReviews({ courseId }: { courseId: string | null }) {
  const [filter, setFilter] = useState<Filter>('all')
  const q = useInfiniteQuery(
    orpc.studio.reviews.list.infiniteOptions({
      input: (page: number) => ({ ...(courseId ? { courseId } : {}), filter, page }),
      initialPageParam: 0,
      getNextPageParam: (last, all) => (last.hasMore ? all.length : undefined),
    }),
  )
  const items = q.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="flex max-w-[860px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Show" className="flex gap-1.5">
          {(
            [
              ['all', 'All reviews'],
              ['unreplied', 'Waiting for a reply'],
            ] as const
          ).map(([f, label]) => (
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
        {courseId && items[0] ? (
          <p className="text-body-sm text-ink-2">
            {items[0].course.title} ·{' '}
            <Link href={'/teach/reviews' as Route} className="text-brand-ink hover:underline">
              All courses
            </Link>
          </p>
        ) : null}
      </div>
      {q.isPending ? (
        <Skeleton className="h-64 w-full rounded-card" />
      ) : q.isError ? (
        <FormAlert tone="error">{apiErrorMessage(q.error)}</FormAlert>
      ) : items.length === 0 ? (
        <EmptyState
          title={filter === 'unreplied' ? 'Every review has a reply' : 'No reviews yet'}
          description={
            filter === 'unreplied'
              ? 'New reviews show here until you reply. You also get an email for each one.'
              : 'Learners can review a course once they’ve finished a fifth of it or 30 minutes of learning.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </ul>
      )}
      {q.hasNextPage ? (
        <Button
          variant="secondary"
          className="w-fit"
          loading={q.isFetchingNextPage}
          onClick={() => q.fetchNextPage()}
        >
          Show more
        </Button>
      ) : null}
    </div>
  )
}

function ReviewCard({ review: r }: { review: StudioReviewDto }) {
  const client = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(r.reply ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async (body: string | null) => {
    setPending(true)
    setError(null)
    try {
      await api.studio.reviews.reply({ reviewId: r.id, body })
      await client.invalidateQueries({ queryKey: orpc.studio.reviews.key() })
      setEditing(false)
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setPending(false)
    }
  }
  return (
    <li className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars rating={r.rating} />
        <span className="text-body-sm font-medium text-ink">{r.authorName}</span>
        <span className="text-body-sm text-ink-3">
          {r.course.title} · {formatDate(r.createdAt)}
          {r.editedAt ? ' · edited' : ''}
          {r.helpfulCount > 0 ? ` · ${r.helpfulCount} found it helpful` : ''}
        </span>
        {r.hidden ? <Badge tone="warning">Hidden by Tokslearn</Badge> : null}
      </div>
      {r.body ? (
        <p className="whitespace-pre-line text-body text-ink">{r.body}</p>
      ) : (
        <p className="text-body-sm text-ink-3">A rating without a written review.</p>
      )}
      {r.reply && !editing ? (
        <div className="rounded-control border-l-2 border-brand bg-canvas px-4 py-3">
          <p className="text-body-sm font-medium text-ink">
            Your reply{r.repliedAt ? ` · ${formatDate(r.repliedAt)}` : ''}
          </p>
          <p className="mt-1 whitespace-pre-line text-body-sm text-ink-2">{r.reply}</p>
        </div>
      ) : null}
      {editing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void save(text.trim() || null)
          }}
        >
          <Label htmlFor={`reply-${r.id}`}>Your reply (shown under the review)</Label>
          <Textarea
            id={`reply-${r.id}`}
            rows={4}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={pending} disabled={!text.trim()}>
              {r.reply ? 'Save reply' : 'Post reply'}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : r.canReply ? (
        <div className="flex flex-wrap gap-3 text-body-sm">
          <button
            type="button"
            className="font-medium text-brand-ink hover:underline"
            onClick={() => {
              setText(r.reply ?? '')
              setEditing(true)
            }}
          >
            {r.reply ? 'Edit reply' : 'Reply'}
          </button>
          {r.reply ? (
            <button
              type="button"
              className="text-ink-2 hover:text-ink hover:underline"
              disabled={pending}
              onClick={() => save(null)}
            >
              Remove reply
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
    </li>
  )
}
