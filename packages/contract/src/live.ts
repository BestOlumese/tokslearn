import { z } from 'zod'
import { base } from './base'
import { IsoDateTime } from './shared'

// Phase 8 live classes (docs/06 §5, docs/10 §11, docs/20 Phase 8 rows, ADR-039). Behind the
// `live_classes` flag. Joining returns a Daily room URL and a meeting token for the viewer.

const named = <S extends z.ZodType>(schema: S) =>
  schema as unknown as z.ZodType<z.output<S>, z.input<S>>

const get = (path: `/${string}`, tag: string, summary: string, description: string) =>
  base.route({ method: 'GET', path, tags: [tag], summary, description })
const post = (path: `/${string}`, tag: string, summary: string, description: string) =>
  base.route({ method: 'POST', path, tags: [tag], summary, description })

export const LiveStatus = z.enum(['scheduled', 'live', 'ended', 'cancelled'])
export type LiveStatus = z.infer<typeof LiveStatus>
/** Where the session stands for the viewer: `open` means they can join now. */
export const LivePhase = z.enum(['upcoming', 'open', 'ended', 'cancelled'])
export type LivePhase = z.infer<typeof LivePhase>
export const RecordingStatus = z.enum(['none', 'importing', 'ready', 'failed'])

const LiveSessionShape = z.object({
  id: z.uuid(),
  title: z.string(),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  /** When the viewer can join: 15 minutes early for learners, 30 for hosts. */
  opensAt: IsoDateTime,
  status: LiveStatus,
  phase: LivePhase,
  recordingEnabled: z.boolean(),
  recordingStatus: RecordingStatus,
  course: z.object({ id: z.uuid(), slug: z.string(), title: z.string() }),
  /** Null: for every learner of the course. */
  cohort: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  lessonId: z.uuid().nullable(),
  hostName: z.string(),
  isHost: z.boolean(),
})
export type LiveSessionDto = z.infer<typeof LiveSessionShape>
export const LiveSessionDto = named(LiveSessionShape)

const LiveSessionDetailShape = LiveSessionShape.extend({
  /** Signed Bunny embed, once the recording is imported. */
  recordingEmbedUrl: z.string().nullable(),
})
export type LiveSessionDetailDto = z.infer<typeof LiveSessionDetailShape>
export const LiveSessionDetailDto = named(LiveSessionDetailShape)

const StudioLiveSessionShape = LiveSessionShape.extend({
  canManage: z.boolean(),
  attended: z.number().int(),
})
export type StudioLiveSessionDto = z.infer<typeof StudioLiveSessionShape>
export const StudioLiveSessionDto = named(StudioLiveSessionShape)

const LiveOptionsShape = z.object({
  enabled: z.boolean(),
  courses: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      cohortBased: z.boolean(),
      runs: z.array(z.object({ id: z.uuid(), name: z.string(), startsAt: IsoDateTime })),
      liveLessons: z.array(z.object({ id: z.uuid(), title: z.string() })),
    }),
  ),
})
export type LiveOptionsDto = z.infer<typeof LiveOptionsShape>
export const LiveOptionsDto = named(LiveOptionsShape)

const AttendanceShape = z.object({
  expected: z.number().int(),
  attendees: z.array(
    z.object({
      name: z.string(),
      isHost: z.boolean(),
      joinedAt: IsoDateTime,
      minutes: z.number().int(),
    }),
  ),
})
export type AttendanceDto = z.infer<typeof AttendanceShape>
export const AttendanceDto = named(AttendanceShape)

const ScheduleFields = {
  /** Null: every learner of the course. */
  cohortId: z.uuid().nullable(),
  /** A "Live class" lesson of the course that shows the session. */
  lessonId: z.uuid().nullable(),
  title: z.string().trim().min(3).max(120),
  startsAt: IsoDateTime,
  durationMin: z.number().int().min(15).max(180),
  recordingEnabled: z.boolean(),
}
const Id = z.object({ id: z.uuid() })

export const liveContract = {
  list: get(
    '/courses/{courseId}/live',
    'Learning',
    'Live classes',
    'The course’s sessions the viewer may attend (course-wide and their run’s), soonest first. Optionally those on one lesson.',
  )
    .input(z.object({ courseId: z.uuid(), lessonId: z.uuid().optional() }))
    .output(z.object({ items: z.array(LiveSessionDto) })),
  get: get(
    '/live/{sessionId}',
    'Learning',
    'A live class',
    'Time, state for the viewer and, after the class, the recording.',
  )
    .input(z.object({ sessionId: z.uuid() }))
    .output(LiveSessionDetailDto),
  join: post(
    '/live/{sessionId}/join',
    'Learning',
    'Join a live class',
    'From 15 minutes before the start (hosts 30) to the end. Returns the Daily room URL and a meeting token that expires with the room. LIVE_NOT_OPEN (data: opensAt), LIVE_ENDED, LIVE_CANCELLED, LIVE_PROVIDER_UNAVAILABLE.',
  )
    .input(z.strictObject({ sessionId: z.uuid() }))
    .output(z.object({ roomUrl: z.string(), token: z.string(), expiresAt: IsoDateTime })),
}

export const studioLiveContract = {
  list: get(
    '/studio/live',
    'Studio',
    'Live classes I teach',
    'Upcoming (soonest first) or past (newest first) sessions in the courses the viewer teaches.',
  )
    .input(z.object({ when: z.enum(['upcoming', 'past']) }))
    .output(z.object({ items: z.array(StudioLiveSessionDto) })),
  options: get(
    '/studio/live/options',
    'Studio',
    'Schedule form choices',
    'Courses the viewer may schedule for, with their runs and Live class lessons.',
  ).output(LiveOptionsDto),
  create: post(
    '/studio/live',
    'Studio',
    'Schedule a live class',
    'Instructor and co-instructors. Up to 3 hours. Reminders go out 24 h and 15 min before.',
  )
    .input(z.strictObject({ courseId: z.uuid(), ...ScheduleFields }))
    .output(Id),
  update: post(
    '/studio/live/{sessionId}',
    'Studio',
    'Change a live class',
    'Before it starts (LIVE_ALREADY_STARTED). A new time restarts the reminders.',
  )
    .input(z.strictObject({ sessionId: z.uuid(), ...ScheduleFields }))
    .output(Id),
  cancel: post(
    '/studio/live/{sessionId}/cancel',
    'Studio',
    'Cancel a live class',
    'Before it ends. Reminders stop and learners see it as cancelled.',
  )
    .input(z.strictObject({ sessionId: z.uuid() }))
    .output(Id),
  attendance: get(
    '/studio/live/{sessionId}/attendance',
    'Studio',
    'Attendance',
    'Who joined and for how long (minutes come from Daily’s webhooks).',
  )
    .input(z.object({ sessionId: z.uuid() }))
    .output(AttendanceDto),
}
