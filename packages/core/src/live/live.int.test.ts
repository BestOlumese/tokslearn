import { type Db, schema } from '@tokslearn/db'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetFeatureFlagCache } from '../admin'
import { createCohort, setCohortSelling, setCohortStatus } from '../cohorts'
import { addLesson, addStaff, getStudioCourse } from '../courses'
import { grantEnrollment } from '../enrollments'
import { inTransaction } from '../kernel/ctx'
import { insertUser, testUser } from '../kernel/testing'
import { codeOf, people, publishCourse, setup } from '../testing'
import {
  attachRecordingVideo,
  cancelSession,
  getSession,
  handleDailyEvent,
  joinSession,
  listCourseSessions,
  listStudioSessions,
  refreshRecording,
  scheduleSession,
  sendLiveReminders,
  sessionAttendance,
  startRecordingImport,
  updateSession,
} from '.'

afterAll(closeTestDb)
beforeEach(() => resetFeatureFlagCache())

const T0 = new Date('2026-10-01T09:00:00Z')
/** The class: Friday 2 October, 7 pm Lagos, one hour. */
const START = new Date('2026-10-02T18:00:00Z')
const min = (n: number) => new Date(START.getTime() + n * 60_000)

async function flags(db: Db, ...keys: string[]) {
  for (const key of keys) {
    await db
      .insert(schema.featureFlags)
      .values({ key, enabled: true })
      .onConflictDoUpdate({ target: schema.featureFlags.key, set: { enabled: true } })
  }
  resetFeatureFlagCache()
}

async function world(db: Db) {
  await seedCatalog(db)
  await seedCommission(db)
  const env = setup(db)
  const { owner, reviewer } = await people(db)
  const course = await publishCourse(env, owner, reviewer)
  const teach = env.ctx(owner, T0)
  let n = 0
  const person = async (opts: { enrolled?: boolean; cohortId?: string | null } = {}) => {
    n++
    const userId = await insertUser(db, {
      name: `Ada Learner${n}`,
      email: `ada${n}@example.com`,
      username: `ada${n}`,
    })
    if (opts.enrolled !== false) {
      await inTransaction(env.ctx({ kind: 'system', reason: 'test' }, T0), (tx) =>
        grantEnrollment(tx, {
          userId,
          courseId: course.id,
          source: 'free',
          cohortId: opts.cohortId ?? null,
        }),
      )
    }
    return testUser(['learner'], { userId })
  }
  const fields = {
    cohortId: null as string | null,
    lessonId: null as string | null,
    title: 'Week 1: your first reconciliation',
    startsAt: START,
    durationMin: 60,
    recordingEnabled: true,
  }
  return { env, owner, course, teach, person, fields }
}

async function run(w: Awaited<ReturnType<typeof world>>) {
  await setCohortSelling(w.teach, { courseId: w.course.id, cohortBased: true })
  const s = await createCohort(w.teach, {
    courseId: w.course.id,
    name: 'October 2026',
    startsAt: new Date('2026-10-05T00:00:00Z'),
    endsAt: new Date('2026-11-30T00:00:00Z'),
    enrollOpensAt: null,
    enrollClosesAt: null,
    capacity: 20,
  })
  const r = s.cohorts[0]
  if (!r) throw new Error('no run')
  await setCohortStatus(w.teach, { cohortId: r.id, status: 'open' })
  return r.id
}

const outboxOf = async (db: Db, name: string) =>
  (await db.select().from(schema.outbox).where(eq(schema.outbox.eventName, name))).map(
    (o) => o.payload as Record<string, unknown>,
  )

describe('access', () => {
  it('keeps a run’s session to that run (Phase 8 acceptance) and lets TAs host but not schedule', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      expect(await codeOf(scheduleSession(w.teach, { courseId: w.course.id, ...w.fields }))).toBe(
        'FEATURE_DISABLED',
      )
      await flags(db, 'live_classes', 'cohorts')
      const runId = await run(w)
      const inRun = await w.person({ cohortId: runId })
      const otherLearner = await w.person()
      const outsider = await w.person({ enrolled: false })

      const { id } = await scheduleSession(w.teach, {
        courseId: w.course.id,
        ...w.fields,
        cohortId: runId,
      })
      const open = min(-10)
      expect((await getSession(w.env.ctx(inRun, T0), id)).cohort?.name).toBe('October 2026')
      expect(await joinSession(w.env.ctx(inRun, open), id)).toMatchObject({
        roomUrl: `https://tokslearn.daily.test/tl-${id}`,
      })
      for (const who of [otherLearner, outsider]) {
        expect(await codeOf(getSession(w.env.ctx(who, T0), id))).toBe('LIVE_SESSION_NOT_FOUND')
        expect(await codeOf(joinSession(w.env.ctx(who, open), id))).toBe('LIVE_SESSION_NOT_FOUND')
      }
      expect(
        await listCourseSessions(w.env.ctx(otherLearner, T0), { courseId: w.course.id }),
      ).toEqual([])
      expect(
        await codeOf(listCourseSessions(w.env.ctx(outsider, T0), { courseId: w.course.id })),
      ).toBe('COURSE_NOT_FOUND')

      // A TA hosts (owner token, earlier window) but can't schedule.
      const taId = await insertUser(db, { name: 'Tunde TA', email: 'ta@example.com' })
      await addStaff(w.teach, { courseId: w.course.id, emailOrUsername: 'ta@example.com' })
      const ta = testUser(['learner'], { userId: taId })
      expect(
        await codeOf(scheduleSession(w.env.ctx(ta, T0), { courseId: w.course.id, ...w.fields })),
      ).toBe('NOT_COURSE_OWNER')
      await joinSession(w.env.ctx(ta, min(-25)), id)
      expect(w.env.daily.tokens.map((t) => t.isOwner)).toEqual([false, true])
      const [studio] = await listStudioSessions(w.env.ctx(ta, T0), { when: 'upcoming' })
      expect(studio).toMatchObject({ id, canManage: false, attended: 1 })
    })
  })
})

describe('joining', () => {
  it('opens 15 minutes before, creates the room once and closes at the end', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      await flags(db, 'live_classes')
      const a = await w.person()
      const { id } = await scheduleSession(w.teach, { courseId: w.course.id, ...w.fields })

      const early = joinSession(w.env.ctx(a, min(-16)), id)
      expect(await codeOf(early)).toBe('LIVE_NOT_OPEN')
      await joinSession(w.env.ctx(a, min(-15)), id)
      await joinSession(w.env.ctx(a, min(30)), id)
      const room = w.env.daily.rooms.get(`tl-${id}`)
      expect(room).toEqual({ expiresAt: min(90), maxParticipants: 200, recording: true })
      expect(w.env.daily.tokens).toHaveLength(2)
      expect(w.env.daily.tokens[0]?.expiresAt).toEqual(min(90))
      expect(await codeOf(joinSession(w.env.ctx(a, min(60)), id))).toBe('LIVE_ENDED')

      // Daily down: a clear error, not a crash.
      w.env.daily.setFailing(true)
      expect(await codeOf(joinSession(w.env.ctx(a, min(1)), id))).toBe('LIVE_PROVIDER_UNAVAILABLE')
      w.env.daily.setFailing(false)

      const attendance = await sessionAttendance(w.teach, id)
      expect(attendance.expected).toBe(1)
      expect(attendance.attendees).toEqual([
        { name: 'Ada L.', isHost: false, joinedAt: min(-15), minutes: 0 },
      ])
    })
  })

  it('runs the class unrecorded when the Daily plan has no recording', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      await flags(db, 'live_classes')
      const a = await w.person()
      const { id } = await scheduleSession(w.teach, { courseId: w.course.id, ...w.fields })
      w.env.daily.setRecordingInPlan(false)
      await joinSession(w.env.ctx(w.owner, min(-20)), id)
      w.env.daily.setRecordingInPlan(true)
      expect(w.env.daily.rooms.get(`tl-${id}`)?.recording).toBe(false)
      expect((await getSession(w.env.ctx(a, T0), id)).recordingEnabled).toBe(false)
    })
  })

  it('refuses cancelled sessions and moves the room when rescheduled', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      await flags(db, 'live_classes')
      const a = await w.person()
      const { id } = await scheduleSession(w.teach, { courseId: w.course.id, ...w.fields })
      await joinSession(w.env.ctx(a, min(-5)), id)
      // Moved a day later before it started (a fresh clock before the original start).
      await updateSession(w.env.ctx(w.owner, min(-1)), {
        sessionId: id,
        ...w.fields,
        startsAt: min(24 * 60),
      })
      await joinSession(w.env.ctx(a, min(24 * 60 - 5)), id)
      expect(w.env.daily.rooms.get(`tl-${id}`)?.expiresAt).toEqual(min(24 * 60 + 90))
      expect((await outboxOf(db, 'live.scheduled')).map((p) => p.startsAt)).toEqual([
        START.toISOString(),
        min(24 * 60).toISOString(),
      ])

      await cancelSession(w.teach, id)
      expect(await codeOf(joinSession(w.env.ctx(a, min(24 * 60 - 5)), id))).toBe('LIVE_CANCELLED')
      expect((await getSession(w.env.ctx(a, T0), id)).phase).toBe('cancelled')
    })
  })
})

describe('scheduling', () => {
  it('checks time, length, run and lesson, and freezes a session once it starts', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      await flags(db, 'live_classes')
      const c = { courseId: w.course.id, ...w.fields }
      expect(await codeOf(scheduleSession(w.teach, { ...c, startsAt: T0 }))).toBe(
        'LIVE_START_IN_PAST',
      )
      expect(await codeOf(scheduleSession(w.teach, { ...c, durationMin: 200 }))).toBe(
        'VALIDATION_FAILED',
      )
      const studio = await getStudioCourse(w.teach, w.course.id)
      const section = studio.sections[0]
      const video = section?.lessons[0]
      if (!section || !video) throw new Error('no lesson')
      expect(await codeOf(scheduleSession(w.teach, { ...c, lessonId: video.id }))).toBe(
        'LIVE_LESSON_INVALID',
      )
      const after = await addLesson(w.teach, {
        courseId: w.course.id,
        version: studio.version,
        sectionId: section.id,
        type: 'live',
        title: 'Live: month-end Q&A',
      })
      const liveLesson = after.sections[0]?.lessons.find((l) => l.type === 'live')
      if (!liveLesson) throw new Error('no live lesson')
      const { id } = await scheduleSession(w.teach, { ...c, lessonId: liveLesson.id })
      const a = await w.person()
      expect(
        (
          await listCourseSessions(w.env.ctx(a, T0), {
            courseId: w.course.id,
            lessonId: liveLesson.id,
          })
        ).map((s) => s.id),
      ).toEqual([id])
      expect(
        await codeOf(updateSession(w.env.ctx(w.owner, min(1)), { sessionId: id, ...w.fields })),
      ).toBe('LIVE_ALREADY_STARTED')
    })
  })
})

const event = (id: string, type: string, payload: Record<string, unknown>) => ({
  id,
  type,
  payload,
})

describe('Daily webhooks and recordings', () => {
  it('adds up attendance once per event and follows the meeting', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      await flags(db, 'live_classes')
      const a = await w.person()
      const { id } = await scheduleSession(w.teach, { courseId: w.course.id, ...w.fields })
      await joinSession(w.env.ctx(a, min(-2)), id)
      const room = `tl-${id}`
      const sys = w.env.ctx({ kind: 'system', reason: 'daily-webhook' }, min(70))
      const sec = (d: Date) => d.getTime() / 1000

      await handleDailyEvent(sys, event('m1', 'meeting.started', { room, start_ts: sec(min(-1)) }))
      // Overrunning: still open after the scheduled end while Daily says it's going.
      expect((await getSession(w.env.ctx(a, min(70)), id)).phase).toBe('open')
      const left = event('p1', 'participant.left', {
        room,
        user_id: a.userId,
        joined_at: sec(min(-2)),
        duration: 1500,
        owner: false,
      })
      expect(await handleDailyEvent(sys, left)).toBe('processed')
      expect(await handleDailyEvent(sys, left)).toBe('duplicate')
      await handleDailyEvent(
        sys,
        event('p2', 'participant.left', {
          room,
          user_id: a.userId,
          joined_at: sec(min(30)),
          duration: 1800,
        }),
      )
      await handleDailyEvent(sys, event('m2', 'meeting.ended', { room, end_ts: sec(min(62)) }))
      expect((await getSession(w.env.ctx(a, min(70)), id)).phase).toBe('ended')
      const att = await sessionAttendance(w.env.ctx(w.owner, min(70)), id)
      expect(att.attendees).toEqual([
        { name: 'Ada L.', isHost: false, joinedAt: min(-2), minutes: 55 },
      ])
      expect(await handleDailyEvent(sys, event('x', 'meeting.started', { room: 'nope' }))).toBe(
        'ignored',
      )
    })
  })

  it('imports the recording to Bunny and shows it on the lesson (Phase 8 acceptance)', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      await flags(db, 'live_classes')
      const a = await w.person()
      const { id } = await scheduleSession(w.teach, { courseId: w.course.id, ...w.fields })
      await joinSession(w.env.ctx(w.owner, min(-20)), id)
      const sys = w.env.ctx({ kind: 'system', reason: 'test' }, min(75))
      await handleDailyEvent(
        sys,
        event('r1', 'recording.ready-to-download', {
          room_name: `tl-${id}`,
          recording_id: 'rec-long-0001',
          duration: 3300,
        }),
      )
      const [ready] = await outboxOf(db, 'live.recording_ready')
      expect(ready).toEqual({ sessionId: id, recordingId: 'rec-long-0001', durationSec: 3300 })

      // The import job, step by step.
      expect(
        await startRecordingImport(sys, {
          sessionId: id,
          recordingId: 'rec-long-0001',
          durationSec: 3300,
        }),
      ).toBe('waiting')
      expect(w.env.bunny.fetched[0]?.url).toBe('https://recordings.daily.test/rec-long-0001.mp4')
      expect(await attachRecordingVideo(sys, { sessionId: id, recordingId: 'rec-long-0001' })).toBe(
        'attached',
      )
      expect((await getSession(w.env.ctx(a, min(75)), id)).recordingStatus).toBe('importing')
      const [s] = await db.select().from(schema.liveSessions).where(eq(schema.liveSessions.id, id))
      const [asset] = await db
        .select()
        .from(schema.videoAssets)
        .where(eq(schema.videoAssets.id, s?.recordingVideoAssetId ?? ''))
      w.env.bunny.setVideo(asset?.providerVideoId ?? '', { status: 'ready', durationSec: 3300 })
      expect(await refreshRecording(sys, id)).toBe(true)

      const shown = await getSession(w.env.ctx(a, min(80)), id)
      expect(shown.recordingStatus).toBe('ready')
      expect(shown.recordingEmbedUrl).toContain(asset?.providerVideoId)
      expect(w.env.daily.deletedRecordings).toEqual(['rec-long-0001'])

      // A shorter second recording (the host pressed record again) is dropped at Daily.
      expect(
        await startRecordingImport(sys, {
          sessionId: id,
          recordingId: 'rec-short-02',
          durationSec: 40,
        }),
      ).toBe('skipped')
      expect(w.env.daily.deletedRecordings).toEqual(['rec-long-0001', 'rec-short-02'])
      expect(w.env.bunny.fetched).toHaveLength(1)
    })
  })
})

describe('reminders', () => {
  it('emails the run’s learners once, and nothing after a move or a cancel', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      await flags(db, 'live_classes', 'cohorts')
      const runId = await run(w)
      await w.person({ cohortId: runId })
      await w.person()
      const { id } = await scheduleSession(w.teach, {
        courseId: w.course.id,
        ...w.fields,
        cohortId: runId,
      })
      const sys = w.env.ctx({ kind: 'system', reason: 'test' }, min(-24 * 60))
      const input = {
        sessionId: id,
        startsAt: START.toISOString(),
        kind: '24h' as const,
        afterUserId: null,
      }
      expect((await sendLiveReminders(sys, input)).sent).toBe(1)
      const [mail] = (await outboxOf(db, 'notification.email_requested')).filter(
        (p) => p.id === 'live-reminder-24h',
      )
      expect(mail?.data).toMatchObject({
        sessionTitle: 'Week 1: your first reconciliation',
        cohortName: 'October 2026',
        when: 'Friday 2 October at 7:00 pm',
        url: `https://tokslearn.test/learn/${w.course.slug}/live/${id}`,
      })

      expect(
        (await sendLiveReminders(sys, { ...input, startsAt: min(30).toISOString() })).sent,
      ).toBe(0)
      await cancelSession(w.teach, id)
      expect((await sendLiveReminders(sys, { ...input, kind: '15m' })).sent).toBe(0)
    })
  })
})
