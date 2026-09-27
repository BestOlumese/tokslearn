import { schema } from '@tokslearn/db'
import { and, desc, eq, ilike, isNull, lt, or, sql } from 'drizzle-orm'
import { writeAudit } from '../admin'
import { reindexCourse } from '../catalog'
import { cacheTags } from '../kernel/cache'
import { type Ctx, inTransaction } from '../kernel/ctx'
import { ConflictError, NotFoundError, RuleViolationError } from '../kernel/errors'
import { requireStaff, requireUser } from '../kernel/guards'
import * as repo from './repo'
import { canEditCourse, canReviewCourses } from './rules'

// Staff course tools (docs/20 `/admin/courses`) and slug changes. Every change reindexes the
// catalog row and invalidates the course's cache tags. Foreign read: user (instructor name).

const { courses, courseRevisions: revisions, user, slugRedirects } = schema

export type AdminCourseFilter =
  | 'all'
  | 'published'
  | 'in_review'
  | 'changes_requested'
  | 'draft'
  | 'unlisted'
  | 'archived'

const encode = (at: Date, id: string) =>
  Buffer.from(`${at.toISOString()}|${id}`).toString('base64url')
function decode(cursor: string | undefined) {
  if (!cursor) return null
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
  const at = new Date(iso ?? '')
  return id && !Number.isNaN(at.getTime()) ? { at, id } : null
}

export async function listAdminCourses(
  ctx: Ctx,
  input: {
    status: AdminCourseFilter
    q?: string | undefined
    cursor?: string | undefined
    limit: number
  },
) {
  requireStaff(ctx.actor, canReviewCourses)
  const after = decode(input.cursor)
  const q = input.q?.trim()
  const rows = await ctx.db
    .select({
      id: courses.id,
      slug: courses.slug,
      status: courses.status,
      title: revisions.title,
      instructorName: user.name,
      priceKobo: courses.priceKobo,
      featuredAt: courses.featuredAt,
      publishedAt: courses.publishedAt,
      updatedAt: courses.updatedAt,
    })
    .from(courses)
    .innerJoin(
      revisions,
      eq(revisions.id, sql`coalesce(${courses.liveRevisionId}, ${courses.draftRevisionId})`),
    )
    .innerJoin(user, eq(user.id, courses.instructorId))
    .where(
      and(
        isNull(courses.deletedAt),
        input.status === 'all' ? undefined : eq(courses.status, input.status),
        q
          ? or(ilike(revisions.title, `%${q.replace(/[%_]/g, '')}%`), eq(courses.slug, q))
          : undefined,
        after
          ? or(
              lt(courses.updatedAt, after.at),
              and(eq(courses.updatedAt, after.at), lt(courses.id, after.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(courses.updatedAt), desc(courses.id))
    .limit(input.limit + 1)
  const page = rows.slice(0, input.limit)
  const last = page.at(-1)
  return {
    items: page,
    nextCursor: rows.length > input.limit && last ? encode(last.updatedAt, last.id) : null,
  }
}

async function afterListingChange(ctx: Ctx, course: repo.CourseRow) {
  await ctx.cache.invalidate([
    cacheTags.course(course.id),
    cacheTags.courseSlug(course.slug),
    cacheTags.catalog,
    cacheTags.instructor(course.instructorId),
  ])
}

/** Shows or hides a live course in the home page's featured row. */
export async function setFeatured(
  ctx: Ctx,
  input: { courseId: string; featured: boolean; reason: string },
) {
  requireStaff(ctx.actor, canReviewCourses)
  const course = await inTransaction(ctx, async (tx) => {
    const c = await repo.lockCourse(tx.db, input.courseId)
    if (!c) throw new NotFoundError('COURSE_NOT_FOUND')
    if (c.status !== 'published') throw new RuleViolationError('COURSE_UNAVAILABLE')
    await repo.updateCourse(tx.db, c.id, { featuredAt: input.featured ? tx.now : null })
    await reindexCourse(tx, c.id)
    await writeAudit(tx, {
      action: input.featured ? 'course.feature' : 'course.unfeature',
      targetType: 'course',
      targetId: c.id,
      after: { reason: input.reason },
    })
    return c
  })
  await afterListingChange(ctx, course)
}

/**
 * Unpublish (policy or quality problem): off the catalog and not for sale; learners who bought it
 * keep access (docs/10 §1 `archived`). Restore puts a live course back on sale.
 */
export async function setCourseListing(
  ctx: Ctx,
  input: { courseId: string; action: 'unpublish' | 'restore'; reason: string },
) {
  requireStaff(ctx.actor, canReviewCourses)
  const course = await inTransaction(ctx, async (tx) => {
    const c = await repo.lockCourse(tx.db, input.courseId)
    if (!c) throw new NotFoundError('COURSE_NOT_FOUND')
    if (!c.liveRevisionId) throw new RuleViolationError('COURSE_UNAVAILABLE')
    const status = input.action === 'unpublish' ? 'archived' : 'published'
    if (c.status === status) return c
    await repo.updateCourse(tx.db, c.id, {
      status,
      ...(input.action === 'unpublish' ? { featuredAt: null } : {}),
      version: c.version + 1,
    })
    await reindexCourse(tx, c.id)
    await writeAudit(tx, {
      action: input.action === 'unpublish' ? 'course.unpublish' : 'course.restore',
      targetType: 'course',
      targetId: c.id,
      before: { status: c.status },
      after: { status, reason: input.reason },
    })
    return c
  })
  await afterListingChange(ctx, course)
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Changes a course URL (studio). The old slug keeps working as a 301 once the course has been
 * live (docs/12 §5 clean URLs).
 */
export async function changeCourseSlug(
  ctx: Ctx,
  input: { courseId: string; version: number; slug: string },
) {
  const user = requireUser(ctx.actor)
  const slug = input.slug.trim().toLowerCase()
  if (!SLUG.test(slug) || slug.length < 3 || slug.length > 80) {
    throw new RuleViolationError('VALIDATION_FAILED', {
      issues: [{ path: 'slug', message: 'Use 3–80 lowercase letters, numbers and dashes.' }],
    })
  }
  const before = await inTransaction(ctx, async (tx) => {
    const c = await repo.lockCourse(tx.db, input.courseId)
    if (!c || !canEditCourse(user, c)) throw new NotFoundError('COURSE_NOT_FOUND')
    if (c.version !== input.version) throw new ConflictError('VERSION_CONFLICT')
    if (c.slug === slug) return c
    const [takenByRedirect] = await tx.db
      .select({ targetId: slugRedirects.targetId })
      .from(slugRedirects)
      .where(and(eq(slugRedirects.kind, 'course'), eq(slugRedirects.fromSlug, slug)))
    if (
      (await repo.isSlugTaken(tx.db, slug)) ||
      (takenByRedirect && takenByRedirect.targetId !== c.id)
    ) {
      throw new ConflictError('SLUG_TAKEN')
    }
    await repo.updateCourse(tx.db, c.id, { slug, version: c.version + 1 })
    if (takenByRedirect) {
      // Taking back one of this course's own old slugs.
      await tx.db
        .delete(slugRedirects)
        .where(and(eq(slugRedirects.kind, 'course'), eq(slugRedirects.fromSlug, slug)))
    }
    if (c.liveRevisionId) {
      await tx.db
        .insert(slugRedirects)
        .values({ kind: 'course', fromSlug: c.slug, targetId: c.id })
        .onConflictDoUpdate({
          target: [slugRedirects.kind, slugRedirects.fromSlug],
          set: { targetId: c.id },
        })
    }
    await reindexCourse(tx, c.id)
    return c
  })
  await ctx.cache.invalidate([
    cacheTags.course(before.id),
    cacheTags.courseSlug(before.slug),
    cacheTags.courseSlug(slug),
    cacheTags.catalog,
  ])
}
