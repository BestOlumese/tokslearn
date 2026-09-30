import { newId, schema } from '@tokslearn/db'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, getTestDb, resetTestDb } from '@tokslearn/db/testing'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { resetFeatureFlagCache } from '../admin'
import { addToCart, startCheckout } from '../commerce'
import { DomainError } from '../kernel/errors'
import { insertUser, testUser } from '../kernel/testing'
import { people, publishCourse, setup } from '../testing'
import { createCohort, setCohortSelling, setCohortStatus } from '.'

// docs/phases/phase-08 acceptance: a run's capacity can't be oversold under 50 concurrent
// checkouts. Real transactions on separate connections, so this commits (fresh ids every run).

afterAll(async () => {
  await resetTestDb()
  await closeTestDb()
})

describe('50 concurrent checkouts for a run of 10', () => {
  it('sell exactly 10 seats; everyone else is told the run is full', async () => {
    const db = await getTestDb()
    await seedCatalog(db)
    await seedCommission(db)
    await db
      .insert(schema.featureFlags)
      .values({ key: 'cohorts', enabled: true })
      .onConflictDoUpdate({ target: schema.featureFlags.key, set: { enabled: true } })
    resetFeatureFlagCache()
    const env = setup(db)
    const { owner, reviewer } = await people(db)
    const course = await publishCourse(env, owner, reviewer, { title: `Race cohort ${newId()}` })
    const now = () => new Date()
    const teach = env.ctx(owner, now())
    await setCohortSelling(teach, { courseId: course.id, cohortBased: true })
    const created = await createCohort(teach, {
      courseId: course.id,
      name: 'Race run',
      startsAt: new Date(Date.now() + 30 * 86_400_000),
      endsAt: new Date(Date.now() + 60 * 86_400_000),
      enrollOpensAt: null,
      enrollClosesAt: null,
      capacity: 10,
    })
    const run = created.cohorts[0]
    if (!run) throw new Error('no run')
    await setCohortStatus(teach, { cohortId: run.id, status: 'open' })

    const buyers = []
    for (let i = 0; i < 50; i++) {
      const userId = await insertUser(db, {
        roles: ['learner'],
        email: `race-cohort-${newId()}@example.test`,
      })
      const buyer = testUser(['learner'], { userId })
      await addToCart(env.ctx(buyer, now()), {
        itemType: 'course',
        itemId: course.id,
        cohortId: run.id,
      })
      buyers.push(buyer)
    }

    const results = await Promise.allSettled(
      buyers.map((b) =>
        startCheckout(env.ctx(b, now()), {
          expectedTotalKobo: 1_500_000n,
          idempotencyKey: 'race',
          anonymousId: null,
        }),
      ),
    )
    const sold = results.filter((r) => r.status === 'fulfilled')
    const refused = results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []))
    expect(sold).toHaveLength(10)
    expect(refused).toHaveLength(40)
    for (const e of refused) {
      expect(e).toBeInstanceOf(DomainError)
      expect((e as DomainError).code).toBe('COHORT_FULL')
    }
    const holds = await db
      .select()
      .from(schema.cohortHolds)
      .where(eq(schema.cohortHolds.cohortId, run.id))
    expect(holds).toHaveLength(10)
  }, 120_000)
})
