import { schema } from '@tokslearn/db'
import { and, asc, eq, gt, inArray, ne, sql } from 'drizzle-orm'
import type { Ctx } from '../kernel/ctx'
import { NotFoundError, RuleViolationError } from '../kernel/errors'
import { availability, HOLD_MS } from './rules'

// Seats (docs/10 §9, ADR-037). A seat is taken by a member (an active or completed enrollment in
// the run) or by a live hold for a pending order. Checkout locks the runs' rows, counts, and writes
// its holds in the same transaction as the order, so concurrent checkouts queue on the lock and
// the capacity can't be exceeded.
// Foreign reads (docs/03 §3): enrollments.

const { cohorts, cohortHolds, enrollments } = schema

type CohortRow = typeof cohorts.$inferSelect

/** Seats taken per run. `exceptUserId`: that user's own holds don't count against them. */
export async function seatsTaken(
  ctx: Ctx,
  cohortIds: ReadonlyArray<string>,
  exceptUserId: string | null = null,
): Promise<Map<string, number>> {
  const taken = new Map<string, number>()
  if (cohortIds.length === 0) return taken
  const ids = [...cohortIds]
  const [members, holds] = await Promise.all([
    ctx.db
      .select({ cohortId: enrollments.cohortId, n: sql<number>`count(*)::int` })
      .from(enrollments)
      .where(
        and(
          inArray(enrollments.cohortId, ids),
          inArray(enrollments.status, ['active', 'completed']),
        ),
      )
      .groupBy(enrollments.cohortId),
    ctx.db
      .select({ cohortId: cohortHolds.cohortId, n: sql<number>`count(*)::int` })
      .from(cohortHolds)
      .where(
        and(
          inArray(cohortHolds.cohortId, ids),
          gt(cohortHolds.expiresAt, ctx.now),
          exceptUserId ? ne(cohortHolds.userId, exceptUserId) : undefined,
        ),
      )
      .groupBy(cohortHolds.cohortId),
  ])
  for (const r of [...members, ...holds]) {
    if (r.cohortId) taken.set(r.cohortId, (taken.get(r.cohortId) ?? 0) + r.n)
  }
  return taken
}

/**
 * Locks the runs (in id order, so two checkouts never deadlock) and checks each pick can be
 * joined now. Call inside the transaction that will write the order or the enrollment.
 */
async function lockAndCheck(
  tx: Ctx,
  userId: string,
  picks: ReadonlyArray<{ courseId: string; cohortId: string }>,
): Promise<Map<string, CohortRow>> {
  const ids = [...new Set(picks.map((p) => p.cohortId))].sort()
  const rows = await tx.db
    .select()
    .from(cohorts)
    .where(inArray(cohorts.id, ids))
    .orderBy(asc(cohorts.id))
    // NO KEY UPDATE: serialises checkouts on the run, but doesn't clash with the key-share
    // locks that inserting rows referencing the run (order items, enrollments) take.
    .for('no key update')
  const byId = new Map(rows.map((r) => [r.id, r]))
  const taken = await seatsTaken(tx, ids, userId)
  for (const pick of picks) {
    const run = byId.get(pick.cohortId)
    if (!run || run.courseId !== pick.courseId) throw new NotFoundError('COHORT_NOT_FOUND')
    const state = availability(run, taken.get(run.id) ?? 0, tx.now)
    if (state === 'full') throw new RuleViolationError('COHORT_FULL')
    if (state !== 'open') throw new RuleViolationError('COHORT_ENROLLMENT_CLOSED')
  }
  return byId
}

/**
 * Holds one seat per pick for a pending order, for 30 minutes (docs/10 §9). Any earlier holds
 * of this user on the same runs are replaced, so retrying checkout never double-holds.
 */
export async function reserveSeats(
  tx: Ctx,
  input: {
    orderId: string
    userId: string
    picks: ReadonlyArray<{ courseId: string; cohortId: string }>
  },
): Promise<void> {
  if (input.picks.length === 0) return
  await lockAndCheck(tx, input.userId, input.picks)
  const ids = input.picks.map((p) => p.cohortId)
  await tx.db
    .delete(cohortHolds)
    .where(and(eq(cohortHolds.userId, input.userId), inArray(cohortHolds.cohortId, ids)))
  await tx.db.insert(cohortHolds).values(
    input.picks.map((p) => ({
      cohortId: p.cohortId,
      orderId: input.orderId,
      userId: input.userId,
      expiresAt: new Date(tx.now.getTime() + HOLD_MS),
    })),
  )
}

/** For free courses: checks the run can be joined; the enrollment follows in the same transaction. */
export async function claimSeat(
  tx: Ctx,
  input: { userId: string; courseId: string; cohortId: string },
): Promise<void> {
  await lockAndCheck(tx, input.userId, [input])
}

/** The order completed (the member now counts) or ended: its holds go. */
export async function releaseOrderHolds(tx: Ctx, orderId: string): Promise<void> {
  await tx.db.delete(cohortHolds).where(eq(cohortHolds.orderId, orderId))
}
