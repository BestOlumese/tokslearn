import { schema } from '@tokslearn/db'
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import type { Ctx } from '../kernel/ctx'
import { NotFoundError, RuleViolationError } from '../kernel/errors'
import { getVideoAssets, publicFileUrl, videoPreviewUrl } from '../media'
import { categoryCounts, featuredCourses, listCourses } from './search'
import { listCategoryTree } from './service'

// Public catalog reads (docs/20 §1). No user data: these are cached by the web app with
// `'use cache'` + tags (docs/03 §5), so they must not depend on who is asking.
// Foreign reads (docs/03 §3): courses, course_revisions, sections, lessons, lesson_resources,
// files, instructor_profiles, user, user_links, slug_redirects, course_search.

const {
  courses,
  courseRevisions: revisions,
  sections,
  lessons,
  lessonResources,
  files,
  instructorProfiles,
  user,
  userLinks,
  slugRedirects,
  courseSearch: cs,
  categories,
} = schema

/** Signed preview links for visitors expire sooner than staff ones (docs/09 §3). */
export const PUBLIC_PREVIEW_TTL_SEC = 30 * 60

async function redirectFor(ctx: Ctx, kind: 'course' | 'instructor' | 'category', slug: string) {
  const [row] = await ctx.db
    .select({ targetId: slugRedirects.targetId })
    .from(slugRedirects)
    .where(and(eq(slugRedirects.kind, kind), eq(slugRedirects.fromSlug, slug)))
  return row?.targetId ?? null
}

export type PublicCourseResult =
  | { kind: 'course'; course: PublicCourse }
  | { kind: 'redirect'; slug: string }
  | { kind: 'missing' }

export interface PublicLesson {
  id: string
  title: string
  type: 'video' | 'article' | 'quiz' | 'assignment' | 'live' | 'resource'
  durationSec: number
  isPreview: boolean
}

export interface PublicCourse {
  id: string
  slug: string
  status: 'published' | 'unlisted'
  title: string
  subtitle: string | null
  descriptionHtml: string | null
  outcomes: string[]
  requirements: string[]
  coverUrl: string | null
  level: 'beginner' | 'intermediate' | 'advanced' | 'all'
  language: string
  category: { name: string; slug: string } | null
  topCategory: { name: string; slug: string } | null
  priceKobo: bigint
  compareAtKobo: bigint | null
  refundPolicyDays: number
  certificateMode: 'none' | 'completion' | 'exam' | 'external'
  totalDurationSec: number
  lessonCount: number
  resourceCount: number
  enrollmentCount: number
  ratingAvg: number | null
  ratingCount: number
  publishedAt: Date
  updatedAt: Date
  instructor: {
    id: string
    name: string
    slug: string | null
    headline: string | null
    bio: string | null
    avatarUrl: string | null
  }
  promo: { lessonId: null; thumbnailUrl: string | null; durationSec: number | null } | null
  sections: Array<{ id: string; title: string; durationSec: number; lessons: PublicLesson[] }>
}

/**
 * A published or unlisted course by slug, with its live content (docs/20 `/courses/[slug]`).
 * Old slugs resolve to a redirect. Drafts, archived and deleted courses are missing.
 */
export async function getPublicCourse(ctx: Ctx, slug: string): Promise<PublicCourseResult> {
  const [row] = await ctx.db
    .select({ course: courses, revision: revisions })
    .from(courses)
    .innerJoin(revisions, eq(revisions.id, courses.liveRevisionId))
    .where(and(eq(courses.slug, slug), isNull(courses.deletedAt)))
  if (!row || (row.course.status !== 'published' && row.course.status !== 'unlisted')) {
    const target = await redirectFor(ctx, 'course', slug)
    if (target) {
      const [to] = await ctx.db
        .select({ slug: courses.slug })
        .from(courses)
        .where(eq(courses.id, target))
      if (to && to.slug !== slug) return { kind: 'redirect', slug: to.slug }
    }
    return { kind: 'missing' }
  }
  const { course: c, revision: r } = row

  const [instructor, sectionRows, lessonRows, stats, cover, categoryRows, promoAsset] =
    await Promise.all([
      ctx.db
        .select({
          name: user.name,
          displayName: instructorProfiles.displayName,
          slug: instructorProfiles.slug,
          headline: user.headline,
          bio: user.bio,
          avatarKey: user.avatarKey,
        })
        .from(user)
        .leftJoin(instructorProfiles, eq(instructorProfiles.userId, user.id))
        .where(eq(user.id, c.instructorId))
        .then((rows) => rows[0]),
      ctx.db
        .select({ id: sections.id, title: sections.title })
        .from(sections)
        .where(and(eq(sections.courseId, c.id), isNotNull(sections.liveSince)))
        .orderBy(asc(sections.position), asc(sections.id)),
      ctx.db
        .select({
          id: lessons.id,
          sectionId: lessons.sectionId,
          title: lessons.title,
          type: lessons.type,
          durationSec: lessons.durationSec,
          isPreview: lessons.isPreview,
        })
        .from(lessons)
        .where(
          and(eq(lessons.courseId, c.id), isNotNull(lessons.liveSince), isNull(lessons.deletedAt)),
        )
        .orderBy(asc(lessons.position), asc(lessons.id)),
      ctx.db
        .select({
          enrollmentCount: cs.enrollmentCount,
          ratingAvg: cs.ratingAvg,
          ratingCount: cs.ratingCount,
        })
        .from(cs)
        .where(eq(cs.courseId, c.id))
        .then((rows) => rows[0]),
      r.coverFileId
        ? ctx.db
            .select({ key: files.key })
            .from(files)
            .where(eq(files.id, r.coverFileId))
            .then((rows) => rows[0])
        : Promise.resolve(undefined),
      c.categoryId
        ? ctx.db
            .select({
              id: categories.id,
              name: categories.name,
              slug: categories.slug,
              parentId: categories.parentId,
            })
            .from(categories)
            .then((rows) => rows)
        : Promise.resolve([]),
      r.promoVideoId ? getVideoAssets(ctx, [r.promoVideoId]) : Promise.resolve(new Map()),
    ])

  const lessonIds = lessonRows.map((l) => l.id)
  const [{ n: resourceCount } = { n: 0 }] =
    lessonIds.length > 0
      ? await ctx.db
          .select({ n: count() })
          .from(lessonResources)
          .where(inArray(lessonResources.lessonId, lessonIds))
      : [{ n: 0 }]

  const category = categoryRows.find((x) => x.id === c.categoryId)
  const top = category?.parentId ? categoryRows.find((x) => x.id === category.parentId) : category
  const promo = r.promoVideoId ? promoAsset.get(r.promoVideoId) : undefined

  return {
    kind: 'course',
    course: {
      id: c.id,
      slug: c.slug,
      status: c.status === 'unlisted' ? 'unlisted' : 'published',
      title: r.title,
      subtitle: r.subtitle,
      descriptionHtml: r.descriptionHtml,
      outcomes: r.outcomes,
      requirements: r.requirements,
      coverUrl: cover ? publicFileUrl(ctx, cover.key) : null,
      level: c.level,
      language: c.language,
      category: category ? { name: category.name, slug: category.slug } : null,
      topCategory: top && top !== category ? { name: top.name, slug: top.slug } : null,
      priceKobo: c.priceKobo,
      compareAtKobo: c.compareAtKobo,
      refundPolicyDays: c.refundPolicyDays,
      certificateMode: c.certificateMode,
      totalDurationSec: c.totalDurationSec,
      lessonCount: c.lessonCount,
      resourceCount,
      enrollmentCount: stats?.enrollmentCount ?? 0,
      ratingAvg: stats?.ratingAvg ? Number(stats.ratingAvg) : null,
      ratingCount: stats?.ratingCount ?? 0,
      publishedAt: c.publishedAt ?? r.createdAt,
      updatedAt: r.reviewedAt ?? c.publishedAt ?? r.createdAt,
      instructor: {
        id: c.instructorId,
        name: instructor?.displayName ?? instructor?.name ?? 'Instructor',
        slug: instructor?.slug ?? null,
        headline: instructor?.headline ?? null,
        bio: instructor?.bio ?? null,
        avatarUrl: instructor?.avatarKey ? publicFileUrl(ctx, instructor.avatarKey) : null,
      },
      promo:
        promo && promo.status === 'ready'
          ? { lessonId: null, thumbnailUrl: promo.thumbnailUrl, durationSec: promo.durationSec }
          : null,
      sections: sectionRows.map((s) => {
        const ls = lessonRows.filter((l) => l.sectionId === s.id)
        return {
          id: s.id,
          title: s.title,
          durationSec: ls.reduce((sum, l) => sum + l.durationSec, 0),
          lessons: ls.map(({ sectionId: _s, ...l }) => l),
        }
      }),
    },
  }
}

/**
 * A free preview for visitors (docs/20 `/courses/[slug]/preview/[lessonId]`): a signed video
 * link that expires in 30 minutes, or the article text. Anything else is NOT_ENROLLED.
 */
export async function getPreviewPlayback(
  ctx: Ctx,
  input: { courseSlug: string; lessonId: string | 'promo' },
) {
  const [row] = await ctx.db
    .select({ course: courses, promoVideoId: revisions.promoVideoId, courseTitle: revisions.title })
    .from(courses)
    .innerJoin(revisions, eq(revisions.id, courses.liveRevisionId))
    .where(and(eq(courses.slug, input.courseSlug), isNull(courses.deletedAt)))
  if (!row || (row.course.status !== 'published' && row.course.status !== 'unlisted')) {
    throw new NotFoundError('COURSE_NOT_FOUND')
  }
  if (input.lessonId === 'promo') {
    const asset = row.promoVideoId
      ? (await getVideoAssets(ctx, [row.promoVideoId])).get(row.promoVideoId)
      : undefined
    if (asset?.status !== 'ready') throw new NotFoundError('LESSON_NOT_FOUND')
    return {
      courseId: row.course.id,
      courseTitle: row.courseTitle,
      lesson: { id: 'promo', title: 'Course preview', type: 'video' as const },
      embedUrl: videoPreviewUrl(ctx, asset, PUBLIC_PREVIEW_TTL_SEC),
      articleHtml: null,
    }
  }
  const [lesson] = await ctx.db
    .select()
    .from(lessons)
    .where(
      and(
        eq(lessons.id, input.lessonId),
        eq(lessons.courseId, row.course.id),
        isNotNull(lessons.liveSince),
        isNull(lessons.deletedAt),
      ),
    )
  if (!lesson) throw new NotFoundError('LESSON_NOT_FOUND')
  if (!lesson.isPreview) throw new RuleViolationError('NOT_ENROLLED')
  const asset = lesson.videoAssetId
    ? (await getVideoAssets(ctx, [lesson.videoAssetId])).get(lesson.videoAssetId)
    : undefined
  return {
    courseId: row.course.id,
    courseTitle: row.courseTitle,
    lesson: { id: lesson.id, title: lesson.title, type: lesson.type },
    embedUrl: asset ? videoPreviewUrl(ctx, asset, PUBLIC_PREVIEW_TTL_SEC) : null,
    articleHtml: lesson.type === 'article' ? lesson.articleHtml : null,
  }
}

export interface PublicInstructor {
  id: string
  slug: string
  name: string
  headline: string | null
  bio: string | null
  avatarUrl: string | null
  links: Array<{ kind: string; url: string }>
  courseCount: number
  learnerCount: number
  ratingAvg: number | null
  ratingCount: number
  since: Date
}

export type PublicInstructorResult =
  | { kind: 'instructor'; instructor: PublicInstructor }
  | { kind: 'redirect'; slug: string }
  | { kind: 'missing' }

/** Instructor profile (docs/20 `/instructors/[slug]`). Suspended or deleted accounts are missing. */
export async function getPublicInstructor(ctx: Ctx, slug: string): Promise<PublicInstructorResult> {
  const [row] = await ctx.db
    .select({ profile: instructorProfiles, u: user })
    .from(instructorProfiles)
    .innerJoin(user, eq(user.id, instructorProfiles.userId))
    .where(eq(instructorProfiles.slug, slug))
  if (!row) {
    const target = await redirectFor(ctx, 'instructor', slug)
    if (target) {
      const [to] = await ctx.db
        .select({ slug: instructorProfiles.slug })
        .from(instructorProfiles)
        .where(eq(instructorProfiles.userId, target))
      if (to) return { kind: 'redirect', slug: to.slug }
    }
    return { kind: 'missing' }
  }
  if (row.u.deletedAt || row.u.banned) return { kind: 'missing' }
  const [links, [stats]] = await Promise.all([
    ctx.db
      .select({ kind: userLinks.kind, url: userLinks.url })
      .from(userLinks)
      .where(eq(userLinks.userId, row.u.id))
      .orderBy(asc(userLinks.position)),
    ctx.db
      .select({
        courses: count(),
        learners: sql<number>`coalesce(sum(${cs.enrollmentCount}), 0)::int`,
        ratingCount: sql<number>`coalesce(sum(${cs.ratingCount}), 0)::int`,
        ratingWeighted: sql<number>`coalesce(sum(${cs.ratingAvg} * ${cs.ratingCount}), 0)::float`,
      })
      .from(cs)
      .where(eq(cs.instructorId, row.u.id)),
  ])
  const ratingCount = stats?.ratingCount ?? 0
  return {
    kind: 'instructor',
    instructor: {
      id: row.u.id,
      slug: row.profile.slug,
      name: row.profile.displayName,
      headline: row.u.headline,
      bio: row.u.bio,
      avatarUrl: row.u.avatarKey ? publicFileUrl(ctx, row.u.avatarKey) : null,
      links,
      courseCount: stats?.courses ?? 0,
      learnerCount: stats?.learners ?? 0,
      ratingAvg: ratingCount >= 3 ? (stats?.ratingWeighted ?? 0) / ratingCount : null,
      ratingCount,
      since: row.profile.approvedAt,
    },
  }
}

/** Categories with course counts, for the home page and `/categories` (docs/20 §1). */
export async function getCategoryDirectory(ctx: Ctx) {
  const [tree, counts] = await Promise.all([listCategoryTree(ctx), categoryCounts(ctx)])
  const descriptions = new Map(
    (
      await ctx.db
        .select({ id: categories.id, description: categories.description })
        .from(categories)
        .where(isNull(categories.parentId))
    ).map((r) => [r.id, r.description]),
  )
  return tree.map((top) => ({
    ...top,
    description: descriptions.get(top.id) ?? null,
    count: counts.get(top.id) ?? 0,
    children: top.children.map((c) => ({ ...c, count: counts.get(c.id) ?? 0 })),
  }))
}

export type CategoryDirectory = Awaited<ReturnType<typeof getCategoryDirectory>>

/** One category (top or sub) by slug, with its parent and children. */
export async function getCategoryBySlug(ctx: Ctx, slug: string) {
  const directory = await getCategoryDirectory(ctx)
  for (const top of directory) {
    if (top.slug === slug) return { category: top, parent: null, children: top.children }
    const child = top.children.find((c) => c.slug === slug)
    if (child) {
      return {
        category: { ...child, description: null as string | null },
        parent: { id: top.id, slug: top.slug, name: top.name },
        children: [],
      }
    }
  }
  const target = await redirectFor(ctx, 'category', slug)
  if (target) {
    const match = directory.flatMap((t) => [t, ...t.children]).find((c) => c.id === target)
    if (match) return { redirect: match.slug }
  }
  return null
}

/** Instructors with the most courses in a category (the category page's instructor row). */
export async function topInstructorsIn(ctx: Ctx, categoryIds: ReadonlyArray<string>, limit = 4) {
  if (categoryIds.length === 0) return []
  const ids = [...categoryIds]
  return ctx.db
    .select({
      slug: instructorProfiles.slug,
      name: instructorProfiles.displayName,
      headline: user.headline,
      avatarKey: user.avatarKey,
      courses: count(),
    })
    .from(cs)
    .innerJoin(instructorProfiles, eq(instructorProfiles.userId, cs.instructorId))
    .innerJoin(user, eq(user.id, cs.instructorId))
    .where(sql`(${inArray(cs.categoryId, ids)} or ${inArray(cs.parentCategoryId, ids)})`)
    .groupBy(instructorProfiles.slug, instructorProfiles.displayName, user.headline, user.avatarKey)
    .orderBy(desc(count()))
    .limit(limit)
}

/** Home page rows (docs/20 `/`); empty rows are left out by the page. */
export async function getHomeRows(ctx: Ctx) {
  const [featured, newest, free, popular, directory] = await Promise.all([
    featuredCourses(ctx),
    listCourses(ctx, { sort: 'newest', limit: 8 }),
    listCourses(ctx, { price: 'free', sort: 'newest', limit: 8 }),
    listCourses(ctx, { sort: 'popular', limit: 8 }),
    getCategoryDirectory(ctx),
  ])
  const total = directory.reduce((sum, t) => sum + t.count, 0)
  return {
    featured,
    newest: newest.items,
    free: free.items,
    popular: popular.items,
    categories: directory,
    courseCount: total,
  }
}
