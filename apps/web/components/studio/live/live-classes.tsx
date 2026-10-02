'use client'
// Client component: `/teach/live` (docs/20): upcoming and past live classes in the courses you
// teach; schedule, change or cancel (instructor and co-instructors), start (hosts), attendance.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { LiveOptionsDto, StudioLiveSessionDto } from '@tokslearn/contract'
import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@tokslearn/ui/dialog'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { Select } from '@tokslearn/ui/select'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { Switch } from '@tokslearn/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tokslearn/ui/tabs'
import type { Route } from 'next'
import Link from 'next/link'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { JoinButton } from '@/components/live/join-button'
import { sessionHref } from '@/components/live/session-card'
import { apiErrorDetails, apiErrorMessage } from '@/lib/api-error'
import { fromLagosInputs, lagosInputs, sessionTime } from '@/lib/live-time'
import { api, orpc } from '@/lib/orpc'
import { ConfirmDialog } from '../confirm-dialog'

type Session = StudioLiveSessionDto
const DURATIONS = [30, 45, 60, 90, 120, 150, 180]
const durationLabel = (m: number) =>
  m < 60
    ? `${m} minutes`
    : `${m / 60} ${m === 60 ? 'hour' : 'hours'}`.replace('.5 hours', '½ hours')

export function LiveClasses() {
  const options = useQuery(orpc.studio.live.options.queryOptions())
  const [editing, setEditing] = useState<Session | 'new' | null>(null)
  if (options.isPending) return <Skeleton className="h-72 w-full max-w-[860px] rounded-card" />
  if (!options.data) return <FormAlert tone="error">{apiErrorMessage(options.error)}</FormAlert>
  const o = options.data
  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      {o.courses.length > 0 ? (
        <Button className="w-fit" onClick={() => setEditing('new')}>
          Schedule a class
        </Button>
      ) : (
        <p className="text-body text-ink-2">
          You can schedule classes for courses you created or co-teach.
        </p>
      )}
      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming" className="pt-4">
          <SessionList when="upcoming" onEdit={setEditing} />
        </TabsContent>
        <TabsContent value="past" className="pt-4">
          <SessionList when="past" onEdit={setEditing} />
        </TabsContent>
      </Tabs>
      <ScheduleForm
        key={editing === 'new' ? 'new' : (editing?.id ?? 'none')}
        session={editing}
        options={o}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

function SessionList({
  when,
  onEdit,
}: {
  when: 'upcoming' | 'past'
  onEdit: (s: Session) => void
}) {
  const client = useQueryClient()
  const q = useQuery(orpc.studio.live.list.queryOptions({ input: { when } }))
  const [cancelling, setCancelling] = useState<Session | null>(null)
  const [attendanceOf, setAttendanceOf] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (q.isPending) return <Skeleton className="h-40 w-full rounded-card" />
  if (!q.data) return <FormAlert tone="error">{apiErrorMessage(q.error)}</FormAlert>
  if (q.data.items.length === 0) {
    return when === 'upcoming' ? (
      <EmptyState
        title="No classes coming up"
        description="Schedule one for a course or one of its cohorts. Learners get an email the day before and 15 minutes before."
      />
    ) : (
      <p className="text-body text-ink-2">Classes you’ve taught show here with their attendance.</p>
    )
  }
  return (
    <>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
        {q.data.items.map((s) => (
          <li key={s.id} className="flex flex-col gap-3 p-4 sm:p-5">
            <div className="flex flex-col gap-1">
              <p className="flex flex-wrap items-center gap-2">
                <Link
                  href={sessionHref(s) as Route}
                  className="text-body font-medium text-ink hover:text-brand-ink hover:underline"
                >
                  {s.title}
                </Link>
                {s.phase === 'open' ? <Badge tone="brand">Open now</Badge> : null}
                {s.phase === 'cancelled' ? <Badge tone="neutral">Cancelled</Badge> : null}
                {s.recordingEnabled ? <Badge tone="neutral">Recorded</Badge> : null}
              </p>
              <p className="text-body-sm text-ink-2">
                {sessionTime(s.startsAt, s.endsAt)} (Lagos) · {s.course.title} ·{' '}
                {s.cohort ? `${s.cohort.name} cohort` : 'All learners'}
              </p>
              {when === 'past' ? (
                <p className="text-body-sm text-ink-2">
                  {s.attended} {s.attended === 1 ? 'learner' : 'learners'} joined ·{' '}
                  {recordingLabel(s)}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {s.phase === 'upcoming' || s.phase === 'open' ? (
                <JoinButton
                  href={sessionHref(s)}
                  opensAt={s.opensAt}
                  open={s.phase === 'open'}
                  host
                  size="sm"
                />
              ) : null}
              {s.canManage && s.phase === 'upcoming' && new Date(s.startsAt) > new Date() ? (
                <Button size="sm" variant="secondary" onClick={() => onEdit(s)}>
                  Change
                </Button>
              ) : null}
              {s.canManage && (s.phase === 'upcoming' || s.phase === 'open') ? (
                <Button size="sm" variant="tertiary" onClick={() => setCancelling(s)}>
                  Cancel class
                </Button>
              ) : null}
              {s.phase !== 'cancelled' && s.phase !== 'upcoming' ? (
                <Button size="sm" variant="secondary" onClick={() => setAttendanceOf(s)}>
                  Attendance
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open) setCancelling(null)
        }}
        title={`Cancel ${cancelling?.title ?? 'this class'}?`}
        description="Learners see it as cancelled and get no more reminders. Post an announcement in the course to tell them why."
        confirmLabel="Cancel class"
        onConfirm={async () => {
          if (!cancelling) return
          setError(null)
          try {
            await api.studio.live.cancel({ sessionId: cancelling.id })
          } catch (e) {
            setError(apiErrorMessage(e))
          }
          await client.invalidateQueries({ queryKey: orpc.studio.live.key() })
        }}
      />
      <AttendanceDialog session={attendanceOf} onClose={() => setAttendanceOf(null)} />
    </>
  )
}

function recordingLabel(s: Session) {
  if (s.recordingStatus === 'ready') return 'recording on the class page'
  if (s.recordingStatus === 'importing') return 'recording being prepared'
  if (s.recordingStatus === 'failed') return 'the recording couldn’t be saved'
  return s.recordingEnabled ? 'no recording yet' : 'not recorded'
}

function AttendanceDialog({ session, onClose }: { session: Session | null; onClose: () => void }) {
  const q = useQuery({
    ...orpc.studio.live.attendance.queryOptions({ input: { sessionId: session?.id ?? '' } }),
    enabled: session !== null,
  })
  return (
    <Dialog open={session !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent
        title={`Attendance: ${session?.title ?? ''}`}
        description="Minutes in the room come from Daily after each person leaves."
      >
        {q.isPending ? (
          <Skeleton className="h-32 w-full rounded-card" />
        ) : !q.data ? (
          <FormAlert tone="error">{apiErrorMessage(q.error)}</FormAlert>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-body text-ink">
              {q.data.attendees.filter((a) => !a.isHost).length} of {q.data.expected}{' '}
              {q.data.expected === 1 ? 'learner' : 'learners'} joined.
            </p>
            {q.data.attendees.length > 0 ? (
              <ul className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto rounded-card border border-border">
                {q.data.attendees.map((a) => (
                  <li
                    key={`${a.name}-${a.joinedAt}`}
                    className="flex justify-between gap-3 px-3 py-2 text-body-sm"
                  >
                    <span className="text-ink">
                      {a.name}
                      {a.isHost ? ' (host)' : ''}
                    </span>
                    <span className="text-ink-2">{a.minutes} min</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ScheduleForm({
  session,
  options,
  onClose,
}: {
  session: Session | 'new' | null
  options: LiveOptionsDto
  onClose: () => void
}) {
  const client = useQueryClient()
  const existing = session && session !== 'new' ? session : null
  const first = options.courses[0]
  const [courseId, setCourseId] = useState(existing?.course.id ?? first?.id ?? '')
  const course = options.courses.find((c) => c.id === courseId)
  const [cohortId, setCohortId] = useState(existing?.cohort?.id ?? '')
  const [lessonId, setLessonId] = useState(existing?.lessonId ?? '')
  const [title, setTitle] = useState(existing?.title ?? '')
  const start = existing ? lagosInputs(existing.startsAt) : { date: '', time: '19:00' }
  const [date, setDate] = useState(start.date)
  const [time, setTime] = useState(start.time)
  const [duration, setDuration] = useState(
    existing
      ? Math.round(
          (new Date(existing.endsAt).getTime() - new Date(existing.startsAt).getTime()) / 60_000,
        )
      : 60,
  )
  const [recording, setRecording] = useState(existing?.recordingEnabled ?? true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Dialog open={session !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent
        title={existing ? `Change ${existing.title}` : 'Schedule a live class'}
        description="Times are Lagos time. Learners can join 15 minutes before the start; you can open the room 30 minutes before."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setPending(true)
            setError(null)
            const fields = {
              cohortId: cohortId || null,
              lessonId: lessonId || null,
              title,
              startsAt: fromLagosInputs(date, time),
              durationMin: duration,
              recordingEnabled: recording,
            }
            try {
              if (existing) await api.studio.live.update({ sessionId: existing.id, ...fields })
              else await api.studio.live.create({ courseId, ...fields })
              await client.invalidateQueries({ queryKey: orpc.studio.live.key() })
              onClose()
            } catch (err) {
              setError(apiErrorDetails(err))
            } finally {
              setPending(false)
            }
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="live-course">Course</Label>
            <Select
              id="live-course"
              value={courseId}
              disabled={existing !== null}
              onChange={(e) => {
                setCourseId(e.target.value)
                setCohortId('')
                setLessonId('')
              }}
            >
              {options.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
          </div>
          {course?.cohortBased || (course?.runs.length ?? 0) > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="live-run">Who it’s for</Label>
              <Select id="live-run" value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
                <option value="">Every learner of the course</option>
                {course?.runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} cohort only
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="live-title">Title</Label>
            <Input
              id="live-title"
              value={title}
              required
              minLength={3}
              maxLength={120}
              placeholder="e.g. Week 2: bank reconciliations, live"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="live-date">Date</Label>
              <Input
                id="live-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="live-time">Starts</Label>
              <Input
                id="live-time"
                type="time"
                required
                step={300}
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="live-duration">Length</Label>
              <Select
                id="live-duration"
                value={String(duration)}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {DURATIONS.map((m) => (
                  <option key={m} value={m}>
                    {durationLabel(m)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="live-lesson">Show it on a lesson (optional)</Label>
            <Select id="live-lesson" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
              <option value="">
                {course?.liveLessons.length ? 'No lesson' : 'No Live class lessons in this course'}
              </option>
              {course?.liveLessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </Select>
            <p className="text-body-sm text-ink-3">
              Add a Live class lesson in the curriculum to give the class a place in the course. On
              a published course, a new lesson shows to learners once your update is approved;
              until then they find the class in each lesson’s Overview and on the cohort page.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="live-recording"
              checked={recording}
              onChange={(e) => setRecording(e.target.checked)}
            />
            <Label htmlFor="live-recording">
              Record the class (starts when you join; learners watch it here afterwards)
            </Label>
          </div>
          {error ? <FormAlert tone="error">{error}</FormAlert> : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {existing ? 'Save' : 'Schedule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
