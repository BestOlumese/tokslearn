'use client'
// Client component: one assignment — the brief, what learners hand in, how it's graded (rubric
// or a plain score), when it's due and what happens to late work (docs/10 §7).

import { useQuery } from '@tanstack/react-query'
import {
  type AssignmentSettings,
  type RichTextDoc,
  type Rubric,
  rubricMax,
  type StudioAssignmentDto,
} from '@tokslearn/contract'
import { Button } from '@tokslearn/ui/button'
import { Checkbox } from '@tokslearn/ui/checkbox'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { Radio } from '@tokslearn/ui/radio'
import { Select } from '@tokslearn/ui/select'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorDetails } from '@/lib/api-error'
import { api, orpc } from '@/lib/orpc'
import { RichTextEditor } from '../rich-text-editor'

let counter = 0
const newId = (prefix: string) =>
  `${prefix}${Date.now().toString(36).slice(-4)}${(counter++).toString(36)}`

const starterRubric = (): Rubric => ({
  criteria: [
    {
      id: newId('c'),
      title: 'Correct',
      description: '',
      levels: [
        { id: newId('l'), title: 'Not yet', description: '', points: 0 },
        { id: newId('l'), title: 'Partly', description: '', points: 5 },
        { id: newId('l'), title: 'Fully', description: '', points: 10 },
      ],
    },
  ],
})

export function AssignmentBuilder({
  assignmentId,
  cohortBased = false,
}: {
  assignmentId: string
  /** Offers due dates counted from the cohort's start. */
  cohortBased?: boolean
}) {
  const q = useQuery(orpc.studio.assignments.get.queryOptions({ input: { assignmentId } }))
  if (q.isPending) return <Skeleton className="h-96 w-full rounded-card" />
  if (!q.data) return <FormAlert tone="error">{apiErrorDetails(q.error)}</FormAlert>
  return <AssignmentForm key={q.data.id} initial={q.data} cohortBased={cohortBased} />
}

function AssignmentForm({
  initial,
  cohortBased,
}: {
  initial: StudioAssignmentDto
  cohortBased: boolean
}) {
  const [a, setA] = useState(initial)
  const [brief, setBrief] = useState<RichTextDoc | null>(initial.instructionsDoc)
  const [s, setS] = useState<AssignmentSettings>(initial.settings)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const set = (patch: Partial<AssignmentSettings>) => {
    setSaved(false)
    setS((x) => ({ ...x, ...patch }))
  }
  const disabled = !a.canEdit || pending
  const types = new Set(s.submissionTypes)
  const toggleType = (t: 'text' | 'file' | 'link', on: boolean) =>
    set({ submissionTypes: on ? [...types, t] : s.submissionTypes.filter((x) => x !== t) })

  const save = async () => {
    setPending(true)
    setError(null)
    try {
      const next = await api.studio.assignments.update({
        assignmentId: a.id,
        instructions: brief,
        settings: s,
      })
      setA(next)
      setS(next.settings)
      setSaved(true)
    } catch (e) {
      setError(apiErrorDetails(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div>
        <h2 className="text-h3 text-ink">{a.lessonTitle ?? 'Assignment'}</h2>
        <p className="mt-1 text-body-sm text-ink-2">
          {a.waiting > 0 ? `${a.waiting} waiting to be graded. ` : ''}
          {a.isLive
            ? 'Live: changes apply straight away.'
            : 'Goes live with your next approved update.'}
        </p>
      </div>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      {saved ? <FormAlert tone="success">Assignment saved.</FormAlert> : null}
      <fieldset disabled={disabled} className="contents">
        <SettingsPanel
          id="asg-brief"
          title="The brief"
          description="What to do, what to hand in, and what a good answer looks like."
        >
          <RichTextEditor
            id="asg-brief-editor"
            value={brief}
            onChange={(doc) => {
              setBrief(doc)
              setSaved(false)
            }}
            minHeight="min-h-48"
          />
        </SettingsPanel>

        <SettingsPanel id="asg-handin" title="What learners hand in">
          <div className="flex flex-col gap-2">
            {(
              [
                ['text', 'A written answer'],
                ['file', 'Files (PDF, Word, Excel, PowerPoint, images, ZIP)'],
                ['link', 'A link (a sheet, a site, a repository)'],
              ] as const
            ).map(([t, label]) => (
              <div key={t} className="flex items-center gap-2">
                <Checkbox
                  id={`asg-type-${t}`}
                  checked={types.has(t)}
                  onChange={(e) => toggleType(t, e.target.checked)}
                />
                <Label htmlFor={`asg-type-${t}`} kind="option">
                  {label}
                </Label>
              </div>
            ))}
          </div>
          {types.has('file') ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field id="asg-files" label="Most files">
                {(p) => (
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={10}
                    value={s.maxFiles}
                    onChange={(e) => set({ maxFiles: Number(e.target.value) || 1 })}
                    {...p}
                  />
                )}
              </Field>
              <Field id="asg-mb" label="Largest file (MB)">
                {(p) => (
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    value={s.maxFileMb}
                    onChange={(e) => set({ maxFileMb: Number(e.target.value) || 1 })}
                    {...p}
                  />
                )}
              </Field>
            </div>
          ) : null}
        </SettingsPanel>

        <SettingsPanel id="asg-grading" title="Grading">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Radio
                id="asg-rubric-on"
                name="asg-rubric"
                checked={s.rubric !== null}
                onChange={() => set({ rubric: s.rubric ?? starterRubric() })}
              />
              <Label htmlFor="asg-rubric-on" kind="option">
                With a rubric (criteria and levels)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Radio
                id="asg-rubric-off"
                name="asg-rubric"
                checked={s.rubric === null}
                onChange={() => set({ rubric: null })}
              />
              <Label htmlFor="asg-rubric-off" kind="option">
                A single score
              </Label>
            </div>
          </div>
          <div className="mt-4">
            {s.rubric ? (
              <RubricEditor rubric={s.rubric} onChange={(rubric) => set({ rubric })} />
            ) : (
              <Field id="asg-max" label="Out of">
                {(p) => (
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={1000}
                    value={s.maxScore}
                    onChange={(e) => set({ maxScore: Number(e.target.value) || 1 })}
                    className="w-32"
                    {...p}
                  />
                )}
              </Field>
            )}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field id="asg-pass" label="Pass mark (%)">
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
            <Field
              id="asg-resubmit"
              label="Resubmissions after a grade"
              helper="Work you send back for changes can always come back."
            >
              {(p) => (
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={10}
                  value={s.resubmissionsAllowed}
                  onChange={(e) => set({ resubmissionsAllowed: Number(e.target.value) || 0 })}
                  {...p}
                />
              )}
            </Field>
          </div>
        </SettingsPanel>

        <SettingsPanel id="asg-due" title="Due date and late work">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Radio
                id="asg-due-none"
                name="asg-due"
                checked={s.dueMode === 'none'}
                onChange={() => set({ dueMode: 'none', dueDays: null })}
              />
              <Label htmlFor="asg-due-none" kind="option">
                No due date
              </Label>
            </div>
            {(
              [
                [
                  'days_after_enrollment',
                  'Days after enrolling',
                  'days after each learner enrolls',
                ],
                ...(cohortBased
                  ? ([
                      [
                        'cohort_date',
                        'Days after the start date',
                        'days after their cohort starts',
                      ],
                    ] as const)
                  : []),
              ] as const
            ).map(([mode, aria, after]) => (
              <div key={mode} className="flex flex-wrap items-center gap-2">
                <Radio
                  id={`asg-due-${mode}`}
                  name="asg-due"
                  checked={s.dueMode === mode}
                  onChange={() => set({ dueMode: mode, dueDays: s.dueDays ?? 7 })}
                />
                <Label htmlFor={`asg-due-${mode}`} kind="option">
                  Due
                </Label>
                <Input
                  aria-label={aria}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={365}
                  value={s.dueMode === mode ? (s.dueDays ?? '') : ''}
                  disabled={s.dueMode !== mode || disabled}
                  onChange={(e) => set({ dueDays: e.target.value ? Number(e.target.value) : null })}
                  className="w-20"
                />
                <span className="text-body text-ink-2">{after}</span>
              </div>
            ))}
          </div>
          {s.dueMode !== 'none' ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field id="asg-late" label="Late work">
                {(p) => (
                  <Select
                    value={s.latePolicy.mode}
                    onChange={(e) =>
                      set({
                        latePolicy: {
                          ...s.latePolicy,
                          mode: e.target.value as AssignmentSettings['latePolicy']['mode'],
                        },
                      })
                    }
                    {...p}
                  >
                    <option value="accept">Accept it</option>
                    <option value="penalty">Take points off</option>
                    <option value="reject">Don’t accept it</option>
                  </Select>
                )}
              </Field>
              {s.latePolicy.mode === 'penalty' ? (
                <Field id="asg-penalty" label="Take off (%)">
                  {(p) => (
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      value={s.latePolicy.penaltyPct}
                      onChange={(e) =>
                        set({
                          latePolicy: { ...s.latePolicy, penaltyPct: Number(e.target.value) || 0 },
                        })
                      }
                      {...p}
                    />
                  )}
                </Field>
              ) : null}
              <Field id="asg-grace" label="Grace period (hours)">
                {(p) => (
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={168}
                    value={s.latePolicy.graceHours}
                    onChange={(e) =>
                      set({
                        latePolicy: { ...s.latePolicy, graceHours: Number(e.target.value) || 0 },
                      })
                    }
                    {...p}
                  />
                )}
              </Field>
            </div>
          ) : null}
        </SettingsPanel>

        {a.canEdit ? (
          <div>
            <Button type="submit" loading={pending}>
              Save assignment
            </Button>
          </div>
        ) : null}
      </fieldset>
    </form>
  )
}

function RubricEditor({ rubric, onChange }: { rubric: Rubric; onChange: (r: Rubric) => void }) {
  const criteria = rubric.criteria
  const update = (i: number, patch: Partial<Rubric['criteria'][number]>) =>
    onChange({ criteria: criteria.map((c, k) => (k === i ? { ...c, ...patch } : c)) })
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-ink-2">
        Scored out of {rubricMax(rubric)}: the top level of each criterion added up.
      </p>
      {criteria.map((c, i) => (
        <div key={c.id} className="flex flex-col gap-3 rounded-card border border-border p-4">
          <div className="flex items-end gap-2">
            <Field id={`crit-${c.id}`} label={`Criterion ${i + 1}`} className="flex-1">
              {(p) => (
                <Input
                  value={c.title}
                  maxLength={120}
                  onChange={(e) => update(i, { title: e.target.value })}
                  {...p}
                />
              )}
            </Field>
            <Button
              variant="tertiary"
              aria-label={`Remove criterion ${i + 1}`}
              disabled={criteria.length <= 1}
              onClick={() => onChange({ criteria: criteria.filter((_, k) => k !== i) })}
            >
              <X aria-hidden />
            </Button>
          </div>
          <ol className="flex flex-col gap-2">
            {c.levels.map((l, j) => (
              <li key={l.id} className="grid grid-cols-[1fr_5.5rem_auto] items-center gap-2">
                <Input
                  aria-label={`Level ${j + 1} of ${c.title || `criterion ${i + 1}`}`}
                  value={l.title}
                  maxLength={80}
                  onChange={(e) =>
                    update(i, {
                      levels: c.levels.map((x, k) =>
                        k === j ? { ...x, title: e.target.value } : x,
                      ),
                    })
                  }
                />
                <Input
                  aria-label={`Points for level ${j + 1}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  value={l.points}
                  onChange={(e) =>
                    update(i, {
                      levels: c.levels.map((x, k) =>
                        k === j ? { ...x, points: Number(e.target.value) || 0 } : x,
                      ),
                    })
                  }
                />
                <Button
                  size="sm"
                  variant="tertiary"
                  aria-label={`Remove level ${j + 1}`}
                  disabled={c.levels.length <= 2}
                  onClick={() => update(i, { levels: c.levels.filter((_, k) => k !== j) })}
                >
                  <X aria-hidden />
                </Button>
              </li>
            ))}
          </ol>
          {c.levels.length < 6 ? (
            <Button
              size="sm"
              variant="tertiary"
              className="w-fit"
              onClick={() =>
                update(i, {
                  levels: [...c.levels, { id: newId('l'), title: '', description: '', points: 0 }],
                })
              }
            >
              <Plus aria-hidden />
              Add a level
            </Button>
          ) : null}
        </div>
      ))}
      {criteria.length < 10 ? (
        <Button
          variant="secondary"
          className="w-fit"
          onClick={() =>
            onChange({
              criteria: [
                ...criteria,
                {
                  id: newId('c'),
                  title: '',
                  description: '',
                  levels: [
                    { id: newId('l'), title: 'Not yet', description: '', points: 0 },
                    { id: newId('l'), title: 'Done', description: '', points: 5 },
                  ],
                },
              ],
            })
          }
        >
          Add a criterion
        </Button>
      ) : null}
    </div>
  )
}
