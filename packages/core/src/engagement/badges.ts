import { schema } from '@tokslearn/db'
import { and, asc, count, eq, isNull, sql } from 'drizzle-orm'
import { track } from '../analytics'
import type { Ctx } from '../kernel/ctx'
import { requireUser } from '../kernel/guards'

// Badges (docs/10 §4): definitions and criteria are data (seeded); awarding is idempotent and
// runs from events (lesson and course completed, streak extended). Kinds this phase can judge:
// lessons_completed, courses_completed, streak. Certificates, quiz scores and accepted answers
// start counting in Phases 6–8.
// Foreign reads (docs/03 §3): lesson_progress, enrollments, user (the badges_public choice).

const { badges, userBadges, streaks, lessonProgress, enrollments, user } = schema

type Criteria =
  | { kind: 'lessons_completed'; count: number }
  | { kind: 'courses_completed'; count: number }
  | { kind: 'streak'; days: number }
  | { kind: string }

/** Awards every badge the user now qualifies for. Returns the codes newly awarded. */
export async function evaluateBadges(ctx: Ctx, userId: string): Promise<string[]> {
  const [defs, [lessons], [courses], [streak], owned] = await Promise.all([
    ctx.db.select().from(badges),
    ctx.db
      .select({ n: count() })
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.status, 'completed'))),
    ctx.db
      .select({ n: count() })
      .from(enrollments)
      .where(and(eq(enrollments.userId, userId), eq(enrollments.status, 'completed'))),
    ctx.db.select({ longest: streaks.longest }).from(streaks).where(eq(streaks.userId, userId)),
    ctx.db
      .select({ badgeId: userBadges.badgeId })
      .from(userBadges)
      .where(eq(userBadges.userId, userId)),
  ])
  const have = new Set(owned.map((o) => o.badgeId))
  const facts = {
    lessons: lessons?.n ?? 0,
    courses: courses?.n ?? 0,
    streak: streak?.longest ?? 0,
  }
  const met = (c: Criteria): boolean => {
    if (c.kind === 'lessons_completed' && 'count' in c) return facts.lessons >= c.count
    if (c.kind === 'courses_completed' && 'count' in c) return facts.courses >= c.count
    if (c.kind === 'streak' && 'days' in c) return facts.streak >= c.days
    return false
  }
  const awarded: string[] = []
  for (const b of defs) {
    if (have.has(b.id) || !met(b.criteria as Criteria)) continue
    const [row] = await ctx.db
      .insert(userBadges)
      .values({ userId, badgeId: b.id, awardedAt: ctx.now })
      .onConflictDoNothing()
      .returning({ badgeId: userBadges.badgeId })
    if (row) {
      awarded.push(b.code)
      void track(ctx, 'badge_awarded', { badge_code: b.code }, { distinctId: userId })
    }
  }
  return awarded
}

export interface BadgeView {
  code: string
  name: string
  description: string
  iconKey: string
  awardedAt: Date | null
}

/** Earned and locked badges with their criteria (docs/20 `/account/badges`). */
export async function listBadges(ctx: Ctx): Promise<BadgeView[]> {
  const actor = requireUser(ctx.actor)
  const rows = await ctx.db
    .select({
      code: badges.code,
      name: badges.name,
      description: badges.description,
      iconKey: badges.iconKey,
      awardedAt: sql<Date | null>`(select ub.awarded_at from user_badges ub where ub.badge_id = "badges"."id" and ub.user_id = ${actor.userId})`,
    })
    .from(badges)
    .orderBy(asc(badges.position))
  return rows.map((r) => ({ ...r, awardedAt: r.awardedAt ? new Date(r.awardedAt) : null }))
}

/**
 * Earned badges for the public profile (docs/10 §4, ADR-042): empty unless the person chose to
 * show them (`user.badges_public`, identity's column, read here). Public: no viewer needed.
 */
export async function publicBadges(
  ctx: Ctx,
  username: string,
): Promise<Array<{ code: string; name: string; description: string; awardedAt: Date }>> {
  const [person] = await ctx.db
    .select({ id: user.id, show: user.badgesPublic })
    .from(user)
    .where(and(eq(user.username, username.toLowerCase()), isNull(user.deletedAt)))
  if (!person?.show) return []
  return ctx.db
    .select({
      code: badges.code,
      name: badges.name,
      description: badges.description,
      awardedAt: userBadges.awardedAt,
    })
    .from(userBadges)
    .innerJoin(badges, eq(badges.id, userBadges.badgeId))
    .where(eq(userBadges.userId, person.id))
    .orderBy(asc(badges.position))
}
