'use client'
// Client component: one discussion with its replies (docs/20 `/learn/[courseSlug]/community`):
// reply, like, accept the answer, report, delete your own, and moderate for the course's
// teachers. Bodies are HTML rendered on the server from an allowlist.

import type { RichTextDoc, ThreadDto } from '@tokslearn/contract'
import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@tokslearn/ui/dialog'
import { Label } from '@tokslearn/ui/label'
import { Textarea } from '@tokslearn/ui/textarea'
import { Check, Heart } from 'lucide-react'
import type { Route } from 'next'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { RichHtml } from '@/components/rich-html'
import {
  acceptAnswer,
  deleteOwnPost,
  getThread,
  likePost,
  moderatePost,
  replyTo,
  reportPost,
} from '@/lib/community-api'
import { formatDateTime } from '@/lib/format'

const RichTextEditor = dynamic(
  () => import('@/components/studio/rich-text-editor').then((m) => m.RichTextEditor),
  { loading: () => <div className="h-28 animate-pulse rounded-control bg-surface-sunken" /> },
)

type Target = { targetType: 'thread' | 'post'; targetId: string }
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function ThreadView({
  threadId,
  backHref,
}: {
  threadId: string
  /** Where to go after the viewer deletes the whole discussion. */
  backHref: string
}) {
  const router = useRouter()
  const [t, setT] = useState<ThreadDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [body, setBody] = useState<RichTextDoc | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const [pending, setPending] = useState(false)
  const [reporting, setReporting] = useState<Target | null>(null)

  useEffect(() => {
    getThread(threadId)
      .then(setT)
      .catch((e) => setError(message(e)))
  }, [threadId])

  if (error && !t) {
    return (
      <p role="alert" className="rounded-card border border-border bg-surface p-5 text-danger">
        {error}
      </p>
    )
  }
  if (!t) return <div className="h-64 animate-pulse rounded-card bg-surface-sunken" />

  const act = async (fn: () => Promise<unknown>, reload = true) => {
    setError(null)
    try {
      await fn()
      if (reload) setT(await getThread(threadId))
    } catch (e) {
      setError(message(e))
    }
  }
  const mod = (target: Target, action: Parameters<typeof moderatePost>[1]) =>
    act(() => moderatePost(target, action))
  const thread: Target = { targetType: 'thread', targetId: t.id }

  return (
    <div className="flex flex-col gap-6">
      <article className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 sm:p-6">
        <p className="flex flex-wrap items-center gap-2">
          {t.kind === 'announcement' ? <Badge tone="accent">Announcement</Badge> : null}
          {t.kind === 'question' ? (
            <Badge tone={t.answered ? 'brand' : 'neutral'}>
              {t.answered ? 'Answered' : 'Question'}
            </Badge>
          ) : null}
          {t.isPinned ? <Badge tone="neutral">Pinned</Badge> : null}
          {t.isLocked ? <Badge tone="neutral">Closed</Badge> : null}
          {t.isHidden ? <Badge tone="warning">Hidden from learners</Badge> : null}
        </p>
        <h1 className="text-h3 text-ink">{t.title}</h1>
        <p className="text-body-sm text-ink-2">
          {t.author.name}
          {t.author.isTeacher ? ' · Instructor' : ''} · {formatDateTime(t.createdAt)}
        </p>
        <RichHtml html={t.bodyHtml} className="text-body text-ink" />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm">
          {t.mine ? (
            <TextButton
              onClick={() =>
                act(async () => {
                  await deleteOwnPost(thread)
                  router.push(backHref as Route)
                }, false)
              }
            >
              Delete
            </TextButton>
          ) : (
            <TextButton onClick={() => setReporting(thread)}>Report</TextButton>
          )}
          {t.can.moderate ? (
            <>
              <TextButton onClick={() => mod(thread, t.isPinned ? 'unpin' : 'pin')}>
                {t.isPinned ? 'Unpin' : 'Pin'}
              </TextButton>
              <TextButton onClick={() => mod(thread, t.isLocked ? 'unlock' : 'lock')}>
                {t.isLocked ? 'Reopen' : 'Close to replies'}
              </TextButton>
              <TextButton onClick={() => mod(thread, t.isHidden ? 'unhide' : 'hide')}>
                {t.isHidden ? 'Show to learners' : 'Hide'}
              </TextButton>
            </>
          ) : null}
        </div>
      </article>

      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}

      <section aria-labelledby="replies" className="flex flex-col gap-3">
        <h2 id="replies" className="text-h4 text-ink">
          {t.posts.length === 0
            ? 'No replies yet'
            : `${t.posts.length} ${t.posts.length === 1 ? 'reply' : 'replies'}`}
        </h2>
        {t.posts.map((p) => {
          const target: Target = { targetType: 'post', targetId: p.id }
          return (
            <article
              key={p.id}
              className={`flex flex-col gap-2 rounded-card border bg-surface p-4 ${p.isAccepted ? 'border-brand' : 'border-border'} ${p.parentId ? 'ml-6' : ''}`}
            >
              <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink-2">
                <span className="font-medium text-ink">{p.author.name}</span>
                {p.isInstructorAnswer ? <Badge tone="brand">Instructor</Badge> : null}
                {p.isAccepted ? (
                  <Badge tone="brand">
                    <Check aria-hidden className="mr-1 inline size-3" />
                    Accepted answer
                  </Badge>
                ) : null}
                {p.isHidden ? <Badge tone="warning">Hidden from learners</Badge> : null}
                <span>{formatDateTime(p.createdAt)}</span>
              </p>
              <RichHtml html={p.bodyHtml} className="text-body text-ink" />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm">
                <button
                  type="button"
                  aria-pressed={p.likedByMe}
                  aria-label={`${p.likedByMe ? 'Unlike' : 'Like'} (${p.likes})`}
                  className="inline-flex items-center gap-1 text-ink-2 hover:text-ink"
                  onClick={() => act(() => likePost(p.id, !p.likedByMe))}
                >
                  <Heart
                    aria-hidden
                    className="size-4"
                    fill={p.likedByMe ? 'currentColor' : 'none'}
                  />
                  {p.likes}
                </button>
                {t.can.accept && !p.mine ? (
                  <TextButton
                    onClick={() => act(() => acceptAnswer(t.id, p.isAccepted ? null : p.id))}
                  >
                    {p.isAccepted ? 'Unmark answer' : 'This answered it'}
                  </TextButton>
                ) : null}
                {p.mine ? (
                  <TextButton onClick={() => act(() => deleteOwnPost(target))}>Delete</TextButton>
                ) : (
                  <TextButton onClick={() => setReporting(target)}>Report</TextButton>
                )}
                {t.can.moderate ? (
                  <TextButton onClick={() => mod(target, p.isHidden ? 'unhide' : 'hide')}>
                    {p.isHidden ? 'Show to learners' : 'Hide'}
                  </TextButton>
                ) : null}
              </div>
            </article>
          )
        })}
      </section>

      {t.can.reply ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!body) return
            setPending(true)
            setError(null)
            try {
              setT(await replyTo(t.id, body))
              setBody(null)
              setEditorKey((k) => k + 1)
            } catch (err) {
              setError(message(err))
            } finally {
              setPending(false)
            }
          }}
        >
          <Label htmlFor={`reply-${t.id}`}>
            {t.kind === 'question' && !t.mine ? 'Your answer' : 'Your reply'}
          </Label>
          <RichTextEditor
            key={editorKey}
            id={`reply-${t.id}`}
            value={body}
            onChange={setBody}
            minHeight="min-h-24"
            basic
          />
          <Button type="submit" className="w-fit" loading={pending} disabled={!body}>
            Reply
          </Button>
        </form>
      ) : (
        <p className="rounded-card border border-border bg-canvas p-4 text-body-sm text-ink-2">
          This discussion is closed to new replies.
        </p>
      )}

      <ReportDialog target={reporting} onClose={() => setReporting(null)} />
    </div>
  )
}

function TextButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-ink-2 hover:text-ink hover:underline">
      {children}
    </button>
  )
}

function ReportDialog({ target, onClose }: { target: Target | null; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => {
    onClose()
    setReason('')
    setDone(false)
    setError(null)
  }
  return (
    <Dialog open={target !== null} onOpenChange={(open) => (open ? null : close())}>
      <DialogContent
        title="Report this post"
        description="Tokslearn staff read every report. The person who wrote it isn't told who reported it."
      >
        {done ? (
          <>
            <p className="text-body text-ink">Thanks. We’ll take a look.</p>
            <DialogFooter>
              <Button onClick={close}>Close</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!target) return
              setPending(true)
              setError(null)
              try {
                await reportPost(target, reason)
                setDone(true)
              } catch (err) {
                setError(message(err))
              } finally {
                setPending(false)
              }
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="report-reason">What’s wrong with it?</Label>
              <Textarea
                id="report-reason"
                value={reason}
                required
                minLength={3}
                maxLength={500}
                rows={3}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="text-body-sm text-danger">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                Send report
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
