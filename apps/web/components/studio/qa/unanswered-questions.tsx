'use client'
// Client component: `/teach/qa` (docs/20): questions in the courses you teach that nobody on the
// teaching side has answered yet, oldest first, answered inline.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { RichTextDoc, UnansweredQuestionDto } from '@tokslearn/contract'
import { Button } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Label } from '@tokslearn/ui/label'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Route } from 'next'
import Link from 'next/link'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { RichTextEditor } from '@/components/studio/rich-text-editor'
import { apiErrorMessage } from '@/lib/api-error'
import { formatDateTime } from '@/lib/format'
import { api, orpc } from '@/lib/orpc'

export function UnansweredQuestions() {
  const q = useQuery(orpc.community.unanswered.queryOptions())
  if (q.isPending) return <Skeleton className="h-64 w-full max-w-[860px] rounded-card" />
  if (!q.data) return <FormAlert tone="error">{apiErrorMessage(q.error)}</FormAlert>
  if (q.data.items.length === 0) {
    return (
      <EmptyState
        title="No questions waiting"
        description="When a learner asks about one of your lessons, it shows here until you or a TA answers."
      />
    )
  }
  return (
    <ul className="flex max-w-[860px] flex-col gap-4">
      {q.data.items.map((item) => (
        <Question key={item.threadId} item={item} />
      ))}
    </ul>
  )
}

function Question({ item }: { item: UnansweredQuestionDto }) {
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState<RichTextDoc | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const href = `/learn/${item.courseSlug}/community/${item.threadId}` as Route
  return (
    <li className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
      <p className="text-body-sm text-ink-2">
        {item.courseTitle}
        {item.lessonTitle ? ` · ${item.lessonTitle}` : ''} · {item.askerName} ·{' '}
        {formatDateTime(item.createdAt)}
      </p>
      <Link href={href} className="text-h4 text-ink hover:text-brand-ink hover:underline">
        {item.title}
      </Link>
      <p className="text-body text-ink-2">{item.excerpt}</p>
      {open ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!body) return
            setPending(true)
            setError(null)
            try {
              await api.community.reply({ threadId: item.threadId, body })
              await client.invalidateQueries({ queryKey: orpc.community.unanswered.key() })
            } catch (err) {
              setError(apiErrorMessage(err))
              setPending(false)
            }
          }}
        >
          <Label htmlFor={`answer-${item.threadId}`}>Your answer</Label>
          <RichTextEditor
            id={`answer-${item.threadId}`}
            value={body}
            onChange={setBody}
            minHeight="min-h-28"
            basic
          />
          {error ? <FormAlert tone="error">{error}</FormAlert> : null}
          <div className="flex gap-2">
            <Button type="submit" loading={pending} disabled={!body}>
              Post answer
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setOpen(true)}>
            Answer
          </Button>
          <Link
            href={href}
            className="inline-flex items-center px-2 text-body-sm text-brand-ink hover:underline"
          >
            Open the discussion
          </Link>
        </div>
      )}
    </li>
  )
}
