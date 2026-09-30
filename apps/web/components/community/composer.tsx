'use client'
// Client component: start a discussion, ask a question, or (instructors) post an announcement
// (docs/10 §10). The editor is the basic one: no headings. The server renders the HTML.

import type { RichTextDoc, ScopeType, ThreadDto, ThreadKind } from '@tokslearn/contract'
import { Button } from '@tokslearn/ui/button'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { Radio } from '@tokslearn/ui/radio'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { createThread } from '@/lib/community-api'

const RichTextEditor = dynamic(
  () => import('@/components/studio/rich-text-editor').then((m) => m.RichTextEditor),
  { loading: () => <div className="h-32 animate-pulse rounded-control bg-surface-sunken" /> },
)

const kindText: Record<ThreadKind, [string, string]> = {
  question: ['Question', 'Your instructor or a TA answers; you can mark the answer that helped.'],
  discussion: ['Discussion', 'Share something or ask your classmates.'],
  announcement: ['Announcement', 'Emailed to every learner it’s for. Only you can post these.'],
}

export function Composer({
  scope,
  kinds,
  onCreated,
  onCancel,
}: {
  scope: { type: ScopeType; id: string }
  /** The kinds offered here, first is the default. */
  kinds: ReadonlyArray<ThreadKind>
  onCreated: (thread: ThreadDto) => void
  onCancel: () => void
}) {
  const [kind, setKind] = useState<ThreadKind>(kinds[0] ?? 'discussion')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState<RichTextDoc | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = `composer-${scope.id}`
  return (
    <form
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 sm:p-5"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!body) {
          setError('Write something first.')
          return
        }
        setPending(true)
        setError(null)
        try {
          onCreated(
            await createThread({ scopeType: scope.type, scopeId: scope.id, kind, title, body }),
          )
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          setPending(false)
        }
      }}
    >
      {kinds.length > 1 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-body-sm font-medium text-ink">What is it?</legend>
          {kinds.map((k) => (
            <div key={k} className="flex items-start gap-2">
              <Radio
                id={`${id}-${k}`}
                name={`${id}-kind`}
                checked={kind === k}
                onChange={() => setKind(k)}
                className="mt-0.5"
              />
              <Label htmlFor={`${id}-${k}`} kind="option">
                <span className="font-medium text-ink">{kindText[k][0]}</span>
                <span className="block text-body-sm text-ink-2">{kindText[k][1]}</span>
              </Label>
            </div>
          ))}
        </fieldset>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-title`}>
          {kind === 'question' ? 'Your question in one line' : 'Title'}
        </Label>
        <Input
          id={`${id}-title`}
          value={title}
          required
          minLength={5}
          maxLength={150}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-body`}>Details</Label>
        <RichTextEditor
          id={`${id}-body`}
          value={body}
          onChange={setBody}
          minHeight="min-h-28"
          basic
        />
        <p className="text-caption text-ink-3">Type @ and a username to mention someone.</p>
      </div>
      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>
          {kind === 'question' ? 'Ask' : 'Post'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
