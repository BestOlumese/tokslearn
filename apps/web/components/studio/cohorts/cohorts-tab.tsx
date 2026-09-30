'use client'
// Client component: the course's Cohorts tab (docs/20 `/teach/courses/[id]/cohorts`): sell by
// start date, and add, change, publish or cancel runs. Seat numbers come from the server.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { StudioCohortsDto } from '@tokslearn/contract'
import { Badge, type BadgeTone } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@tokslearn/ui/dialog'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Route } from 'next'
import Link from 'next/link'
import { useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorDetails, apiErrorMessage } from '@/lib/api-error'
import { formatDate } from '@/lib/format'
import { api, orpc } from '@/lib/orpc'
import { ConfirmDialog } from '../confirm-dialog'
import { useCourseEditor } from '../course-editor-provider'

type Run = StudioCohortsDto['cohorts'][number]

const stateLabel: Record<Run['availability'], [string, BadgeTone]> = {
  draft: ['Draft', 'neutral'],
  cancelled: ['Cancelled', 'neutral'],
  not_open_yet: ['Enrolment not open yet', 'info'],
  open: ['On sale', 'brand'],
  full: ['Full', 'warning'],
  closed: ['Enrolment closed', 'neutral'],
}

// Dates are picked as Lagos calendar days: a run starts at the start of its day and ends, and
// enrolment closes, at the end of its day.
const lagosStart = (d: string) => new Date(`${d}T00:00:00+01:00`).toISOString()
const lagosEnd = (d: string) => new Date(`${d}T23:59:00+01:00`).toISOString()
const lagosDay = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date(iso)) : ''

export function CohortsTab() {
  const { course, replace } = useCourseEditor()
  const client = useQueryClient()
  const options = orpc.studio.cohorts.get.queryOptions({ input: { courseId: course.id } })
  const q = useQuery(options)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [editing, setEditing] = useState<Run | 'new' | null>(null)
  const [cancelling, setCancelling] = useState<Run | null>(null)

  if (q.isPending) return <Skeleton className="h-72 w-full max-w-[860px] rounded-card" />
  if (!q.data) return <FormAlert tone="error">{apiErrorMessage(q.error)}</FormAlert>
  const s = q.data
  const set = (next: StudioCohortsDto) => client.setQueryData(options.queryKey, next)
  const act = async (fn: () => Promise<StudioCohortsDto>) => {
    setPending(true)
    setError(null)
    try {
      set(await fn())
    } catch (e) {
      setError(apiErrorDetails(e))
    } finally {
      setPending(false)
    }
  }
  const readOnly = !s.canEdit

  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      <SettingsPanel
        id="cohort-selling"
        title="Sell by start date"
        description="Buyers pick a run with a start date and a limited number of seats. Lessons can open on the run's timetable (Drip schedule: days after the start date)."
      >
        <div className="flex flex-col gap-3">
          {!s.enabled && !s.cohortBased ? (
            <p className="text-body text-ink-2">Cohorts aren’t available on Tokslearn yet.</p>
          ) : (
            <p className="text-body text-ink">
              {s.cohortBased
                ? 'This course is sold by start date. Learners who bought it before keep their access.'
                : 'This course is self-paced: learners start whenever they buy.'}
            </p>
          )}
          {error ? <FormAlert tone="error">{error}</FormAlert> : null}
          {readOnly || (!s.enabled && !s.cohortBased) ? null : (
            <Button
              className="w-fit"
              variant={s.cohortBased ? 'secondary' : 'primary'}
              loading={pending}
              onClick={() =>
                act(async () => {
                  const next = await api.studio.cohorts.setSelling({
                    courseId: course.id,
                    cohortBased: !s.cohortBased,
                  })
                  // The course's version moved: refresh the editor's copy.
                  replace(await api.studio.courses.get({ courseId: course.id }))
                  return next
                })
              }
            >
              {s.cohortBased ? 'Go back to self-paced' : 'Sell by start date'}
            </Button>
          )}
        </div>
      </SettingsPanel>

      {s.cohortBased ? (
        <SettingsPanel
          id="cohort-runs"
          title="Runs"
          description="A new run starts as a draft. Publish it to put it on sale on the course page."
        >
          <div className="flex flex-col gap-4">
            {s.cohorts.length === 0 ? (
              <p className="text-body text-ink-2">
                No runs yet. Add the first start date to open the course for sale.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
                {s.cohorts.map((c) => {
                  const [label, tone] = stateLabel[c.availability]
                  return (
                    <li key={c.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-body font-medium text-ink">
                          {c.name} <Badge tone={tone}>{label}</Badge>
                        </p>
                        <p className="text-body-sm text-ink-2">
                          {formatDate(c.startsAt)} to {formatDate(c.endsAt)} · {c.members}{' '}
                          {c.members === 1 ? 'learner' : 'learners'}
                          {c.capacity !== null ? ` of ${c.capacity} · ${c.seatsLeft} left` : ''}
                        </p>
                      </div>
                      {readOnly ? null : (
                        <div className="flex flex-wrap gap-2">
                          {c.status === 'draft' ? (
                            <Button
                              size="sm"
                              loading={pending}
                              onClick={() =>
                                act(() =>
                                  api.studio.cohorts.setStatus({ cohortId: c.id, status: 'open' }),
                                )
                              }
                            >
                              Publish
                            </Button>
                          ) : null}
                          {c.status !== 'cancelled' ? (
                            <Button size="sm" variant="secondary" onClick={() => setEditing(c)}>
                              Edit
                            </Button>
                          ) : null}
                          {c.status !== 'cancelled' && c.members === 0 ? (
                            <Button size="sm" variant="tertiary" onClick={() => setCancelling(c)}>
                              Cancel run
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {readOnly ? null : (
              <Button className="w-fit" variant="secondary" onClick={() => setEditing('new')}>
                Add a run
              </Button>
            )}
            <p className="text-body-sm text-ink-3">
              Learners of a run appear on the{' '}
              <Link
                href={`/teach/courses/${course.id}/learners` as Route}
                className="text-brand-ink hover:underline"
              >
                Learners
              </Link>{' '}
              tab with its name.
            </p>
          </div>
        </SettingsPanel>
      ) : null}

      <RunForm
        key={editing === 'new' ? 'new' : (editing?.id ?? 'none')}
        run={editing}
        courseId={course.id}
        onClose={() => setEditing(null)}
        onSaved={(next) => {
          set(next)
          setEditing(null)
        }}
      />
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open) setCancelling(null)
        }}
        title={`Cancel ${cancelling?.name ?? 'this run'}?`}
        description="It comes off the course page. Nobody has joined it, so no one loses a place."
        confirmLabel="Cancel run"
        onConfirm={async () => {
          if (cancelling) {
            await act(() =>
              api.studio.cohorts.setStatus({ cohortId: cancelling.id, status: 'cancelled' }),
            )
          }
        }}
      />
    </div>
  )
}

function RunForm({
  run,
  courseId,
  onClose,
  onSaved,
}: {
  run: Run | 'new' | null
  courseId: string
  onClose: () => void
  onSaved: (next: StudioCohortsDto) => void
}) {
  const existing = run && run !== 'new' ? run : null
  const [name, setName] = useState(existing?.name ?? '')
  const [starts, setStarts] = useState(lagosDay(existing?.startsAt ?? null))
  const [ends, setEnds] = useState(lagosDay(existing?.endsAt ?? null))
  const [opens, setOpens] = useState(lagosDay(existing?.enrollOpensAt ?? null))
  const [closes, setCloses] = useState(lagosDay(existing?.enrollClosesAt ?? null))
  const [capacity, setCapacity] = useState(existing?.capacity ? String(existing.capacity) : '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Dialog open={run !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent
        title={existing ? `Edit ${existing.name}` : 'Add a run'}
        description="Dates are Lagos days. Enrolment closes when the run starts unless you set another day."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setPending(true)
            setError(null)
            const fields = {
              name,
              startsAt: lagosStart(starts),
              endsAt: lagosEnd(ends),
              enrollOpensAt: opens ? lagosStart(opens) : null,
              enrollClosesAt: closes ? lagosEnd(closes) : null,
              capacity: capacity ? Number(capacity) : null,
            }
            try {
              onSaved(
                existing
                  ? await api.studio.cohorts.update({ cohortId: existing.id, ...fields })
                  : await api.studio.cohorts.create({ courseId, ...fields }),
              )
            } catch (err) {
              setError(apiErrorDetails(err))
            } finally {
              setPending(false)
            }
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="run-name">Name learners see</Label>
            <Input
              id="run-name"
              value={name}
              required
              minLength={2}
              maxLength={80}
              placeholder="e.g. November 2026"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="run-starts">Starts</Label>
              <Input
                id="run-starts"
                type="date"
                required
                value={starts}
                onChange={(e) => setStarts(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="run-ends">Ends</Label>
              <Input
                id="run-ends"
                type="date"
                required
                value={ends}
                onChange={(e) => setEnds(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="run-opens">Enrolment opens (optional)</Label>
              <Input
                id="run-opens"
                type="date"
                value={opens}
                onChange={(e) => setOpens(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="run-closes">Enrolment closes (optional)</Label>
              <Input
                id="run-closes"
                type="date"
                value={closes}
                onChange={(e) => setCloses(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="run-capacity">Seats (leave empty for no limit)</Label>
            <Input
              id="run-capacity"
              type="number"
              inputMode="numeric"
              min={1}
              max={10000}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className="w-32"
            />
          </div>
          {error ? <FormAlert tone="error">{error}</FormAlert> : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {existing ? 'Save' : 'Add run'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
