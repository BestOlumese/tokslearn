import { type Db, schema } from '@tokslearn/db'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { getStudioCourse, submitForReview, updatePricing } from '../courses'
import { grantEnrollment } from '../enrollments'
import { inTransaction } from '../kernel/ctx'
import { insertUser, testUser } from '../kernel/testing'
import { setPreference, unsubscribeByLink } from '../notifications'
import { codeOf, people, publishCourse, setup } from '../testing'
import { addToWishlist, announceCoupon, createInstructorCoupon, sendPriceDropNotices } from '.'

afterAll(closeTestDb)

const T0 = new Date('2026-10-03T09:00:00Z')

async function world(db: Db) {
  await seedCatalog(db)
  await seedCommission(db)
  const env = setup(db)
  const { owner, reviewer } = await people(db)
  const course = await publishCourse(env, owner, reviewer)
  const saver = async (n: number, opts: { emails?: boolean } = {}) => {
    const userId = await insertUser(db, { name: `Ada Saver${n}`, email: `saver${n}@example.com` })
    const actor = testUser(['learner'], { userId })
    await addToWishlist(env.ctx(actor, T0), course.id)
    if (opts.emails) {
      await setPreference(env.ctx(actor, T0), {
        type: 'wishlist.price_drop',
        channel: 'email',
        enabled: true,
      })
    }
    return { userId, actor, email: `saver${n}@example.com` }
  }
  return { env, owner, course, saver }
}

const outbox = async (db: Db, name: string) =>
  (await db.select().from(schema.outbox).where(eq(schema.outbox.eventName, name))).map(
    (o) => o.payload as Record<string, unknown>,
  )
const notices = async (db: Db, userId: string) =>
  db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId))

describe('wishlist price drops', () => {
  it('tells people who saved a course about a lower price; email only for those who opted in', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      const inApp = await w.saver(1)
      const both = await w.saver(2, { emails: true })
      const owns = await w.saver(3)
      // Already enrolled: skipped.
      await inTransaction(w.env.ctx({ kind: 'system', reason: 'test' }, T0), (tx) =>
        grantEnrollment(tx, {
          userId: owns.userId,
          courseId: w.course.id,
          source: 'free',
          cohortId: null,
        }),
      )

      // A lower price, approved (small changes approve at once).
      let s = await getStudioCourse(w.env.ctx(w.owner, T0), w.course.id)
      s = await updatePricing(w.env.ctx(w.owner, T0), {
        courseId: s.id,
        version: s.version,
        priceKobo: 1_000_000n,
        compareAtKobo: null,
        refundPolicyDays: 7,
      })
      await submitForReview(w.env.ctx(w.owner, T0), { courseId: s.id, version: s.version })
      const [drop] = await outbox(db, 'course.price_dropped')
      expect(drop).toEqual({ courseId: w.course.id, fromKobo: '1500000', toKobo: '1000000' })

      const sys = w.env.ctx({ kind: 'system', reason: 'test' }, T0)
      const input = {
        kind: 'price' as const,
        courseId: w.course.id,
        fromKobo: '1500000',
        toKobo: '1000000',
      }
      const page = await sendPriceDropNotices(sys, { ...input, after: null })
      expect(page).toMatchObject({ sent: 2, done: true })
      // Running again (a retried job) writes nothing new.
      await sendPriceDropNotices(sys, { ...input, after: null })
      expect((await notices(db, inApp.userId)).map((n) => n.title)).toEqual([
        expect.stringContaining('is now ₦10,000'),
      ])
      expect(await notices(db, owns.userId)).toEqual([])
      const mails = (await outbox(db, 'notification.email_requested')).filter(
        (p) => p.id === 'wishlist-price-drop',
      )
      expect(mails.map((m) => m.to)).toEqual([both.email])
      const data = mails[0]?.data as { unsubscribeUrl: string; oldKobo: string; newKobo: string }
      expect(data).toMatchObject({ oldKobo: '1500000', newKobo: '1000000' })

      // One click from the email turns it off; a forged link doesn't.
      const url = new URL(data.unsubscribeUrl)
      const link = {
        userId: url.searchParams.get('u') ?? '',
        type: url.searchParams.get('t') ?? '',
        signature: url.searchParams.get('s') ?? '',
      }
      expect(await codeOf(unsubscribeByLink(sys, { ...link, signature: 'nope' }))).toBe(
        'NOTIFICATION_NOT_FOUND',
      )
      expect(await unsubscribeByLink(sys, link)).toEqual({ label: 'Wishlist price drops' })
      expect(await codeOf(unsubscribeByLink(sys, { ...link, type: 'order.receipt' }))).toBe(
        'NOTIFICATION_NOT_FOUND',
      )
    })
  })

  it('lets the instructor share a live coupon with people who saved the course, once', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      const a = await w.saver(1, { emails: true })
      const teach = w.env.ctx(w.owner, T0)
      const later = await createInstructorCoupon(teach, {
        code: 'LATER',
        kind: 'percent',
        percentOff: 20,
        appliesTo: 'course',
        targetId: w.course.id,
        startsAt: new Date('2026-11-01T00:00:00Z'),
      })
      expect(await codeOf(announceCoupon(teach, later.id))).toBe('COUPON_NOT_ANNOUNCEABLE')
      const c = await createInstructorCoupon(teach, {
        code: 'OCT30',
        kind: 'percent',
        percentOff: 30,
        appliesTo: 'instructor_all',
        endsAt: new Date('2026-10-31T22:59:00Z'),
      })
      const someone = testUser(['learner'], {
        userId: await insertUser(db, { name: 'Other Teacher', roles: ['learner', 'instructor'] }),
      })
      expect(await codeOf(announceCoupon(w.env.ctx(someone, T0), c.id))).toBe('COUPON_NOT_FOUND')
      await announceCoupon(teach, c.id)
      expect(await codeOf(announceCoupon(teach, c.id))).toBe('COUPON_ALREADY_ANNOUNCED')
      expect(await outbox(db, 'coupon.announced')).toEqual([{ couponId: c.id }])

      const sys = w.env.ctx({ kind: 'system', reason: 'test' }, T0)
      await sendPriceDropNotices(sys, { kind: 'coupon', couponId: c.id, after: null })
      const [n] = await notices(db, a.userId)
      expect(n?.title).toContain('with OCT30')
      const [mail] = (await outbox(db, 'notification.email_requested')).filter(
        (p) => p.id === 'wishlist-price-drop',
      )
      expect(mail?.data).toMatchObject({
        couponCode: 'OCT30',
        oldKobo: '1500000',
        newKobo: '1050000',
        endsAt: '2026-10-31T22:59:00.000Z',
      })
    })
  })
})
