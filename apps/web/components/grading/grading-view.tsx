'use client'
// Client component: grade one submission (docs/20 `/teach/grading`): the learner's work and
// files, the brief, earlier attempts, rubric levels or a score, feedback, then grade or send back.

import { useQuery } from '@tanstack/react-query'
import type { GradingViewDto, RichTextDoc, SubmissionDto } from '@tokslearn/contract'
import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { Radio } from '@tokslearn/ui/radio'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { Download } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { RichHtml } from '@/components/rich-html'
import { RichTextEditor } from '@/components/studio/rich-text-editor'
import { apiErrorDetails, apiErrorMessage } from '@/lib/api-error'
import { formatBytes, formatDateTime } from '@/lib/format'
import { api, orpc } from '@/lib/orpc'

export function GradingView({ submissionId }: { submissionId: string }) {
  const q = useQuery(orpc.grading.get.queryOptions({ input: { submissionId } }))
  if (q.isPending) return <Skeleton className="h-96 w-full rounded-card" />
  if (!q.data) return <FormAlert tone="error">{apiErrorMessage(q.error)}</FormAlert>
  return <Grading key={q.data.submission.id} initial={q.data} />
}

function Work({ submissionId, s }: { submissionId: string; s: SubmissionDto }) {
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-4">
      {s.textHtml ? <RichHtml html={s.textHtml} className="text-body text-ink" /> : null}
      {s.link ? (
        <p className="text-body">
          Link:{' '}
          <a
            href={s.link}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="break-all font-medium text-brand-ink underline"
          >
            {s.link}
          </a>
        </p>
      ) : null}
      {s.files.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
          {s.files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 p-3">
              <span className="min-w-0">
                <span className="block truncate text-body text-ink">{f.name}</span>
                <span className="text-body-sm text-ink-2">{formatBytes(f.sizeBytes)}</span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                icon={<Download aria-hidden />}
                onClick={async () => {
                  try {
                    const file = await api.grading.file({ submissionId, fileId: f.id })
                    window.location.assign(file.url)
                  } catch (e) {
                    setError(apiErrorMessage(e))
                  }
                }}
              >
                Download
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      {!s.textHtml && !s.link && s.files.length === 0 ? (
        <p className="text-body text-ink-2">Nothing was handed in.</p>
      ) : null}
    </div>
  )
}

function Grading({ initial }: { initial: GradingViewDto }) {
  const [view, setView] = useState(initial)
  const s = view.submission
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [score, setScore] = useState('')
  const [feedback, setFeedback] = useState<RichTextDoc | null>(null)
  const [pending, setPending] = useState<'graded' | 'returned' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const open = view.canGrade && (s.status === 'submitted' || s.status === 'grading')
  const rubricTotal = view.rubric
    ? view.rubric.criteria.reduce(
        (sum, c) => sum + (c.levels.find((l) => l.id === picks[c.id])?.points ?? 0),
        0,
      )
    : null

  const grade = async (decision: 'graded' | 'returned') => {
    setPending(decision)
    setError(null)
    try {
      const next = await api.grading.grade({
        submissionId: s.id,
        decision,
        ...(decision === 'graded'
          ? view.rubric
            ? { rubricScores: picks }
            : { score: Number(score) }
          : {}),
        feedback,
      })
      setView(next)
    } catch (e) {
      setError(apiErrorDetails(e))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      <Link href="/teach/grading" className="w-fit text-body-sm text-ink-2 hover:text-ink">
        ← Grading queue
      </Link>
      <div>
        <h1 className="text-h2 text-ink">
          {view.assignmentTitle} · {view.learnerName}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-body-sm text-ink-2">
          <span>
            {view.courseTitle} · attempt {s.attemptNo}
            {s.submittedAt ? ` · submitted ${formatDateTime(s.submittedAt)}` : ''}
          </span>
          {s.isLate ? (
            <Badge tone="warning">Late{s.latePenaltyPct ? `: ${s.latePenaltyPct}% off` : ''}</Badge>
          ) : null}
        </p>
      </div>

      <SettingsPanel id="work" title="Their work">
        <Work submissionId={s.id} s={s} />
      </SettingsPanel>

      {s.grade ? (
        <SettingsPanel
          id="result"
          title={s.grade.decision === 'returned' ? 'Sent back for changes' : 'Grade'}
        >
          {s.grade.score !== null ? (
            <p className="text-h3 text-ink">
              {s.grade.score} / {s.grade.maxScore}{' '}
              {s.grade.passed ? (
                <Badge tone="brand">Pass</Badge>
              ) : (
                <Badge tone="warning">Below the pass mark</Badge>
              )}
            </p>
          ) : null}
          {s.grade.feedbackHtml ? (
            <RichHtml html={s.grade.feedbackHtml} className="mt-3 text-body text-ink" />
          ) : null}
          <p className="mt-3 text-body-sm text-ink-2">
            Graded {formatDateTime(s.grade.gradedAt)}. The learner has been emailed.
          </p>
        </SettingsPanel>
      ) : null}

      {open ? (
        <SettingsPanel
          id="grade"
          title="Grade it"
          description={`Pass mark ${view.passPct}%.${s.latePenaltyPct ? ` The ${s.latePenaltyPct}% late penalty is taken off automatically.` : ''}`}
        >
          <div className="flex flex-col gap-5">
            {error ? <FormAlert tone="error">{error}</FormAlert> : null}
            {view.rubric ? (
              <div className="flex flex-col gap-4">
                {view.rubric.criteria.map((c) => (
                  <fieldset key={c.id} className="flex flex-col gap-2">
                    <legend className="mb-1 text-body font-medium text-ink">{c.title}</legend>
                    {c.levels.map((l) => (
                      <div key={l.id} className="flex items-center gap-2">
                        <Radio
                          id={`${c.id}-${l.id}`}
                          name={c.id}
                          checked={picks[c.id] === l.id}
                          onChange={() => setPicks((p) => ({ ...p, [c.id]: l.id }))}
                        />
                        <Label htmlFor={`${c.id}-${l.id}`} kind="option">
                          {l.title} <span className="text-ink-2">({l.points})</span>
                        </Label>
                      </div>
                    ))}
                  </fieldset>
                ))}
                <p className="text-body-sm text-ink-2">
                  So far: {rubricTotal} / {view.maxScore}
                </p>
              </div>
            ) : (
              <Field id="grade-score" label={`Score out of ${view.maxScore}`}>
                {(p) => (
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={view.maxScore}
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    className="w-32"
                    {...p}
                  />
                )}
              </Field>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grade-feedback">Feedback</Label>
              <RichTextEditor
                id="grade-feedback"
                value={feedback}
                onChange={setFeedback}
                minHeight="min-h-28"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                loading={pending === 'graded'}
                disabled={pending !== null}
                onClick={() => void grade('graded')}
              >
                Grade
              </Button>
              <Button
                variant="secondary"
                loading={pending === 'returned'}
                disabled={pending !== null}
                onClick={() => void grade('returned')}
              >
                Send back for changes
              </Button>
            </div>
          </div>
        </SettingsPanel>
      ) : null}

      <details className="rounded-card border border-border bg-surface p-5">
        <summary className="cursor-pointer text-body font-medium text-ink">The brief</summary>
        {view.instructionsHtml ? (
          <RichHtml html={view.instructionsHtml} className="mt-3 text-body text-ink" />
        ) : (
          <p className="mt-3 text-body-sm text-ink-2">No brief written.</p>
        )}
      </details>

      {view.earlier.length > 0 ? (
        <details className="rounded-card border border-border bg-surface p-5">
          <summary className="cursor-pointer text-body font-medium text-ink">
            Earlier attempts ({view.earlier.length})
          </summary>
          <div className="mt-4 flex flex-col gap-6">
            {view.earlier.map((e) => (
              <div key={e.id} className="flex flex-col gap-2">
                <p className="text-body-sm text-ink-2">
                  Attempt {e.attemptNo}
                  {e.grade
                    ? ` · ${e.grade.decision === 'returned' ? 'sent back' : `${e.grade.score}/${e.grade.maxScore}`}`
                    : ''}
                </p>
                <Work submissionId={e.id} s={e} />
                {e.grade?.feedbackHtml ? (
                  <RichHtml html={e.grade.feedbackHtml} className="text-body-sm text-ink-2" />
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
      <Link
        href={`/teach/courses/${view.courseId}/learners` as Route}
        className="w-fit text-body-sm text-brand-ink hover:underline"
      >
        See the course’s learners
      </Link>
    </div>
  )
}
