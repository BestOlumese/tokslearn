import { createRouterClient } from '@orpc/server'
import { people, publishCourse, setup } from '@tokslearn/core/fixtures'
import { type Actor, anonymousActor } from '@tokslearn/core/kernel'
import { insertUser, testUser } from '@tokslearn/core/testing'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { afterAll, describe, expect, it } from 'vitest'
import { router } from './router'
import { testContext } from './test-context'

afterAll(closeTestDb)

describe('commerce procedures', () => {
  it('runs cart → checkout → confirm → receipt with kobo as strings', async () => {
    await withRollback(async (db) => {
      await seedCatalog(db)
      await seedCommission(db)
      const env = setup(db)
      const { owner, reviewer } = await people(db)
      const course = await publishCourse(env, owner, reviewer)
      const buyerId = await insertUser(db, { roles: ['learner'] })
      const providers = {
        payments: env.paystack.provider,
        urls: { app: 'https://tokslearn.test', cdn: null },
      }
      const client = (actor: Actor = anonymousActor) =>
        createRouterClient(router, { context: testContext({ db, actor, providers }) })
      const buyer = client(testUser(['learner'], { userId: buyerId }))

      const visitor = await client().cart.preview({
        items: [{ itemType: 'course', itemId: course.id }],
      })
      expect(visitor.totalKobo).toBe('1500000')

      const cart = await buyer.cart.add({ itemType: 'course', itemId: course.id })
      expect(cart).toMatchObject({ totalKobo: '1500000', couponError: null })
      expect(await buyer.cart.count()).toEqual({ count: 1 })

      const started = await buyer.checkout.start({
        expectedTotalKobo: '1500000',
        idempotencyKey: 'checkout-1',
      })
      expect(started).toMatchObject({ status: 'pending', totalKobo: '1500000' })
      expect(started.accessCode).toBeTruthy()

      const confirmed = await buyer.checkout.confirm({ reference: started.publicId })
      expect(confirmed).toMatchObject({ status: 'paid', courses: [{ slug: course.slug }] })

      const receipt = await buyer.orders.get({ publicId: started.publicId })
      expect(receipt.items[0]).toMatchObject({ netPriceKobo: '1500000', refundPolicyDays: 7 })
      expect(typeof receipt.paidAt).toBe('string')
      expect((await buyer.orders.list({})).items).toHaveLength(1)
      expect(await buyer.enrollments.status({ courseIds: [course.id] })).toMatchObject({
        enrolled: [course.id],
      })
      expect((await buyer.enrollments.listMine({})).items[0]?.courseId).toBe(course.id)

      // Someone else can't confirm or read this order.
      const strangerId = await insertUser(db, { roles: ['learner'] })
      const stranger = client(testUser(['learner'], { userId: strangerId }))
      await expect(stranger.orders.get({ publicId: started.publicId })).rejects.toMatchObject({
        data: { code: 'ORDER_NOT_FOUND' },
      })
      await expect(
        stranger.checkout.confirm({ reference: started.publicId }),
      ).rejects.toMatchObject({
        data: { code: 'ORDER_NOT_FOUND' },
      })

      // Finance sees the sale entry; a learner doesn't get in.
      const financeId = await insertUser(db, { roles: ['learner', 'finance'] })
      const finance = client(testUser(['learner', 'finance'], { userId: financeId }))
      const detail = await finance.admin.orders.get({ orderId: started.orderId })
      expect(detail.ledger[0]?.lines.every((l) => typeof l.amountKobo === 'string')).toBe(true)
      expect(detail.items[0]).toMatchObject({
        attributionSource: 'platform_organic',
        platformRateBps: 4000,
      })
      expect((await finance.admin.ledger.integrity()).ok).toBe(true)
      await expect(buyer.admin.orders.search({})).rejects.toMatchObject({
        data: { code: 'STAFF_ONLY' },
      })
    })
  })
})
