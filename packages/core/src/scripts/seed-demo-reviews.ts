// Local demo reviews: four learners review Excel for Accountants (one with the instructor's
// reply), then the rating is computed. Refuses production.
//   DATABASE_URL=… pnpm --filter @tokslearn/core seed:demo-reviews
// Needs `pnpm db:seed:demo-catalog` first.

import { createDb, type Db, schema } from '@tokslearn/db'
import { createFakeBunny } from '@tokslearn/integrations/bunny'
import { createFakeStorage } from '@tokslearn/integrations/r2'
import { and, eq } from 'drizzle-orm'
import { grantEnrollment } from '../enrollments'
import type { Actor, UserActor } from '../kernel/actor'
import { createCtx, inTransaction } from '../kernel/ctx'
import { recomputeRatingStats, replyToReview, saveReview } from '../reviews'

const TOBI = '01920000-0000-7000-8000-000000000201'
const people = [
  {
    id: '01920000-0000-7000-8000-000000000401',
    name: 'Funmi Adebayo',
    rating: 5,
    body: 'The bank reconciliation lesson alone was worth it. I closed March two days earlier than usual.',
  },
  {
    id: '01920000-0000-7000-8000-000000000402',
    name: 'Ifeanyi Nwosu',
    rating: 4,
    body: 'Clear and practical. I wanted more on VAT schedules, but the pivot table section is excellent.',
  },
  { id: '01920000-0000-7000-8000-000000000403', name: 'Halima Bello', rating: 5, body: null },
  {
    id: '01920000-0000-7000-8000-000000000404',
    name: 'Segun Ojo',
    rating: 3,
    body: 'Good content. The videos go a bit fast if Excel is new to you; pause often.',
  },
]

const user = (userId: string, roles: UserActor['roles']): UserActor => ({
  kind: 'user',
  userId,
  sessionId: 'demo-seed',
  roles,
  emailVerified: true,
  twoFactorEnabled: true,
  twoFactorVerifiedAt: new Date(),
})

async function run(db: Db) {
  const ctx = (actor: Actor) =>
    createCtx({
      db,
      actor,
      requestId: 'demo-seed',
      providers: {
        storage: createFakeStorage(),
        video: createFakeBunny().provider,
        sessions: { revokeSession: async () => {}, revokeAllSessions: async () => {} },
        urls: { app: 'http://localhost:3000', cdn: null },
      },
    })
  const [course] = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(eq(schema.courses.slug, 'excel-for-accountants'))
  if (!course) throw new Error('Run pnpm db:seed:demo-catalog first.')
  const [existing] = await db
    .select({ id: schema.reviews.id })
    .from(schema.reviews)
    .where(eq(schema.reviews.courseId, course.id))
  if (existing) {
    console.info('skip  reviews (already there)')
    return
  }
  const sys = ctx({ kind: 'system', reason: 'demo-seed' })
  let firstReviewId: string | null = null
  for (const [i, p] of people.entries()) {
    await db
      .insert(schema.user)
      .values({
        id: p.id,
        name: p.name,
        email: `reviewer${i + 1}@tokslearn.test`,
        emailVerified: true,
        createdAt: new Date('2026-01-10T09:00:00Z'),
      })
      .onConflictDoNothing()
    await db
      .insert(schema.userRoles)
      .values({ userId: p.id, role: 'learner' })
      .onConflictDoNothing()
    await inTransaction(sys, (tx) =>
      grantEnrollment(tx, { userId: p.id, courseId: course.id, source: 'free', cohortId: null }),
    )
    await db
      .update(schema.enrollments)
      .set({ progressPct: 40 + i * 15 })
      .where(and(eq(schema.enrollments.userId, p.id), eq(schema.enrollments.courseId, course.id)))
    const r = await saveReview(ctx(user(p.id, ['learner'])), {
      courseId: course.id,
      rating: p.rating,
      body: p.body,
    })
    firstReviewId ??= p.rating === 4 ? r.id : null
  }
  if (firstReviewId) {
    await replyToReview(ctx(user(TOBI, ['learner', 'instructor'])), {
      reviewId: firstReviewId,
      body: 'Thanks, Ifeanyi. A VAT schedules lesson is going into section three this month.',
    })
  }
  const stars = await recomputeRatingStats(sys, course.id)
  console.info(`reviews added to Excel for Accountants: ${stars.count}, average ${stars.avg}`)
}

const url = process.env.DATABASE_URL
if (!url) throw new Error('Set DATABASE_URL')
if (process.env.NEXT_PUBLIC_APP_ENV === 'production') {
  throw new Error('Demo reviews are for local and preview databases only.')
}
const { db, close } = createDb(url, { max: 1, tcp: true })
try {
  await run(db)
} finally {
  await close()
}
