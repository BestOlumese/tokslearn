'use client'
// Client component: an assignment lesson (docs/20 assignment lesson, docs/10 §7). The brief,
// due date and late policy, the rubric, a draft that saves itself, submit, then status, grade
// and feedback, and submit again when allowed.

import type { MyAssignmentDto, RichTextDoc } from '@tokslearn/contract'
import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@tokslearn/ui/dialog'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { Download, Paperclip, X } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RichHtml } from '@/components/rich-html'
import { formatBytes, formatDateTime } from '@/lib/format'
import {
  getMyAssignment,
  LearnError,
  myAssignmentFile,
  saveAssignmentDraft,
  submitAssignment,
  uploadSubmissionFile,
} from '@/lib/learn-api'

// The editor is large; it loads only on assignment lessons.
const RichTextEditor = dynamic(
  () => import('@/components/studio/rich-text-editor').then((m) => m.RichTextEditor),
  {
    loading: () => <div className="h-40 animate-pulse rounded-control bg-surface-sunken" />,
  },
)

const failed = (e: unknown) =>
  e instanceof LearnError ? e.message : 'Something went wrong. Try again.'
type FileRef = MyAssignmentDto['submissions'][number]['files'][number]

const blockedText = {
  awaiting_grade:
    'Your work is with your instructor. You can submit again once it’s graded, if the assignment allows it.',
  no_resubmissions: 'This assignment has been graded and doesn’t take another submission.',
  past_due: 'The deadline has passed and this assignment doesn’t take late work.',
  teaching: 'You’re seeing this as the course’s teacher. Learners hand in their work here.',
} as const

export function AssignmentLesson({ lessonId }: { lessonId: string }) {
  const router = useRouter()
  const [a, setA] = useState<MyAssignmentDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    getMyAssignment(lessonId)
      .then(setA)
      .catch((e) => setError(failed(e)))
  }, [lessonId])
  if (error)
    return (
      <p
        role="alert"
        className="rounded-card border border-border bg-surface p-6 text-body text-danger"
      >
        {error}
      </p>
    )
  if (!a) return <div className="h-64 animate-pulse rounded-card bg-surface-sunken" />
  return (
    <div className="flex flex-col gap-5">
      <Brief a={a} />
      {a.canSubmit ? (
        <Draft
          key={a.submissions.length}
          a={a}
          onSubmitted={(next) => {
            setA(next)
            router.refresh()
          }}
        />
      ) : a.blockedBy ? (
        <p className="rounded-card border border-border bg-surface p-5 text-body text-ink-2">
          {blockedText[a.blockedBy]}
        </p>
      ) : null}
      {a.submissions.length > 0 ? <History a={a} /> : null}
    </div>
  )
}

function Brief({ a }: { a: MyAssignmentDto }) {
  const late = a.latePolicy
  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 sm:p-8">
      {a.dueAt ? (
        <p className="text-body text-ink">
          Due {formatDateTime(a.dueAt)}.{' '}
          <span className="text-ink-2">
            {late.mode === 'reject'
              ? `Late work isn’t accepted${late.graceHours ? ` after a ${late.graceHours}-hour grace period` : ''}.`
              : late.mode === 'penalty'
                ? `Late work loses ${late.penaltyPct}% of its score${late.graceHours ? ` after a ${late.graceHours}-hour grace period` : ''}.`
                : 'Late work is still accepted.'}
          </span>
        </p>
      ) : null}
      {a.instructionsHtml ? (
        <RichHtml html={a.instructionsHtml} className="text-body text-ink" />
      ) : (
        <p className="text-body text-ink-2">No brief yet.</p>
      )}
      <p className="text-body-sm text-ink-2">
        Graded out of {a.maxScore}, pass mark {a.passPct}%.
        {a.resubmissionsAllowed > 0
          ? ` You can submit again ${a.resubmissionsAllowed === 1 ? 'once' : `${a.resubmissionsAllowed} times`} after a grade.`
          : ''}
      </p>
      {a.rubric ? (
        <details>
          <summary className="cursor-pointer text-body-sm font-medium text-brand-ink">
            How it’s graded
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-body-sm">
              <tbody>
                {a.rubric.criteria.map((c) => (
                  <tr key={c.id} className="border-t border-border align-top">
                    <th scope="row" className="w-40 py-2 pr-3 text-left font-medium text-ink">
                      {c.title}
                    </th>
                    {c.levels.map((l) => (
                      <td key={l.id} className="py-2 pr-3 text-ink-2">
                        {l.title} <span className="text-ink-3">({l.points})</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  )
}

type SaveState = 'saved' | 'saving' | 'unsaved' | 'error'

function Draft({
  a,
  onSubmitted,
}: {
  a: MyAssignmentDto
  onSubmitted: (next: MyAssignmentDto) => void
}) {
  const types = new Set(a.submissionTypes)
  const [text, setText] = useState<RichTextDoc | null>(a.draft?.textDoc ?? null)
  const [files, setFiles] = useState<FileRef[]>(a.draft?.files ?? [])
  const [link, setLink] = useState(a.draft?.link ?? '')
  const [state, setState] = useState<SaveState>('saved')
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Kept apart from `error`: a draft save that succeeds must not hide a failed upload.
  const [fileError, setFileError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef({ text, files, link })
  latest.current = { text, files, link }

  const save = useCallback(async () => {
    const { text, files, link } = latest.current
    setState('saving')
    try {
      await saveAssignmentDraft({
        lessonId: a.lessonId,
        text,
        fileIds: files.map((f) => f.id),
        link: link.trim() || null,
      })
      setState('saved')
      setError(null)
      return true
    } catch (e) {
      setState('error')
      setError(failed(e))
      return false
    }
  }, [a.lessonId])

  const changed = () => {
    setState('unsaved')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), 1500)
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const hasWork = Boolean(text) || files.length > 0 || link.trim() !== ''

  return (
    <section
      aria-labelledby="your-work"
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="your-work" className="text-h4 text-ink">
          {a.submissions.length > 0 ? 'Submit again' : 'Your work'}
        </h2>
        <p role="status" className="text-body-sm text-ink-3">
          {state === 'saving'
            ? 'Saving…'
            : state === 'unsaved'
              ? 'Not saved yet'
              : state === 'error'
                ? 'Not saved'
                : 'Draft saved'}
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}

      {types.has('text') ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="asg-text">Written answer</Label>
          <RichTextEditor
            id="asg-text"
            value={text}
            minHeight="min-h-48"
            onChange={(doc) => {
              setText(doc)
              changed()
            }}
          />
        </div>
      ) : null}

      {types.has('file') ? (
        <div className="flex flex-col gap-2">
          <p className="text-body-sm font-medium text-ink">
            Files{' '}
            <span className="font-normal text-ink-2">
              (up to {a.maxFiles}, {a.maxFileMb} MB each)
            </span>
          </p>
          {files.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border rounded-control border border-border">
              {files.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 p-3">
                  <span className="min-w-0">
                    <span className="block truncate text-body text-ink">{f.name}</span>
                    <span className="text-body-sm text-ink-2">{formatBytes(f.sizeBytes)}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="tertiary"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => {
                      setFiles(files.filter((x) => x.id !== f.id))
                      changed()
                    }}
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {files.length < a.maxFiles ? (
            <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-control border border-border-strong px-3 py-2 text-body-sm text-ink hover:bg-canvas has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
              <Paperclip aria-hidden className="size-4" />
              {uploading ? `Uploading ${uploading}…` : 'Add a file'}
              <input
                type="file"
                className="sr-only"
                disabled={uploading !== null}
                accept=".pdf,.zip,.docx,.xlsx,.pptx,.csv,.txt,.jpg,.jpeg,.png"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  if (file.size > a.maxFileMb * 1024 * 1024) {
                    setFileError(`That file is over ${a.maxFileMb} MB.`)
                    return
                  }
                  setUploading(file.name)
                  setFileError(null)
                  try {
                    const id = await uploadSubmissionFile(file)
                    setFiles((list) => [
                      ...list,
                      { id, name: file.name, mime: file.type, sizeBytes: file.size },
                    ])
                    changed()
                  } catch (err) {
                    setFileError(failed(err))
                  } finally {
                    setUploading(null)
                  }
                }}
              />
            </label>
          ) : null}
          {fileError ? (
            <p role="alert" className="text-body-sm text-danger">
              {fileError}
            </p>
          ) : null}
        </div>
      ) : null}

      {types.has('link') ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="asg-link">Link</Label>
          <Input
            id="asg-link"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={link}
            maxLength={2000}
            onChange={(e) => {
              setLink(e.target.value)
              changed()
            }}
          />
        </div>
      ) : null}

      <Button
        className="w-fit"
        disabled={!hasWork || uploading !== null}
        onClick={() => setConfirming(true)}
      >
        Submit
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent
          title="Submit your work?"
          description="Your instructor will grade it. You can’t change it after submitting."
        >
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Not yet
            </Button>
            <Button
              loading={submitting}
              onClick={async () => {
                setSubmitting(true)
                if (timer.current) clearTimeout(timer.current)
                const ok = await save()
                if (ok) {
                  try {
                    onSubmitted(await submitAssignment(a.lessonId))
                  } catch (e) {
                    setError(failed(e))
                  }
                }
                setSubmitting(false)
                setConfirming(false)
              }}
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function History({ a }: { a: MyAssignmentDto }) {
  const [error, setError] = useState<string | null>(null)
  return (
    <section aria-labelledby="submissions" className="flex flex-col gap-3">
      <h2 id="submissions" className="text-h4 text-ink">
        {a.submissions.length === 1 ? 'Your submission' : 'Your submissions'}
      </h2>
      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
      {a.submissions.map((s) => (
        <article
          key={s.id}
          className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5"
        >
          <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink-2">
            Attempt {s.attemptNo}
            {s.submittedAt ? ` · submitted ${formatDateTime(s.submittedAt)}` : ''}
            {s.isLate ? (
              <Badge tone="warning">
                Late{s.latePenaltyPct ? `: ${s.latePenaltyPct}% off` : ''}
              </Badge>
            ) : null}
            {s.status === 'submitted' || s.status === 'grading' ? (
              <Badge tone="info">Waiting for a grade</Badge>
            ) : null}
            {s.status === 'returned' ? <Badge tone="warning">Sent back for changes</Badge> : null}
            {s.grade?.decision === 'graded' ? (
              <Badge tone={s.grade.passed ? 'brand' : 'neutral'}>
                {s.grade.passed ? 'Passed' : 'Graded'}
              </Badge>
            ) : null}
          </p>
          {s.grade?.score !== null && s.grade?.score !== undefined ? (
            <p className="text-h3 text-ink">
              {s.grade.score} / {s.grade.maxScore}
            </p>
          ) : null}
          {s.grade?.feedbackHtml ? (
            <div className="rounded-control bg-canvas p-4">
              <p className="mb-1 text-caption font-semibold text-ink-3 uppercase">Feedback</p>
              <RichHtml html={s.grade.feedbackHtml} className="text-body text-ink" />
            </div>
          ) : null}
          <details>
            <summary className="cursor-pointer text-body-sm text-brand-ink">
              What you handed in
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              {s.textHtml ? <RichHtml html={s.textHtml} className="text-body text-ink" /> : null}
              {s.link ? (
                <a
                  href={s.link}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="break-all text-body text-brand-ink underline"
                >
                  {s.link}
                </a>
              ) : null}
              {s.files.map((f) => (
                <Button
                  key={f.id}
                  size="sm"
                  variant="secondary"
                  className="w-fit"
                  icon={<Download aria-hidden />}
                  onClick={async () => {
                    try {
                      window.location.assign((await myAssignmentFile(a.lessonId, f.id)).url)
                    } catch (e) {
                      setError(failed(e))
                    }
                  }}
                >
                  {f.name}
                </Button>
              ))}
            </div>
          </details>
        </article>
      ))}
    </section>
  )
}
