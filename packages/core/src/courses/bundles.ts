import { hasRole } from '../kernel/actor'
import { type Ctx, inTransaction } from '../kernel/ctx'
import { ForbiddenError, NotFoundError, RuleViolationError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import * as repo from './repo'
import { courseSlug, validPrice } from './rules'

// Bundles of an instructor's own courses at one price (docs/05 bundles). Selling them arrives
// with checkout in Phase 4; an active bundle needs at least two published courses.

export const MIN_BUNDLE_COURSES = 2

async function withCourses(ctx: Ctx, bundles: ReadonlyArray<repo.BundleRow>) {
  const links = await repo.bundleCourseIds(
    ctx.db,
    bundles.map((b) => b.id),
  )
  return bundles.map((b) => ({
    ...b,
    courseIds: links.filter((l) => l.bundleId === b.id).map((l) => l.courseId),
  }))
}

export async function listMyBundles(ctx: Ctx) {
  const user = requireUser(ctx.actor)
  return withCourses(ctx, await repo.bundlesOf(ctx.db, user.userId))
}

async function ownBundle(ctx: Ctx, id: string) {
  const user = requireUser(ctx.actor)
  const bundle = await repo.getBundle(ctx.db, id)
  if (!bundle || (bundle.instructorId !== user.userId && !hasRole(user, 'admin', 'super_admin'))) {
    throw new NotFoundError('BUNDLE_NOT_FOUND')
  }
  return bundle
}

export async function getBundle(ctx: Ctx, id: string) {
  const [bundle] = await withCourses(ctx, [await ownBundle(ctx, id)])
  if (!bundle) throw new NotFoundError('BUNDLE_NOT_FOUND')
  return bundle
}

/** Courses must belong to the bundle's instructor; activation needs 2+ published ones. */
async function checkCourses(
  ctx: Ctx,
  instructorId: string,
  courseIds: ReadonlyArray<string>,
  status: repo.BundleRow['status'],
) {
  const unique = [...new Set(courseIds)]
  const rows = await repo.coursesByIds(ctx.db, unique)
  if (rows.length !== unique.length || rows.some((c) => c.instructorId !== instructorId)) {
    throw new NotFoundError('COURSE_NOT_FOUND')
  }
  if (status === 'active' && rows.filter((c) => c.liveRevisionId).length < MIN_BUNDLE_COURSES) {
    throw new RuleViolationError('VALIDATION_FAILED', {
      issues: [
        { path: 'courseIds', message: 'An active bundle needs at least two published courses.' },
      ],
    })
  }
  return unique
}

function checkPrice(priceKobo: bigint) {
  if (priceKobo === 0n || !validPrice(priceKobo)) {
    throw new RuleViolationError('VALIDATION_FAILED', {
      issues: [{ path: 'priceKobo', message: 'Between ₦1,000 and ₦5,000,000.' }],
    })
  }
}

async function uniqueBundleSlug(ctx: Ctx, title: string, exceptId?: string) {
  const base = courseSlug(title)
  for (let i = 1; i < 100; i++) {
    const slug = i === 1 ? `${base}-bundle` : `${base}-bundle-${i}`
    if (!(await repo.isBundleSlugTaken(ctx.db, slug, exceptId))) return slug
  }
  return `${base}-bundle-${Date.now().toString(36)}`
}

export interface BundleInput {
  title: string
  description: string | null
  priceKobo: bigint
  courseIds: string[]
  status: 'draft' | 'active'
}

export async function createBundle(ctx: Ctx, input: BundleInput) {
  const user = requireUser(ctx.actor)
  if (!hasRole(user, 'instructor')) throw new ForbiddenError('INSTRUCTOR_REQUIRED')
  checkPrice(input.priceKobo)
  const courseIds = await checkCourses(ctx, user.userId, input.courseIds, input.status)
  const id = await inTransaction(ctx, async (tx) => {
    const bundle = await repo.insertBundle(tx.db, {
      instructorId: user.userId,
      slug: await uniqueBundleSlug(tx, input.title),
      title: input.title.trim(),
      description: input.description?.trim() || null,
      priceKobo: input.priceKobo,
      status: input.status,
    })
    await repo.setBundleCourses(tx.db, bundle.id, courseIds)
    return bundle.id
  })
  return getBundle(ctx, id)
}

export async function updateBundle(ctx: Ctx, input: BundleInput & { id: string }) {
  const bundle = await ownBundle(ctx, input.id)
  checkPrice(input.priceKobo)
  const courseIds = await checkCourses(ctx, bundle.instructorId, input.courseIds, input.status)
  await inTransaction(ctx, async (tx) => {
    await repo.updateBundle(tx.db, bundle.id, {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      priceKobo: input.priceKobo,
      status: input.status,
    })
    await repo.setBundleCourses(tx.db, bundle.id, courseIds)
  })
  return getBundle(ctx, bundle.id)
}

export async function archiveBundle(ctx: Ctx, id: string) {
  const bundle = await ownBundle(ctx, id)
  await repo.updateBundle(ctx.db, bundle.id, { status: 'archived' })
}
