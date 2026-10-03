import { schema } from '@tokslearn/db'
import { ProviderError } from '@tokslearn/integrations/daily'
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { isFeatureEnabled, markWebhookProcessed, recordWebhookEvent, writeAudit } from '../admin'
import { track } from '../analytics'
import { learnerDisplayName } from '../enrollments'
import { hasRole } from '../kernel/actor'
import { type Ctx, inTransaction, provider } from '../kernel/ctx'
import {
  ConflictError,
  ExternalServiceError,
  ForbiddenError,
  NotFoundError,
  RuleViolationError,
  ValidationError,
} from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { log } from '../kernel/logger'
import { getVideoAssets, refreshVideoAsset, registerFetchedVideo, videoPlayback } from '../media'
import { notifyMany } from '../notifications'
import {
  endsAtFor,
  googleCalendarUrl,
  type LiveStatus,
  lagosTime,
  lagosWhen,
  maxParticipants,
  opensAt,
  type Phase,
  phase,
  roomExpiry,
  roomName,
  scheduleIssues,
} from './rules'

// Live classes (docs/10 §11, docs/09 §6, docs/20 Phase 8 rows, ADR-039): scheduling in the
// studio, joining through Daily with a meeting token, attendance and meeting state from Daily's
// webhooks, recordings imported to Bunny, and reminder emails. Behind the `live_classes` flag.
// Foreign reads (docs/03 §3): courses, course_revisions, course_staff, instructor_profiles,
// enrollments, cohorts, lessons, sections, user.

const {
  liveSessions,
  liveAttendance,
  courses,
  courseRevisions,
  courseStaff,
  instructorProfiles,
  enrollments,
  cohorts,
  lessons,
  sections,
  user,
} = schema

type SessionRow = typeof liveSessions.$inferSelect

async function requireEnabled(ctx: Ctx) {
  if (!(await isFeatureEnabled(ctx, 'live_classes'))) throw new ForbiddenError('FEATURE_DISABLED')
}

async function liveCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof ProviderError) {
      throw new ExternalServiceError('LIVE_PROVIDER_UNAVAILABLE', {}, { cause: error })
    }
    throw error
  }
}

// ─── Who's asking ────────────────────────────────────────────────────────────────────────────

interface Access {
  userId: string
  /** The instructor, a co-instructor or a TA (or an admin): joins as a Daily owner. */
  host: boolean
  /** The instructor, a co-instructor or an admin: schedules, changes and cancels. */
  manage: boolean
  /** The learner's run, if any. */
  cohortId: string | null
}

async function accessTo(ctx: Ctx, courseId: string): Promise<Access | null> {
  const me = requireUser(ctx.actor)
  const [row] = await ctx.db
    .select({
      instructorId: courses.instructorId,
      staffRole: courseStaff.role,
      status: enrollments.status,
      expires: enrollments.accessExpiresAt,
      cohortId: enrollments.cohortId,
    })
    .from(courses)
    .leftJoin(
      courseStaff,
      and(eq(courseStaff.courseId, courses.id), eq(courseStaff.userId, me.userId)),
    )
    .leftJoin(
      enrollments,
      and(eq(enrollments.courseId, courses.id), eq(enrollments.userId, me.userId)),
    )
    .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)))
  if (!row) return null
  const admin = hasRole(me, 'admin', 'super_admin')
  const owner = row.instructorId === me.userId
  const host = owner || row.staffRole !== null || admin
  const enrolled =
    (row.status === 'active' || row.status === 'completed') &&
    (row.expires === null || row.expires > ctx.now)
  if (!host && !enrolled) return null
  return {
    userId: me.userId,
    host,
    manage: owner || row.staffRole === 'co_instructor' || admin,
    cohortId: enrolled ? row.cohortId : null,
  }
}

/** A run's session is for that run's learners; a course-wide one for every learner. */
const sees = (a: Access, s: { cohortId: string | null }) =>
  a.host || s.cohortId === null || s.cohortId === a.cohortId

async function loadSession(ctx: Ctx, sessionId: string) {
  const [s] = await ctx.db.select().from(liveSessions).where(eq(liveSessions.id, sessionId))
  return s ?? null
}

/** The session and the viewer's access, or LIVE_SESSION_NOT_FOUND (nothing leaks). */
async function visibleSession(ctx: Ctx, sessionId: string) {
  await requireEnabled(ctx)
  const s = await loadSession(ctx, sessionId)
  const a = s ? await accessTo(ctx, s.courseId) : null
  if (!s || !a || !sees(a, s)) throw new NotFoundError('LIVE_SESSION_NOT_FOUND')
  return { s, a }
}

async function requireManage(ctx: Ctx, courseId: string): Promise<Access> {
  const a = await accessTo(ctx, courseId)
  if (!a?.host) throw new NotFoundError('COURSE_NOT_FOUND')
  if (!a.manage) throw new ForbiddenError('NOT_COURSE_OWNER')
  return a
}

// ─── Views ───────────────────────────────────────────────────────────────────────────────────

export interface LiveSessionView {
  id: string
  title: string
  startsAt: Date
  endsAt: Date
  /** When the viewer can join (hosts earlier than learners). */
  opensAt: Date
  status: LiveStatus
  phase: Phase
  recordingEnabled: boolean
  recordingStatus: 'none' | 'importing' | 'ready' | 'failed'
  course: { id: string; slug: string; title: string }
  cohort: { id: string; name: string } | null
  lessonId: string | null
  hostName: string
  isHost: boolean
}

const courseTitleJoin = eq(
  courseRevisions.id,
  sql`coalesce(${courses.liveRevisionId}, ${courses.draftRevisionId})`,
)

async function courseFacts(ctx: Ctx, courseIds: ReadonlyArray<string>) {
  if (courseIds.length === 0) return new Map<string, CourseFacts>()
  const rows = await ctx.db
    .select({
      id: courses.id,
      slug: courses.slug,
      title: courseRevisions.title,
      instructorId: courses.instructorId,
      instructorName: sql<string>`coalesce(${instructorProfiles.displayName}, ${user.name})`,
    })
    .from(courses)
    .innerJoin(courseRevisions, courseTitleJoin)
    .innerJoin(user, eq(user.id, courses.instructorId))
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, courses.instructorId))
    .where(inArray(courses.id, [...new Set(courseIds)]))
  return new Map(rows.map((r) => [r.id, r]))
}
interface CourseFacts {
  id: string
  slug: string
  title: string
  instructorId: string
  instructorName: string
}

async function cohortNames(ctx: Ctx, ids: ReadonlyArray<string | null>) {
  const wanted = [...new Set(ids.filter((x): x is string => x !== null))]
  if (wanted.length === 0) return new Map<string, string>()
  const rows = await ctx.db
    .select({ id: cohorts.id, name: cohorts.name })
    .from(cohorts)
    .where(inArray(cohorts.id, wanted))
  return new Map(rows.map((r) => [r.id, r.name]))
}

/** Lessons the player can open: approved by a review and not deleted. */
async function openableLessons(ctx: Ctx, ids: ReadonlyArray<string | null>) {
  const wanted = [...new Set(ids.filter((x): x is string => x !== null))]
  if (wanted.length === 0) return new Set<string>()
  const rows = await ctx.db
    .select({ id: lessons.id })
    .from(lessons)
    .where(
      and(inArray(lessons.id, wanted), isNotNull(lessons.liveSince), isNull(lessons.deletedAt)),
    )
  return new Set(rows.map((r) => r.id))
}

/**
 * `lessons: 'openable'` (learner pages) links a session to its lesson only once the player can
 * open it: a Live class lesson added to a published course waits for review, and linking to it
 * before then is a 404. The studio keeps the lesson as set, for editing.
 */
async function toViews(
  ctx: Ctx,
  rows: ReadonlyArray<SessionRow>,
  isHost: (s: SessionRow) => boolean,
  lessonsShown: 'openable' | 'as_set' = 'openable',
): Promise<LiveSessionView[]> {
  const [facts, runs, openable] = await Promise.all([
    courseFacts(
      ctx,
      rows.map((r) => r.courseId),
    ),
    cohortNames(
      ctx,
      rows.map((r) => r.cohortId),
    ),
    lessonsShown === 'openable'
      ? openableLessons(
          ctx,
          rows.map((r) => r.lessonId),
        )
      : Promise.resolve(null),
  ])
  return rows.flatMap((s) => {
    const c = facts.get(s.courseId)
    if (!c) return []
    const host = isHost(s)
    return [
      {
        id: s.id,
        title: s.title,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        opensAt: opensAt(s, host),
        status: s.status,
        phase: phase(s, ctx.now, host),
        recordingEnabled: s.recordingEnabled,
        recordingStatus: s.recordingStatus,
        course: { id: c.id, slug: c.slug, title: c.title },
        cohort: s.cohortId ? { id: s.cohortId, name: runs.get(s.cohortId) ?? '' } : null,
        lessonId: s.lessonId && (!openable || openable.has(s.lessonId)) ? s.lessonId : null,
        hostName: c.instructorName,
        isHost: host,
      },
    ]
  })
}

// ─── Learners (and hosts) ────────────────────────────────────────────────────────────────────

/**
 * The course's sessions the viewer may attend, soonest first: the course-wide ones and their
 * run's. Optionally only those shown on one lesson. Cancelled sessions stay listed until their
 * end time, so nobody waits in an empty room.
 */
export async function listCourseSessions(
  ctx: Ctx,
  input: { courseId: string; lessonId?: string | undefined },
): Promise<LiveSessionView[]> {
  await requireEnabled(ctx)
  const a = await accessTo(ctx, input.courseId)
  if (!a) throw new NotFoundError('COURSE_NOT_FOUND')
  const rows = await ctx.db
    .select()
    .from(liveSessions)
    .where(
      and(
        eq(liveSessions.courseId, input.courseId),
        input.lessonId ? eq(liveSessions.lessonId, input.lessonId) : undefined,
        a.host
          ? undefined
          : or(
              isNull(liveSessions.cohortId),
              a.cohortId ? eq(liveSessions.cohortId, a.cohortId) : sql`false`,
            ),
        or(ne(liveSessions.status, 'cancelled'), gt(liveSessions.endsAt, ctx.now)),
      ),
    )
    .orderBy(asc(liveSessions.startsAt))
    .limit(100)
  return toViews(ctx, rows, () => a.host)
}

export interface LiveSessionDetail extends LiveSessionView {
  /** Signed Bunny embed of the recording, once imported. */
  recordingEmbedUrl: string | null
}

export async function getSession(ctx: Ctx, sessionId: string): Promise<LiveSessionDetail> {
  const { s, a } = await visibleSession(ctx, sessionId)
  const [view] = await toViews(ctx, [s], () => a.host)
  if (!view) throw new NotFoundError('LIVE_SESSION_NOT_FOUND')
  let recordingEmbedUrl: string | null = null
  if (s.recordingStatus === 'ready' && s.recordingVideoAssetId) {
    const asset = (await getVideoAssets(ctx, [s.recordingVideoAssetId])).get(
      s.recordingVideoAssetId,
    )
    recordingEmbedUrl = asset ? (videoPlayback(ctx, asset)?.embedUrl ?? null) : null
  }
  return { ...view, recordingEmbedUrl }
}

async function displayName(ctx: Ctx, userId: string, host: boolean) {
  const [row] = await ctx.db
    .select({ name: user.name, displayName: instructorProfiles.displayName })
    .from(user)
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, user.id))
    .where(eq(user.id, userId))
  if (!row) return 'Guest'
  return host ? (row.displayName ?? row.name) : learnerDisplayName(row.name)
}

/**
 * `live.join` (docs/10 §11): checks the viewer may attend and the window is open, creates the
 * room on first use (or updates it after a reschedule) and returns a meeting token that expires
 * with the room. Records the join, so attendance works even before webhooks arrive.
 */
export async function joinSession(ctx: Ctx, sessionId: string) {
  const { s, a } = await visibleSession(ctx, sessionId)
  const where = phase(s, ctx.now, a.host)
  if (where === 'cancelled') throw new RuleViolationError('LIVE_CANCELLED')
  if (where === 'upcoming') {
    throw new RuleViolationError('LIVE_NOT_OPEN', { opensAt: opensAt(s, a.host).toISOString() })
  }
  if (where === 'ended') throw new RuleViolationError('LIVE_ENDED')

  const daily = provider(ctx, 'live')
  const expiresAt = roomExpiry(s)
  let room = { name: s.dailyRoomName, url: s.dailyRoomUrl }
  let recording = s.recordingEnabled
  if (!room.name || !room.url || s.roomExpiresAt?.getTime() !== expiresAt.getTime()) {
    const [run] = s.cohortId
      ? await ctx.db
          .select({ capacity: cohorts.capacity })
          .from(cohorts)
          .where(eq(cohorts.id, s.cohortId))
      : []
    const made = await liveCall(() =>
      daily.upsertRoom({
        name: roomName(s.id),
        expiresAt,
        maxParticipants: maxParticipants(run?.capacity ?? null),
        recording: s.recordingEnabled,
      }),
    )
    // The Daily plan has no cloud recording: the class runs, and says it isn't recorded.
    const unrecorded = s.recordingEnabled && !made.recording
    if (unrecorded) {
      log('warn', 'live: recording not in the Daily plan', {
        requestId: ctx.requestId,
        sessionId: s.id,
      })
    }
    await ctx.db
      .update(liveSessions)
      .set({
        dailyRoomName: made.roomName,
        dailyRoomUrl: made.url,
        roomExpiresAt: expiresAt,
        ...(unrecorded ? { recordingEnabled: false } : {}),
      })
      .where(eq(liveSessions.id, s.id))
    room = { name: made.roomName, url: made.url }
    recording = made.recording
  }
  const roomNameNow = room.name ?? roomName(s.id)
  const token = await liveCall(async () =>
    daily.createMeetingToken({
      roomName: roomNameNow,
      userId: a.userId,
      userName: await displayName(ctx, a.userId, a.host),
      isOwner: a.host,
      expiresAt,
      startRecording: recording,
    }),
  )
  await ctx.db
    .insert(liveAttendance)
    .values({ sessionId: s.id, userId: a.userId, joinedAt: ctx.now, isHost: a.host })
    .onConflictDoNothing()
  await track(ctx, 'live_joined', {
    session_id: s.id,
    minutes_before_start: Math.round((s.startsAt.getTime() - ctx.now.getTime()) / 60_000),
  })
  return { roomUrl: room.url ?? '', token, expiresAt }
}

// ─── Studio ──────────────────────────────────────────────────────────────────────────────────

export interface StudioLiveSession extends LiveSessionView {
  canManage: boolean
  /** Learners who joined (hosts not counted). */
  attended: number
}

/** Sessions in every course the viewer teaches: upcoming soonest first, past newest first. */
export async function listStudioSessions(
  ctx: Ctx,
  input: { when: 'upcoming' | 'past' },
): Promise<StudioLiveSession[]> {
  const me = requireUser(ctx.actor)
  const upcoming = input.when === 'upcoming'
  const rows = await ctx.db
    .select({ s: liveSessions, instructorId: courses.instructorId, role: courseStaff.role })
    .from(liveSessions)
    .innerJoin(courses, eq(courses.id, liveSessions.courseId))
    .leftJoin(
      courseStaff,
      and(eq(courseStaff.courseId, liveSessions.courseId), eq(courseStaff.userId, me.userId)),
    )
    .where(
      and(
        or(eq(courses.instructorId, me.userId), sql`${courseStaff.userId} is not null`),
        upcoming ? gt(liveSessions.endsAt, ctx.now) : lte(liveSessions.endsAt, ctx.now),
      ),
    )
    .orderBy(upcoming ? asc(liveSessions.startsAt) : desc(liveSessions.startsAt))
    .limit(upcoming ? 100 : 50)
  const ids = rows.map((r) => r.s.id)
  const counts = ids.length
    ? await ctx.db
        .select({ id: liveAttendance.sessionId, n: sql<number>`count(*)::int` })
        .from(liveAttendance)
        .where(and(inArray(liveAttendance.sessionId, ids), eq(liveAttendance.isHost, false)))
        .groupBy(liveAttendance.sessionId)
    : []
  const attended = new Map(counts.map((c) => [c.id, c.n]))
  const manage = new Map(
    rows.map((r) => [r.s.id, r.instructorId === me.userId || r.role === 'co_instructor']),
  )
  const views = await toViews(
    ctx,
    rows.map((r) => r.s),
    () => true,
    'as_set',
  )
  return views.map((v) => ({
    ...v,
    canManage: manage.get(v.id) ?? false,
    attended: attended.get(v.id) ?? 0,
  }))
}

export interface LiveOptions {
  /** The `live_classes` flag. */
  enabled: boolean
  courses: Array<{
    id: string
    title: string
    cohortBased: boolean
    runs: Array<{ id: string; name: string; startsAt: Date }>
    liveLessons: Array<{ id: string; title: string }>
  }>
}

/** What the schedule form offers: courses the viewer may schedule for, their runs and lessons. */
export async function studioLiveOptions(ctx: Ctx): Promise<LiveOptions> {
  const me = requireUser(ctx.actor)
  const [enabled, mine] = await Promise.all([
    isFeatureEnabled(ctx, 'live_classes'),
    ctx.db
      .select({ id: courses.id, title: courseRevisions.title, cohortBased: courses.cohortBased })
      .from(courses)
      .innerJoin(courseRevisions, courseTitleJoin)
      .leftJoin(
        courseStaff,
        and(eq(courseStaff.courseId, courses.id), eq(courseStaff.userId, me.userId)),
      )
      .where(
        and(
          isNull(courses.deletedAt),
          or(eq(courses.instructorId, me.userId), eq(courseStaff.role, 'co_instructor')),
        ),
      )
      .orderBy(asc(courseRevisions.title)),
  ])
  const ids = mine.map((c) => c.id)
  const [runs, liveLessons] = ids.length
    ? await Promise.all([
        ctx.db
          .select({
            id: cohorts.id,
            courseId: cohorts.courseId,
            name: cohorts.name,
            startsAt: cohorts.startsAt,
          })
          .from(cohorts)
          .where(
            and(
              inArray(cohorts.courseId, ids),
              ne(cohorts.status, 'cancelled'),
              gt(cohorts.endsAt, ctx.now),
            ),
          )
          .orderBy(asc(cohorts.startsAt)),
        ctx.db
          .select({ id: lessons.id, courseId: lessons.courseId, title: lessons.title })
          .from(lessons)
          .innerJoin(sections, eq(sections.id, lessons.sectionId))
          .where(
            and(
              inArray(lessons.courseId, ids),
              eq(lessons.type, 'live'),
              isNull(lessons.deletedAt),
            ),
          )
          .orderBy(asc(sections.position), asc(lessons.position)),
      ])
    : [[], []]
  return {
    enabled,
    courses: mine.map((c) => ({
      ...c,
      runs: runs
        .filter((r) => r.courseId === c.id)
        .map(({ id, name, startsAt }) => ({ id, name, startsAt })),
      liveLessons: liveLessons
        .filter((l) => l.courseId === c.id)
        .map(({ id, title }) => ({ id, title })),
    })),
  }
}

export interface ScheduleFields {
  /** Null: every learner of the course. */
  cohortId: string | null
  /** A "Live class" lesson of the course that shows the session, or null. */
  lessonId: string | null
  title: string
  startsAt: Date
  durationMin: number
  recordingEnabled: boolean
}

async function checkFields(ctx: Ctx, courseId: string, f: ScheduleFields) {
  const issues = scheduleIssues(f)
  if (issues.length > 0) throw new ValidationError(issues)
  if (f.startsAt <= ctx.now) throw new RuleViolationError('LIVE_START_IN_PAST')
  if (f.cohortId) {
    const [run] = await ctx.db
      .select({ id: cohorts.id })
      .from(cohorts)
      .where(
        and(
          eq(cohorts.id, f.cohortId),
          eq(cohorts.courseId, courseId),
          ne(cohorts.status, 'cancelled'),
        ),
      )
    if (!run) throw new NotFoundError('COHORT_NOT_FOUND')
  }
  if (f.lessonId) {
    const [lesson] = await ctx.db
      .select({ id: lessons.id })
      .from(lessons)
      .where(
        and(
          eq(lessons.id, f.lessonId),
          eq(lessons.courseId, courseId),
          eq(lessons.type, 'live'),
          isNull(lessons.deletedAt),
        ),
      )
    if (!lesson) throw new RuleViolationError('LIVE_LESSON_INVALID')
  }
}

const sessionValues = (f: ScheduleFields) => ({
  cohortId: f.cohortId,
  lessonId: f.lessonId,
  title: f.title.trim(),
  startsAt: f.startsAt,
  endsAt: endsAtFor(f.startsAt, f.durationMin),
  recordingEnabled: f.recordingEnabled,
})

export async function scheduleSession(
  ctx: Ctx,
  input: ScheduleFields & { courseId: string },
): Promise<{ id: string }> {
  await requireEnabled(ctx)
  const a = await requireManage(ctx, input.courseId)
  await checkFields(ctx, input.courseId, input)
  return inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .insert(liveSessions)
      .values({ courseId: input.courseId, createdBy: a.userId, ...sessionValues(input) })
      .returning({ id: liveSessions.id, startsAt: liveSessions.startsAt })
    if (!row) throw new Error('live session insert returned nothing')
    await tx.events.emit('live.scheduled', {
      sessionId: row.id,
      courseId: input.courseId,
      startsAt: row.startsAt.toISOString(),
    })
    await writeAudit(tx, {
      action: 'live.scheduled',
      targetType: 'live_session',
      targetId: row.id,
      after: { courseId: input.courseId, startsAt: row.startsAt.toISOString() },
    })
    return { id: row.id }
  })
}

/** Change a session before it starts. A new time restarts the reminders. */
export async function updateSession(
  ctx: Ctx,
  input: ScheduleFields & { sessionId: string },
): Promise<{ id: string }> {
  await requireEnabled(ctx)
  const s = await loadSession(ctx, input.sessionId)
  if (!s) throw new NotFoundError('LIVE_SESSION_NOT_FOUND')
  await requireManage(ctx, s.courseId)
  if (s.status === 'cancelled') throw new RuleViolationError('LIVE_CANCELLED')
  if (ctx.now >= s.startsAt) throw new ConflictError('LIVE_ALREADY_STARTED')
  await checkFields(ctx, s.courseId, input)
  const values = sessionValues(input)
  return inTransaction(ctx, async (tx) => {
    await tx.db.update(liveSessions).set(values).where(eq(liveSessions.id, s.id))
    if (values.startsAt.getTime() !== s.startsAt.getTime()) {
      await tx.events.emit('live.scheduled', {
        sessionId: s.id,
        courseId: s.courseId,
        startsAt: values.startsAt.toISOString(),
      })
    }
    await writeAudit(tx, {
      action: 'live.updated',
      targetType: 'live_session',
      targetId: s.id,
      before: { startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() },
      after: { startsAt: values.startsAt.toISOString(), endsAt: values.endsAt.toISOString() },
    })
    return { id: s.id }
  })
}

/** Cancel before the end. Reminders stop; learners see "Cancelled". */
export async function cancelSession(ctx: Ctx, sessionId: string): Promise<{ id: string }> {
  await requireEnabled(ctx)
  const s = await loadSession(ctx, sessionId)
  if (!s) throw new NotFoundError('LIVE_SESSION_NOT_FOUND')
  await requireManage(ctx, s.courseId)
  if (s.status === 'cancelled') return { id: s.id }
  if (ctx.now >= s.endsAt) throw new RuleViolationError('LIVE_ENDED')
  await inTransaction(ctx, async (tx) => {
    await tx.db
      .update(liveSessions)
      .set({ status: 'cancelled', cancelledAt: ctx.now })
      .where(eq(liveSessions.id, s.id))
    await writeAudit(tx, { action: 'live.cancelled', targetType: 'live_session', targetId: s.id })
  })
  return { id: s.id }
}

export interface Attendance {
  /** Learners the session was for. */
  expected: number
  attendees: Array<{ name: string; isHost: boolean; joinedAt: Date; minutes: number }>
}

export async function sessionAttendance(ctx: Ctx, sessionId: string): Promise<Attendance> {
  const s = await loadSession(ctx, sessionId)
  const a = s ? await accessTo(ctx, s.courseId) : null
  if (!s || !a?.host) throw new NotFoundError('LIVE_SESSION_NOT_FOUND')
  const [[expected], rows] = await Promise.all([
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.courseId, s.courseId),
          inArray(enrollments.status, ['active', 'completed']),
          s.cohortId ? eq(enrollments.cohortId, s.cohortId) : undefined,
        ),
      ),
    ctx.db
      .select({
        name: user.name,
        displayName: instructorProfiles.displayName,
        isHost: liveAttendance.isHost,
        joinedAt: liveAttendance.joinedAt,
        totalSec: liveAttendance.totalSec,
      })
      .from(liveAttendance)
      .innerJoin(user, eq(user.id, liveAttendance.userId))
      .leftJoin(instructorProfiles, eq(instructorProfiles.userId, liveAttendance.userId))
      .where(eq(liveAttendance.sessionId, s.id))
      .orderBy(asc(liveAttendance.joinedAt)),
  ])
  return {
    expected: expected?.n ?? 0,
    attendees: rows.map((r) => ({
      name: r.isHost ? (r.displayName ?? r.name) : learnerDisplayName(r.name),
      isHost: r.isHost,
      joinedAt: r.joinedAt,
      minutes: Math.round(r.totalSec / 60),
    })),
  }
}

// ─── Daily webhooks ──────────────────────────────────────────────────────────────────────────

export interface DailyEvent {
  id: string
  type: string
  payload: Record<string, unknown>
}

const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const fromEpoch = (v: unknown) => {
  const n = num(v)
  return n === null ? null : new Date(n * 1000)
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A verified Daily webhook (docs/06 §7): recorded once, then applied in the same transaction.
 * Meeting start and end move the session's status; a participant leaving adds their time to
 * attendance; a finished recording starts the import job. Payloads are stored without names.
 */
export async function handleDailyEvent(
  ctx: Ctx,
  event: DailyEvent,
): Promise<'processed' | 'duplicate' | 'ignored'> {
  const p = event.payload
  const room = str(p.room) ?? str(p.room_name)
  return inTransaction(ctx, async (tx) => {
    const seen = await recordWebhookEvent(tx, {
      provider: 'daily',
      eventId: event.id,
      type: event.type,
      payload: { room },
    })
    if (seen === 'duplicate') return 'duplicate'
    const [s] = room
      ? await tx.db.select().from(liveSessions).where(eq(liveSessions.dailyRoomName, room))
      : []
    if (!s) {
      await markWebhookProcessed(tx, { provider: 'daily', eventId: event.id, error: 'no_session' })
      return 'ignored'
    }
    if (event.type === 'meeting.started') {
      await tx.db
        .update(liveSessions)
        .set({
          status: 'live',
          startedAt: sql`coalesce(${liveSessions.startedAt}, ${fromEpoch(p.start_ts) ?? tx.now})`,
        })
        .where(and(eq(liveSessions.id, s.id), eq(liveSessions.status, 'scheduled')))
    } else if (event.type === 'meeting.ended') {
      await tx.db
        .update(liveSessions)
        .set({ status: 'ended', endedAt: fromEpoch(p.end_ts) ?? tx.now })
        .where(and(eq(liveSessions.id, s.id), inArray(liveSessions.status, ['scheduled', 'live'])))
    } else if (event.type === 'participant.left') {
      await recordLeave(tx, s.id, p)
    } else if (event.type === 'recording.ready-to-download') {
      const recordingId = str(p.recording_id)
      if (recordingId) {
        await tx.events.emit('live.recording_ready', {
          sessionId: s.id,
          recordingId,
          durationSec: Math.round(num(p.duration) ?? 0),
        })
      }
    } else if (event.type === 'recording.error') {
      log('warn', 'live recording failed at Daily', { requestId: tx.requestId, sessionId: s.id })
    }
    await markWebhookProcessed(tx, { provider: 'daily', eventId: event.id })
    return 'processed'
  })
}

async function recordLeave(ctx: Ctx, sessionId: string, p: Record<string, unknown>) {
  const userId = str(p.user_id)
  const joinedAt = fromEpoch(p.joined_at)
  const duration = Math.max(0, Math.round(num(p.duration) ?? 0))
  if (!userId || !UUID.test(userId) || !joinedAt) return
  const [known] = await ctx.db.select({ id: user.id }).from(user).where(eq(user.id, userId))
  if (!known) return
  const leftAt = new Date(joinedAt.getTime() + duration * 1000)
  await ctx.db
    .insert(liveAttendance)
    .values({
      sessionId,
      userId,
      joinedAt,
      leftAt,
      totalSec: duration,
      isHost: p.owner === true,
    })
    .onConflictDoUpdate({
      target: [liveAttendance.sessionId, liveAttendance.userId],
      set: {
        joinedAt: sql`least("live_attendance"."joined_at", excluded.joined_at)`,
        leftAt: sql`greatest(coalesce("live_attendance"."left_at", excluded.left_at), excluded.left_at)`,
        totalSec: sql`"live_attendance"."total_sec" + excluded.total_sec`,
        updatedAt: ctx.now,
      },
    })
}

// ─── Recordings (docs/09 §6) ─────────────────────────────────────────────────────────────────

async function bestEffort(ctx: Ctx, what: string, fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch (error) {
    log('warn', `live: ${what} failed`, {
      requestId: ctx.requestId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function attach(ctx: Ctx, s: SessionRow, recordingId: string, videoId: string) {
  const [c] = await ctx.db
    .select({ instructorId: courses.instructorId })
    .from(courses)
    .where(eq(courses.id, s.courseId))
  if (!c) return
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(s.startsAt)
  const asset = await registerFetchedVideo(ctx, {
    ownerId: c.instructorId,
    providerVideoId: videoId,
    filename: `live-class-${day}.mp4`,
  })
  await ctx.db
    .update(liveSessions)
    .set({ recordingVideoAssetId: asset.id })
    .where(and(eq(liveSessions.id, s.id), eq(liveSessions.dailyRecordingId, recordingId)))
}

/**
 * Step 1 of `recording-import`: hands Daily's download link to Bunny. A session keeps its
 * longest recording; a shorter one is deleted at Daily, a longer one replaces the earlier one.
 */
export async function startRecordingImport(
  ctx: Ctx,
  input: { sessionId: string; recordingId: string; durationSec: number },
): Promise<'skipped' | 'attached' | 'waiting'> {
  const s = await loadSession(ctx, input.sessionId)
  if (!s) return 'skipped'
  if (s.dailyRecordingId === input.recordingId) {
    return s.recordingVideoAssetId ? 'attached' : 'waiting'
  }
  const daily = provider(ctx, 'live')
  const video = provider(ctx, 'video')
  if (
    s.dailyRecordingId &&
    s.recordingStatus !== 'failed' &&
    (s.recordingDurationSec ?? 0) >= input.durationSec
  ) {
    await bestEffort(ctx, 'delete shorter recording', () =>
      daily.deleteRecording(input.recordingId),
    )
    return 'skipped'
  }
  const [facts] = [...(await courseFacts(ctx, [s.courseId])).values()]
  const title = `${facts?.title ?? 'Live class'} · ${s.title} · ${input.recordingId.slice(0, 8)}`
  const url = await daily.recordingDownloadUrl(input.recordingId)
  const { videoId } = await video.fetchVideo({ url, title })
  await ctx.db
    .update(liveSessions)
    .set({
      dailyRecordingId: input.recordingId,
      recordingDurationSec: input.durationSec,
      recordingTitle: title.slice(0, 200),
      recordingStatus: 'importing',
      recordingVideoAssetId: null,
    })
    .where(eq(liveSessions.id, s.id))
  const previousRecording = s.dailyRecordingId
  if (previousRecording) {
    await bestEffort(ctx, 'delete replaced recording', () =>
      daily.deleteRecording(previousRecording),
    )
  }
  if (s.recordingVideoAssetId) {
    const old = (await getVideoAssets(ctx, [s.recordingVideoAssetId])).get(s.recordingVideoAssetId)
    if (old)
      await bestEffort(ctx, 'delete replaced video', () => video.deleteVideo(old.providerVideoId))
  }
  if (!videoId) return 'waiting'
  await attach(ctx, { ...s, dailyRecordingId: input.recordingId }, input.recordingId, videoId)
  return 'attached'
}

/** Step 2 when Bunny didn't say which video it created: find it by its title (retried). */
export async function attachRecordingVideo(
  ctx: Ctx,
  input: { sessionId: string; recordingId: string },
): Promise<'attached' | 'skipped'> {
  const s = await loadSession(ctx, input.sessionId)
  if (!s || s.dailyRecordingId !== input.recordingId) return 'skipped'
  if (s.recordingVideoAssetId) return 'attached'
  const videoId = s.recordingTitle
    ? await provider(ctx, 'video').findVideoByTitle(s.recordingTitle)
    : null
  if (!videoId) throw new Error('the fetched recording is not at Bunny yet')
  await attach(ctx, s, input.recordingId, videoId)
  return 'attached'
}

/**
 * After the recording's video changes (the Bunny webhook's video-status job, or the import
 * job's own checks): ready shows it to learners and deletes Daily's copy; failed says so.
 */
export async function onRecordingVideoChanged(ctx: Ctx, videoAssetId: string) {
  const [s] = await ctx.db
    .select()
    .from(liveSessions)
    .where(eq(liveSessions.recordingVideoAssetId, videoAssetId))
  if (!s) return
  const asset = (await getVideoAssets(ctx, [videoAssetId])).get(videoAssetId)
  if (asset?.status === 'ready' && s.recordingStatus !== 'ready') {
    await ctx.db
      .update(liveSessions)
      .set({ recordingStatus: 'ready' })
      .where(eq(liveSessions.id, s.id))
    const recordingId = s.dailyRecordingId
    if (recordingId) {
      await bestEffort(ctx, 'delete imported recording', () =>
        provider(ctx, 'live').deleteRecording(recordingId),
      )
    }
  } else if (asset?.status === 'failed' && s.recordingStatus !== 'failed') {
    await ctx.db
      .update(liveSessions)
      .set({ recordingStatus: 'failed' })
      .where(eq(liveSessions.id, s.id))
  }
}

/** The import job's check in case Bunny's webhook never comes. True once it's settled. */
export async function refreshRecording(ctx: Ctx, sessionId: string): Promise<boolean> {
  const s = await loadSession(ctx, sessionId)
  if (!s?.recordingVideoAssetId) return s?.recordingStatus !== 'importing'
  const { asset } = await refreshVideoAsset(ctx, s.recordingVideoAssetId)
  await onRecordingVideoChanged(ctx, asset.id)
  return asset.status === 'ready' || asset.status === 'failed'
}

// ─── Reminders ───────────────────────────────────────────────────────────────────────────────

const REMIND_PAGE = 500

export const sessionUrl = (ctx: Ctx, courseSlug: string, sessionId: string) =>
  `${provider(ctx, 'urls').app.replace(/\/$/, '')}/learn/${courseSlug}/live/${sessionId}`

/**
 * The `live-reminders` job: one page of 24 h or 15 min reminders. Sends nothing if the session
 * was cancelled or moved since the job was scheduled (the move scheduled a new run).
 */
export async function sendLiveReminders(
  ctx: Ctx,
  input: { sessionId: string; startsAt: string; kind: '24h' | '15m'; afterUserId: string | null },
): Promise<{ sent: number; lastUserId: string | null; done: boolean }> {
  const none = { sent: 0, lastUserId: null, done: true }
  const s = await loadSession(ctx, input.sessionId)
  if (!s || s.status === 'cancelled' || s.startsAt.toISOString() !== input.startsAt) return none
  const facts = (await courseFacts(ctx, [s.courseId])).get(s.courseId)
  if (!facts) return none
  const runName = s.cohortId
    ? ((await cohortNames(ctx, [s.cohortId])).get(s.cohortId) ?? null)
    : null
  const learners = await ctx.db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(enrollments)
    .innerJoin(user, eq(user.id, enrollments.userId))
    .where(
      and(
        eq(enrollments.courseId, s.courseId),
        inArray(enrollments.status, ['active', 'completed']),
        s.cohortId ? eq(enrollments.cohortId, s.cohortId) : undefined,
        input.afterUserId ? gt(user.id, input.afterUserId) : undefined,
      ),
    )
    .orderBy(asc(user.id))
    .limit(REMIND_PAGE)
  const url = sessionUrl(ctx, facts.slug, s.id)
  const base = {
    courseTitle: facts.title,
    cohortName: runName,
    sessionTitle: s.title,
    hostName: facts.instructorName,
    when: lagosWhen(s.startsAt),
    time: lagosTime(s.startsAt),
    url,
  }
  const calendarUrl = googleCalendarUrl({
    title: `${s.title} (${facts.title})`,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    details: `Join on Tokslearn: ${url}`,
  })
  const path = new URL(url).pathname
  await notifyMany(
    ctx,
    learners.map((l) => {
      const name = l.name.split(/\s+/)[0] ?? l.name
      const businessKey = `${s.id}:${s.startsAt.getTime()}:${l.id}`
      return {
        userId: l.id,
        type: 'live.reminder' as const,
        title:
          input.kind === '24h'
            ? `${s.title} is tomorrow at ${base.time}`
            : `${s.title} starts in 15 minutes`,
        link: path,
        dedupeKey: `live.reminder:${input.kind}:${businessKey}`,
        email:
          input.kind === '24h'
            ? {
                id: 'live-reminder-24h' as const,
                businessKey,
                data: { ...base, name, calendarUrl },
              }
            : { id: 'live-reminder-15m' as const, businessKey, data: { ...base, name } },
      }
    }),
  )
  return {
    sent: learners.length,
    lastUserId: learners[learners.length - 1]?.id ?? null,
    done: learners.length < REMIND_PAGE,
  }
}
