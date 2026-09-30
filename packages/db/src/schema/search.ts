import { sql } from 'drizzle-orm'
import {
  boolean,
  customType,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { baseColumns, currency, kobo, timestamps, tstz } from '../columns'
import { categories } from './catalog'
import { certificateModeEnum, courseLevelEnum, courses } from './courses'
import { user } from './identity'

// Public catalog read model (docs/05 catalog `course_search`, docs/12 §4). One row per listed
// course with everything a course card and the filters need, so listings read a single table.
// Rebuilt by `catalog.reindexCourse` whenever a course is published, updated, featured or hidden.

const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector',
})

export const courseSearch = pgTable(
  'course_search',
  {
    courseId: uuid()
      .primaryKey()
      .references(() => courses.id, { onDelete: 'cascade' }),
    /** Weighted: title A; subtitle, tags, instructor name B; description C. */
    document: tsvector().notNull(),
    /** Lowercased, accent-free title + tags for trigram typo matching. */
    titleNorm: text().notNull(),
    slug: text().notNull(),
    title: text().notNull(),
    subtitle: text(),
    coverKey: text(),
    instructorId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    instructorName: text().notNull(),
    instructorSlug: text(),
    categoryId: uuid().references(() => categories.id, { onDelete: 'set null' }),
    /** Top-level category, so a category page can list its subcategories' courses. */
    parentCategoryId: uuid().references(() => categories.id, { onDelete: 'set null' }),
    priceKobo: kobo().notNull(),
    compareAtKobo: kobo(),
    currency: currency(),
    isFree: boolean().notNull(),
    level: courseLevelEnum().notNull(),
    language: text().notNull(),
    certificateMode: certificateModeEnum().notNull(),
    totalDurationSec: integer().notNull().default(0),
    lessonCount: integer().notNull().default(0),
    enrollmentCount: integer().notNull().default(0),
    ratingAvg: numeric({ precision: 3, scale: 2 }),
    ratingCount: integer().notNull().default(0),
    popularityScore: real().notNull().default(0),
    featuredAt: tstz(),
    /** Cohort-based courses: the next open run's start, for the badge, filter and home row. */
    cohortBased: boolean().notNull().default(false),
    nextCohortStartsAt: tstz(),
    publishedAt: tstz().notNull(),
    ...timestamps(),
  },
  (t) => [
    index('course_search_document_idx').using('gin', t.document),
    index('course_search_title_trgm_idx').using('gin', t.titleNorm.op('gin_trgm_ops')),
    index().on(t.categoryId, t.publishedAt.desc()),
    index().on(t.parentCategoryId, t.publishedAt.desc()),
    index().on(t.instructorId),
    index().on(t.popularityScore.desc(), t.publishedAt.desc()),
    index().on(t.publishedAt.desc()),
    index().on(t.priceKobo),
    index('course_search_next_cohort_idx')
      .on(t.nextCohortStartsAt)
      .where(sql`${t.nextCohortStartsAt} is not null`),
    index('course_search_featured_idx')
      .on(t.featuredAt.desc())
      .where(sql`${t.featuredAt} is not null`),
  ],
)

export const slugKindEnum = pgEnum('slug_kind', ['course', 'instructor', 'category'])

/** Old public slugs → current record, so renamed URLs 301 instead of 404 (docs/12 §5). */
export const slugRedirects = pgTable(
  'slug_redirects',
  {
    ...baseColumns(),
    kind: slugKindEnum().notNull(),
    fromSlug: text().notNull(),
    targetId: uuid().notNull(),
  },
  (t) => [uniqueIndex().on(t.kind, t.fromSlug), index().on(t.targetId)],
)
