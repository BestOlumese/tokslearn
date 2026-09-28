import { schema } from '@tokslearn/db'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import type { Ctx } from '../kernel/ctx'
import { publicFileUrl } from '../media'
import type { CartLine, PricedCourse } from './pricing'

// Purchasable items as checkout sees them: live price, status and instructor, read fresh from
// the courses module's tables (never from the cart or the client).
// Foreign reads (docs/03 §3): courses, course_revisions, bundles, bundle_courses, files, user,
// instructor_profiles.

const {
  courses,
  courseRevisions: revisions,
  bundles,
  bundleCourses,
  files,
  user,
  instructorProfiles,
} = schema

export type ItemRef = { itemType: 'course' | 'bundle'; itemId: string }

export interface ItemView {
  itemType: 'course' | 'bundle'
  itemId: string
  slug: string
  title: string
  instructorId: string
  instructorName: string
  coverUrl: string | null
  priceKobo: bigint
  compareAtKobo: bigint | null
  /** Courses in the item (one for a course). */
  courseIds: string[]
  /** Shortest refund window among its courses, for the cart's refund summary. */
  refundPolicyDays: number
  /** Why it can't be bought right now, if so. */
  unavailable: 'not_live' | 'free' | null
  line: CartLine
}

const live = sql`${courses.status} in ('published', 'unlisted') and ${courses.deletedAt} is null`

async function loadCourses(ctx: Ctx, ids: ReadonlyArray<string>) {
  if (ids.length === 0) return []
  return ctx.db
    .select({
      id: courses.id,
      slug: courses.slug,
      title: sql<string>`coalesce(${revisions.title}, '')`,
      instructorId: courses.instructorId,
      instructorName: sql<string>`coalesce(${instructorProfiles.displayName}, ${user.name})`,
      coverKey: files.key,
      priceKobo: courses.priceKobo,
      compareAtKobo: courses.compareAtKobo,
      refundPolicyDays: courses.refundPolicyDays,
      live: sql<boolean>`${live}`,
    })
    .from(courses)
    .leftJoin(revisions, eq(revisions.id, courses.liveRevisionId))
    .leftJoin(files, eq(files.id, revisions.coverFileId))
    .innerJoin(user, eq(user.id, courses.instructorId))
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, courses.instructorId))
    .where(inArray(courses.id, [...ids]))
}

/** Views for the given items, in the given order; unknown ids are dropped. */
export async function loadItems(ctx: Ctx, refs: ReadonlyArray<ItemRef>): Promise<ItemView[]> {
  const courseIds = refs.filter((r) => r.itemType === 'course').map((r) => r.itemId)
  const bundleIds = refs.filter((r) => r.itemType === 'bundle').map((r) => r.itemId)

  const bundleRows = bundleIds.length
    ? await ctx.db
        .select({
          id: bundles.id,
          slug: bundles.slug,
          title: bundles.title,
          instructorId: bundles.instructorId,
          instructorName: sql<string>`coalesce(${instructorProfiles.displayName}, ${user.name})`,
          priceKobo: bundles.priceKobo,
          status: bundles.status,
        })
        .from(bundles)
        .innerJoin(user, eq(user.id, bundles.instructorId))
        .leftJoin(instructorProfiles, eq(instructorProfiles.userId, bundles.instructorId))
        .where(inArray(bundles.id, bundleIds))
    : []
  const members = bundleIds.length
    ? await ctx.db
        .select({ bundleId: bundleCourses.bundleId, courseId: bundleCourses.courseId })
        .from(bundleCourses)
        .where(inArray(bundleCourses.bundleId, bundleIds))
        .orderBy(asc(bundleCourses.position))
    : []
  const courseRows = await loadCourses(ctx, [...courseIds, ...members.map((m) => m.courseId)])
  const byId = new Map(courseRows.map((c) => [c.id, c]))
  const priced = (c: (typeof courseRows)[number]): PricedCourse => ({
    id: c.id,
    title: c.title,
    instructorId: c.instructorId,
    priceKobo: c.priceKobo,
    refundPolicyDays: c.refundPolicyDays,
  })

  return refs.flatMap((ref): ItemView[] => {
    if (ref.itemType === 'course') {
      const c = byId.get(ref.itemId)
      if (!c) return []
      return [
        {
          itemType: 'course',
          itemId: c.id,
          slug: c.slug,
          title: c.title,
          instructorId: c.instructorId,
          instructorName: c.instructorName,
          coverUrl: publicFileUrl(ctx, c.coverKey),
          priceKobo: c.priceKobo,
          compareAtKobo: c.compareAtKobo,
          courseIds: [c.id],
          refundPolicyDays: c.refundPolicyDays,
          unavailable: !c.live ? 'not_live' : c.priceKobo === 0n ? 'free' : null,
          line: { type: 'course', course: priced(c) },
        },
      ]
    }
    const b = bundleRows.find((x) => x.id === ref.itemId)
    if (!b) return []
    const inBundle = members
      .filter((m) => m.bundleId === b.id)
      .flatMap((m) => {
        const c = byId.get(m.courseId)
        return c ? [c] : []
      })
    const allLive = inBundle.length >= 2 && inBundle.every((c) => c.live)
    const first = inBundle[0]
    return [
      {
        itemType: 'bundle',
        itemId: b.id,
        slug: b.slug,
        title: b.title,
        instructorId: b.instructorId,
        instructorName: b.instructorName,
        coverUrl: first ? publicFileUrl(ctx, first.coverKey) : null,
        priceKobo: b.priceKobo,
        compareAtKobo: inBundle.reduce((a, c) => a + c.priceKobo, 0n),
        courseIds: inBundle.map((c) => c.id),
        refundPolicyDays: Math.min(...inBundle.map((c) => c.refundPolicyDays), 14),
        unavailable:
          b.status !== 'active' || !allLive ? 'not_live' : b.priceKobo === 0n ? 'free' : null,
        line: {
          type: 'bundle',
          bundle: { id: b.id, instructorId: b.instructorId, priceKobo: b.priceKobo },
          courses: inBundle.map(priced),
        },
      },
    ]
  })
}

/** A live bundle for its public page (docs/20 `/bundles/[slug]`), or null. */
export async function getPublicBundle(ctx: Ctx, slug: string) {
  const [b] = await ctx.db
    .select({ id: bundles.id, description: bundles.description, status: bundles.status })
    .from(bundles)
    .where(eq(bundles.slug, slug))
  if (b?.status !== 'active') return null
  const [view] = await loadItems(ctx, [{ itemType: 'bundle', itemId: b.id }])
  if (!view || view.unavailable) return null
  const courseRows = await loadCourses(ctx, view.courseIds)
  return {
    ...view,
    description: b.description,
    courses: view.courseIds.flatMap((id) => {
      const c = courseRows.find((r) => r.id === id)
      return c
        ? [
            {
              id: c.id,
              slug: c.slug,
              title: c.title,
              priceKobo: c.priceKobo,
              coverUrl: publicFileUrl(ctx, c.coverKey),
              refundPolicyDays: c.refundPolicyDays,
            },
          ]
        : []
    }),
  }
}
