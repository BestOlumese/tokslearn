import { schema } from '@tokslearn/db'
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import { writeAudit } from '../admin'
import { type Ctx, inTransaction, provider } from '../kernel/ctx'
import { ConflictError, NotFoundError, RuleViolationError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { notifyMany } from '../notifications'
import { couponDiscount } from './pricing'

// Wishlist price drops (docs/23 `wishlist-price-drop`, ADR-042): when a saved course gets cheaper
// (a lower price is approved) or its instructor shares a coupon with the people who saved it.
// Opt-in: the email is off until the person turns it on; the in-app notice is on.
// Foreign reads (docs/03 §3): courses, course_revisions, instructor_profiles, enrollments, user.
// (`enrollments` only inside the not-exists filter.)

const { wishlistItems, coupons, courses, courseRevisions, instructorProfiles, user } = schema

const PAGE = 500

const naira = (kobo: bigint) =>
  `₦${(Number(kobo) / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`

/** Studio: tell the people who saved the coupon's course(s). Once per coupon. */
export async function announceCoupon(ctx: Ctx, couponId: string): Promise<{ announcedAt: Date }> {
  const me = requireUser(ctx.actor)
  return inTransaction(ctx, async (tx) => {
    const [c] = await tx.db.select().from(coupons).where(eq(coupons.id, couponId)).for('update')
    if (!c || c.instructorId !== me.userId) throw new NotFoundError('COUPON_NOT_FOUND')
    if (c.announcedAt) throw new ConflictError('COUPON_ALREADY_ANNOUNCED')
    const live =
      c.active &&
      (c.startsAt === null || c.startsAt <= tx.now) &&
      (c.endsAt === null || c.endsAt > tx.now) &&
      (c.maxRedemptions === null || c.redemptionCount < c.maxRedemptions)
    if (!live) throw new RuleViolationError('COUPON_NOT_ANNOUNCEABLE')
    if (c.appliesTo !== 'course' && c.appliesTo !== 'instructor_all') {
      throw new RuleViolationError('COUPON_NOT_ANNOUNCEABLE')
    }
    await tx.db.update(coupons).set({ announcedAt: tx.now }).where(eq(coupons.id, c.id))
    await tx.events.emit('coupon.announced', { couponId: c.id })
    await writeAudit(tx, { action: 'coupon.announced', targetType: 'coupon', targetId: c.id })
    return { announcedAt: tx.now }
  })
}

export type PriceDropInput =
  | { kind: 'price'; courseId: string; fromKobo: string; toKobo: string }
  | { kind: 'coupon'; couponId: string }

/**
 * The `wishlist-price-drop` job: one page of notices, by wishlist row. People already enrolled
 * are skipped; each person hears once per course per price (or per coupon).
 */
export async function sendPriceDropNotices(
  ctx: Ctx,
  input: PriceDropInput & { after: string | null },
): Promise<{ sent: number; after: string | null; done: boolean }> {
  const none = { sent: 0, after: null, done: true }
  let coupon: typeof coupons.$inferSelect | null = null
  let courseIds: string[]
  if (input.kind === 'coupon') {
    const [c] = await ctx.db.select().from(coupons).where(eq(coupons.id, input.couponId))
    if (!c?.active || !c.instructorId) return none
    coupon = c
    courseIds =
      c.appliesTo === 'course' && c.targetId
        ? [c.targetId]
        : (
            await ctx.db
              .select({ id: courses.id })
              .from(courses)
              .where(and(eq(courses.instructorId, c.instructorId), eq(courses.status, 'published')))
          ).map((r) => r.id)
  } else {
    courseIds = [input.courseId]
  }
  if (courseIds.length === 0) return none

  const facts = await ctx.db
    .select({
      id: courses.id,
      slug: courses.slug,
      priceKobo: courses.priceKobo,
      status: courses.status,
      title: courseRevisions.title,
      instructorName: sql<string>`coalesce(${instructorProfiles.displayName}, 'your instructor')`,
    })
    .from(courses)
    .innerJoin(courseRevisions, eq(courseRevisions.id, courses.liveRevisionId))
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, courses.instructorId))
    .where(and(inArray(courses.id, courseIds), isNull(courses.deletedAt)))
  const byId = new Map(facts.filter((f) => f.status === 'published').map((f) => [f.id, f]))
  if (byId.size === 0) return none

  // Wishlist rows have no surrogate id: page by (user, course) as one text key.
  const key = sql<string>`${wishlistItems.userId}::text || ':' || ${wishlistItems.courseId}::text`
  const rows = await ctx.db
    .select({
      userId: wishlistItems.userId,
      courseId: wishlistItems.courseId,
      key,
      name: user.name,
    })
    .from(wishlistItems)
    .innerJoin(user, eq(user.id, wishlistItems.userId))
    .where(
      and(
        inArray(wishlistItems.courseId, [...byId.keys()]),
        isNull(user.deletedAt),
        input.after ? gt(key, input.after) : undefined,
        sql`not exists (select 1 from enrollments e where e.user_id = ${wishlistItems.userId}
          and e.course_id = ${wishlistItems.courseId} and e.status in ('active', 'completed'))`,
      ),
    )
    .orderBy(asc(key))
    .limit(PAGE)

  const app = provider(ctx, 'urls').app.replace(/\/$/, '')
  const links = provider(ctx, 'unsubscribe')
  const items = rows.flatMap((r) => {
    const f = byId.get(r.courseId)
    if (!f) return []
    const oldKobo = input.kind === 'price' ? BigInt(input.fromKobo) : f.priceKobo
    const newKobo =
      input.kind === 'price'
        ? f.priceKobo
        : f.priceKobo - (coupon ? couponDiscount(coupon, f.priceKobo) : 0n)
    if (newKobo >= oldKobo) return []
    const tag = input.kind === 'price' ? `price:${newKobo}` : `coupon:${input.couponId}`
    return [
      {
        userId: r.userId,
        type: 'wishlist.price_drop' as const,
        title:
          newKobo === 0n
            ? `${f.title} is free${coupon ? ` with ${coupon.code}` : ''}`
            : `${f.title} is now ${naira(newKobo)}${coupon ? ` with ${coupon.code}` : ''}`,
        link: `/courses/${f.slug}`,
        dedupeKey: `wishlist.price_drop:${f.id}:${tag}`,
        email: {
          id: 'wishlist-price-drop' as const,
          businessKey: `${f.id}:${tag}:${r.userId}`,
          data: {
            name: r.name.split(/\s+/)[0] ?? r.name,
            courseTitle: f.title,
            instructorName: f.instructorName,
            oldKobo: oldKobo.toString(),
            newKobo: newKobo.toString(),
            couponCode: coupon?.code ?? null,
            endsAt: coupon?.endsAt?.toISOString() ?? null,
            url: `${app}/courses/${f.slug}`,
            unsubscribeUrl: links.url({ userId: r.userId, type: 'wishlist.price_drop' }),
          },
        },
      },
    ]
  })
  await notifyMany(ctx, items)
  return {
    sent: items.length,
    after: rows[rows.length - 1]?.key ?? null,
    done: rows.length < PAGE,
  }
}
