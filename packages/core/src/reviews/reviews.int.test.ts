import { type Db, schema } from '@tokslearn/db'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { and, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { addStaff } from '../courses'
import { grantEnrollment } from '../enrollments'
import { inTransaction } from '../kernel/ctx'
import { insertUser, testUser } from '../kernel/testing'
import { codeOf, people, publishCourse, setup } from '../testing'
import {
  deleteMyReview,
  dismissReviewReports,
  getMyReview,
  listCourseReviews,
  listReviewReports,
  listStudioReviews,
  recomputeRatingStats,
  replyToReview,
  reportReview,
  saveReview,
  setReviewHidden,
  voteHelpful,
} from '.'

afterAll(closeTestDb)

const T0 = new Date('2026-10-03T09:00:00Z')

async function world(db: Db) {
  await seedCatalog(db)
  await seedCommission(db)
  const env = setup(db)
  const { owner, reviewer } = await people(db)
  const course = await publishCourse(env, owner, reviewer)
  const teach = env.ctx(owner, T0)
  const sys = env.ctx({ kind: 'system', reason: 'test' }, T0)
  let n = 0
  /** A learner, enrolled, who has done `pct` of the course. */
  const learner = async (pct = 25) => {
    n++
    const userId = await insertUser(db, { name: `Ada Learner${n}`, email: `ada${n}@example.com` })
    await db
      .update(schema.user)
      .set({ createdAt: new Date('2025-10-01T09:00:00Z') })
      .where(eq(schema.user.id, userId))
    await inTransaction(sys, (tx) =>
      grantEnrollment(tx, { userId, courseId: course.id, source: 'free', cohortId: null }),
    )
    await db
      .update(schema.enrollments)
      .set({ progressPct: pct })
      .where(and(eq(schema.enrollments.userId, userId), eq(schema.enrollments.courseId, course.id)))
    return testUser(['learner'], { userId })
  }
  return { env, owner, course, teach, sys, learner }
}

const changedEvents = async (db: Db) =>
  (await db.select().from(schema.outbox).where(eq(schema.outbox.eventName, 'review.changed')))
    .length

describe('writing a review', () => {
  it('needs 20% or 30 minutes (Phase 9 acceptance), and one review per learner per course', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      const early = await w.learner(10)
      const c = w.env.ctx(early, T0)
      const page = await getMyReview(c, w.course.slug)
      expect(page.eligibility).toMatchObject({ eligible: false, needPct: 20, needMinutes: 30 })
      expect(await codeOf(saveReview(c, { courseId: w.course.id, rating: 5, body: null }))).toBe(
        'REVIEW_NOT_ELIGIBLE',
      )

      // 30 minutes of video also counts.
      const [lesson] = await db
        .select({ id: schema.lessons.id })
        .from(schema.lessons)
        .where(eq(schema.lessons.courseId, w.course.id))
        .limit(1)
      await db.insert(schema.lessonProgress).values({
        userId: early.userId,
        lessonId: lesson?.id ?? '',
        courseId: w.course.id,
        watchedSec: 30 * 60,
      })
      await saveReview(c, { courseId: w.course.id, rating: 4, body: 'Clear examples.' })
      // Writing again edits the same review.
      const edited = await saveReview(c, {
        courseId: w.course.id,
        rating: 5,
        body: 'Clear examples and useful workbooks.',
      })
      const rows = await db
        .select()
        .from(schema.reviews)
        .where(eq(schema.reviews.courseId, w.course.id))
      expect(rows).toHaveLength(1)
      expect(edited).toMatchObject({ rating: 5, editedAt: T0 })
      // The instructor heard once, about the new review.
      const mails = (await db.select().from(schema.outbox))
        .map((o) => o.payload as { id?: string })
        .filter((p) => p.id === 'new-review')
      expect(mails).toHaveLength(1)

      const outsider = testUser(['learner'], {
        userId: await insertUser(db, { name: 'Bola Outsider', email: 'bola@example.com' }),
      })
      expect(
        await codeOf(
          saveReview(w.env.ctx(outsider, T0), { courseId: w.course.id, rating: 1, body: null }),
        ),
      ).toBe('NOT_ENROLLED')
      expect(
        await codeOf(
          saveReview(w.env.ctx(await w.learner(), T0), {
            courseId: w.course.id,
            rating: 1,
            body: 'Total mumu course',
          }),
        ),
      ).toBe('CONTENT_REJECTED')
    })
  })
})

describe('ratings and the public list', () => {
  it('hides the average below three reviews, sorts by helpful, and drops hidden reviews', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      const [a, b, c] = [await w.learner(), await w.learner(), await w.learner()]
      await saveReview(w.env.ctx(a, T0), { courseId: w.course.id, rating: 5, body: 'Great.' })
      await saveReview(w.env.ctx(b, T0), { courseId: w.course.id, rating: 4, body: null })
      await recomputeRatingStats(w.sys, w.course.id)
      let page = await listCourseReviews(w.sys, { courseId: w.course.id, sort: 'helpful', page: 0 })
      expect(page.summary).toEqual({ count: 2, avg: null, stars: null })

      await saveReview(w.env.ctx(c, T0), { courseId: w.course.id, rating: 3, body: 'Too fast.' })
      const third = (await getMyReview(w.env.ctx(c, T0), w.course.slug)).review
      await voteHelpful(w.env.ctx(a, T0), { reviewId: third?.id ?? '', on: true })
      await voteHelpful(w.env.ctx(a, T0), { reviewId: third?.id ?? '', on: true })
      expect(
        await codeOf(voteHelpful(w.env.ctx(c, T0), { reviewId: third?.id ?? '', on: true })),
      ).toBe('REVIEW_OWN')
      const stars = await recomputeRatingStats(w.sys, w.course.id)
      expect(stars).toEqual({ count: 3, avg: 4, stars: [0, 0, 1, 1, 1] })
      page = await listCourseReviews(w.env.ctx(a, T0), {
        courseId: w.course.id,
        sort: 'helpful',
        page: 0,
      })
      expect(page.summary).toEqual({ count: 3, avg: 4, stars: [0, 0, 1, 1, 1] })
      expect(page.items[0]).toMatchObject({ body: 'Too fast.', helpfulCount: 1, votedByMe: true })
      expect(page.items.map((i) => i.authorName)).toContain('Ada L.')
      const [search] = await db
        .select({ avg: schema.courseSearch.ratingAvg, count: schema.courseSearch.ratingCount })
        .from(schema.courseSearch)
        .where(eq(schema.courseSearch.courseId, w.course.id))
      expect(search).toEqual({ avg: '4.00', count: 3 })

      // Reported, then hidden by staff: off the list, out of the average, reports resolved.
      const reporter = await w.learner()
      await reportReview(w.env.ctx(reporter, T0), {
        reviewId: third?.id ?? '',
        reason: 'Not about the course',
      })
      const staffId = await insertUser(db, { name: 'Sade Support', roles: ['learner', 'support'] })
      const staff = w.env.ctx(testUser(['learner', 'support'], { userId: staffId }), T0)
      expect((await listReviewReports(staff)).map((r) => r.reports)).toEqual([1])
      expect(await codeOf(listReviewReports(w.env.ctx(a, T0)))).toBe('STAFF_ONLY')
      await setReviewHidden(staff, { reviewId: third?.id ?? '', hidden: true })
      expect(await listReviewReports(staff)).toEqual([])
      expect((await recomputeRatingStats(w.sys, w.course.id)).count).toBe(2)
      page = await listCourseReviews(w.sys, { courseId: w.course.id, sort: 'recent', page: 0 })
      expect(page.items.map((i) => i.rating).sort()).toEqual([4, 5])
      expect((await getMyReview(w.env.ctx(c, T0), w.course.slug)).review?.hidden).toBe(true)

      // A dismissed report leaves the review up.
      await reportReview(w.env.ctx(reporter, T0), {
        reviewId: page.items[0]?.id ?? '',
        reason: 'Spam?',
      })
      await dismissReviewReports(staff, page.items[0]?.id ?? '')
      expect(await listReviewReports(staff)).toEqual([])
      expect(await changedEvents(db)).toBeGreaterThan(3)
    })
  })
})

describe('instructor replies', () => {
  it('lets the instructor and co-instructors reply once (editable), TAs only read', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      const a = await w.learner()
      const mine = await saveReview(w.env.ctx(a, T0), {
        courseId: w.course.id,
        rating: 3,
        body: 'Wanted more VAT examples.',
      })
      expect(
        (await listStudioReviews(w.teach, { filter: 'unreplied', page: 0 })).items,
      ).toHaveLength(1)
      await replyToReview(w.teach, {
        reviewId: mine.id,
        body: 'Added two VAT examples in section 3.',
      })
      await replyToReview(w.teach, {
        reviewId: mine.id,
        body: 'Added three VAT examples in section 3.',
      })
      expect((await listStudioReviews(w.teach, { filter: 'unreplied', page: 0 })).items).toEqual([])
      const shown = await listCourseReviews(w.sys, {
        courseId: w.course.id,
        sort: 'recent',
        page: 0,
      })
      expect(shown.items[0]?.instructorReply?.body).toBe('Added three VAT examples in section 3.')

      const taId = await insertUser(db, { name: 'Tunde TA', email: 'ta@example.com' })
      await addStaff(w.teach, { courseId: w.course.id, emailOrUsername: 'ta@example.com' })
      const ta = w.env.ctx(testUser(['learner'], { userId: taId }), T0)
      const seen = await listStudioReviews(ta, { filter: 'all', page: 0 })
      expect(seen.items[0]).toMatchObject({ canReply: false })
      expect(await codeOf(replyToReview(ta, { reviewId: mine.id, body: 'Hi' }))).toBe(
        'NOT_COURSE_OWNER',
      )
      expect(await codeOf(replyToReview(w.env.ctx(a, T0), { reviewId: mine.id, body: 'Hi' }))).toBe(
        'REVIEW_NOT_FOUND',
      )

      // Deleted and written again: a fresh review, the old reply gone.
      await deleteMyReview(w.env.ctx(a, T0), w.course.id)
      const again = await saveReview(w.env.ctx(a, T0), {
        courseId: w.course.id,
        rating: 5,
        body: 'Much better now.',
      })
      expect(again).toMatchObject({ id: mine.id, instructorReply: null, editedAt: null })
    })
  })
})
