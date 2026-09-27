import type {
  AdminCourseRow,
  CategoryRow,
  CourseCardDto,
  PublicCourseDto,
  PublicInstructorDto,
} from '@tokslearn/contract'
import * as catalog from '@tokslearn/core/catalog'
import * as courses from '@tokslearn/core/courses'
import type { Ctx } from '@tokslearn/core/kernel'
import { NotFoundError } from '@tokslearn/core/kernel'
import { publicFileUrl } from '@tokslearn/core/media'
import { pub, staff } from '../base'

// Public catalog (docs/20 §1) and staff course/category tools. Thin: core → DTO.

export const toCardDto = (ctx: Ctx, c: catalog.CourseCard): CourseCardDto => ({
  courseId: c.courseId,
  slug: c.slug,
  title: c.title,
  subtitle: c.subtitle,
  coverUrl: publicFileUrl(ctx, c.coverKey),
  instructorName: c.instructorName,
  instructorSlug: c.instructorSlug,
  priceKobo: c.priceKobo.toString(),
  compareAtKobo: c.compareAtKobo?.toString() ?? null,
  isFree: c.isFree,
  level: c.level,
  certificateMode: c.certificateMode,
  totalDurationSec: c.totalDurationSec,
  lessonCount: c.lessonCount,
  ratingAvg: c.ratingAvg === null ? null : Number(c.ratingAvg),
  ratingCount: c.ratingCount,
  enrollmentCount: c.enrollmentCount,
  publishedAt: c.publishedAt.toISOString(),
})

export const toPublicCourseDto = (c: catalog.PublicCourse): PublicCourseDto => ({
  ...c,
  priceKobo: c.priceKobo.toString(),
  compareAtKobo: c.compareAtKobo?.toString() ?? null,
  publishedAt: c.publishedAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
  promo: c.promo ? { thumbnailUrl: c.promo.thumbnailUrl, durationSec: c.promo.durationSec } : null,
})

/** Category slug → ids to filter on (the category itself; its subcategories match by parent). */
async function categoryIds(ctx: Ctx, slug: string | undefined) {
  if (!slug) return undefined
  const found = await catalog.getCategoryBySlug(ctx, slug)
  if (!found || 'redirect' in found) return ['00000000-0000-0000-0000-000000000000']
  return [found.category.id]
}

/** Follows one redirect for old slugs; the web page issues a real 301 instead. */
async function courseBySlug(ctx: Ctx, slug: string) {
  let result = await catalog.getPublicCourse(ctx, slug)
  if (result.kind === 'redirect') result = await catalog.getPublicCourse(ctx, result.slug)
  if (result.kind !== 'course') throw new NotFoundError('COURSE_NOT_FOUND')
  return result.course
}

export const catalogPublicRouter = {
  home: pub.catalog.home.handler(async ({ context }) => {
    const h = await catalog.getHomeRows(context.ctx)
    const cards = (list: catalog.CourseCard[]) => list.map((c) => toCardDto(context.ctx, c))
    return {
      featured: cards(h.featured),
      newest: cards(h.newest),
      free: cards(h.free),
      popular: cards(h.popular),
      categories: h.categories,
      courseCount: h.courseCount,
    }
  }),
  directory: pub.catalog.directory.handler(({ context }) =>
    catalog.getCategoryDirectory(context.ctx),
  ),
}

export const coursesRouter = {
  list: pub.courses.list.handler(async ({ context, input }) => {
    const page = await catalog.listCourses(context.ctx, {
      ...input,
      categoryIds: await categoryIds(context.ctx, input.category),
    })
    return { items: page.items.map((c) => toCardDto(context.ctx, c)), nextCursor: page.nextCursor }
  }),
  search: pub.courses.search.handler(async ({ context, input }) => {
    const [result, instructors] = await Promise.all([
      catalog.searchCourses(context.ctx, {
        ...input,
        categoryIds: await categoryIds(context.ctx, input.category),
      }),
      input.cursor ? Promise.resolve([]) : catalog.searchInstructors(context.ctx, input.q),
    ])
    return {
      items: result.items.map((c) => toCardDto(context.ctx, c)),
      nextCursor: result.nextCursor,
      typoMatch: result.typoMatch,
      instructors: instructors.map((i) => ({
        slug: i.slug,
        name: i.displayName,
        headline: i.headline,
        avatarUrl: publicFileUrl(context.ctx, i.avatarKey),
      })),
    }
  }),
  getBySlug: pub.courses.getBySlug.handler(async ({ context, input }) =>
    toPublicCourseDto(await courseBySlug(context.ctx, input.slug)),
  ),
  getCurriculum: pub.courses.getCurriculum.handler(async ({ context, input }) => ({
    sections: (await courseBySlug(context.ctx, input.slug)).sections,
  })),
}

export const instructorProfileHandlers = {
  getBySlug: pub.instructors.getBySlug.handler(
    async ({ context, input }): Promise<PublicInstructorDto> => {
      let result = await catalog.getPublicInstructor(context.ctx, input.slug)
      if (result.kind === 'redirect')
        result = await catalog.getPublicInstructor(context.ctx, result.slug)
      if (result.kind !== 'instructor') throw new NotFoundError('USER_NOT_FOUND')
      const i = result.instructor
      const list = await catalog.listCourses(context.ctx, {
        instructorId: i.id,
        sort: 'newest',
        limit: 48,
      })
      return {
        ...i,
        since: i.since.toISOString(),
        courses: list.items.map((c) => toCardDto(context.ctx, c)),
      }
    },
  ),
}

export const learnRouter = {
  previewPlayback: pub.learn.previewPlayback.handler(({ context, input }) =>
    catalog.getPreviewPlayback(context.ctx, input),
  ),
}

const reviewers = staff('reviewer', 'admin', 'super_admin')
const admins = staff('admin', 'super_admin')
const ok = { ok: true as const }

export const adminCoursesRouter = {
  list: reviewers.admin.courses.list.handler(async ({ context, input }) => {
    const page = await courses.listAdminCourses(context.ctx, input)
    return {
      items: page.items.map(
        (c): AdminCourseRow => ({
          ...c,
          priceKobo: c.priceKobo.toString(),
          featuredAt: c.featuredAt?.toISOString() ?? null,
          publishedAt: c.publishedAt?.toISOString() ?? null,
          updatedAt: c.updatedAt.toISOString(),
        }),
      ),
      nextCursor: page.nextCursor,
    }
  }),
  setFeatured: reviewers.admin.courses.setFeatured.handler(async ({ context, input }) => {
    await courses.setFeatured(context.ctx, input)
    return ok
  }),
  setListing: reviewers.admin.courses.setListing.handler(async ({ context, input }) => {
    await courses.setCourseListing(context.ctx, input)
    return ok
  }),
}

const toCategoryRow = (c: Awaited<ReturnType<typeof catalog.createCategory>>): CategoryRow => ({
  id: c.id,
  slug: c.slug,
  name: c.name,
  description: c.description,
  parentId: c.parentId,
  position: c.position,
})

export const adminCategoriesRouter = {
  list: admins.admin.categories.list.handler(async ({ context }) =>
    (await catalog.listAdminCategories(context.ctx)).map((t) => ({
      ...t,
      children: t.children.map(({ children: _c, ...leaf }) => leaf),
    })),
  ),
  create: admins.admin.categories.create.handler(async ({ context, input }) =>
    toCategoryRow(await catalog.createCategory(context.ctx, input)),
  ),
  update: admins.admin.categories.update.handler(async ({ context, input }) =>
    toCategoryRow(await catalog.updateCategory(context.ctx, input)),
  ),
  move: admins.admin.categories.move.handler(async ({ context, input }) => {
    await catalog.moveCategory(context.ctx, input)
    return ok
  }),
  delete: admins.admin.categories.delete.handler(async ({ context, input }) => {
    await catalog.deleteCategory(context.ctx, input.id)
    return ok
  }),
}
