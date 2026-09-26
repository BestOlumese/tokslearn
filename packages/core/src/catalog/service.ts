import { schema } from '@tokslearn/db'
import { asc, eq, inArray } from 'drizzle-orm'
import { slugify } from '../instructors'
import type { Ctx } from '../kernel/ctx'
import { NotFoundError } from '../kernel/errors'

// Catalog taxonomy (docs/05 catalog). Owns categories, tags and course_tags. Listing and search
// arrive in Phase 3.

const { categories, tags, courseTags } = schema

export interface CategoryNode {
  id: string
  slug: string
  name: string
  children: Array<{ id: string; slug: string; name: string }>
}

/** Two-level tree in display order. Small and read-mostly: callers may cache it. */
export async function listCategoryTree(ctx: Ctx): Promise<CategoryNode[]> {
  const rows = await ctx.db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      parentId: categories.parentId,
      position: categories.position,
    })
    .from(categories)
    .orderBy(asc(categories.position), asc(categories.name))
  const tops = rows.filter((r) => r.parentId === null)
  return tops.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    children: rows
      .filter((r) => r.parentId === t.id)
      .map((c) => ({ id: c.id, slug: c.slug, name: c.name })),
  }))
}

/** Throws CATEGORY_NOT_FOUND unless the id exists. */
export async function requireCategory(ctx: Ctx, id: string) {
  const [row] = await ctx.db
    .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
    .from(categories)
    .where(eq(categories.id, id))
  if (!row) throw new NotFoundError('CATEGORY_NOT_FOUND')
  return row
}

export async function categoryNames(ctx: Ctx, ids: ReadonlyArray<string>) {
  if (ids.length === 0) return new Map<string, string>()
  const rows = await ctx.db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(inArray(categories.id, [...ids]))
  return new Map(rows.map((r) => [r.id, r.name]))
}

/** Replaces a course's tags (max 10), creating tags as needed. Run inside the caller's tx. */
export async function setCourseTags(ctx: Ctx, courseId: string, names: ReadonlyArray<string>) {
  const wanted = new Map<string, string>()
  for (const name of names) {
    const clean = name.trim().replace(/\s+/g, ' ').slice(0, 40)
    const slug = slugify(clean, 40)
    if (clean && slug !== 'instructor' && !wanted.has(slug)) wanted.set(slug, clean)
  }
  const slugs = [...wanted.keys()].slice(0, 10)
  if (slugs.length > 0) {
    await ctx.db
      .insert(tags)
      .values(slugs.map((slug) => ({ slug, name: wanted.get(slug) ?? slug })))
      .onConflictDoNothing()
  }
  const rows =
    slugs.length > 0
      ? await ctx.db.select({ id: tags.id }).from(tags).where(inArray(tags.slug, slugs))
      : []
  await ctx.db.delete(courseTags).where(eq(courseTags.courseId, courseId))
  if (rows.length > 0) {
    await ctx.db.insert(courseTags).values(rows.map((r) => ({ courseId, tagId: r.id })))
  }
}

export async function courseTagNames(ctx: Ctx, courseId: string): Promise<string[]> {
  const rows = await ctx.db
    .select({ name: tags.name })
    .from(courseTags)
    .innerJoin(tags, eq(tags.id, courseTags.tagId))
    .where(eq(courseTags.courseId, courseId))
    .orderBy(asc(tags.name))
  return rows.map((r) => r.name)
}
