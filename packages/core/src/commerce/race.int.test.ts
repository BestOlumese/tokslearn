import { newId, schema } from '@tokslearn/db'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, getTestDb, resetTestDb } from '@tokslearn/db/testing'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { insertUser, testUser } from '../kernel/testing'
import { entriesFor } from '../ledger'
import { people, publishCourse, setup } from '../testing'
import { addToCart, completeOrder, startCheckout } from '.'

// docs/08 §12: "3 concurrent calls → one sale entry, one set of enrollments". Real transactions
// on separate connections, so this commits to the test database (fresh ids every run).

afterAll(async () => {
  await resetTestDb()
  await closeTestDb()
})

describe('completeOrder under concurrency', () => {
  it('confirm, webhook and cron racing on one order give one sale and one enrollment', async () => {
    const db = await getTestDb()
    await seedCatalog(db)
    await seedCommission(db)
    const env = setup(db)
    const { owner, reviewer } = await people(db)
    const course = await publishCourse(env, owner, reviewer, { title: `Race ${newId()}` })
    const buyerId = await insertUser(db, {
      roles: ['learner'],
      email: `race-${newId()}@example.test`,
    })
    const buyer = env.ctx(testUser(['learner'], { userId: buyerId }))
    await addToCart(buyer, { itemType: 'course', itemId: course.id })
    const started = await startCheckout(buyer, {
      expectedTotalKobo: 1_500_000n,
      idempotencyKey: newId(),
      anonymousId: null,
    })

    const results = await Promise.all(
      (['confirm', 'webhook', 'reconcile'] as const).map((via) =>
        completeOrder(env.ctx({ kind: 'system', reason: via }), {
          reference: started.publicId,
          via,
        }),
      ),
    )
    expect(results.map((r) => r.status)).toEqual(['paid', 'paid', 'paid'])
    const entries = await entriesFor(buyer, { type: 'order', id: started.orderId })
    expect(entries.filter((e) => e.kind === 'sale')).toHaveLength(1)
    const enrollments = await db
      .select()
      .from(schema.enrollments)
      .where(eq(schema.enrollments.userId, buyerId))
    expect(enrollments).toHaveLength(1)
    const events = await db
      .select({ name: schema.outbox.eventName, payload: schema.outbox.payload })
      .from(schema.outbox)
      .where(eq(schema.outbox.eventName, 'order.paid'))
    expect(
      events.filter((e) => (e.payload as { orderId: string }).orderId === started.orderId),
    ).toHaveLength(1)
  })
})
