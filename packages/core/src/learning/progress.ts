import { schema } from '@tokslearn/db'
import { and, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import { getSetting } from '../admin'
import { track } from '../analytics'
import { markPurchaseConsumed, refundablePurchase } from '../commerce'
import { recordLearning } from '../engagement'
import { lessonAccess } from '../enrollments'
import { cacheTags } from '../kernel/cache'
import { type Ctx, inTransaction } from '../kernel/ctx'
import { ForbiddenError, NotFoundError, ValidationError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'

// Progress (docs/09 §4, docs/10 §3). Heartbeats every 20 s while a video plays; the server never
// trusts the numbers: watched time per beat is capped by the wall-clock time since the last beat
// at 2× speed, positions by the lesson's length. Completion, course progress, streak days and the
// refund-consumption rule (docs/08 §7) all follow from here.
// Foreign reads (docs/03 §3): lessons, courses, enrollments, consumption_events.

const { lessonProgress, lessons, courses, enrollments, consumptionEvents } = schema

/** Fastest playback we credit (docs/09 §4). */
export const MAX_RATE = 2
/** Slack for clock jitter and the first beat of a session. */
const SLACK_SEC = 5
/** No single beat credits more than this, however long the gap. */
const MAX_BEAT_SEC = 60
/** At most one `video_progress` consumption event per lesson per 5 minutes. */
const CONSUMPTION_EVERY_MS = 5 * 60_000
/** "Last opened" moves at most every 5 minutes, to keep heartbeats from writing it constantly. */
const TOUCH_EVERY_MS = 5 * 60_000

export interface HeartbeatInput {
  lessonId: string
  positionSec: number
  watchedDeltaSec: number
  playbackRate?: number | undefined
  /** When the beat happened (offline batches from mobile). Never in the future. */
  occurredAt?: Date | undefined
}

export interface HeartbeatResult {
  recorded: boolean
  status: 'not_started' | 'in_progress' | 'completed'
  positionSec: number
  /** True on the beat that completed the lesson. */
  completedNow: boolean
  courseProgressPct: number | null
  streakExtendedTo: number | null
}

/**
 * Credited watch time for one beat: never negative, never more than wall-clock time since the
 * last beat at 2× (plus slack), never more than 60 s. Exported for unit tests.
 */
export function clampWatched(input: {
  claimedSec: number
  lastBeatAt: Date | null
  at: Date
}): number {
  const claimed = Number.isFinite(input.claimedSec) ? Math.max(0, input.claimedSec) : 0
  const elapsed = input.lastBeatAt
    ? Math.max(0, (input.at.getTime() - input.lastBeatAt.getTime()) / 1000)
    : 20
  const allowed = Math.min(MAX_BEAT_SEC, elapsed * MAX_RATE + SLACK_SEC)
  return Math.floor(Math.min(claimed, allowed))
}

/** Completion rule (docs/09 §4): max(watched, furthest point) ÷ length ≥ the course threshold. */
export const isComplete = (
  watchedSec: number,
  maxPositionSec: number,
  durationSec: number,
  thresholdPct: number,
) => durationSec > 0 && Math.max(watchedSec, maxPositionSec) * 100 >= durationSec * thresholdPct

async function courseProgress(tx: Ctx, userId: string, courseId: string) {
  const [row] = await tx.db
    .select({
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where exists (
        select 1 from lesson_progress lp
        where lp.lesson_id = "lessons"."id" and lp.user_id = ${userId} and lp.status = 'completed'))::int`,
    })
    .from(lessons)
    .where(
      and(eq(lessons.courseId, courseId), isNotNull(lessons.liveSince), isNull(lessons.deletedAt)),
    )
  const total = row?.total ?? 0
  return total === 0 ? 0 : Math.floor(((row?.done ?? 0) * 100) / total)
}

/** Updates the enrollment after a lesson completes; finishing every lesson completes the course. */
async function afterLessonCompleted(tx: Ctx, userId: string, courseId: string, lessonId: string) {
  const pct = await courseProgress(tx, userId, courseId)
  const [before] = await tx.db
    .select({ status: enrollments.status, createdAt: enrollments.createdAt })
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)))
  const finished = pct === 100 && before?.status === 'active'
  await tx.db
    .update(enrollments)
    .set({
      progressPct: pct,
      lastAccessedAt: tx.now,
      ...(finished ? { status: 'completed' as const, completedAt: tx.now } : {}),
    })
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)))
  await tx.events.emit('lesson.completed', { userId, courseId, lessonId })
  if (finished) {
    await tx.events.emit('course.completed', { userId, courseId })
    void track(
      tx,
      'course_completed',
      {
        course_id: courseId,
        days_since_enroll: before
          ? Math.floor((tx.now.getTime() - before.createdAt.getTime()) / 86_400_000)
          : 0,
      },
      { distinctId: userId },
    )
  }
  return pct
}

/**
 * docs/08 §7 CONTENT_CONSUMED: once a buyer has watched the refund threshold (30%) of the course's
 * video, the purchase stops being refundable and the instructor's earning is released.
 */
async function checkConsumption(tx: Ctx, userId: string, courseId: string) {
  const purchase = await refundablePurchase(tx, { userId, courseId })
  if (!purchase) return
  const threshold =
    (await getSetting(tx, 'refund_consumption_threshold_pct', (v) => Number(v))) ?? 30
  const [row] = await tx.db
    .select({
      total: sql<number>`coalesce(sum(${lessons.durationSec}), 0)::int`,
      watched: sql<number>`coalesce(sum(least(${lessonProgress.watchedSec}, ${lessons.durationSec})), 0)::int`,
    })
    .from(lessons)
    .leftJoin(
      lessonProgress,
      and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, userId)),
    )
    .where(
      and(
        eq(lessons.courseId, courseId),
        eq(lessons.type, 'video'),
        isNotNull(lessons.liveSince),
        isNull(lessons.deletedAt),
      ),
    )
  const total = row?.total ?? 0
  if (total > 0 && (row?.watched ?? 0) * 100 >= total * threshold) {
    await markPurchaseConsumed(tx, { userId, courseId, reason: 'content_consumed' })
  }
}

async function learnerLesson(ctx: Ctx, lessonId: string) {
  const access = await lessonAccess(ctx, lessonId)
  if (access.reason === 'missing' || !access.courseId) throw new NotFoundError('LESSON_NOT_FOUND')
  if (!access.allowed)
    throw new ForbiddenError(access.reason === 'revoked' ? 'ENROLLMENT_REVOKED' : 'NOT_ENROLLED')
  const [row] = await ctx.db
    .select({
      id: lessons.id,
      type: lessons.type,
      durationSec: lessons.durationSec,
      courseId: lessons.courseId,
      threshold: courses.completionThresholdPct,
    })
    .from(lessons)
    .innerJoin(courses, eq(courses.id, lessons.courseId))
    .where(eq(lessons.id, lessonId))
  if (!row) throw new NotFoundError('LESSON_NOT_FOUND')
  return { lesson: row, access }
}

/**
 * `progress.heartbeat`. Previews, teachers and staff get `recorded: false`: only enrolled
 * learners build progress, streaks and refund evidence.
 */
export async function heartbeat(ctx: Ctx, input: HeartbeatInput): Promise<HeartbeatResult> {
  const actor = requireUser(ctx.actor)
  if (!Number.isFinite(input.positionSec) || input.positionSec < 0) {
    throw new ValidationError([{ path: 'positionSec', message: 'Position must be 0 or more.' }])
  }
  const { lesson, access } = await learnerLesson(ctx, input.lessonId)
  const skipped: HeartbeatResult = {
    recorded: false,
    status: 'not_started',
    positionSec: Math.floor(input.positionSec),
    completedNow: false,
    courseProgressPct: null,
    streakExtendedTo: null,
  }
  if (access.reason !== 'enrolled') return skipped
  const at = input.occurredAt && input.occurredAt < ctx.now ? input.occurredAt : ctx.now

  const result = await inTransaction(ctx, async (tx) => {
    const [existing] = await tx.db
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, actor.userId), eq(lessonProgress.lessonId, lesson.id)))
      .for('update')
    // Out-of-order beats (offline batches) never move time backwards.
    const lastBeatAt = existing?.lastHeartbeatAt ?? null
    const beatAt = lastBeatAt && at < lastBeatAt ? lastBeatAt : at
    const credited = clampWatched({ claimedSec: input.watchedDeltaSec, lastBeatAt, at: beatAt })
    const cap = lesson.durationSec > 0 ? lesson.durationSec : Number.MAX_SAFE_INTEGER
    const position = Math.min(Math.floor(input.positionSec), cap)
    const watched = Math.min((existing?.watchedSec ?? 0) + credited, cap)
    const maxPosition = Math.max(existing?.maxPositionSec ?? 0, position)
    const wasComplete = existing?.status === 'completed'
    const nowComplete =
      wasComplete || isComplete(watched, maxPosition, lesson.durationSec, lesson.threshold)
    const logConsumption =
      !existing?.lastConsumptionAt ||
      beatAt.getTime() - existing.lastConsumptionAt.getTime() >= CONSUMPTION_EVERY_MS

    await tx.db
      .insert(lessonProgress)
      .values({
        userId: actor.userId,
        lessonId: lesson.id,
        courseId: lesson.courseId,
        status: nowComplete ? 'completed' : 'in_progress',
        positionSec: position,
        watchedSec: watched,
        maxPositionSec: maxPosition,
        completedAt: nowComplete ? (existing?.completedAt ?? tx.now) : null,
        lastHeartbeatAt: beatAt,
        lastConsumptionAt: logConsumption ? beatAt : (existing?.lastConsumptionAt ?? null),
      })
      .onConflictDoUpdate({
        target: [lessonProgress.userId, lessonProgress.lessonId],
        set: {
          status: nowComplete ? 'completed' : 'in_progress',
          positionSec: position,
          watchedSec: watched,
          maxPositionSec: maxPosition,
          completedAt: nowComplete ? (existing?.completedAt ?? tx.now) : null,
          lastHeartbeatAt: beatAt,
          lastConsumptionAt: logConsumption ? beatAt : (existing?.lastConsumptionAt ?? null),
        },
      })

    if (logConsumption && lesson.type === 'video') {
      await tx.db.insert(consumptionEvents).values({
        userId: actor.userId,
        courseId: lesson.courseId,
        kind: 'video_progress',
        refId: lesson.id,
        value: String(watched),
        occurredAt: beatAt,
        ipHash: tx.ipHash,
      })
      await checkConsumption(tx, actor.userId, lesson.courseId)
    }

    const completedNow = nowComplete && !wasComplete
    const courseProgressPct = completedNow
      ? await afterLessonCompleted(tx, actor.userId, lesson.courseId, lesson.id)
      : null
    if (!completedNow) {
      await tx.db
        .update(enrollments)
        .set({ lastAccessedAt: tx.now })
        .where(
          and(
            eq(enrollments.userId, actor.userId),
            eq(enrollments.courseId, lesson.courseId),
            or(
              isNull(enrollments.lastAccessedAt),
              lt(enrollments.lastAccessedAt, new Date(tx.now.getTime() - TOUCH_EVERY_MS)),
            ),
          ),
        )
    }
    const streak = await recordLearning(tx, {
      userId: actor.userId,
      learnedSec: credited,
      lessonsCompleted: completedNow ? 1 : 0,
    })
    return {
      recorded: true,
      status: nowComplete ? ('completed' as const) : ('in_progress' as const),
      positionSec: position,
      completedNow,
      courseProgressPct,
      streakExtendedTo: streak.extendedTo,
      firstBeat: !existing,
    }
  })

  if (result.firstBeat) {
    void track(
      ctx,
      'lesson_started',
      {
        course_id: lesson.courseId,
        lesson_id: lesson.id,
        lesson_type: lesson.type,
        position: result.positionSec,
      },
      { distinctId: actor.userId },
    )
  }
  if (result.completedNow) {
    void track(
      ctx,
      'lesson_completed',
      { course_id: lesson.courseId, lesson_id: lesson.id, lesson_type: lesson.type },
      { distinctId: actor.userId },
    )
    await ctx.cache.invalidate([cacheTags.userEnrollments(actor.userId)])
  }
  const { firstBeat: _f, ...out } = result
  return out
}

/** "Mark complete" on article and resource lessons (and any lesson the learner finishes by hand). */
export async function markLessonComplete(ctx: Ctx, lessonId: string): Promise<HeartbeatResult> {
  const actor = requireUser(ctx.actor)
  const { lesson, access } = await learnerLesson(ctx, lessonId)
  if (access.reason !== 'enrolled') {
    return {
      recorded: false,
      status: 'not_started',
      positionSec: 0,
      completedNow: false,
      courseProgressPct: null,
      streakExtendedTo: null,
    }
  }
  return completeLessonFor(ctx, { userId: actor.userId, lesson })
}

/**
 * Completes a lesson for a learner (idempotent). For modules that decide completion themselves,
 * e.g. assessments when a quiz is passed, including the auto-submit job, which has no signed-in
 * user. The caller has already checked the learner is enrolled.
 */
export async function completeLessonFor(
  ctx: Ctx,
  input: { userId: string; lesson: { id: string; courseId: string; type: string } },
): Promise<HeartbeatResult> {
  const { userId, lesson } = input
  const result = await inTransaction(ctx, async (tx) => {
    const [existing] = await tx.db
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lesson.id)))
      .for('update')
    if (existing?.status === 'completed') {
      return { completedNow: false, pct: null, streak: null, position: existing.positionSec }
    }
    await tx.db
      .insert(lessonProgress)
      .values({
        userId,
        lessonId: lesson.id,
        courseId: lesson.courseId,
        status: 'completed',
        completedAt: tx.now,
      })
      .onConflictDoUpdate({
        target: [lessonProgress.userId, lessonProgress.lessonId],
        set: { status: 'completed', completedAt: tx.now },
      })
    const pct = await afterLessonCompleted(tx, userId, lesson.courseId, lesson.id)
    const streak = await recordLearning(tx, { userId, learnedSec: 0, lessonsCompleted: 1 })
    return {
      completedNow: true,
      pct,
      streak: streak.extendedTo,
      position: existing?.positionSec ?? 0,
    }
  })
  if (result.completedNow) {
    void track(
      ctx,
      'lesson_completed',
      { course_id: lesson.courseId, lesson_id: lesson.id, lesson_type: lesson.type },
      { distinctId: userId },
    )
    await ctx.cache.invalidate([cacheTags.userEnrollments(userId)])
  }
  return {
    recorded: true,
    status: 'completed',
    positionSec: result.position,
    completedNow: result.completedNow,
    courseProgressPct: result.pct,
    streakExtendedTo: result.streak,
  }
}

/**
 * `progress.syncBatch` (mobile, offline): beats in the order they happened, each clamped against
 * the one before. At most 100 per call.
 */
export async function syncBatch(
  ctx: Ctx,
  beats: ReadonlyArray<HeartbeatInput & { occurredAt: Date }>,
): Promise<{ accepted: number }> {
  if (beats.length > 100) {
    throw new ValidationError([{ path: 'beats', message: 'Send at most 100 beats at a time.' }])
  }
  const ordered = [...beats].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
  let accepted = 0
  for (const beat of ordered) {
    const r = await heartbeat(ctx, beat)
    if (r.recorded) accepted++
  }
  return { accepted }
}
