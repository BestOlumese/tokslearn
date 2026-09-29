'use client'
// Client component: review a flagged exam attempt (docs/10 §6). Signals are shown as counts,
// never raw network details. A person decides: void with a reason the learner will read.

import { useQuery } from '@tanstack/react-query'
import type { AttemptReviewDto } from '@tokslearn/contract'
import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { Field } from '@tokslearn/ui/field'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { Textarea } from '@tokslearn/ui/textarea'
import Link from 'next/link'
import { useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { RichHtml } from '@/components/rich-html'
import { apiErrorDetails, apiErrorMessage } from '@/lib/api-error'
import { formatDateTime } from '@/lib/format'
import { api, orpc } from '@/lib/orpc'
import { reasonText } from './grading-queue'

const minutes = (ms: number | undefined) => Math.round((ms ?? 0) / 60_000)

export function AttemptReview({ attemptId }: { attemptId: string }) {
  const q = useQuery(orpc.grading.attempt.queryOptions({ input: { attemptId } }))
  if (q.isPending) return <Skeleton className="h-96 w-full rounded-card" />
  if (!q.data) return <FormAlert tone="error">{apiErrorMessage(q.error)}</FormAlert>
  return <Review key={q.data.attemptId} initial={q.data} />
}

function Review({ initial }: { initial: AttemptReviewDto }) {
  const [r, setR] = useState(initial)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const i = r.integrity
  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      <Link
        href="/teach/grading?tab=flagged"
        className="w-fit text-body-sm text-ink-2 hover:text-ink"
      >
        ← Flagged exams
      </Link>
      <div>
        <h1 className="text-h2 text-ink">
          {r.examTitle} · {r.learnerName}
        </h1>
        <p className="mt-1 text-body-sm text-ink-2">
          {r.courseTitle} · attempt {r.attemptNo} · started {formatDateTime(r.startedAt)}
          {r.submittedAt ? ` · submitted ${formatDateTime(r.submittedAt)}` : ''}
          {r.score !== null && r.maxScore ? ` · ${r.score}/${r.maxScore}` : ''}
        </p>
        <p className="mt-2 flex flex-wrap gap-1.5">
          {r.status === 'void' ? <Badge tone="danger">Voided</Badge> : null}
          {r.reasons.map((x) => (
            <Badge key={x} tone="warning">
              {reasonText[x]}
            </Badge>
          ))}
        </p>
      </div>

      <SettingsPanel
        id="signals"
        title="Recorded signals"
        description="The learner was told these are recorded before starting. They are signals, not proof."
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            [
              'Left the exam tab',
              `${i.focusLosses ?? 0} times, ${minutes(i.focusLossMs)} min in total`,
            ],
            ['Left fullscreen', `${i.fullscreenExits ?? 0} times`],
            ['Tried to paste', `${i.pastes ?? 0} times`],
            ['Networks used', `${i.networksSeen}`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-control bg-canvas p-3">
              <dt className="text-body-sm text-ink-2">{k}</dt>
              <dd className="text-body font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </SettingsPanel>

      <SettingsPanel id="answers" title="Answers">
        {r.answers.length === 0 ? (
          <p className="text-body text-ink-2">No answers were saved.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {r.answers.map((a, n) => (
              <li key={a.questionId} className="flex flex-col gap-1 py-3">
                <p className="text-caption text-ink-3">
                  {n + 1}. {a.correct ? 'Right' : 'Wrong'} · answered {formatDateTime(a.answeredAt)}
                </p>
                <RichHtml html={a.promptHtml} className="line-clamp-2 text-body-sm text-ink" />
                <code className="break-all text-caption text-ink-2">
                  {JSON.stringify(a.answer)}
                </code>
              </li>
            ))}
          </ol>
        )}
      </SettingsPanel>

      {r.canVoid ? (
        <SettingsPanel
          id="void"
          title="Void this attempt"
          tone="danger"
          description="It stops counting, the learner can take the exam again, and they get an email with your reason."
        >
          <div className="flex flex-col gap-3">
            {error ? <FormAlert tone="error">{error}</FormAlert> : null}
            <Field id="void-reason" label="Reason (the learner reads this)">
              {(p) => (
                <Textarea
                  rows={3}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  {...p}
                />
              )}
            </Field>
            <Button
              variant="danger"
              className="w-fit"
              loading={pending}
              disabled={reason.trim().length < 10}
              onClick={async () => {
                setPending(true)
                setError(null)
                try {
                  setR(await api.grading.voidAttempt({ attemptId: r.attemptId, reason }))
                } catch (e) {
                  setError(apiErrorDetails(e))
                } finally {
                  setPending(false)
                }
              }}
            >
              Void attempt
            </Button>
          </div>
        </SettingsPanel>
      ) : null}
    </div>
  )
}
