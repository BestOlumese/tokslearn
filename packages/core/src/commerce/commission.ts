import { schema } from '@tokslearn/db'
import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm'
import { writeAudit } from '../admin'
import { hasRole, type UserActor } from '../kernel/actor'
import { type Ctx, inTransaction } from '../kernel/ctx'
import { NotFoundError, RuleViolationError, ValidationError } from '../kernel/errors'
import { requireStaff } from '../kernel/guards'
import type { AttributionSource, CommissionRule } from './pricing'

// Commission rules as data (docs/08 §3). Super admins change them in /admin/settings/commission;
// a change ends the current rule and starts a new one, so orders keep the rule they used.
// Foreign reads (docs/03 §3): user, instructor_profiles.

const { commissionRules, user, instructorProfiles } = schema

export const canManageCommission = (actor: UserActor): boolean => hasRole(actor, 'super_admin')

const toRule = (r: typeof commissionRules.$inferSelect): CommissionRule => ({
  id: r.id,
  scope: r.scope,
  instructorId: r.instructorId,
  source: r.source,
  platformRateBps: r.platformRateBps,
  startsAt: r.startsAt,
  endsAt: r.endsAt,
})

/** Rules active now, for pricing. */
export async function loadActiveRules(ctx: Ctx): Promise<CommissionRule[]> {
  const rows = await ctx.db
    .select()
    .from(commissionRules)
    .where(
      and(
        lte(commissionRules.startsAt, ctx.now),
        or(isNull(commissionRules.endsAt), gt(commissionRules.endsAt, ctx.now)),
      ),
    )
  return rows.map(toRule)
}

export interface CommissionRuleView extends CommissionRule {
  instructorName: string | null
  note: string | null
  createdAt: Date
  active: boolean
}

/** Every rule, newest first, with the instructor's name (the admin page shows history too). */
export async function listCommissionRules(ctx: Ctx): Promise<CommissionRuleView[]> {
  requireStaff(ctx.actor, canManageCommission)
  const rows = await ctx.db
    .select({
      rule: commissionRules,
      name: user.name,
      displayName: instructorProfiles.displayName,
    })
    .from(commissionRules)
    .leftJoin(user, eq(user.id, commissionRules.instructorId))
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, commissionRules.instructorId))
    .orderBy(desc(commissionRules.startsAt), desc(commissionRules.createdAt))
    .limit(300)
  return rows.map((r) => ({
    ...toRule(r.rule),
    instructorName: r.displayName ?? r.name,
    note: r.rule.note,
    createdAt: r.rule.createdAt,
    active: r.rule.startsAt <= ctx.now && (r.rule.endsAt === null || r.rule.endsAt > ctx.now),
  }))
}

function checkRate(bps: number) {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new ValidationError([{ path: 'platformRateBps', message: 'Between 0% and 100%.' }])
  }
}

/**
 * New default rate for a source, from now on. The old default ends now; orders already placed
 * keep their snapshot.
 */
export async function setDefaultRate(
  ctx: Ctx,
  input: { source: AttributionSource; platformRateBps: number; note: string },
) {
  const actor = requireStaff(ctx.actor, canManageCommission)
  checkRate(input.platformRateBps)
  return inTransaction(ctx, async (tx) => {
    const [current] = await tx.db
      .select()
      .from(commissionRules)
      .where(
        and(
          eq(commissionRules.scope, 'default'),
          eq(commissionRules.source, input.source),
          isNull(commissionRules.endsAt),
        ),
      )
      .for('update')
    if (current) {
      await tx.db
        .update(commissionRules)
        .set({ endsAt: tx.now })
        .where(eq(commissionRules.id, current.id))
    }
    const [rule] = await tx.db
      .insert(commissionRules)
      .values({
        scope: 'default',
        source: input.source,
        platformRateBps: input.platformRateBps,
        startsAt: tx.now,
        note: input.note,
        createdBy: actor.userId,
      })
      .returning()
    if (!rule) throw new Error('commission rule not inserted')
    await writeAudit(tx, {
      action: 'commission.default_changed',
      targetType: 'commission_rule',
      targetId: rule.id,
      before: current ? { platformRateBps: current.platformRateBps } : null,
      after: { source: input.source, platformRateBps: input.platformRateBps, note: input.note },
    })
    return toRule(rule)
  })
}

async function requireInstructor(ctx: Ctx, instructorId: string) {
  const [p] = await ctx.db
    .select({ userId: instructorProfiles.userId })
    .from(instructorProfiles)
    .where(eq(instructorProfiles.userId, instructorId))
  if (!p) throw new NotFoundError('USER_NOT_FOUND')
}

/**
 * An override for one instructor and source (scope `instructor`), or a dated promo (scope
 * `promo`, which wins over the override while it runs).
 */
export async function addInstructorRule(
  ctx: Ctx,
  input: {
    scope: 'instructor' | 'promo'
    instructorId: string
    source: AttributionSource
    platformRateBps: number
    startsAt?: Date | null | undefined
    endsAt?: Date | null | undefined
    note: string
  },
) {
  const actor = requireStaff(ctx.actor, canManageCommission)
  checkRate(input.platformRateBps)
  const startsAt = input.startsAt && input.startsAt > ctx.now ? input.startsAt : ctx.now
  if (input.scope === 'promo' && !input.endsAt) {
    throw new ValidationError([{ path: 'endsAt', message: 'A promo needs an end date.' }])
  }
  if (input.endsAt && input.endsAt <= startsAt) {
    throw new ValidationError([{ path: 'endsAt', message: 'The end must be after the start.' }])
  }
  await requireInstructor(ctx, input.instructorId)
  return inTransaction(ctx, async (tx) => {
    if (input.scope === 'instructor') {
      // One open override per instructor and source: end the previous one.
      await tx.db
        .update(commissionRules)
        .set({ endsAt: startsAt })
        .where(
          and(
            eq(commissionRules.scope, 'instructor'),
            eq(commissionRules.instructorId, input.instructorId),
            eq(commissionRules.source, input.source),
            or(isNull(commissionRules.endsAt), gt(commissionRules.endsAt, startsAt)),
            lte(commissionRules.startsAt, startsAt),
          ),
        )
    }
    const [rule] = await tx.db
      .insert(commissionRules)
      .values({
        scope: input.scope,
        instructorId: input.instructorId,
        source: input.source,
        platformRateBps: input.platformRateBps,
        startsAt,
        endsAt: input.endsAt ?? null,
        note: input.note,
        createdBy: actor.userId,
      })
      .returning()
    if (!rule) throw new Error('commission rule not inserted')
    await writeAudit(tx, {
      action: `commission.${input.scope}_added`,
      targetType: 'commission_rule',
      targetId: rule.id,
      after: {
        instructorId: input.instructorId,
        source: input.source,
        platformRateBps: input.platformRateBps,
        startsAt: startsAt.toISOString(),
        endsAt: input.endsAt?.toISOString() ?? null,
        note: input.note,
      },
    })
    return toRule(rule)
  })
}

/** Ends an override or promo now. Defaults can only be replaced, never ended. */
export async function endRule(ctx: Ctx, input: { ruleId: string; note: string }) {
  requireStaff(ctx.actor, canManageCommission)
  const [rule] = await ctx.db
    .select()
    .from(commissionRules)
    .where(eq(commissionRules.id, input.ruleId))
  if (!rule) throw new NotFoundError('COMMISSION_RULE_NOT_FOUND')
  if (rule.scope === 'default') throw new RuleViolationError('COMMISSION_DEFAULT_REQUIRED')
  if (rule.endsAt && rule.endsAt <= ctx.now) return
  const endsAt = rule.startsAt > ctx.now ? rule.startsAt : ctx.now
  await inTransaction(ctx, async (tx) => {
    if (endsAt.getTime() === rule.startsAt.getTime()) {
      // Not started yet: nothing ever used it. A window of 0 isn't allowed, so 1 ms.
      await tx.db
        .update(commissionRules)
        .set({ endsAt: new Date(endsAt.getTime() + 1) })
        .where(eq(commissionRules.id, rule.id))
    } else {
      await tx.db.update(commissionRules).set({ endsAt }).where(eq(commissionRules.id, rule.id))
    }
    await writeAudit(tx, {
      action: 'commission.rule_ended',
      targetType: 'commission_rule',
      targetId: rule.id,
      before: { endsAt: rule.endsAt?.toISOString() ?? null },
      after: { endsAt: endsAt.toISOString(), note: input.note },
    })
  })
}
