import { schema } from '@tokslearn/db'
import { and, count, desc, eq, sql } from 'drizzle-orm'
import { writeAudit } from '../admin'
import { hasRole, type UserActor } from '../kernel/actor'
import type { Ctx } from '../kernel/ctx'
import { ConflictError, NotFoundError, RuleViolationError, ValidationError } from '../kernel/errors'
import { requireStaff, requireUser } from '../kernel/guards'
import type { CouponTerms } from './pricing'

// Coupons (docs/05 commerce, docs/08 §2 step 3). Instructors make coupons for their own courses in
// the studio; admins make platform coupons. One coupon per order. Validity (dates, limits) is
// checked here; whether it fits the cart is the pricing engine's job.
// Foreign reads (docs/03 §3): courses, bundles, orders.

const { coupons, couponRedemptions, courses, bundles } = schema

const CODE = /^[A-Z0-9][A-Z0-9-]{2,29}$/

/** Codes are case-insensitive: stored and compared upper-case. */
export const normalizeCode = (code: string): string => code.trim().toUpperCase()

export const canManagePlatformCoupons = (actor: UserActor): boolean =>
  hasRole(actor, 'admin', 'super_admin')

type CouponRow = typeof coupons.$inferSelect

const toTerms = (c: CouponRow): CouponTerms => ({
  id: c.id,
  code: c.code,
  instructorId: c.instructorId,
  kind: c.kind,
  percentOff: c.percentOff,
  amountOffKobo: c.amountOffKobo,
  appliesTo: c.appliesTo,
  targetId: c.targetId,
})

/**
 * A coupon the user may use right now, or the reason they can't: COUPON_INVALID (unknown,
 * switched off, not started), COUPON_EXPIRED, COUPON_LIMIT_REACHED (overall or for this user).
 */
export async function findUsableCoupon(
  ctx: Ctx,
  code: string,
  userId: string | null,
): Promise<CouponTerms> {
  const normalized = normalizeCode(code)
  if (!CODE.test(normalized)) throw new RuleViolationError('COUPON_INVALID')
  const [c] = await ctx.db.select().from(coupons).where(eq(coupons.code, normalized))
  if (!c?.active) throw new RuleViolationError('COUPON_INVALID')
  if (c.startsAt && c.startsAt > ctx.now) throw new RuleViolationError('COUPON_INVALID')
  if (c.endsAt && c.endsAt <= ctx.now) throw new RuleViolationError('COUPON_EXPIRED')
  if (c.maxRedemptions !== null && c.redemptionCount >= c.maxRedemptions) {
    throw new RuleViolationError('COUPON_LIMIT_REACHED')
  }
  if (userId) {
    const [used] = await ctx.db
      .select({ n: count() })
      .from(couponRedemptions)
      .where(and(eq(couponRedemptions.couponId, c.id), eq(couponRedemptions.userId, userId)))
    if ((used?.n ?? 0) >= c.perUserLimit) throw new RuleViolationError('COUPON_LIMIT_REACHED')
  }
  return toTerms(c)
}

export interface CouponInput {
  code: string
  kind: 'percent' | 'fixed'
  percentOff?: number | null | undefined
  amountOffKobo?: bigint | null | undefined
  appliesTo: 'course' | 'bundle' | 'instructor_all' | 'all'
  targetId?: string | null | undefined
  maxRedemptions?: number | null | undefined
  perUserLimit?: number | undefined
  startsAt?: Date | null | undefined
  endsAt?: Date | null | undefined
}

function checkTerms(input: CouponInput) {
  const issues: Array<{ path: string; message: string }> = []
  if (!CODE.test(normalizeCode(input.code))) {
    issues.push({ path: 'code', message: '3 to 30 letters, numbers or dashes.' })
  }
  if (input.kind === 'percent') {
    const p = input.percentOff ?? 0
    if (!Number.isInteger(p) || p < 1 || p > 100) {
      issues.push({ path: 'percentOff', message: 'Between 1% and 100%.' })
    }
  } else if (!input.amountOffKobo || input.amountOffKobo <= 0n) {
    issues.push({ path: 'amountOffKobo', message: 'Enter an amount above ₦0.' })
  }
  if ((input.appliesTo === 'course' || input.appliesTo === 'bundle') && !input.targetId) {
    issues.push({ path: 'targetId', message: 'Choose the course or bundle.' })
  }
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
    issues.push({ path: 'endsAt', message: 'The end date must be after the start date.' })
  }
  if (
    input.maxRedemptions !== undefined &&
    input.maxRedemptions !== null &&
    input.maxRedemptions < 1
  ) {
    issues.push({ path: 'maxRedemptions', message: 'At least 1, or leave it empty.' })
  }
  if (input.perUserLimit !== undefined && input.perUserLimit < 1) {
    issues.push({ path: 'perUserLimit', message: 'At least 1.' })
  }
  if (issues.length > 0) throw new ValidationError(issues)
}

async function insertCoupon(
  ctx: Ctx,
  actor: UserActor,
  input: CouponInput,
  instructorId: string | null,
) {
  const code = normalizeCode(input.code)
  const [taken] = await ctx.db
    .select({ id: coupons.id })
    .from(coupons)
    .where(eq(coupons.code, code))
  if (taken) throw new ConflictError('COUPON_CODE_TAKEN')
  const targeted = input.appliesTo === 'course' || input.appliesTo === 'bundle'
  const [row] = await ctx.db
    .insert(coupons)
    .values({
      instructorId,
      code,
      kind: input.kind,
      percentOff: input.kind === 'percent' ? (input.percentOff ?? null) : null,
      amountOffKobo: input.kind === 'fixed' ? (input.amountOffKobo ?? null) : null,
      appliesTo: input.appliesTo,
      targetId: targeted ? (input.targetId ?? null) : null,
      maxRedemptions: input.maxRedemptions ?? null,
      perUserLimit: input.perUserLimit ?? 1,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      createdBy: actor.userId,
    })
    .onConflictDoNothing({ target: coupons.code })
    .returning()
  if (!row) throw new ConflictError('COUPON_CODE_TAKEN')
  return row
}

/** Studio: a coupon for the instructor's own course, bundle or all their courses. */
export async function createInstructorCoupon(ctx: Ctx, input: CouponInput) {
  const actor = requireUser(ctx.actor)
  if (!hasRole(actor, 'instructor')) throw new RuleViolationError('INSTRUCTOR_REQUIRED')
  if (input.appliesTo === 'all') {
    throw new ValidationError([
      { path: 'appliesTo', message: 'Choose a course, a bundle or all your courses.' },
    ])
  }
  checkTerms(input)
  if (input.appliesTo === 'course' && input.targetId) {
    const [c] = await ctx.db
      .select({ instructorId: courses.instructorId })
      .from(courses)
      .where(eq(courses.id, input.targetId))
    if (!c || c.instructorId !== actor.userId) throw new NotFoundError('COURSE_NOT_FOUND')
  }
  if (input.appliesTo === 'bundle' && input.targetId) {
    const [b] = await ctx.db
      .select({ instructorId: bundles.instructorId })
      .from(bundles)
      .where(eq(bundles.id, input.targetId))
    if (!b || b.instructorId !== actor.userId) throw new NotFoundError('BUNDLE_NOT_FOUND')
  }
  return insertCoupon(ctx, actor, input, actor.userId)
}

/** Admin: a platform coupon (paid for by the platform's commission, docs/08 §3). */
export async function createPlatformCoupon(ctx: Ctx, input: CouponInput) {
  const actor = requireStaff(ctx.actor, canManagePlatformCoupons)
  if (input.appliesTo === 'instructor_all') {
    throw new ValidationError([
      { path: 'appliesTo', message: 'Platform coupons apply to everything or one item.' },
    ])
  }
  checkTerms(input)
  const row = await insertCoupon(ctx, actor, input, null)
  await writeAudit(ctx, {
    action: 'coupon.create',
    targetType: 'coupon',
    targetId: row.id,
    after: { code: row.code, kind: row.kind, appliesTo: row.appliesTo },
  })
  return row
}

export interface CouponView {
  id: string
  code: string
  instructorId: string | null
  kind: 'percent' | 'fixed'
  percentOff: number | null
  amountOffKobo: bigint | null
  appliesTo: 'course' | 'bundle' | 'instructor_all' | 'all'
  targetId: string | null
  targetTitle: string | null
  maxRedemptions: number | null
  perUserLimit: number
  redemptionCount: number
  /** Total discount given on paid orders. */
  discountGivenKobo: bigint
  startsAt: Date | null
  endsAt: Date | null
  active: boolean
  /** When people who saved the course(s) were told (instructor coupons, once). */
  announcedAt: Date | null
  createdAt: Date
}

async function listCoupons(ctx: Ctx, where: ReturnType<typeof eq> | undefined) {
  const rows = await ctx.db
    .select({
      coupon: coupons,
      // Qualified names: unqualified columns would bind to the subquery's tables.
      discountGiven: sql<string>`coalesce((
        select sum(o.discount_kobo) from orders o
        where o.coupon_id = "coupons"."id" and o.status = 'paid'), 0)::text`,
      targetTitle: sql<string | null>`case
        when "coupons"."applies_to" = 'course' then (
          select r.title from courses c join course_revisions r
            on r.id = coalesce(c.live_revision_id, c.draft_revision_id)
          where c.id = "coupons"."target_id")
        when "coupons"."applies_to" = 'bundle' then (
          select b.title from bundles b where b.id = "coupons"."target_id")
        end`,
    })
    .from(coupons)
    .where(where)
    .orderBy(desc(coupons.createdAt))
    .limit(200)
  return rows.map(
    (r): CouponView => ({
      id: r.coupon.id,
      code: r.coupon.code,
      instructorId: r.coupon.instructorId,
      kind: r.coupon.kind,
      percentOff: r.coupon.percentOff,
      amountOffKobo: r.coupon.amountOffKobo,
      appliesTo: r.coupon.appliesTo,
      targetId: r.coupon.targetId,
      targetTitle: r.targetTitle,
      maxRedemptions: r.coupon.maxRedemptions,
      perUserLimit: r.coupon.perUserLimit,
      redemptionCount: r.coupon.redemptionCount,
      discountGivenKobo: BigInt(r.discountGiven),
      startsAt: r.coupon.startsAt,
      endsAt: r.coupon.endsAt,
      active: r.coupon.active,
      announcedAt: r.coupon.announcedAt,
      createdAt: r.coupon.createdAt,
    }),
  )
}

/** Studio `/teach/coupons`. */
export async function listMyCoupons(ctx: Ctx): Promise<CouponView[]> {
  const actor = requireUser(ctx.actor)
  return listCoupons(ctx, eq(coupons.instructorId, actor.userId))
}

/** Admin `/admin/coupons`: platform coupons, or every coupon. */
export async function listAllCoupons(
  ctx: Ctx,
  input: { scope: 'platform' | 'all' },
): Promise<CouponView[]> {
  requireStaff(ctx.actor, canManagePlatformCoupons)
  return listCoupons(
    ctx,
    input.scope === 'platform' ? sql`${coupons.instructorId} is null` : undefined,
  )
}

/** Switch a coupon off or on. Owners manage theirs; admins manage any (audited). */
export async function setCouponActive(ctx: Ctx, input: { couponId: string; active: boolean }) {
  const actor = requireUser(ctx.actor)
  const [c] = await ctx.db.select().from(coupons).where(eq(coupons.id, input.couponId))
  if (!c) throw new NotFoundError('COUPON_NOT_FOUND')
  const owner = c.instructorId !== null && c.instructorId === actor.userId
  if (!owner) requireStaff(ctx.actor, canManagePlatformCoupons)
  await ctx.db.update(coupons).set({ active: input.active }).where(eq(coupons.id, c.id))
  if (!owner) {
    await writeAudit(ctx, {
      action: input.active ? 'coupon.activate' : 'coupon.deactivate',
      targetType: 'coupon',
      targetId: c.id,
      before: { active: c.active },
      after: { active: input.active },
    })
  }
}
