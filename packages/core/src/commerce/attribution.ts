import { publicId, schema } from '@tokslearn/db'
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm'
import { track } from '../analytics'
import type { Ctx } from '../kernel/ctx'
import { requireUser } from '../kernel/guards'
import { log } from '../kernel/logger'
import type { AttributionFacts } from './pricing'

// Attribution (docs/08 §3): referral link visits and paid-campaign landings are recorded here,
// server-side, and read back at checkout. Cookies only carry an anonymous browser id, never the
// attribution itself, so a learner can't grant an instructor 97% by editing a cookie.
// Foreign reads (docs/03 §3): courses, instructor_profiles.

const { referralLinks, attributions, courses, instructorProfiles } = schema

export const ATTRIBUTION_DAYS = 30
const windowEnd = (now: Date) => new Date(now.getTime() + ATTRIBUTION_DAYS * 86_400_000)

/**
 * `/r/{code}` (docs/20): records the visit and returns where to send the visitor. An unknown or
 * switched-off code returns null (the route sends them home). Course links fall back to the
 * instructor's profile when the course isn't live.
 */
export async function recordReferralVisit(
  ctx: Ctx,
  input: { code: string; anonymousId: string | null; userId: string | null },
): Promise<{ path: string } | null> {
  const code = input.code.trim().toLowerCase()
  if (!/^[a-z0-9-]{3,40}$/.test(code)) return null
  const [link] = await ctx.db
    .select({
      id: referralLinks.id,
      instructorId: referralLinks.instructorId,
      targetType: referralLinks.targetType,
      targetId: referralLinks.targetId,
      active: referralLinks.active,
      profileSlug: instructorProfiles.slug,
      courseSlug: courses.slug,
      courseStatus: courses.status,
    })
    .from(referralLinks)
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, referralLinks.instructorId))
    .leftJoin(courses, eq(courses.id, referralLinks.targetId))
    .where(eq(referralLinks.code, code))
  if (!link?.active) return null
  if (!input.anonymousId && !input.userId) return null

  await ctx.db.insert(attributions).values({
    userId: input.userId,
    anonymousId: input.anonymousId,
    source: 'instructor_referral',
    referralLinkId: link.id,
    instructorId: link.instructorId,
    expiresAt: windowEnd(ctx.now),
  })
  const counter = ctx.providers.clickCounter
  if (counter) {
    await counter.increment(link.id).catch((error) => {
      log('warn', 'referral click not counted', { requestId: ctx.requestId, error: String(error) })
    })
  } else {
    await ctx.db
      .update(referralLinks)
      .set({ clicks: sql`${referralLinks.clicks} + 1` })
      .where(eq(referralLinks.id, link.id))
  }
  void track(
    ctx,
    'referral_link_clicked',
    { referral_link_id: link.id, instructor_id: link.instructorId },
    { distinctId: input.userId ?? input.anonymousId ?? 'anonymous' },
  )

  const courseLive = link.courseStatus === 'published' || link.courseStatus === 'unlisted'
  if (link.targetType === 'course' && link.courseSlug && courseLive) {
    return { path: `/courses/${link.courseSlug}` }
  }
  return { path: link.profileSlug ? `/instructors/${link.profileSlug}` : '/' }
}

/** Moves counted clicks from the counter into referral_links (hourly job). */
export async function flushReferralClicks(ctx: Ctx): Promise<number> {
  const counter = ctx.providers.clickCounter
  if (!counter) return 0
  const counts = await counter.drain()
  for (const { linkId, clicks } of counts) {
    if (clicks <= 0) continue
    await ctx.db
      .update(referralLinks)
      .set({ clicks: sql`${referralLinks.clicks} + ${clicks}` })
      .where(eq(referralLinks.id, linkId))
  }
  return counts.length
}

/**
 * A landing from one of our paid campaigns (docs/08 §3 `platform_paid`). The web app only calls
 * this with a campaign cookie it signed itself.
 */
export async function recordPaidLanding(
  ctx: Ctx,
  input: { anonymousId: string | null; userId: string | null; utm: Record<string, string> },
) {
  if (!input.anonymousId && !input.userId) return
  await ctx.db.insert(attributions).values({
    userId: input.userId,
    anonymousId: input.anonymousId,
    source: 'platform_paid',
    utm: input.utm,
    expiresAt: windowEnd(ctx.now),
  })
}

/**
 * What the buyer's touches say at checkout: referral instructors and paid campaigns within the
 * window, for the user or their browser. Also claims the browser's anonymous touches for the
 * user so they count on later purchases from another device.
 */
export async function attributionFacts(
  ctx: Ctx,
  input: { anonymousId: string | null },
): Promise<AttributionFacts & { referralLinks: Map<string, string> }> {
  const actor = requireUser(ctx.actor)
  if (input.anonymousId) {
    await ctx.db
      .update(attributions)
      .set({ userId: actor.userId })
      .where(and(eq(attributions.anonymousId, input.anonymousId), isNull(attributions.userId)))
  }
  const rows = await ctx.db
    .select({
      source: attributions.source,
      instructorId: attributions.instructorId,
      referralLinkId: attributions.referralLinkId,
    })
    .from(attributions)
    .where(
      and(
        gt(attributions.expiresAt, ctx.now),
        input.anonymousId
          ? or(
              eq(attributions.userId, actor.userId),
              eq(attributions.anonymousId, input.anonymousId),
            )
          : eq(attributions.userId, actor.userId),
      ),
    )
    // Last touch wins per instructor: newest first, first seen kept.
    .orderBy(desc(attributions.createdAt))
  const referralLinks = new Map<string, string>()
  for (const r of rows) {
    if (r.source === 'instructor_referral' && r.instructorId && r.referralLinkId) {
      if (!referralLinks.has(r.instructorId)) referralLinks.set(r.instructorId, r.referralLinkId)
    }
  }
  return {
    referralInstructorIds: new Set(referralLinks.keys()),
    paidCampaign: rows.some((r) => r.source === 'platform_paid'),
    referralLinks,
  }
}

// ── Studio: referral links (docs/20 `/teach/referrals`) ────────────────────────────

export interface ReferralLinkView {
  id: string
  code: string
  /** Full link to share, e.g. https://tokslearn.com/r/k7m2qx. */
  url: string
  targetType: 'course' | 'profile'
  targetId: string | null
  targetTitle: string
  clicks: number
  sales: number
  /** What the instructor earned from these sales. */
  earnedKobo: bigint
}

const newCode = () => publicId('x', 6).slice(2).toLowerCase()

/**
 * The instructor's links: one for their profile and one per live course, created on first view.
 * Sales and earnings come from paid order items credited to each link.
 */
export async function listMyReferralLinks(ctx: Ctx): Promise<ReferralLinkView[]> {
  const actor = requireUser(ctx.actor)
  const live = await ctx.db
    .select({ id: courses.id })
    .from(courses)
    .where(
      and(
        eq(courses.instructorId, actor.userId),
        inArray(courses.status, ['published', 'unlisted']),
        isNull(courses.deletedAt),
      ),
    )
  const wanted = [
    { targetType: 'profile' as const, targetId: null },
    ...live.map((c) => ({ targetType: 'course' as const, targetId: c.id })),
  ]
  for (const w of wanted) {
    await ctx.db
      .insert(referralLinks)
      .values({ instructorId: actor.userId, code: newCode(), ...w })
      .onConflictDoNothing()
  }
  const rows = await ctx.db
    .select({
      id: referralLinks.id,
      code: referralLinks.code,
      targetType: referralLinks.targetType,
      targetId: referralLinks.targetId,
      clicks: referralLinks.clicks,
      // Qualified names: unqualified columns would bind to the subquery's tables.
      targetTitle: sql<string | null>`(
        select r.title from course_revisions r join courses c on r.id = c.live_revision_id
        where c.id = "referral_links"."target_id")`,
      sales: sql<number>`(
        select count(*)::int from order_items i join orders o on o.id = i.order_id
        where i.referral_link_id = "referral_links"."id" and o.status = 'paid' and i.status <> 'refunded')`,
      earned: sql<string>`(
        select coalesce(sum(i.instructor_share_kobo), 0)::text from order_items i
        join orders o on o.id = i.order_id
        where i.referral_link_id = "referral_links"."id" and o.status = 'paid' and i.status <> 'refunded')`,
    })
    .from(referralLinks)
    .where(and(eq(referralLinks.instructorId, actor.userId), eq(referralLinks.active, true)))
    .orderBy(referralLinks.targetType, referralLinks.createdAt)
  const app = ctx.providers.urls?.app ?? ''
  // Clicks wait in Redis until the hourly job moves them; add them so the page is current.
  const pending = ctx.providers.clickCounter
    ? await ctx.providers.clickCounter
        .peek(rows.map((r) => r.id))
        .catch(() => new Map<string, number>())
    : new Map<string, number>()
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    url: `${app}/r/${r.code}`,
    targetType: r.targetType,
    targetId: r.targetId,
    targetTitle:
      r.targetType === 'profile' ? 'Your instructor profile' : (r.targetTitle ?? 'Course'),
    clicks: r.clicks + (pending.get(r.id) ?? 0),
    sales: r.sales,
    earnedKobo: BigInt(r.earned),
  }))
}
