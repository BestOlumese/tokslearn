'use client'
// Client component: one quiz or exam — its settings, and either a fixed list of questions or
// draws from question banks (docs/10 §5–6).

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { QuizSettings, StudioQuizDto } from '@tokslearn/contract'
import { Button } from '@tokslearn/ui/button'
import { Checkbox } from '@tokslearn/ui/checkbox'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { Radio } from '@tokslearn/ui/radio'
import { Select } from '@tokslearn/ui/select'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { RichHtml } from '@/components/rich-html'
import { apiErrorDetails } from '@/lib/api-error'
import { api, orpc } from '@/lib/orpc'
import { typeLabels } from './question-editor'

type Kind = StudioQuizDto['kind']
const kinds: ReadonlyArray<[Kind, string, string]> = [
  ['practice', 'Practice quiz', 'For learning: unlimited tries, no pass mark.'],
  ['graded', 'Graded quiz', 'Counts: a pass mark and a set number of attempts.'],
  [
    'exam',
    'Certification exam',
    'Timed, one attempt at a time, recorded signals, ends the refund right when started.',
  ],
]

const showLabels: Record<QuizSettings['showAnswers'], string> = {
  never: 'Never',
  after_submit: 'Right after submitting',
  after_pass: 'Only after passing',
  after_close: 'From a date',
}

export function QuizBuilder({ quizId, courseId }: { quizId: string; courseId: string }) {
  const quiz = useQuery(orpc.studio.quizzes.get.queryOptions({ input: { quizId } }))
  if (quiz.isPending) return <Skeleton className="h-96 w-full rounded-card" />
  if (!quiz.data) return <FormAlert tone="error">{apiErrorDetails(quiz.error)}</FormAlert>
  return <QuizForm key={quiz.data.id} initial={quiz.data} courseId={courseId} />
}

function QuizForm({ initial, courseId }: { initial: StudioQuizDto; courseId: string }) {
  const client = useQueryClient()
  const [quiz, setQuiz] = useState(initial)
  const [kind, setKind] = useState<Kind>(initial.kind)
  const [s, setS] = useState<QuizSettings>(initial.settings)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const set = (patch: Partial<QuizSettings>) => {
    setSaved(null)
    setS((x) => ({ ...x, ...patch }))
  }
  const disabled = !quiz.canEdit || pending

  const apply = async (fn: () => Promise<StudioQuizDto>, message: string) => {
    setPending(true)
    setError(null)
    try {
      const next = await fn()
      setQuiz(next)
      setS(next.settings)
      setKind(next.kind)
      setSaved(message)
      void client.invalidateQueries({ queryKey: orpc.studio.quizzes.list.key() })
    } catch (e) {
      setError(apiErrorDetails(e))
    } finally {
      setPending(false)
    }
  }

  const minutes = s.timeLimitSec === null ? '' : String(Math.round(s.timeLimitSec / 60))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-h3 text-ink">{quiz.lessonTitle ?? 'Quiz'}</h2>
        <p className="mt-1 text-body-sm text-ink-2">
          {quiz.questionsPerAttempt === 1 ? '1 question' : `${quiz.questionsPerAttempt} questions`}{' '}
          per attempt
          {quiz.isLive
            ? ' · Live: changes apply to new attempts straight away.'
            : ' · Goes live with your next approved update.'}
        </p>
      </div>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      {saved ? <FormAlert tone="success">{saved}</FormAlert> : null}

      <fieldset disabled={disabled} className="contents">
        <SettingsPanel id="quiz-kind" title="What kind">
          <div className="flex flex-col gap-2">
            {kinds.map(([value, label, hint]) => (
              <div key={value} className="flex items-start gap-3">
                <Radio
                  id={`kind-${value}`}
                  name="quiz-kind"
                  checked={kind === value}
                  onChange={() => {
                    setKind(value)
                    if (value === 'exam' && s.timeLimitSec === null)
                      set({ timeLimitSec: 3600, showAnswers: 'never' })
                  }}
                  className="mt-0.5"
                />
                <Label htmlFor={`kind-${value}`} kind="option">
                  <span className="font-medium text-ink">{label}</span>
                  <span className="block text-body-sm text-ink-2">{hint}</span>
                </Label>
              </div>
            ))}
          </div>
        </SettingsPanel>

        <SettingsPanel id="quiz-rules" title="Rules">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="quiz-time"
              label="Time limit (minutes)"
              helper={kind === 'exam' ? 'Required for exams.' : 'Empty for no limit.'}
            >
              {(p) => (
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={240}
                  value={minutes}
                  onChange={(e) =>
                    set({
                      timeLimitSec: e.target.value ? Math.round(Number(e.target.value) * 60) : null,
                    })
                  }
                  {...p}
                />
              )}
            </Field>
            <Field id="quiz-attempts" label="Attempts" helper="Empty for unlimited.">
              {(p) => (
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  value={s.attemptsAllowed ?? ''}
                  onChange={(e) =>
                    set({ attemptsAllowed: e.target.value ? Number(e.target.value) : null })
                  }
                  {...p}
                />
              )}
            </Field>
            <Field id="quiz-cooldown" label="Wait between attempts (hours)">
              {(p) => (
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={720}
                  value={s.cooldownHours}
                  onChange={(e) => set({ cooldownHours: Number(e.target.value) || 0 })}
                  {...p}
                />
              )}
            </Field>
            <Field id="quiz-pass" label="Pass mark (%)">
              {(p) => (
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  value={s.passPct}
                  onChange={(e) => set({ passPct: Number(e.target.value) || 0 })}
                  {...p}
                />
              )}
            </Field>
            <Field id="quiz-show" label="Show correct answers">
              {(p) => (
                <Select
                  value={s.showAnswers}
                  onChange={(e) =>
                    set({ showAnswers: e.target.value as QuizSettings['showAnswers'] })
                  }
                  {...p}
                >
                  {(Object.keys(showLabels) as Array<QuizSettings['showAnswers']>).map((k) => (
                    <option key={k} value={k}>
                      {showLabels[k]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {s.showAnswers === 'after_close' ? (
              <Field id="quiz-closes" label="Answers visible from">
                {(p) => (
                  <Input
                    type="datetime-local"
                    value={s.closesAt ? s.closesAt.slice(0, 16) : ''}
                    onChange={(e) =>
                      set({ closesAt: e.target.value ? `${e.target.value}:00+01:00` : null })
                    }
                    {...p}
                  />
                )}
              </Field>
            ) : null}
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {(
              [
                ['shuffleQuestions', 'Shuffle the question order for each attempt'],
                ['shuffleOptions', 'Shuffle the choices'],
                ['partialCredit', 'Give partial points on ordering and matching questions'],
                ...(kind === 'exam'
                  ? ([
                      ['requireAllLessons', 'Learners finish every other lesson first'],
                      ['oneQuestionPerScreen', 'Show one question per screen'],
                    ] as const)
                  : []),
              ] as const
            ).map(([k, label]) => (
              <div key={k} className="flex items-center gap-2">
                <Checkbox
                  id={`quiz-${k}`}
                  checked={s[k]}
                  onChange={(e) => set({ [k]: e.target.checked })}
                />
                <Label htmlFor={`quiz-${k}`} kind="option">
                  {label}
                </Label>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <Button
              loading={pending}
              onClick={() =>
                void apply(
                  () => api.studio.quizzes.update({ quizId: quiz.id, kind, settings: s }),
                  'Settings saved.',
                )
              }
            >
              Save settings
            </Button>
          </div>
        </SettingsPanel>

        <SettingsPanel
          id="quiz-questions"
          title="Questions"
          description="A fixed list everyone gets, or a number drawn at random from your banks for each attempt."
        >
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:gap-6">
            {(
              [
                ['fixed', 'A fixed list'],
                ['draw', 'Draw from banks'],
              ] as const
            ).map(([mode, label]) => (
              <div key={mode} className="flex items-center gap-2">
                <Radio
                  id={`mode-${mode}`}
                  name="quiz-mode"
                  checked={s.mode === mode}
                  onChange={() =>
                    void apply(
                      () =>
                        api.studio.quizzes.update({
                          quizId: quiz.id,
                          kind,
                          settings: { ...s, mode },
                        }),
                      'Saved.',
                    )
                  }
                />
                <Label htmlFor={`mode-${mode}`} kind="option">
                  {label}
                </Label>
              </div>
            ))}
          </div>
          {s.mode === 'fixed' ? (
            <FixedQuestions
              quiz={quiz}
              courseId={courseId}
              onChange={(ids) =>
                apply(
                  () => api.studio.quizzes.setQuestions({ quizId: quiz.id, questionIds: ids }),
                  'Questions saved.',
                )
              }
            />
          ) : (
            <Draws
              quiz={quiz}
              courseId={courseId}
              onSave={(sources) =>
                apply(
                  () => api.studio.quizzes.setSources({ quizId: quiz.id, sources }),
                  'Draws saved.',
                )
              }
            />
          )}
        </SettingsPanel>
      </fieldset>
    </div>
  )
}

function FixedQuestions({
  quiz,
  courseId,
  onChange,
}: {
  quiz: StudioQuizDto
  courseId: string
  onChange: (ids: string[]) => Promise<void>
}) {
  const banks = useQuery(orpc.studio.questionBanks.list.queryOptions({ input: { courseId } }))
  const [bankId, setBankId] = useState<string>('')
  const questions = useQuery({
    ...orpc.studio.questions.list.queryOptions({ input: { bankId } }),
    enabled: bankId !== '',
  })
  const ids = quiz.questions.map((q) => q.id)
  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length) return
    const next = [...ids]
    const [x] = next.splice(from, 1)
    if (x) next.splice(to, 0, x)
    void onChange(next)
  }
  return (
    <div className="flex flex-col gap-4">
      {quiz.questions.length > 0 ? (
        <ol className="flex flex-col divide-y divide-border rounded-card border border-border">
          {quiz.questions.map((q, i) => (
            <li key={q.id} className="flex items-start gap-2 p-3">
              <span className="w-6 pt-0.5 text-right text-body-sm text-ink-3">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <p className="text-caption text-ink-3">
                  {typeLabels[q.type]} · {q.points} pt
                </p>
                <RichHtml html={q.promptHtml} className="line-clamp-2 text-body-sm text-ink" />
              </div>
              <Button
                size="sm"
                variant="tertiary"
                aria-label="Move up"
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                size="sm"
                variant="tertiary"
                aria-label="Move down"
                disabled={i === ids.length - 1}
                onClick={() => move(i, i + 1)}
              >
                <ArrowDown aria-hidden />
              </Button>
              <Button
                size="sm"
                variant="tertiary"
                aria-label="Remove from quiz"
                onClick={() => void onChange(ids.filter((x) => x !== q.id))}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-body-sm text-ink-2">No questions yet. Add some from a bank below.</p>
      )}
      <div className="flex flex-col gap-3 rounded-card border border-dashed border-border-strong p-4">
        <Field id="pick-bank" label="Add questions from">
          {(p) => (
            <Select value={bankId} onChange={(e) => setBankId(e.target.value)} {...p}>
              <option value="">Choose a bank…</option>
              {(banks.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} ({b.questionCount})
                </option>
              ))}
            </Select>
          )}
        </Field>
        {bankId && questions.data ? (
          questions.data.length === 0 ? (
            <p className="text-body-sm text-ink-2">This bank is empty.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {questions.data.map((q) => {
                const inQuiz = ids.includes(q.id)
                return (
                  <li key={q.id} className="flex items-start justify-between gap-3">
                    <RichHtml
                      html={q.promptHtml}
                      className="line-clamp-2 min-w-0 text-body-sm text-ink"
                    />
                    <Button
                      size="sm"
                      variant={inQuiz ? 'tertiary' : 'secondary'}
                      disabled={inQuiz}
                      onClick={() => void onChange([...ids, q.id])}
                    >
                      {inQuiz ? 'Added' : 'Add'}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )
        ) : null}
      </div>
    </div>
  )
}

type SourceRow = { key: string; bankId: string; questionCount: number; tags: string }
let rowKey = 0
const nextKey = () => `draw-${rowKey++}`

function Draws({
  quiz,
  courseId,
  onSave,
}: {
  quiz: StudioQuizDto
  courseId: string
  onSave: (
    sources: Array<{ bankId: string; questionCount: number; tagFilter: string[] }>,
  ) => Promise<void>
}) {
  const banks = useQuery(orpc.studio.questionBanks.list.queryOptions({ input: { courseId } }))
  const [rows, setRows] = useState<SourceRow[]>(() =>
    quiz.sources.map((s) => ({
      key: nextKey(),
      bankId: s.bankId,
      questionCount: s.questionCount,
      tags: s.tagFilter.join(', '),
    })),
  )
  const available = new Map(quiz.sources.map((s) => [s.bankId, s.available]))
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r, i) => (
        <div key={r.key} className="grid gap-2 sm:grid-cols-[1fr_7rem_1fr_auto] sm:items-end">
          <Field id={`draw-bank-${i}`} label="Bank">
            {(p) => (
              <Select
                value={r.bankId}
                onChange={(e) =>
                  setRows(rows.map((x, k) => (k === i ? { ...x, bankId: e.target.value } : x)))
                }
                {...p}
              >
                <option value="">Choose…</option>
                {(banks.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} ({b.questionCount})
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id={`draw-count-${i}`} label="How many">
            {(p) => (
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={200}
                value={r.questionCount}
                onChange={(e) =>
                  setRows(
                    rows.map((x, k) =>
                      k === i ? { ...x, questionCount: Number(e.target.value) || 1 } : x,
                    ),
                  )
                }
                {...p}
              />
            )}
          </Field>
          <Field id={`draw-tags-${i}`} label="Only with tags (optional)">
            {(p) => (
              <Input
                value={r.tags}
                onChange={(e) =>
                  setRows(rows.map((x, k) => (k === i ? { ...x, tags: e.target.value } : x)))
                }
                {...p}
              />
            )}
          </Field>
          <Button
            variant="tertiary"
            aria-label="Remove this draw"
            onClick={() => setRows(rows.filter((_, k) => k !== i))}
          >
            <X aria-hidden />
          </Button>
          {available.has(r.bankId) && (available.get(r.bankId) ?? 0) < r.questionCount ? (
            <p className="text-body-sm text-warning sm:col-span-4">
              This bank has {available.get(r.bankId)} matching questions, so attempts get that many.
            </p>
          ) : null}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {rows.length < 10 ? (
          <Button
            variant="secondary"
            onClick={() =>
              setRows([...rows, { key: nextKey(), bankId: '', questionCount: 5, tags: '' }])
            }
          >
            Add a bank
          </Button>
        ) : null}
        <Button
          onClick={() =>
            void onSave(
              rows
                .filter((r) => r.bankId)
                .map((r) => ({
                  bankId: r.bankId,
                  questionCount: r.questionCount,
                  tagFilter: r.tags
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                })),
            )
          }
        >
          Save draws
        </Button>
      </div>
    </div>
  )
}
