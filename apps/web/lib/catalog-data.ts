import 'server-only'
import { toCardDto, toPublicCourseDto, toReviewPageDto } from '@tokslearn/api'
import type {
  CategoryDirectoryDto,
  CourseCardDto,
  PublicCohortDto,
  PublicCourseDto,
  ReviewPageDto,
  ReviewSort,
} from '@tokslearn/contract'
import { isFeatureEnabled } from '@tokslearn/core/admin'
import * as catalog from '@tokslearn/core/catalog'
import * as cohorts from '@tokslearn/core/cohorts'
import * as commerce from '@tokslearn/core/commerce'
import { anonymousActor, type Ctx, cacheTags, createCtx, DomainError } from '@tokslearn/core/kernel'
import { publicFileUrl } from '@tokslearn/core/media'
import * as reviews from '@tokslearn/core/reviews'
import { getDb } from '@tokslearn/db'
import { cacheLife, cacheTag } from 'next/cache'
import { baseProviders } from './providers'

// Cached public catalog reads (docs/03 §5, docs/12 §2.4). Everything here is the same for every
// visitor, so it runs with an anonymous ctx and never reads headers or cookies. Writes invalidate
// by tag through lib/next-cache.ts: `course:{id}`, `course-slug:{slug}`, `instructor:{id}`,
// `catalog`.

function publicCtx(): Ctx {
  return createCtx({
    actor: anonymousActor,
    db: getDb(),
    requestId: 'public-cache',
    providers: baseProviders(),
  })
}

export async function getHome() {
  'use cache'
  cacheTag(cacheTags.catalog)
  cacheLife('hours')
  const ctx = publicCtx()
  const h = await catalog.getHomeRows(ctx)
  const cards = (list: catalog.CourseCard[]) => list.map((c) => toCardDto(ctx, c))
  return {
    featured: cards(h.featured),
    newest: cards(h.newest),
    free: cards(h.free),
    popular: cards(h.popular),
    startingSoon: cards(h.startingSoon),
    categories: h.categories as CategoryDirectoryDto,
    courseCount: h.courseCount,
  }
}

/** The `cohorts` flag, for public pages that offer cohort filters. */
export async function cohortsOn(): Promise<boolean> {
  'use cache'
  cacheTag(cacheTags.featureFlags)
  cacheLife('hours')
  return isFeatureEnabled(publicCtx(), 'cohorts')
}

/** The `community` flag, for navigation that links to community pages. */
export async function communityOn(): Promise<boolean> {
  'use cache'
  cacheTag(cacheTags.featureFlags)
  cacheLife('hours')
  return isFeatureEnabled(publicCtx(), 'community')
}

/** The `live_classes` flag, for navigation that links to live class pages. */
export async function liveOn(): Promise<boolean> {
  'use cache'
  cacheTag(cacheTags.featureFlags)
  cacheLife('hours')
  return isFeatureEnabled(publicCtx(), 'live_classes')
}

export async function getDirectory(): Promise<CategoryDirectoryDto> {
  'use cache'
  cacheTag(cacheTags.catalog)
  cacheLife('hours')
  return catalog.getCategoryDirectory(publicCtx())
}

export type Filters = Omit<catalog.CourseFilters, 'categoryIds' | 'limit' | 'q'> & {
  categoryId?: string | undefined
}

export async function browse(
  filters: Filters,
): Promise<{ items: CourseCardDto[]; nextCursor: string | null }> {
  'use cache'
  cacheTag(cacheTags.catalog)
  cacheLife('minutes')
  const ctx = publicCtx()
  const { categoryId, ...rest } = filters
  const page = await catalog.listCourses(ctx, {
    ...rest,
    ...(categoryId ? { categoryIds: [categoryId] } : {}),
    limit: 24,
  })
  return { items: page.items.map((c) => toCardDto(ctx, c)), nextCursor: page.nextCursor }
}

export async function search(q: string, filters: Filters) {
  'use cache'
  cacheTag(cacheTags.catalog)
  cacheLife('minutes')
  const ctx = publicCtx()
  const { categoryId, ...rest } = filters
  const [result, instructors] = await Promise.all([
    catalog.searchCourses(ctx, {
      ...rest,
      q,
      ...(categoryId ? { categoryIds: [categoryId] } : {}),
      limit: 24,
    }),
    filters.cursor ? Promise.resolve([]) : catalog.searchInstructors(ctx, q),
  ])
  return {
    items: result.items.map((c) => toCardDto(ctx, c)),
    nextCursor: result.nextCursor,
    typoMatch: result.typoMatch,
    instructors: instructors.map((i) => ({
      slug: i.slug,
      name: i.displayName,
      headline: i.headline,
      avatarUrl: publicFileUrl(ctx, i.avatarKey),
    })),
  }
}

export type CourseResult =
  | { kind: 'course'; course: PublicCourseDto }
  | { kind: 'redirect'; slug: string }
  | { kind: 'missing' }

export async function getCourse(slug: string): Promise<CourseResult> {
  'use cache'
  cacheTag(cacheTags.courseSlug(slug))
  cacheLife('hours')
  const result = await catalog.getPublicCourse(publicCtx(), slug)
  if (result.kind !== 'course') return result
  cacheTag(cacheTags.course(result.course.id), cacheTags.instructor(result.course.instructor.id))
  return { kind: 'course', course: toPublicCourseDto(result.course) }
}

/**
 * A cohort-based course's start dates (docs/10 §9). Tagged with the course, which cohort changes
 * and cohort enrolments invalidate; checkout re-checks seats, so a stale count never oversells.
 */
export async function getCourseCohorts(courseId: string): Promise<PublicCohortDto[]> {
  'use cache'
  cacheTag(cacheTags.course(courseId))
  cacheLife('minutes')
  const list = await cohorts.listCourseCohorts(publicCtx(), courseId)
  return list.map((c) => ({
    ...c,
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    closesAt: c.closesAt.toISOString(),
    opensAt: c.opensAt?.toISOString() ?? null,
  }))
}

/**
 * A course's visible reviews for the course and reviews pages (docs/10 §12). Same for every
 * visitor; tagged with the course (the rating-stats job expires it) and refreshed every few
 * minutes for helpful counts.
 */
export async function getCourseReviews(
  courseId: string,
  sort: ReviewSort,
  page: number,
  pageSize = 10,
): Promise<ReviewPageDto> {
  'use cache'
  cacheTag(cacheTags.course(courseId))
  cacheLife('minutes')
  return toReviewPageDto(
    await reviews.listCourseReviews(publicCtx(), { courseId, sort, page, pageSize }),
  )
}

export type CategoryPageData =
  | { kind: 'redirect'; slug: string }
  | {
      kind: 'category'
      category: {
        id: string
        slug: string
        name: string
        description: string | null
        count: number
      }
      parent: { id: string; slug: string; name: string } | null
      children: Array<{ id: string; slug: string; name: string; count: number }>
      instructors: Array<{
        slug: string
        name: string
        headline: string | null
        avatarUrl: string | null
        courses: number
      }>
    }

export async function getCategory(slug: string): Promise<CategoryPageData | null> {
  'use cache'
  cacheTag(cacheTags.catalog)
  cacheLife('hours')
  const ctx = publicCtx()
  const found = await catalog.getCategoryBySlug(ctx, slug)
  if (!found) return null
  if (typeof found.redirect === 'string') return { kind: 'redirect', slug: found.redirect }
  if (!('category' in found) || !found.category) return null
  const ids = [found.category.id, ...found.children.map((c) => c.id)]
  const instructors = await catalog.topInstructorsIn(ctx, ids)
  return {
    kind: 'category',
    category: {
      id: found.category.id,
      slug: found.category.slug,
      name: found.category.name,
      description: found.category.description,
      count: found.category.count,
    },
    parent: found.parent,
    children: found.children,
    instructors: instructors.map((i) => ({
      slug: i.slug,
      name: i.name,
      headline: i.headline,
      avatarUrl: publicFileUrl(ctx, i.avatarKey),
      courses: i.courses,
    })),
  }
}

export async function getInstructor(slug: string) {
  'use cache'
  cacheTag(cacheTags.catalog)
  cacheLife('hours')
  const ctx = publicCtx()
  const result = await catalog.getPublicInstructor(ctx, slug)
  if (result.kind !== 'instructor') return result
  const i = result.instructor
  cacheTag(cacheTags.instructor(i.id))
  const list = await catalog.listCourses(ctx, { instructorId: i.id, sort: 'newest', limit: 48 })
  return {
    kind: 'instructor' as const,
    instructor: {
      ...i,
      since: i.since.toISOString(),
      courses: list.items.map((c) => toCardDto(ctx, c)),
    },
  }
}

/** Slugs to prerender at build (docs/03 §5: top courses); at least one for Cache Components. */
export async function topCourseSlugs(limit = 200): Promise<string[]> {
  const page = await catalog.listCourses(publicCtx(), { sort: 'popular', limit })
  return page.items.map((c) => c.slug)
}

export type PreviewResult =
  | { kind: 'preview'; preview: Awaited<ReturnType<typeof catalog.getPreviewPlayback>> }
  | { kind: 'locked' }
  | { kind: 'missing' }

/**
 * A free preview for the preview page. Not cached: the video link is signed for 30 minutes, so
 * every visit gets a fresh one. Locked lessons send the visitor back to the course page.
 */
export async function previewLesson(courseSlug: string, lessonId: string): Promise<PreviewResult> {
  try {
    const preview = await catalog.getPreviewPlayback(publicCtx(), { courseSlug, lessonId })
    return { kind: 'preview', preview }
  } catch (e) {
    if (e instanceof DomainError && e.code === 'NOT_ENROLLED') return { kind: 'locked' }
    if (e instanceof DomainError && e.code.endsWith('_NOT_FOUND')) return { kind: 'missing' }
    throw e
  }
}

export async function sitemapRows(kind: catalog.SitemapKind) {
  'use cache'
  cacheTag(cacheTags.catalog)
  cacheLife('hours')
  return catalog.sitemapEntries(publicCtx(), kind)
}

/** Instructors with a live course, prerendered at build like the top courses. */
export async function topInstructorSlugs(limit = 200): Promise<string[]> {
  const rows = await catalog.sitemapEntries(publicCtx(), 'instructors')
  return rows.slice(0, limit).map((r) => r.slug)
}

export interface BundlePageData {
  id: string
  slug: string
  title: string
  description: string | null
  instructorName: string
  priceKobo: string
  valueKobo: string
  refundPolicyDays: number
  courses: Array<{
    id: string
    slug: string
    title: string
    priceKobo: string
    coverUrl: string | null
    refundPolicyDays: number
  }>
}

/** A live bundle for `/bundles/[slug]` (docs/20), or null. Refreshed with the catalog tag. */
export async function getBundle(slug: string): Promise<BundlePageData | null> {
  'use cache'
  cacheTag(cacheTags.catalog)
  cacheLife('hours')
  const b = await commerce.getPublicBundle(publicCtx(), slug)
  if (!b) return null
  return {
    id: b.itemId,
    slug: b.slug,
    title: b.title,
    description: b.description,
    instructorName: b.instructorName,
    priceKobo: b.priceKobo.toString(),
    valueKobo: (b.compareAtKobo ?? b.priceKobo).toString(),
    refundPolicyDays: b.refundPolicyDays,
    courses: b.courses.map((c) => ({ ...c, priceKobo: c.priceKobo.toString() })),
  }
}
