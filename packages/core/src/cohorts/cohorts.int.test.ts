import { type Db, schema } from '@tokslearn/db'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetFeatureFlagCache } from '../admin'
import { addToCart, completeOrder, startCheckout } from '../commerce'
import { createBundle, getStudioCourse, updateDripSettings } from '../courses'
import { enrollFree, lessonAccess } from '../enrollments'
import type { UserActor } from '../kernel/actor'
import { insertUser, testUser } from '../kernel/testing'
import { codeOf, people, publishCourse, setup } from '../testing'
import {
  createCohort,
  getMyCohort,
  getStudioCohorts,
  listCourseCohorts,
  setCohortSelling,
  setCohortStatus,
  updateCohort,
} from '.'

afterAll(closeTestDb)
beforeEach(() => resetFeatureFlagCache())

const T0 = new Date('2026-10-01T09:00:00Z')
const DAY = 86_400_000
const at = (days: number) => new Date(T0.getTime() + days * DAY)

async function enableCohorts(db: Db) {
  await db
    .insert(schema.featureFlags)
    .values({ key: 'cohorts', enabled: true })
    .onConflictDoUpdate({ target: schema.featureFlags.key, set: { enabled: true } })
}

async function world(db: Db, opts: { priceKobo?: bigint; capacity?: number | null } = {}) {
  await seedCatalog(db)
  await seedCommission(db)
  const env = setup(db)
  const { owner, reviewer } = await people(db)
  const course = await publishCourse(env, owner, reviewer, {
    ...(opts.priceKobo !== undefined ? { priceKobo: opts.priceKobo } : {}),
  })
  const teach = env.ctx(owner, T0)
  await enableCohorts(db)
  await setCohortSelling(teach, { courseId: course.id, cohortBased: true })
  const created = await createCohort(teach, {
    courseId: course.id,
    name: 'November 2026',
    startsAt: at(30),
    endsAt: at(72),
    enrollOpensAt: null,
    enrollClosesAt: null,
    capacity: opts.capacity === undefined ? 2 : opts.capacity,
  })
  const run = created.cohorts[0]
  if (!run) throw new Error('no run')
  await setCohortStatus(teach, { cohortId: run.id, status: 'open' })
  let n = 0
  const learner = async () =>
    testUser(['learner'], {
      userId: await insertUser(db, { name: `Ada Learner${++n}`, email: `ada${n}@example.com` }),
    })
  return { env, owner, reviewer, course, teach, run, learner }
}

async function buy(
  env: ReturnType<typeof setup>,
  who: UserActor,
  courseId: string,
  cohortId: string | null,
  when = T0,
) {
  const c = env.ctx(who, when)
  await addToCart(c, { itemType: 'course', itemId: courseId, cohortId })
  return startCheckout(c, {
    expectedTotalKobo: 1_500_000n,
    idempotencyKey: `buy-${who.userId}`,
    anonymousId: null,
  })
}

describe('studio', () => {
  it('needs the cohorts flag, checks run details, and keeps cohort courses out of bundles', async () => {
    await withRollback(async (db) => {
      await seedCatalog(db)
      await seedCommission(db)
      const env = setup(db)
      const { owner, reviewer } = await people(db)
      const course = await publishCourse(env, owner, reviewer)
      const other = await publishCourse(env, owner, reviewer, { title: 'Power BI Dashboards' })
      const teach = env.ctx(owner, T0)
      expect(
        await codeOf(setCohortSelling(teach, { courseId: course.id, cohortBased: true })),
      ).toBe('FEATURE_DISABLED')

      await enableCohorts(db)
      resetFeatureFlagCache()
      // In a bundle: can't switch to cohorts.
      await createBundle(teach, {
        title: 'Finance pack',
        description: null,
        priceKobo: 2_000_000n,
        courseIds: [course.id, other.id],
        status: 'active',
      })
      expect(
        await codeOf(setCohortSelling(teach, { courseId: course.id, cohortBased: true })),
      ).toBe('COURSE_IN_BUNDLE')

      const third = await publishCourse(env, owner, reviewer, { title: 'Payroll in Excel' })
      const on = await setCohortSelling(teach, { courseId: third.id, cohortBased: true })
      expect(on).toMatchObject({ enabled: true, cohortBased: true, cohorts: [] })
      expect(
        await codeOf(
          createCohort(teach, {
            courseId: third.id,
            name: 'x',
            startsAt: at(10),
            endsAt: at(5),
            enrollOpensAt: null,
            enrollClosesAt: null,
            capacity: 0,
          }),
        ),
      ).toBe('VALIDATION_FAILED')
      // And a cohort course can't go into a bundle.
      expect(
        await codeOf(
          createBundle(teach, {
            title: 'Another pack',
            description: null,
            priceKobo: 2_000_000n,
            courseIds: [third.id, other.id],
            status: 'draft',
          }),
        ),
      ).toBe('VALIDATION_FAILED')
    })
  })
})

describe('selling by start date', () => {
  it('holds seats at checkout, refuses the run when full, and enrolls buyers into their run', async () => {
    await withRollback(async (db) => {
      const w = await world(db, { capacity: 2 })
      const [a, b, c] = [await w.learner(), await w.learner(), await w.learner()]

      // A cohort course needs a date.
      expect(await codeOf(buy(w.env, a, w.course.id, null))).toBe('COHORT_REQUIRED')
      const orderA = await buy(w.env, a, w.course.id, w.run.id)
      await buy(w.env, b, w.course.id, w.run.id)
      expect(await codeOf(buy(w.env, c, w.course.id, w.run.id))).toBe('COHORT_FULL')

      const shown = await listCourseCohorts(w.env.ctx({ kind: 'anonymous' }, T0), w.course.id)
      expect(shown).toMatchObject([{ name: 'November 2026', seatsLeft: 0, availability: 'full' }])

      await completeOrder(w.env.ctx(a, T0), { reference: orderA.publicId, via: 'confirm' })
      const [enrollment] = await db
        .select({ cohortId: schema.enrollments.cohortId })
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.userId, a.userId),
            eq(schema.enrollments.courseId, w.course.id),
          ),
        )
      expect(enrollment?.cohortId).toBe(w.run.id)
      const holds = await db
        .select()
        .from(schema.cohortHolds)
        .where(eq(schema.cohortHolds.cohortId, w.run.id))
      // A's hold became membership; B's is still held.
      expect(holds.map((h) => h.userId)).toEqual([b.userId])

      // B's hold lapses after 30 minutes: the seat is C's.
      const later = new Date(T0.getTime() + 31 * 60_000)
      const orderC = await buy(w.env, c, w.course.id, w.run.id, later)
      expect(orderC.status).toBe('pending')

      // The studio sees members and seats; it can't cancel a run people joined or shrink it.
      const studio = await getStudioCohorts(w.teach, w.course.id)
      expect(studio.cohorts[0]).toMatchObject({ members: 1 })
      expect(
        await codeOf(setCohortStatus(w.teach, { cohortId: w.run.id, status: 'cancelled' })),
      ).toBe('COHORT_HAS_LEARNERS')
      expect(
        await codeOf(
          updateCohort(w.teach, {
            cohortId: w.run.id,
            name: 'November 2026',
            startsAt: at(30),
            endsAt: at(72),
            enrollOpensAt: null,
            enrollClosesAt: null,
            capacity: 1,
          }),
        ),
      ).toBe('COHORT_CAPACITY_TOO_LOW')
    })
  })

  it('closes enrolment at the start, and free runs still count seats', async () => {
    await withRollback(async (db) => {
      const w = await world(db, { priceKobo: 0n, capacity: 1 })
      const [a, b] = [await w.learner(), await w.learner()]
      expect(await codeOf(enrollFree(w.env.ctx(a, T0), w.course.id))).toBe('COHORT_REQUIRED')
      await enrollFree(w.env.ctx(a, T0), w.course.id, w.run.id)
      expect(await codeOf(enrollFree(w.env.ctx(b, T0), w.course.id, w.run.id))).toBe('COHORT_FULL')
      await updateCohort(w.teach, {
        cohortId: w.run.id,
        name: 'November 2026',
        startsAt: at(30),
        endsAt: at(72),
        enrollOpensAt: null,
        enrollClosesAt: null,
        capacity: 5,
      })
      expect(await codeOf(enrollFree(w.env.ctx(b, at(31)), w.course.id, w.run.id))).toBe(
        'COHORT_ENROLLMENT_CLOSED',
      )
    })
  })
})

describe('the cohort home and drip', () => {
  it('lists members by display name and opens lessons relative to the run start', async () => {
    await withRollback(async (db) => {
      const w = await world(db, { priceKobo: 0n, capacity: null })
      const a = await w.learner()
      await enrollFree(w.env.ctx(a, T0), w.course.id, w.run.id)
      const studio = await getStudioCourse(w.teach, w.course.id)
      const article = studio.sections[0]?.lessons.find((l) => l.type === 'article')
      if (!article) throw new Error('no article')
      await updateDripSettings(w.teach, {
        courseId: w.course.id,
        version: studio.version,
        mode: 'cohort_relative',
        lessons: [{ lessonId: article.id, offsetDays: 3, date: null }],
      })

      const home = await getMyCohort(w.env.ctx(a, T0), w.course.slug)
      expect(home).toMatchObject({
        cohort: { name: 'November 2026' },
        memberCount: 1,
        members: [{ name: 'Ada L.', isMe: true }],
        schedule: [{ title: 'Shortcuts', opensAt: at(33) }],
      })
      // Locked until 3 days after the run starts, not after enrolling.
      expect(await lessonAccess(w.env.ctx(a, at(5)), article.id)).toMatchObject({
        allowed: false,
        reason: 'locked',
        unlocksAt: at(33),
      })
      expect((await lessonAccess(w.env.ctx(a, at(34)), article.id)).allowed).toBe(true)

      // Someone without a run has no cohort home.
      const b = await w.learner()
      expect(await codeOf(getMyCohort(w.env.ctx(b, T0), w.course.slug))).toBe('COHORT_NOT_FOUND')
    })
  })

  it('shows the next open start date in the catalog', async () => {
    await withRollback(async (db) => {
      const w = await world(db, { capacity: 3 })
      const [row] = await db
        .select({
          cohortBased: schema.courseSearch.cohortBased,
          next: schema.courseSearch.nextCohortStartsAt,
        })
        .from(schema.courseSearch)
        .where(eq(schema.courseSearch.courseId, w.course.id))
      // The run starts 30 days after the test clock, so it is the next open date.
      expect(row?.cohortBased).toBe(true)
      expect(row?.next?.toISOString()).toBe(at(30).toISOString())
    })
  })
})
