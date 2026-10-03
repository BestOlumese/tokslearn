// Local demo earnings for Tobi (instructor@tokslearn.test): three sales last month that have
// released, two this week still pending, one of those refunded, and last month's statement.
// Refuses production.
//   DATABASE_URL=… pnpm --filter @tokslearn/core seed:demo-earnings
// Needs `pnpm db:seed:demo-catalog` first.

import { createDb, type Db, schema } from '@tokslearn/db'
import { createFakeBunny } from '@tokslearn/integrations/bunny'
import { createFakePaystack } from '@tokslearn/integrations/paystack'
import { createFakeStatementRenderer } from '@tokslearn/integrations/pdf'
import { createFakeStorage } from '@tokslearn/integrations/r2'
import { eq, inArray } from 'drizzle-orm'
import {
  addToCart,
  completeOrder,
  generateStatement,
  previousMonth,
  releaseEarnings,
  requestRefund,
  sendRefund,
  settleRefunds,
  startCheckout,
} from '../commerce'
import type { Actor, UserActor } from '../kernel/actor'
import { createCtx } from '../kernel/ctx'

const TOBI = '01920000-0000-7000-8000-000000000201'
const DAY = 86_400_000
const sales = [
  { slug: 'power-bi-dashboards', daysAgo: 28, name: 'Kemi Adeyemi' },
  { slug: 'excel-for-accountants', daysAgo: 24, name: 'Musa Danjuma' },
  { slug: 'power-bi-dashboards', daysAgo: 20, name: 'Ngozi Okafor' },
  { slug: 'excel-for-accountants', daysAgo: 2, name: 'Tunde Bakare' },
  { slug: 'personal-income-tax-in-nigeria', daysAgo: 1, name: 'Aisha Lawal', refund: true },
]

const learner = (userId: string): UserActor => ({
  kind: 'user',
  userId,
  sessionId: 'demo-seed',
  roles: ['learner'],
  emailVerified: true,
  twoFactorEnabled: false,
  twoFactorVerifiedAt: null,
})

async function run(db: Db) {
  const paystack = createFakePaystack()
  const ctx = (actor: Actor) =>
    createCtx({
      db,
      actor,
      requestId: 'demo-seed',
      providers: {
        storage: createFakeStorage(),
        video: createFakeBunny().provider,
        payments: paystack.provider,
        statementPdf: createFakeStatementRenderer(),
        sessions: { revokeSession: async () => {}, revokeAllSessions: async () => {} },
        urls: { app: 'http://localhost:3000', cdn: null },
      },
    })
  const courses = await db
    .select({ id: schema.courses.id, slug: schema.courses.slug, price: schema.courses.priceKobo })
    .from(schema.courses)
    .where(inArray(schema.courses.slug, [...new Set(sales.map((s) => s.slug))]))
  if (courses.length === 0) throw new Error('Run pnpm db:seed:demo-catalog first.')
  const [already] = await db
    .select({ id: schema.orderItems.id })
    .from(schema.orderItems)
    .where(eq(schema.orderItems.instructorId, TOBI))
    .limit(1)
  if (already) {
    console.info('skip  earnings (Tobi already has sales)')
    return
  }

  const now = Date.now()
  for (const [i, s] of sales.entries()) {
    const course = courses.find((c) => c.slug === s.slug)
    if (!course) throw new Error(`missing course ${s.slug}`)
    const userId = `01920000-0000-7000-8000-00000000050${i + 1}`
    await db
      .insert(schema.user)
      .values({
        id: userId,
        name: s.name,
        email: `buyer${i + 1}@tokslearn.test`,
        emailVerified: true,
      })
      .onConflictDoNothing()
    await db.insert(schema.userRoles).values({ userId, role: 'learner' }).onConflictDoNothing()
    const me = ctx(learner(userId))
    await addToCart(me, { itemType: 'course', itemId: course.id })
    const checkout = await startCheckout(me, {
      expectedTotalKobo: course.price,
      idempotencyKey: `demo-earnings-${i + 1}`,
      anonymousId: null,
    })
    await completeOrder(me, { reference: checkout.publicId, via: 'confirm', userId })
    const paidAt = new Date(now - s.daysAgo * DAY)
    await db.update(schema.orders).set({ paidAt }).where(eq(schema.orders.id, checkout.orderId))
    const [item] = await db
      .update(schema.orderItems)
      .set({ refundableUntil: new Date(paidAt.getTime() + 7 * DAY) })
      .where(eq(schema.orderItems.orderId, checkout.orderId))
      .returning({ id: schema.orderItems.id })
    if (s.refund && item) {
      const r = await requestRefund(me, { orderItemId: item.id, reasonCode: 'changed_mind' })
      const sys = ctx({ kind: 'system', reason: 'demo-seed' })
      await sendRefund(sys, r.id)
      for (const id of paystack.refunds.keys()) paystack.settleRefund(id, 'processed')
      await settleRefunds(sys, { olderThanMs: 0 })
    }
  }

  const sys = ctx({ kind: 'system', reason: 'demo-seed' })
  const { released } = await releaseEarnings(sys)
  const month = previousMonth(new Date())
  await generateStatement(sys, { instructorId: TOBI, month })
  console.info(`earnings: ${sales.length} sales for Tobi, ${released} released, ${month} statement`)
}

const url = process.env.DATABASE_URL
if (!url) throw new Error('Set DATABASE_URL')
if (process.env.NEXT_PUBLIC_APP_ENV === 'production') {
  throw new Error('Demo earnings are for local and preview databases only.')
}
const { db, close } = createDb(url, { max: 1, tcp: true })
try {
  await run(db)
} finally {
  await close()
}
