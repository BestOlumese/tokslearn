import { schema } from '@tokslearn/db'
import { and, eq, gt, isNotNull, lt, sql } from 'drizzle-orm'
import { track } from '../analytics'
import type { Ctx } from '../kernel/ctx'
import { requireUser } from '../kernel/guards'

// Streaks (docs/10 §4): a day counts once the learner completes a lesson or learns for 10
// minutes, on Africa/Lagos days. One freeze token per 7 days in a row (at most 2), spent
// automatically by the nightly rollover when a day is missed. Kept quiet in the UI.
// Foreign reads: none.

const { activityDays, streaks } = schema

export const STREAK_MINUTES = 10
const DAY_MS = 86_400_000
const MAX_TOKENS = 2

/** YYYY-MM-DD in Lagos (UTC+1 all year). */
export const lagosDay = (at: Date): string =>
  new Date(at.getTime() + 3_600_000).toISOString().slice(0, 10)

const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)

const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)

/**
 * Adds learning to today's activity row and, the first time today meets the bar, extends the
 * streak. Call inside the progress transaction. Returns the new streak length when it grew.
 */
export async function recordLearning(
  ctx: Ctx,
  input: { userId: string; learnedSec: number; lessonsCompleted: number },
): Promise<{ extendedTo: number | null }> {
  const today = lagosDay(ctx.now)
  const [day] = await ctx.db
    .insert(activityDays)
    .values({
      userId: input.userId,
      day: today,
      learnedSec: input.learnedSec,
      lessonsCompleted: input.lessonsCompleted,
    })
    .onConflictDoUpdate({
      target: [activityDays.userId, activityDays.day],
      set: {
        learnedSec: sql`${activityDays.learnedSec} + ${input.learnedSec}`,
        lessonsCompleted: sql`${activityDays.lessonsCompleted} + ${input.lessonsCompleted}`,
      },
    })
    .returning()
  if (!day || day.countedAt) return { extendedTo: null }
  if (day.lessonsCompleted < 1 && day.learnedSec < STREAK_MINUTES * 60) return { extendedTo: null }

  // First time today qualifies: claim it so concurrent heartbeats count it once.
  const [claimed] = await ctx.db
    .update(activityDays)
    .set({ countedAt: ctx.now })
    .where(
      and(
        eq(activityDays.userId, input.userId),
        eq(activityDays.day, today),
        sql`${activityDays.countedAt} is null`,
      ),
    )
    .returning({ day: activityDays.day })
  if (!claimed) return { extendedTo: null }

  await ctx.db.insert(streaks).values({ userId: input.userId }).onConflictDoNothing()
  const [streak] = await ctx.db
    .select()
    .from(streaks)
    .where(eq(streaks.userId, input.userId))
    .for('update')
  if (!streak) return { extendedTo: null }
  if (streak.lastDay === today) return { extendedTo: null }
  const current = streak.lastDay === addDays(today, -1) ? streak.current + 1 : 1
  const earned = current % 7 === 0 ? 1 : 0
  await ctx.db
    .update(streaks)
    .set({
      current,
      longest: Math.max(streak.longest, current),
      lastDay: today,
      freezeTokens: Math.min(MAX_TOKENS, streak.freezeTokens + earned),
    })
    .where(eq(streaks.userId, input.userId))
  await ctx.events.emit('streak.extended', { userId: input.userId, length: current })
  void track(ctx, 'streak_extended', { length: current }, { distinctId: input.userId })
  return { extendedTo: current }
}

/**
 * Nightly (00:15 Lagos): streaks whose last day is before yesterday either spend freeze tokens to
 * cover the missed days or end. Safe to run twice.
 */
export async function rolloverStreaks(ctx: Ctx): Promise<{ frozen: number; ended: number }> {
  const yesterday = addDays(lagosDay(ctx.now), -1)
  const behind = await ctx.db
    .select()
    .from(streaks)
    .where(and(gt(streaks.current, 0), isNotNull(streaks.lastDay), lt(streaks.lastDay, yesterday)))
  let frozen = 0
  let ended = 0
  for (const s of behind) {
    const missed = daysBetween(s.lastDay ?? yesterday, yesterday)
    if (missed <= s.freezeTokens) {
      await ctx.db
        .update(streaks)
        .set({ freezeTokens: s.freezeTokens - missed, lastDay: yesterday })
        .where(eq(streaks.userId, s.userId))
      frozen++
    } else {
      await ctx.db.update(streaks).set({ current: 0 }).where(eq(streaks.userId, s.userId))
      ended++
    }
  }
  return { frozen, ended }
}

export interface StreakView {
  current: number
  longest: number
  freezeTokens: number
  /** Today already counts. */
  todayCounted: boolean
  learnedTodaySec: number
}

/** The learner's streak as it stands now (docs/20 `/account` streak indicator). */
export async function getStreak(ctx: Ctx): Promise<StreakView> {
  const actor = requireUser(ctx.actor)
  const today = lagosDay(ctx.now)
  const [[s], [day]] = await Promise.all([
    ctx.db.select().from(streaks).where(eq(streaks.userId, actor.userId)),
    ctx.db
      .select()
      .from(activityDays)
      .where(and(eq(activityDays.userId, actor.userId), eq(activityDays.day, today))),
  ])
  // Between midnight and the rollover a broken streak can still read as alive: check here too.
  const alive =
    s?.lastDay !== null &&
    s?.lastDay !== undefined &&
    daysBetween(s.lastDay, today) <= 1 + s.freezeTokens
  return {
    current: alive ? (s?.current ?? 0) : 0,
    longest: s?.longest ?? 0,
    freezeTokens: s?.freezeTokens ?? 0,
    todayCounted: Boolean(day?.countedAt),
    learnedTodaySec: day?.learnedSec ?? 0,
  }
}
