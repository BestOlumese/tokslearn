import { type Db, schema } from '@tokslearn/db'
import { seedBadgeDefinitions, seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { and, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { addToCart, completeOrder, startCheckout } from '../commerce'
import { addStaff, getDripSettings, updateDripSettings } from '../courses'
import {
  createNote,
  deleteNote,
  evaluateBadges,
  exportNotesMarkdown,
  getStreak,
  listBadges,
  listBookmarks,
  listNotes,
  rolloverStreaks,
  toggleBookmark,
  updateNote,
} from '../engagement'
import {
  grantEnrollment,
  learnerDisplayName,
  listCourseLearners,
  revokeEnrollment,
} from '../enrollments'
import type { UserActor } from '../kernel/actor'
import { inTransaction } from '../kernel/ctx'
import { insertUser, testUser } from '../kernel/testing'
import { balances, entriesFor, instructorAccount } from '../ledger'
import { codeOf, people, publishCourse, setup } from '../testing'
import {
  continueLearning,
  downloadResource,
  getCourseOutline,
  getCourseProgress,
  getLesson,
  getPlayback,
  heartbeat,
  markLessonComplete,
  sendUnlockEmails,
  syncBatch,
} from '.'

afterAll(closeTestDb)

const T0 = new Date('2026-10-01T09:00:00Z')
const at = (sec: number) => new Date(T0.getTime() + sec * 1000)

async function world(db: Db) {
  await seedCatalog(db)
  await seedCommission(db)
  await seedBadgeDefinitions(db)
  const env = setup(db)
  const { owner, reviewer } = await people(db)
  const course = await publishCourse(env, owner, reviewer)
  const [video, article] = course.sections[0]?.lessons ?? []
  const resourceLesson = course.sections[1]?.lessons[0]
  const [resource] = await db
    .select()
    .from(schema.lessonResources)
    .where(eq(schema.lessonResources.lessonId, resourceLesson?.id ?? ''))
  // Make the video paid-only so access rules are visible (publishCourse marks it a preview).
  await db
    .update(schema.lessons)
    .set({ isPreview: false })
    .where(eq(schema.lessons.id, video?.id ?? ''))
  const buyer = testUser(['learner'], {
    userId: await insertUser(db, { name: 'Amaka Obi', email: 'amaka@example.com' }),
  })
  const c = env.ctx(buyer)
  await addToCart(c, { itemType: 'course', itemId: course.id })
  const order = await startCheckout(c, {
    expectedTotalKobo: 1_500_000n,
    idempotencyKey: 'buy',
    anonymousId: null,
  })
  await completeOrder(c, { reference: order.publicId, via: 'confirm' })
  return {
    env,
    owner,
    course,
    buyer,
    order,
    video: video?.id ?? '',
    article: article?.id ?? '',
    resourceLesson: resourceLesson?.id ?? '',
    resource: resource?.id ?? '',
  }
}

const beat = (
  env: ReturnType<typeof setup>,
  who: UserActor,
  lessonId: string,
  sec: number,
  positionSec: number,
  watchedDeltaSec: number,
) => heartbeat(env.ctx(who, at(sec)), { lessonId, positionSec, watchedDeltaSec })

describe('learning access', () => {
  it('gives playback and file links only to people who may open the lesson', async () => {
    await withRollback(async (db) => {
      const { env, course, owner, buyer, video, resourceLesson, resource } = await world(db)
      const stranger = testUser(['learner'], { userId: await insertUser(db) })
      const anon = env.ctx({ kind: 'anonymous' })
      for (const ctx of [env.ctx(stranger), anon]) {
        expect(await codeOf(getPlayback(ctx, video))).toBe('NOT_ENROLLED')
        expect(
          await codeOf(downloadResource(ctx, { lessonId: resourceLesson, resourceId: resource })),
        ).toBe('NOT_ENROLLED')
        expect(await codeOf(getLesson(ctx, video))).toBe('NOT_ENROLLED')
      }
      expect(await codeOf(getCourseOutline(env.ctx(stranger), course.slug))).toBe('NOT_ENROLLED')
      expect(await codeOf(getCourseOutline(env.ctx(stranger), 'no-such-course'))).toBe(
        'COURSE_NOT_FOUND',
      )
      expect(
        await codeOf(getPlayback(env.ctx(buyer), '01920000-0000-7000-8000-00000000dead')),
      ).toBe('LESSON_NOT_FOUND')

      const play = await getPlayback(env.ctx(buyer), video)
      expect(play.embedUrl).toContain('token=')
      expect(play.resumeAt).toBe(0)
      // The instructor can check their own course without enrolling.
      expect((await getCourseOutline(env.ctx(owner), course.slug)).role).toBe('teaching')
      expect((await getPlayback(env.ctx(owner), video)).embedUrl).toBeTruthy()

      await revokeEnrollment(env.ctx(buyer), { userId: buyer.userId, courseId: course.id })
      expect(await codeOf(getPlayback(env.ctx(buyer), video))).toBe('ENROLLMENT_REVOKED')
      expect(await codeOf(getCourseOutline(env.ctx(buyer), course.slug))).toBe('ENROLLMENT_REVOKED')
    })
  })

  it('locks drip lessons until their day, and says when', async () => {
    await withRollback(async (db) => {
      const { env, course, buyer, article } = await world(db)
      await db
        .update(schema.courses)
        .set({ dripMode: 'after_enrollment' })
        .where(eq(schema.courses.id, course.id))
      await db
        .update(schema.lessons)
        .set({ dripOffsetDays: 3 })
        .where(eq(schema.lessons.id, article))
      // Enrollment time comes from the database clock, so everything is relative to it.
      const [enrollment] = await db
        .select({ at: schema.enrollments.createdAt })
        .from(schema.enrollments)
        .where(eq(schema.enrollments.userId, buyer.userId))
      const enrolledAt = enrollment?.at ?? new Date(0)
      const day = (n: number) => new Date(enrolledAt.getTime() + n * 86_400_000)
      const now = env.ctx(buyer, day(1))
      expect(await codeOf(getLesson(now, article))).toBe('LESSON_LOCKED')
      const outline = await getCourseOutline(now, course.slug)
      const locked = outline.sections.flatMap((s) => s.lessons).find((l) => l.id === article)
      expect(locked).toMatchObject({ locked: true })
      expect(locked?.unlocksAt?.toISOString()).toBe(day(3).toISOString())
      const later = env.ctx(buyer, day(3))
      expect((await getLesson(later, article)).type).toBe('article')
    })
  })
})

describe('progress', () => {
  it('resumes where the learner stopped and clamps fake watch time', async () => {
    await withRollback(async (db) => {
      const { env, buyer, video } = await world(db)
      // Refresh mid-video: the last beat was at 7:20.
      await beat(env, buyer, video, 0, 420, 20)
      expect((await getPlayback(env.ctx(buyer, at(5)), video)).resumeAt).toBe(420)
      const lesson = await getLesson(env.ctx(buyer, at(5)), video)
      expect(lesson.progress).toEqual({ status: 'in_progress', positionSec: 420 })
      expect(lesson.watermark).toBe('Amaka Obi · am***@example.com')

      // Claiming 10 minutes per beat, three beats 20 s apart: at most 45 s each is credited.
      await beat(env, buyer, video, 20, 440, 600)
      await beat(env, buyer, video, 40, 460, 600)
      await beat(env, buyer, video, 60, 480, 600)
      const [row] = await db
        .select()
        .from(schema.lessonProgress)
        .where(
          and(
            eq(schema.lessonProgress.userId, buyer.userId),
            eq(schema.lessonProgress.lessonId, video),
          ),
        )
      expect(row?.watchedSec).toBe(20 + 45 * 3)
      // Positions can't run past the end.
      const r = await beat(env, buyer, video, 80, 99_999, 10)
      expect(r.positionSec).toBe(1900)
    })
  })

  it('completes lessons and the course, and records the events', async () => {
    await withRollback(async (db) => {
      const { env, course, buyer, video, article, resourceLesson } = await world(db)
      expect((await markLessonComplete(env.ctx(buyer), article)).completedNow).toBe(true)
      expect((await markLessonComplete(env.ctx(buyer), article)).completedNow).toBe(false)
      expect((await markLessonComplete(env.ctx(buyer), resourceLesson)).courseProgressPct).toBe(66)
      // Seeking to the end completes a video (furthest point ≥ 90%).
      const done = await beat(env, buyer, video, 0, 1800, 20)
      expect(done).toMatchObject({
        completedNow: true,
        courseProgressPct: 100,
        status: 'completed',
      })
      const [enrollment] = await db
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.userId, buyer.userId),
            eq(schema.enrollments.courseId, course.id),
          ),
        )
      expect(enrollment).toMatchObject({ status: 'completed', progressPct: 100 })
      const events = await db.select({ name: schema.outbox.eventName }).from(schema.outbox)
      expect(events.map((e) => e.name)).toEqual(
        expect.arrayContaining(['lesson.completed', 'course.completed']),
      )
      expect((await getPlayback(env.ctx(buyer), video)).resumeAt).toBe(0)
      const outline = await getCourseOutline(env.ctx(buyer), course.slug)
      expect(outline.progressPct).toBe(100)
      expect(
        outline.sections.flatMap((s) => s.lessons).every((l) => l.status === 'completed'),
      ).toBe(true)
    })
  })

  it('ignores progress from previews and teachers, and orders offline batches', async () => {
    await withRollback(async (db) => {
      const { env, owner, buyer, video } = await world(db)
      expect((await beat(env, owner, video, 0, 30, 20)).recorded).toBe(false)
      expect(
        await codeOf(
          heartbeat(env.ctx(buyer), { lessonId: video, positionSec: -1, watchedDeltaSec: 0 }),
        ),
      ).toBe('VALIDATION_FAILED')
      const r = await syncBatch(env.ctx(buyer, at(120)), [
        { lessonId: video, positionSec: 60, watchedDeltaSec: 20, occurredAt: at(60) },
        { lessonId: video, positionSec: 40, watchedDeltaSec: 20, occurredAt: at(40) },
        { lessonId: video, positionSec: 20, watchedDeltaSec: 20, occurredAt: at(20) },
      ])
      expect(r.accepted).toBe(3)
      const [row] = await db
        .select()
        .from(schema.lessonProgress)
        .where(eq(schema.lessonProgress.lessonId, video))
      expect(row).toMatchObject({ positionSec: 60, watchedSec: 60, maxPositionSec: 60 })
      expect(
        await codeOf(
          syncBatch(
            env.ctx(buyer),
            Array.from({ length: 101 }, () => ({
              lessonId: video,
              positionSec: 0,
              watchedDeltaSec: 0,
              occurredAt: T0,
            })),
          ),
        ),
      ).toBe('VALIDATION_FAILED')
    })
  })
})

describe('staff who are also learners', () => {
  it('records progress for an admin who bought the course, and still skips staff who did not', async () => {
    await withRollback(async (db) => {
      const { env, course, video, article, resourceLesson } = await world(db)
      const adminId = await insertUser(db, { roles: ['learner', 'admin'] })
      const admin = testUser(['learner', 'admin'], { userId: adminId })
      // Not enrolled: admins can open everything, but it isn't their learning.
      expect((await markLessonComplete(env.ctx(admin), article)).recorded).toBe(false)
      await inTransaction(env.ctx({ kind: 'system', reason: 'test' }), (tx) =>
        grantEnrollment(tx, { userId: adminId, courseId: course.id, source: 'free' }),
      )
      expect(await markLessonComplete(env.ctx(admin), article)).toMatchObject({
        recorded: true,
        completedNow: true,
        courseProgressPct: 33,
      })
      expect((await beat(env, admin, video, 0, 60, 20)).recorded).toBe(true)
      const outline = await getCourseOutline(env.ctx(admin), course.slug)
      expect(outline.role).toBe('learner')
      expect(outline.sections[0]?.lessons.find((l) => l.id === article)?.status).toBe('completed')

      // Drip applies to them like any learner; a colleague who didn't enroll sees everything.
      await db
        .update(schema.courses)
        .set({ dripMode: 'after_enrollment' })
        .where(eq(schema.courses.id, course.id))
      await db
        .update(schema.lessons)
        .set({ dripOffsetDays: 30 })
        .where(eq(schema.lessons.id, resourceLesson))
      expect(await codeOf(getLesson(env.ctx(admin, new Date()), resourceLesson))).toBe(
        'LESSON_LOCKED',
      )
      const locked = (await getCourseOutline(env.ctx(admin, new Date()), course.slug)).sections
        .flatMap((s) => s.lessons)
        .find((l) => l.id === resourceLesson)
      expect(locked?.locked).toBe(true)
      const otherAdmin = testUser(['learner', 'admin'], {
        userId: await insertUser(db, { roles: ['learner', 'admin'] }),
      })
      expect((await getLesson(env.ctx(otherAdmin), resourceLesson)).id).toBe(resourceLesson)
    })
  })
})

describe('refund consumption', () => {
  it('asks before an important download, then ends the refund right and releases the earning', async () => {
    await withRollback(async (db) => {
      const { env, owner, buyer, order, resourceLesson, resource } = await world(db)
      const c = env.ctx(buyer)
      expect(
        await codeOf(downloadResource(c, { lessonId: resourceLesson, resourceId: resource })),
      ).toBe('DOWNLOAD_CONFIRM_REQUIRED')
      const before = await getLesson(c, resourceLesson)
      expect(before.refundable).toBe(true)
      expect(before.refund).toMatchObject({ state: 'open', until: expect.any(Date) })
      const file = await downloadResource(c, {
        lessonId: resourceLesson,
        resourceId: resource,
        confirmed: true,
      })
      expect(file.filename).toMatch(/^Month-end template/)
      // Taking a file completes a file lesson.
      const [done] = await db
        .select({ status: schema.lessonProgress.status })
        .from(schema.lessonProgress)
        .where(eq(schema.lessonProgress.lessonId, resourceLesson))
      expect(done?.status).toBe('completed')
      expect(file.url).toBeTruthy()

      const [item] = await db
        .select()
        .from(schema.orderItems)
        .where(eq(schema.orderItems.orderId, order.orderId))
      expect(item).toMatchObject({ status: 'non_refundable', earningStatus: 'available' })
      const b = await balances(c, [
        instructorAccount(owner.userId, 'pending'),
        instructorAccount(owner.userId, 'available'),
      ])
      expect([...b.values()]).toEqual([0n, item?.instructorShareKobo ?? -1n])
      expect(
        (await entriesFor(c, { type: 'order', id: order.orderId })).map((e) => e.kind),
      ).toEqual(['sale', 'release'])
      // Nothing left to protect: no more confirmation, and the page says the window has ended.
      const after = await getLesson(c, resourceLesson)
      expect(after.refundable).toBe(false)
      expect(after.refund).toEqual({ state: 'ended' })
      await downloadResource(c, { lessonId: resourceLesson, resourceId: resource })
      const logged = await db
        .select()
        .from(schema.consumptionEvents)
        .where(eq(schema.consumptionEvents.userId, buyer.userId))
      expect(logged.filter((e) => e.kind === 'resource_download')).toHaveLength(2)
      expect(
        await codeOf(
          downloadResource(c, {
            lessonId: resourceLesson,
            resourceId: '01920000-0000-7000-8000-00000000dead',
          }),
        ),
      ).toBe('RESOURCE_NOT_FOUND')
    })
  })

  it('ends the refund right once 30% of the course video has been watched', async () => {
    await withRollback(async (db) => {
      const { env, buyer, order, video } = await world(db)
      // Beats 5 minutes apart credit up to 60 s each; 30% of 1,900 s is 570 s.
      for (let i = 0; i < 9; i++) await beat(env, buyer, video, i * 300, i * 60, 60)
      let [item] = await db
        .select()
        .from(schema.orderItems)
        .where(eq(schema.orderItems.orderId, order.orderId))
      expect(item?.status).toBe('active')
      await beat(env, buyer, video, 9 * 300, 600, 60)
      ;[item] = await db
        .select()
        .from(schema.orderItems)
        .where(eq(schema.orderItems.orderId, order.orderId))
      expect(item).toMatchObject({ status: 'non_refundable', earningStatus: 'available' })
    })
  })
})

describe('notes, bookmarks, streaks and badges', () => {
  it('keeps private notes and bookmarks and exports them', async () => {
    await withRollback(async (db) => {
      const { env, buyer, course, video, article } = await world(db)
      const c = env.ctx(buyer)
      const note = await createNote(c, {
        lessonId: video,
        positionSec: 125.7,
        body: '  Use XLOOKUP here  ',
      })
      await createNote(c, { lessonId: article, body: 'Shortcut list' })
      expect(note).toMatchObject({ positionSec: 125, body: 'Use XLOOKUP here' })
      await updateNote(c, { noteId: note.id, body: 'Use XLOOKUP, not VLOOKUP' })
      expect((await listNotes(c, { courseId: course.id })).map((n) => n.body)).toEqual([
        'Use XLOOKUP, not VLOOKUP',
        'Shortcut list',
      ])
      expect((await listNotes(c, { q: 'shortcut' })).map((n) => n.body)).toEqual(['Shortcut list'])
      const md = await exportNotesMarkdown(c)
      expect(md).toContain('## Excel for Accountants')
      expect(md).toContain('- [2:05] Use XLOOKUP, not VLOOKUP')
      expect(await codeOf(createNote(c, { lessonId: video, body: ' ' }))).toBe('VALIDATION_FAILED')
      const stranger = testUser(['learner'], { userId: await insertUser(db) })
      expect(await codeOf(createNote(env.ctx(stranger), { lessonId: video, body: 'x' }))).toBe(
        'NOT_ENROLLED',
      )
      expect(await codeOf(updateNote(env.ctx(stranger), { noteId: note.id, body: 'x' }))).toBe(
        'NOTE_NOT_FOUND',
      )
      await deleteNote(c, note.id)
      expect(await listNotes(c, { lessonId: video })).toEqual([])

      expect(await toggleBookmark(c, { lessonId: video, positionSec: 60 })).toEqual({
        bookmarked: true,
      })
      expect(await toggleBookmark(c, { lessonId: article })).toEqual({ bookmarked: true })
      expect((await listBookmarks(c, course.id)).map((b) => b.positionSec)).toEqual([60, null])
      expect(await toggleBookmark(c, { lessonId: video, positionSec: 60 })).toEqual({
        bookmarked: false,
      })
    })
  })

  it('counts streak days, freezes a missed day, ends a broken streak, and awards badges', async () => {
    await withRollback(async (db) => {
      const { env, buyer, article, video } = await world(db)
      const day = (n: number, h = 10) => new Date(Date.UTC(2026, 9, 1 + n, h))
      // Day 0: finishing a lesson counts.
      await markLessonComplete(env.ctx(buyer, day(0)), article)
      expect((await getStreak(env.ctx(buyer, day(0)))).current).toBe(1)
      // Days 1–6: ten minutes of video each day.
      for (let n = 1; n <= 6; n++) {
        for (let i = 0; i < 12; i++) {
          await heartbeat(env.ctx(buyer, new Date(day(n).getTime() + i * 60_000)), {
            lessonId: video,
            positionSec: 30,
            watchedDeltaSec: 60,
          })
        }
      }
      let s = await getStreak(env.ctx(buyer, day(6)))
      expect(s).toMatchObject({ current: 7, longest: 7, freezeTokens: 1, todayCounted: true })
      expect(
        await evaluateBadges(env.ctx({ kind: 'system', reason: 'test' }), buyer.userId),
      ).toEqual(expect.arrayContaining(['first_lesson', 'streak_7']))
      expect(
        await evaluateBadges(env.ctx({ kind: 'system', reason: 'test' }), buyer.userId),
      ).toEqual([])
      const badges = await listBadges(env.ctx(buyer))
      expect(badges.find((b) => b.code === 'streak_7')?.awardedAt).not.toBeNull()
      expect(badges.find((b) => b.code === 'streak_30')?.awardedAt).toBeNull()

      // Day 7 missed: the nightly rollover on day 8 spends the token and the streak lives.
      expect(await rolloverStreaks(env.ctx({ kind: 'system', reason: 'cron' }, day(8, 0)))).toEqual(
        { frozen: 1, ended: 0 },
      )
      s = await getStreak(env.ctx(buyer, day(8)))
      expect(s).toMatchObject({ current: 7, freezeTokens: 0, todayCounted: false })
      // Days 8 and 9 missed too: no tokens left, so it ends.
      expect(
        await rolloverStreaks(env.ctx({ kind: 'system', reason: 'cron' }, day(10, 0))),
      ).toEqual({ frozen: 0, ended: 1 })
      expect((await getStreak(env.ctx(buyer, day(10)))).current).toBe(0)
      expect((await getStreak(env.ctx(buyer, day(10)))).longest).toBe(7)
    })
  })
})

describe('drip schedule, learners and the continue card', () => {
  it('lets the instructor set a drip schedule that locks lessons, keeps started ones open and emails on unlock', async () => {
    await withRollback(async (db) => {
      const { env, owner, course, buyer, article, resourceLesson } = await world(db)
      const settings = await getDripSettings(env.ctx(owner), course.id)
      expect(settings).toMatchObject({ mode: 'none', canEdit: true })
      // Started before the schedule changes: stays open.
      await markLessonComplete(env.ctx(buyer), article)
      const updated = await updateDripSettings(env.ctx(owner), {
        courseId: course.id,
        version: settings.version,
        mode: 'after_enrollment',
        lessons: [
          { lessonId: article, offsetDays: 2, date: null },
          { lessonId: resourceLesson, offsetDays: 3, date: null },
        ],
      })
      expect(updated.version).toBe(settings.version + 1)
      expect(updated.lessons.find((l) => l.lessonId === resourceLesson)?.offsetDays).toBe(3)
      expect(
        await codeOf(
          updateDripSettings(env.ctx(owner), {
            courseId: course.id,
            version: settings.version,
            mode: 'none',
            lessons: [],
          }),
        ),
      ).toBe('VERSION_CONFLICT')
      expect(
        await codeOf(
          updateDripSettings(env.ctx(buyer), {
            courseId: course.id,
            version: updated.version,
            mode: 'none',
            lessons: [],
          }),
        ),
      ).toBe('COURSE_NOT_FOUND')

      const c = env.ctx(buyer)
      expect((await getLesson(c, article)).id).toBe(article)
      expect(await codeOf(getLesson(c, resourceLesson))).toBe('LESSON_LOCKED')

      const [enrollment] = await db
        .select()
        .from(schema.enrollments)
        .where(eq(schema.enrollments.userId, buyer.userId))
      const day = (n: number) => new Date((enrollment?.createdAt.getTime() ?? 0) + n * 86_400_000)
      const system = (now: Date) => env.ctx({ kind: 'system', reason: 'drip-unlocks' }, now)
      expect(await sendUnlockEmails(system(day(2)), { from: day(1), to: day(2) })).toEqual({
        emails: 0,
        lessons: 0,
      })
      expect(await sendUnlockEmails(system(day(4)), { from: day(2.5), to: day(4) })).toEqual({
        emails: 1,
        lessons: 1,
      })
      await sendUnlockEmails(system(day(4)), { from: day(2.5), to: day(4) })
      const queued = await db
        .select({ payload: schema.outbox.payload })
        .from(schema.outbox)
        .where(eq(schema.outbox.eventName, 'notification.email_requested'))
      const unlocks = queued
        .map(
          (r) => r.payload as { id: string; idempotencyKey: string; data: { lessons: string[] } },
        )
        .filter((p) => p.id === 'lesson-unlocked')
      expect(unlocks).toHaveLength(2)
      expect(new Set(unlocks.map((u) => u.idempotencyKey)).size).toBe(1)
      expect(unlocks[0]?.data.lessons).toHaveLength(1)
    })
  })

  it('shows learners to the instructor without emails, and picks the lesson to continue', async () => {
    await withRollback(async (db) => {
      const { env, owner, course, buyer, video, article } = await world(db)
      const page = await listCourseLearners(env.ctx(owner), { courseId: course.id })
      expect(page).toMatchObject({ total: 1, nextCursor: null })
      // The course's teaching assistants see the list too.
      const taId = await insertUser(db, { email: 'ta@example.com', roles: ['learner'] })
      await addStaff(env.ctx(owner), { courseId: course.id, emailOrUsername: 'ta@example.com' })
      expect(
        (
          await listCourseLearners(env.ctx(testUser(['learner'], { userId: taId })), {
            courseId: course.id,
          })
        ).total,
      ).toBe(1)
      expect(page.items[0]).toMatchObject({
        displayName: 'Amaka O.',
        progressPct: 0,
        status: 'active',
      })
      expect(JSON.stringify(page)).not.toContain('@')
      expect(await codeOf(listCourseLearners(env.ctx(buyer), { courseId: course.id }))).toBe(
        'COURSE_NOT_FOUND',
      )
      expect(learnerDisplayName('Tobi')).toBe('Tobi')

      const c = env.ctx(buyer)
      expect(await continueLearning(c)).toMatchObject({
        lessonId: video,
        positionSec: 0,
        courseSlug: course.slug,
      })
      await beat(env, buyer, video, 0, 300, 20)
      expect(await continueLearning(c)).toMatchObject({ lessonId: video, positionSec: 300 })
      await beat(env, buyer, video, 20, 1800, 20)
      expect(await continueLearning(c)).toMatchObject({ lessonId: article })
      const progress = await getCourseProgress(c, course.id)
      expect(progress.progressPct).toBe(33)
      expect(progress.lessons).toEqual([
        expect.objectContaining({ lessonId: video, status: 'completed' }),
      ])
      expect(await codeOf(getCourseProgress(env.ctx(owner), course.id))).toBe('COURSE_NOT_FOUND')
    })
  })
})
