import { schema } from '@tokslearn/db'
import { and, asc, count, eq, isNull, max, ne } from 'drizzle-orm'
import { writeAudit } from '../admin'
import { slugify } from '../instructors'
import { hasRole, type UserActor } from '../kernel/actor'
import { cacheTags } from '../kernel/cache'
import { type Ctx, inTransaction } from '../kernel/ctx'
import { ConflictError, NotFoundError, RuleViolationError } from '../kernel/errors'
import { requireStaff } from '../kernel/guards'

// Category tree editing (docs/20 `/admin/categories`, admin only). Two levels: top categories and
// their subcategories. Renaming a slug keeps the old URL working through slug_redirects.
// Foreign reads (docs/03 §3): courses and course_revisions, to refuse deleting a used category.

const { categories, courses, courseRevisions, slugRedirects } = schema

export const canManageCategories = (actor: UserActor): boolean =>
  hasRole(actor, 'admin', 'super_admin')

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

async function uniqueSlug(ctx: Ctx, wanted: string, exceptId?: string) {
  const slug = slugify(wanted, 60)
  const [taken] = await ctx.db
    .select({ id: categories.id })
    .from(categories)
    .where(
      exceptId
        ? and(eq(categories.slug, slug), ne(categories.id, exceptId))
        : eq(categories.slug, slug),
    )
  if (taken) throw new ConflictError('SLUG_TAKEN')
  return slug
}

async function loadCategory(ctx: Ctx, id: string) {
  const [row] = await ctx.db.select().from(categories).where(eq(categories.id, id))
  if (!row) throw new NotFoundError('CATEGORY_NOT_FOUND')
  return row
}

export async function createCategory(
  ctx: Ctx,
  input: {
    name: string
    slug?: string | undefined
    parentId: string | null
    description: string | null
  },
) {
  requireStaff(ctx.actor, canManageCategories)
  if (input.slug && !SLUG.test(input.slug)) {
    throw new RuleViolationError('VALIDATION_FAILED', {
      issues: [{ path: 'slug', message: 'Use lowercase letters, numbers and dashes.' }],
    })
  }
  const id = await inTransaction(ctx, async (tx) => {
    if (input.parentId) {
      const parent = await loadCategory(tx, input.parentId)
      if (parent.parentId) {
        throw new RuleViolationError('VALIDATION_FAILED', {
          issues: [
            { path: 'parentId', message: 'Subcategories can only sit under a top category.' },
          ],
        })
      }
    }
    const [pos] = await tx.db
      .select({ n: max(categories.position) })
      .from(categories)
      .where(input.parentId ? eq(categories.parentId, input.parentId) : isNull(categories.parentId))
    const [row] = await tx.db
      .insert(categories)
      .values({
        slug: await uniqueSlug(tx, input.slug || input.name),
        name: input.name.trim(),
        description: input.parentId ? null : input.description?.trim() || null,
        parentId: input.parentId,
        position: (pos?.n ?? -1) + 1,
      })
      .returning()
    if (!row) throw new Error('category insert returned nothing')
    await writeAudit(tx, {
      action: 'category.create',
      targetType: 'category',
      targetId: row.id,
      after: { name: row.name, slug: row.slug },
    })
    return row.id
  })
  await ctx.cache.invalidate([cacheTags.catalog])
  return loadCategory(ctx, id)
}

export async function updateCategory(
  ctx: Ctx,
  input: { id: string; name: string; slug: string; description: string | null },
) {
  requireStaff(ctx.actor, canManageCategories)
  if (!SLUG.test(input.slug)) {
    throw new RuleViolationError('VALIDATION_FAILED', {
      issues: [{ path: 'slug', message: 'Use lowercase letters, numbers and dashes.' }],
    })
  }
  await inTransaction(ctx, async (tx) => {
    const before = await loadCategory(tx, input.id)
    const slug =
      before.slug === input.slug ? before.slug : await uniqueSlug(tx, input.slug, before.id)
    await tx.db
      .update(categories)
      .set({
        name: input.name.trim(),
        slug,
        description: before.parentId ? null : input.description?.trim() || null,
      })
      .where(eq(categories.id, before.id))
    if (slug !== before.slug) {
      await tx.db
        .insert(slugRedirects)
        .values({ kind: 'category', fromSlug: before.slug, targetId: before.id })
        .onConflictDoUpdate({
          target: [slugRedirects.kind, slugRedirects.fromSlug],
          set: { targetId: before.id },
        })
    }
    await writeAudit(tx, {
      action: 'category.update',
      targetType: 'category',
      targetId: before.id,
      before: { name: before.name, slug: before.slug },
      after: { name: input.name, slug },
    })
  })
  await ctx.cache.invalidate([cacheTags.catalog])
  return loadCategory(ctx, input.id)
}

/** Moves a category to a new position among its siblings (0-based). */
export async function moveCategory(ctx: Ctx, input: { id: string; toIndex: number }) {
  requireStaff(ctx.actor, canManageCategories)
  await inTransaction(ctx, async (tx) => {
    const row = await loadCategory(tx, input.id)
    const siblings = await tx.db
      .select({ id: categories.id, position: categories.position })
      .from(categories)
      .where(row.parentId ? eq(categories.parentId, row.parentId) : isNull(categories.parentId))
      .orderBy(asc(categories.position), asc(categories.name))
    const from = siblings.findIndex((s) => s.id === row.id)
    if (from === -1 || input.toIndex < 0 || input.toIndex >= siblings.length) {
      throw new RuleViolationError('INVALID_MOVE')
    }
    const [moved] = siblings.splice(from, 1)
    if (moved) siblings.splice(input.toIndex, 0, moved)
    for (const [position, s] of siblings.entries()) {
      if (s.position !== position)
        await tx.db.update(categories).set({ position }).where(eq(categories.id, s.id))
    }
  })
  await ctx.cache.invalidate([cacheTags.catalog])
}

/** Deletes an unused category: no subcategories and no course (live or draft) points at it. */
export async function deleteCategory(ctx: Ctx, id: string) {
  requireStaff(ctx.actor, canManageCategories)
  await inTransaction(ctx, async (tx) => {
    const row = await loadCategory(tx, id)
    const [[children], [inCourses], [inRevisions]] = await Promise.all([
      tx.db.select({ n: count() }).from(categories).where(eq(categories.parentId, id)),
      tx.db.select({ n: count() }).from(courses).where(eq(courses.categoryId, id)),
      tx.db.select({ n: count() }).from(courseRevisions).where(eq(courseRevisions.categoryId, id)),
    ])
    if ((children?.n ?? 0) + (inCourses?.n ?? 0) + (inRevisions?.n ?? 0) > 0) {
      throw new ConflictError('CATEGORY_IN_USE')
    }
    await tx.db
      .delete(slugRedirects)
      .where(and(eq(slugRedirects.kind, 'category'), eq(slugRedirects.targetId, id)))
    await tx.db.delete(categories).where(eq(categories.id, id))
    await writeAudit(tx, {
      action: 'category.delete',
      targetType: 'category',
      targetId: id,
      before: { name: row.name, slug: row.slug },
    })
  })
  await ctx.cache.invalidate([cacheTags.catalog])
}
