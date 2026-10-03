import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { baseColumns, timestamps, tstz } from '../columns'
import { courses } from './courses'
import { enrollments } from './enrollments'
import { user } from './identity'

// Reviews and ratings (docs/05 reviews, docs/10 §12, ADR-040). One review per learner per course,
// editable; the instructor replies once (editable); reports go to the staff queue. Ratings shown
// on cards and course pages come from `course_rating_stats`, recomputed by the rating-stats job.

export const reviewStatusEnum = pgEnum('review_status', ['visible', 'hidden'])
export const reviewReportStatusEnum = pgEnum('review_report_status', [
  'open',
  'resolved',
  'dismissed',
])

export const reviews = pgTable(
  'reviews',
  {
    ...baseColumns(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    enrollmentId: uuid()
      .notNull()
      .references(() => enrollments.id, { onDelete: 'restrict' }),
    rating: smallint().notNull(),
    /** Plain text; a rating alone is allowed. */
    body: text(),
    status: reviewStatusEnum().notNull().default('visible'),
    helpfulCount: integer().notNull().default(0),
    /** The instructor's (or a co-instructor's) reply: one, editable. */
    instructorReply: text(),
    repliedAt: tstz(),
    repliedBy: uuid().references(() => user.id, { onDelete: 'restrict' }),
    editedAt: tstz(),
    hiddenAt: tstz(),
    hiddenBy: uuid().references(() => user.id, { onDelete: 'restrict' }),
    deletedAt: tstz(),
  },
  (t) => [
    uniqueIndex().on(t.courseId, t.userId),
    index('reviews_course_visible_idx')
      .on(t.courseId, t.createdAt.desc())
      .where(sql`${t.status} = 'visible' and ${t.deletedAt} is null`),
    index().on(t.userId),
    index().on(t.enrollmentId),
    index().on(t.repliedBy),
    index().on(t.hiddenBy),
    check('reviews_rating_range', sql`${t.rating} between 1 and 5`),
  ],
)

/** "Helpful" votes; `reviews.helpful_count` mirrors the count for sorting. */
export const reviewVotes = pgTable(
  'review_votes',
  {
    reviewId: uuid()
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.reviewId, t.userId] }), index().on(t.userId)],
)

export const reviewReports = pgTable(
  'review_reports',
  {
    ...baseColumns(),
    reviewId: uuid()
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    reporterId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    reason: text().notNull(),
    status: reviewReportStatusEnum().notNull().default('open'),
    handledBy: uuid().references(() => user.id, { onDelete: 'restrict' }),
    handledAt: tstz(),
  },
  (t) => [
    uniqueIndex().on(t.reviewId, t.reporterId),
    index('review_reports_open_idx').on(t.createdAt).where(sql`${t.status} = 'open'`),
    index().on(t.reporterId),
    index().on(t.handledBy),
  ],
)

/** Visible reviews only. Ratings show publicly from 3 reviews (docs/10 §12). */
export const courseRatingStats = pgTable('course_rating_stats', {
  courseId: uuid()
    .primaryKey()
    .references(() => courses.id, { onDelete: 'cascade' }),
  count: integer().notNull().default(0),
  avg: numeric({ precision: 3, scale: 2 }),
  stars1: integer().notNull().default(0),
  stars2: integer().notNull().default(0),
  stars3: integer().notNull().default(0),
  stars4: integer().notNull().default(0),
  stars5: integer().notNull().default(0),
  ...timestamps(),
})
