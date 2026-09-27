import { type DbOrTx, schema } from '@tokslearn/db'
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import type { Ctx } from '../kernel/ctx'

// Catalog read model (docs/05 `course_search`, docs/12 §4). Owns course_search.
// Foreign reads (docs/03 §3): courses, course_revisions, files (cover key), instructor_profiles, user (instructor name), course_tags/tags, categories.

const {
  courseSearch: cs,
  courses,
  courseRevisions: revisions,
  instructorProfiles,
  user,
  courseTags,
  tags,
  categories,
} = schema

/** Lowercase, accents stripped, punctuation to spaces: what trigram matching compares. */
export const normalizeText = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const plain = (html: string | null) =>
  (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 20_000)

/**
 * Rebuilds one course's catalog row: upserts it while the course is published and live, removes
 * it otherwise (draft, unlisted, archived, deleted). Call inside the transaction that changed it.
 */
export async function reindexCourse(ctx: Ctx, courseId: string): Promise<'indexed' | 'removed'> {
  const db = ctx.db
  const [row] = await db
    .select({
      course: courses,
      revision: revisions,
      instructorName: user.name,
      instructorSlug: instructorProfiles.slug,
      displayName: instructorProfiles.displayName,
      parentCategoryId: categories.parentId,
    })
    .from(courses)
    .innerJoin(revisions, eq(revisions.id, courses.liveRevisionId))
    .innerJoin(user, eq(user.id, courses.instructorId))
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, courses.instructorId))
    .leftJoin(categories, eq(categories.id, courses.categoryId))
    .where(eq(courses.id, courseId))
  const c = row?.course
  if (!row || !c || c.status !== 'published' || c.deletedAt) {
    await db.delete(cs).where(eq(cs.courseId, courseId))
    return 'removed'
  }
  const tagRows = await db
    .select({ name: tags.name })
    .from(courseTags)
    .innerJoin(tags, eq(tags.id, courseTags.tagId))
    .where(eq(courseTags.courseId, courseId))
  const tagText = tagRows.map((t) => t.name).join(' ')
  const r = row.revision
  const instructorName = row.displayName ?? row.instructorName
  const document = sql`setweight(to_tsvector('english', ${r.title}), 'A') ||
    setweight(to_tsvector('english', ${[r.subtitle ?? '', tagText, instructorName].join(' ')}), 'B') ||
    setweight(to_tsvector('english', ${[plain(r.descriptionHtml), ...r.outcomes].join(' ')}), 'C')`
  const values = {
    courseId,
    document,
    titleNorm: normalizeText(`${r.title} ${tagText}`),
    slug: c.slug,
    title: r.title,
    subtitle: r.subtitle,
    coverKey: null as string | null,
    instructorId: c.instructorId,
    instructorName,
    instructorSlug: row.instructorSlug,
    categoryId: c.categoryId,
    parentCategoryId: row.parentCategoryId ?? c.categoryId,
    priceKobo: c.priceKobo,
    compareAtKobo: c.compareAtKobo,
    isFree: c.priceKobo === 0n,
    level: c.level,
    language: c.language,
    certificateMode: c.certificateMode,
    totalDurationSec: c.totalDurationSec,
    lessonCount: c.lessonCount,
    featuredAt: c.featuredAt,
    publishedAt: c.publishedAt ?? ctx.now,
  }
  if (r.coverFileId) {
    const [file] = await db
      .select({ key: schema.files.key })
      .from(schema.files)
      .where(eq(schema.files.id, r.coverFileId))
    values.coverKey = file?.key ?? null
  }
  const { courseId: _id, ...update } = values
  await db.insert(cs).values(values).onConflictDoUpdate({ target: cs.courseId, set: update })
  return 'indexed'
}

/** Rebuilds every listed course's row (after schema changes or a data fix). */
export async function reindexAll(ctx: Ctx): Promise<number> {
  const ids = await ctx.db
    .select({ id: courses.id })
    .from(courses)
    .where(isNotNull(courses.liveRevisionId))
  for (const { id } of ids) await reindexCourse(ctx, id)
  return ids.length
}

// ─── Listing and search ───────────────────────────────────────────────────────────────────────

export type CourseSort = 'popular' | 'newest' | 'rating' | 'price_low' | 'price_high'
export type DurationBucket = 'short' | 'medium' | 'long'

export interface CourseFilters {
  q?: string | undefined
  categoryIds?: ReadonlyArray<string> | undefined
  instructorId?: string | undefined
  price?: 'any' | 'free' | 'paid' | undefined
  level?: 'beginner' | 'intermediate' | 'advanced' | 'all' | undefined
  language?: string | undefined
  minRating?: number | undefined
  duration?: DurationBucket | undefined
  certificate?: boolean | undefined
  sort?: CourseSort | undefined
  cursor?: string | undefined
  limit: number
}

export type CourseCard = Awaited<ReturnType<typeof selectCards>>[number]

const cardColumns = {
  courseId: cs.courseId,
  slug: cs.slug,
  title: cs.title,
  subtitle: cs.subtitle,
  coverKey: cs.coverKey,
  instructorName: cs.instructorName,
  instructorSlug: cs.instructorSlug,
  priceKobo: cs.priceKobo,
  compareAtKobo: cs.compareAtKobo,
  isFree: cs.isFree,
  level: cs.level,
  certificateMode: cs.certificateMode,
  totalDurationSec: cs.totalDurationSec,
  lessonCount: cs.lessonCount,
  ratingAvg: cs.ratingAvg,
  ratingCount: cs.ratingCount,
  enrollmentCount: cs.enrollmentCount,
  publishedAt: cs.publishedAt,
}

function selectCards(db: DbOrTx) {
  return db.select(cardColumns).from(cs)
}

const HOUR = 3600

function filterConditions(f: CourseFilters): SQL[] {
  const c: SQL[] = []
  if (f.categoryIds && f.categoryIds.length > 0) {
    const ids = [...f.categoryIds]
    const either = or(inArray(cs.categoryId, ids), inArray(cs.parentCategoryId, ids))
    if (either) c.push(either)
  }
  if (f.instructorId) c.push(eq(cs.instructorId, f.instructorId))
  if (f.price === 'free') c.push(eq(cs.isFree, true))
  if (f.price === 'paid') c.push(eq(cs.isFree, false))
  if (f.level) c.push(eq(cs.level, f.level))
  if (f.language) c.push(eq(cs.language, f.language))
  if (f.minRating) c.push(gte(cs.ratingAvg, String(f.minRating)))
  if (f.duration === 'short') c.push(lt(cs.totalDurationSec, 2 * HOUR))
  if (f.duration === 'medium') {
    c.push(gte(cs.totalDurationSec, 2 * HOUR), lte(cs.totalDurationSec, 6 * HOUR))
  }
  if (f.duration === 'long') c.push(gt(cs.totalDurationSec, 6 * HOUR))
  if (f.certificate) c.push(sql`${cs.certificateMode} <> 'none'`)
  return c
}

interface KeysetCursor {
  v: string | number | null
  id: string
}

const encode = (c: KeysetCursor) => Buffer.from(JSON.stringify(c)).toString('base64url')
function decode(cursor: string | undefined): KeysetCursor | null {
  if (!cursor) return null
  try {
    const c = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as KeysetCursor
    return typeof c.id === 'string' ? c : null
  } catch {
    return null
  }
}

/** Sort key and direction per sort option; ties break on course id (docs/05 §3.1 keyset). */
function sortSpec(sort: CourseSort) {
  switch (sort) {
    case 'newest':
      return {
        col: cs.publishedAt,
        dir: 'desc' as const,
        value: (r: CourseCard) => r.publishedAt.toISOString(),
      }
    case 'rating':
      return {
        col: sql`coalesce(${cs.ratingAvg}, 0)`,
        dir: 'desc' as const,
        value: (r: CourseCard) => Number(r.ratingAvg ?? 0),
      }
    case 'price_low':
      return {
        col: cs.priceKobo,
        dir: 'asc' as const,
        value: (r: CourseCard) => r.priceKobo.toString(),
      }
    case 'price_high':
      return {
        col: cs.priceKobo,
        dir: 'desc' as const,
        value: (r: CourseCard) => r.priceKobo.toString(),
      }
    default:
      return {
        col: sql`(${cs.popularityScore} + ${cs.enrollmentCount})`,
        dir: 'desc' as const,
        value: (r: CourseCard) => r.enrollmentCount,
      }
  }
}

/** Browse with filters and keyset pagination (`/courses`, category pages). */
export async function listCourses(ctx: Ctx, f: CourseFilters) {
  const spec = sortSpec(f.sort ?? 'popular')
  const cursor = decode(f.cursor)
  const conditions = filterConditions(f)
  if (cursor) {
    const cmp = spec.dir === 'desc' ? sql`<` : sql`>`
    conditions.push(sql`(${spec.col}, ${cs.courseId}) ${cmp} (${cursor.v}, ${cursor.id})`)
  }
  const rows = await selectCards(ctx.db)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      spec.dir === 'desc' ? desc(spec.col) : asc(spec.col),
      spec.dir === 'desc' ? desc(cs.courseId) : asc(cs.courseId),
    )
    .limit(f.limit + 1)
  const page = rows.slice(0, f.limit)
  const last = page.at(-1)
  return {
    items: page,
    nextCursor:
      rows.length > f.limit && last ? encode({ v: spec.value(last), id: last.courseId }) : null,
  }
}

export const SEARCH_MAX_RESULTS = 96
const TRIGRAM_THRESHOLD = 0.35

/**
 * Search (docs/20 `/search`): full-text match ranked first, then trigram matches on the title
 * and tags so typos still find courses ("javascrpit" → JavaScript). Result sets are small and
 * bounded, so pages use an offset within the first 96 results.
 */
export async function searchCourses(ctx: Ctx, f: CourseFilters & { q: string }) {
  const q = f.q.trim().slice(0, 100)
  const qn = normalizeText(q)
  if (!qn) return { items: [], nextCursor: null, typoMatch: false }
  const query = sql`websearch_to_tsquery('english', ${q})`
  const fts = sql`${cs.document} @@ ${query}`
  const sim = sql`word_similarity(${qn}, ${cs.titleNorm})`
  const offset = Math.min(Number(f.cursor ?? 0) || 0, SEARCH_MAX_RESULTS)
  const conditions = filterConditions(f)
  const match = or(fts, sql`${sim} > ${TRIGRAM_THRESHOLD}`)
  if (match) conditions.push(match)
  const rows = await ctx.db
    .select({ ...cardColumns, exact: sql<boolean>`${fts}` })
    .from(cs)
    .where(and(...conditions))
    .orderBy(
      // A chosen sort wins; otherwise best match: exact words first, then close spellings.
      ...(f.sort
        ? [sortSpec(f.sort).dir === 'desc' ? desc(sortSpec(f.sort).col) : asc(sortSpec(f.sort).col)]
        : []),
      desc(fts),
      desc(sql`ts_rank_cd(${cs.document}, ${query})`),
      desc(sim),
      // title_norm includes tags; on a tie the course whose own title is closer wins.
      desc(sql`word_similarity(${qn}, lower(${cs.title}))`),
      desc(cs.publishedAt),
    )
    .limit(Math.min(f.limit + 1, SEARCH_MAX_RESULTS - offset + 1))
    .offset(offset)
  const page = rows.slice(0, f.limit)
  const more = rows.length > f.limit && offset + f.limit < SEARCH_MAX_RESULTS
  return {
    items: page.map(({ exact: _e, ...card }) => card),
    nextCursor: more ? String(offset + f.limit) : null,
    /** No exact matches, only close spellings: the page says "Showing close matches". */
    typoMatch: page.length > 0 && page.every((r) => !r.exact),
  }
}

/** Instructors whose name matches a search (the "instructor matches" row on /search). */
export async function searchInstructors(ctx: Ctx, q: string, limit = 4) {
  const qn = normalizeText(q)
  if (qn.length < 3) return []
  const name = sql`lower(${instructorProfiles.displayName})`
  return ctx.db
    .select({
      slug: instructorProfiles.slug,
      displayName: instructorProfiles.displayName,
      headline: user.headline,
      avatarKey: user.avatarKey,
    })
    .from(instructorProfiles)
    .innerJoin(user, eq(user.id, instructorProfiles.userId))
    .where(
      and(
        sql`word_similarity(${qn}, ${name}) > 0.5`,
        sql`${user.deletedAt} is null`,
        eq(user.banned, false),
      ),
    )
    .orderBy(desc(sql`word_similarity(${qn}, ${name})`))
    .limit(limit)
}

/** Course counts per category id (a course counts toward its subcategory and its top category). */
export async function categoryCounts(ctx: Ctx): Promise<Map<string, number>> {
  const rows = await ctx.db.execute(sql`
    select id, count(*)::int as n from (
      select ${cs.categoryId} as id from ${cs} where ${cs.categoryId} is not null
      union all
      select ${cs.parentCategoryId} from ${cs}
        where ${cs.parentCategoryId} is not null and ${cs.parentCategoryId} <> ${cs.categoryId}
    ) x group by id`)
  const list = (rows as unknown as { rows: Array<{ id: string; n: number }> }).rows
  return new Map(list.map((r) => [r.id, r.n]))
}

/** Featured courses for the home page, most recently featured first (docs/20 /admin/courses). */
export async function featuredCourses(ctx: Ctx, limit = 8) {
  return selectCards(ctx.db)
    .where(isNotNull(cs.featuredAt))
    .orderBy(desc(cs.featuredAt))
    .limit(limit)
}
