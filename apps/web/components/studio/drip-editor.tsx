'use client'

// Client component: the drip schedule (docs/20 `/teach/courses/[id]/drip`). Scheduling, not
// content, so it saves straight to the live course and stays editable during a review (ADR-034).

import { useQuery } from '@tanstack/react-query'
import type { DripSettingsDto } from '@tokslearn/contract'
import { Button } from '@tokslearn/ui/button'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { Radio } from '@tokslearn/ui/radio'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { api, orpc } from '@/lib/orpc'
import { useCourseEditor } from './course-editor-provider'

type Mode = DripSettingsDto['mode']
type Row = { offsetDays: string; date: string }

const modes: ReadonlyArray<[Mode, string, string]> = [
  ['none', 'Everything opens at once', 'Learners can go through the course at their own pace.'],
  [
    'after_enrollment',
    'Days after each learner enrolls',
    'Each learner gets lessons on their own timetable, counted from the day they joined.',
  ],
  [
    'fixed_dates',
    'On set dates',
    'Everyone gets a lesson on the same day. Good for a course that runs alongside a class.',
  ],
  [
    'cohort_relative',
    'Days after the start date',
    'Counted from the start of each learner’s cohort, so every run follows the same timetable.',
  ],
]

export function DripEditor() {
  const { course } = useCourseEditor()
  const query = useQuery(orpc.studio.drip.get.queryOptions({ input: { courseId: course.id } }))
  if (query.isPending) return <Skeleton className="h-96 w-full rounded-card" />
  if (!query.data) {
    return <FormAlert tone="error">{apiErrorMessage(query.error)}</FormAlert>
  }
  return <DripForm initial={query.data} />
}

function DripForm({ initial }: { initial: DripSettingsDto }) {
  const { course, run } = useCourseEditor()
  const editable = initial.canEdit && course.status !== 'archived'
  const [mode, setMode] = useState<Mode>(initial.mode)
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      initial.lessons.map((l) => [
        l.lessonId,
        { offsetDays: l.offsetDays === null ? '' : String(l.offsetDays), date: l.date ?? '' },
      ]),
    ),
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const set = (id: string, patch: Partial<Row>) => {
    setSaved(false)
    setRows((r) => ({ ...r, [id]: { offsetDays: '', date: '', ...r[id], ...patch } }))
  }

  const save = async () => {
    setPending(true)
    setError(null)
    try {
      await run(async (version) => {
        const next = await api.studio.drip.update({
          courseId: course.id,
          version,
          mode,
          lessons: initial.lessons.map((l) => {
            const r = rows[l.lessonId]
            const days = Number.parseInt(r?.offsetDays ?? '', 10)
            return {
              lessonId: l.lessonId,
              offsetDays: Number.isFinite(days) && days > 0 ? days : null,
              date: r?.date ? r.date : null,
            }
          }),
        })
        setMode(next.mode)
        return api.studio.courses.get({ courseId: course.id })
      })
      setSaved(true)
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="flex max-w-[860px] flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      {saved ? (
        <FormAlert tone="success">Schedule saved. It applies to learners now.</FormAlert>
      ) : null}
      <fieldset disabled={!editable || pending} className="contents">
        <SettingsPanel
          id="drip-mode"
          title="When lessons open"
          description="A lesson a learner has already started stays open, even if you move its date later. Free previews are always open."
        >
          <div className="flex flex-col gap-2">
            {modes
              .filter(([value]) => value !== 'cohort_relative' || initial.cohortBased)
              .map(([value, label, hint]) => (
                <div key={value} className="flex items-start gap-3">
                  <Radio
                    id={`drip-${value}`}
                    name="drip-mode"
                    checked={mode === value}
                    onChange={() => {
                      setMode(value)
                      setSaved(false)
                    }}
                    className="mt-0.5"
                  />
                  <Label htmlFor={`drip-${value}`} kind="option">
                    <span className="font-medium text-ink">{label}</span>
                    <span className="block text-body-sm text-ink-2">{hint}</span>
                  </Label>
                </div>
              ))}
          </div>
        </SettingsPanel>

        {mode !== 'none' ? (
          <SettingsPanel
            id="drip-lessons"
            title={
              mode === 'after_enrollment'
                ? 'Days after enrolling'
                : mode === 'cohort_relative'
                  ? 'Days after the start date'
                  : 'Opening dates'
            }
            description={
              mode === 'after_enrollment'
                ? 'Counted from each learner’s own enrollment date, so someone who joined 10 days ago already has a “7 days” lesson. Leave a lesson empty or at 0 to open it straight away.'
                : mode === 'cohort_relative'
                  ? 'Counted from the start date of the learner’s cohort. Leave a lesson empty or at 0 to open it as soon as they join.'
                  : 'Dates are in Lagos time; a lesson opens at midnight. Leave empty to open it straight away.'
            }
          >
            <ol className="flex flex-col divide-y divide-border rounded-card border border-border">
              {initial.lessons.map((l, i) => {
                const heading =
                  initial.lessons[i - 1]?.sectionTitle !== l.sectionTitle ? l.sectionTitle : null
                const r = rows[l.lessonId]
                return (
                  <li key={l.lessonId} className="flex flex-col">
                    {heading ? (
                      <p className="bg-canvas px-4 py-2 text-caption font-semibold text-ink-2">
                        {heading}
                      </p>
                    ) : null}
                    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-body text-ink">{l.title}</p>
                        {!l.isLive ? (
                          <p className="text-caption text-ink-3">Not published yet</p>
                        ) : null}
                      </div>
                      {l.isPreview ? (
                        <p className="shrink-0 text-body-sm text-ink-3">
                          Free preview, always open
                        </p>
                      ) : mode === 'after_enrollment' || mode === 'cohort_relative' ? (
                        <div className="flex shrink-0 items-center gap-2">
                          <Input
                            aria-label={`${mode === 'cohort_relative' ? 'Days after the start date' : 'Days after enrolling'} for ${l.title}`}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={365}
                            value={r?.offsetDays ?? ''}
                            onChange={(e) => set(l.lessonId, { offsetDays: e.target.value })}
                            className="w-24"
                          />
                          <span className="text-body-sm text-ink-2">days</span>
                        </div>
                      ) : (
                        <Input
                          aria-label={`Opening date for ${l.title}`}
                          type="date"
                          value={r?.date ?? ''}
                          onChange={(e) => set(l.lessonId, { date: e.target.value })}
                          className="w-44 shrink-0"
                        />
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </SettingsPanel>
        ) : null}

        {editable ? (
          <div>
            <Button type="submit" loading={pending}>
              Save schedule
            </Button>
          </div>
        ) : (
          <p className="text-body-sm text-ink-2">Only the course’s instructor can change this.</p>
        )}
      </fieldset>
    </form>
  )
}
