import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { baseColumns, currency, kobo, timestamps, tstz } from '../columns'
import { categories, tags } from './catalog'
import { user } from './identity'
import { files, videoAssets } from './media'

// Courses and authoring (docs/05 courses, docs/10 §1).
//
// Course metadata (title, description, cover…) lives in revisions: the studio edits the draft
// revision, the catalog reads the live one. Sections and lessons are edited in place; after the
// first publish, new ones stay hidden until a review approves them (`live_since` is null) and
// removals wait for approval (`removal_requested_at`). See ADR-030.

export const courseStatusEnum = pgEnum('course_status', [
  'draft',
  'in_review',
  'changes_requested',
  'published',
  'unlisted',
  'archived',
])
export const courseLevelEnum = pgEnum('course_level', [
  'beginner',
  'intermediate',
  'advanced',
  'all',
])
export const certificateModeEnum = pgEnum('certificate_mode', [
  'none',
  'completion',
  'exam',
  'external',
])
export const dripModeEnum = pgEnum('drip_mode', [
  'none',
  'fixed_dates',
  'after_enrollment',
  'cohort_relative',
])

export const courses = pgTable(
  'courses',
  {
    ...baseColumns(),
    instructorId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    slug: text().notNull().unique(),
    status: courseStatusEnum().notNull().default('draft'),
    liveRevisionId: uuid().references((): AnyPgColumn => courseRevisions.id, {
      onDelete: 'restrict',
    }),
    draftRevisionId: uuid().references((): AnyPgColumn => courseRevisions.id, {
      onDelete: 'restrict',
    }),
    categoryId: uuid().references(() => categories.id, { onDelete: 'restrict' }),
    level: courseLevelEnum().notNull().default('all'),
    language: text().notNull().default('en'),
    priceKobo: kobo().notNull().default(sql`0`),
    compareAtKobo: kobo(),
    currency: currency(),
    isFree: boolean()
      .notNull()
      .generatedAlwaysAs(sql`price_kobo = 0`),
    refundPolicyDays: smallint().notNull().default(7),
    certificateMode: certificateModeEnum().notNull().default('none'),
    dripMode: dripModeEnum().notNull().default('none'),
    completionThresholdPct: smallint().notNull().default(90),
    subscriptionOptIn: boolean().notNull().default(false),
    drmRequired: boolean().notNull().default(false),
    totalDurationSec: integer().notNull().default(0),
    lessonCount: integer().notNull().default(0),
    /** Autosave conflict token: every studio write bumps it; a stale value is VERSION_CONFLICT. */
    version: integer().notNull().default(1),
    publishedAt: tstz(),
    deletedAt: tstz(),
  },
  (t) => [
    index().on(t.instructorId, t.status),
    index().on(t.status, t.publishedAt.desc()),
    index().on(t.categoryId),
    index().on(t.liveRevisionId),
    index().on(t.draftRevisionId),
    check('courses_refund_policy_days', sql`${t.refundPolicyDays} in (0, 3, 7, 14)`),
    check('courses_price_non_negative', sql`${t.priceKobo} >= 0`),
    check(
      'courses_completion_threshold',
      sql`${t.completionThresholdPct} between 50 and 100`,
    ),
  ],
)

export const revisionStatusEnum = pgEnum('course_revision_status', [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'superseded',
])

export const courseRevisions = pgTable(
  'course_revisions',
  {
    ...baseColumns(),
    courseId: uuid()
      .notNull()
      .references((): AnyPgColumn => courses.id, { onDelete: 'restrict' }),
    number: integer().notNull(),
    status: revisionStatusEnum().notNull().default('draft'),
    title: text().notNull(),
    subtitle: text(),
    descriptionDoc: jsonb().$type<Record<string, unknown>>(),
    descriptionHtml: text(),
    outcomes: text().array().notNull().default(sql`'{}'::text[]`),
    requirements: text().array().notNull().default(sql`'{}'::text[]`),
    coverFileId: uuid().references(() => files.id, { onDelete: 'restrict' }),
    promoVideoId: uuid().references(() => videoAssets.id, { onDelete: 'restrict' }),
    /** Frozen outline + settings at submit time; the reviewer diffs it against the live one. */
    snapshot: jsonb().$type<Record<string, unknown>>(),
    /** Reviewer checklist (docs/25 §B) with ticked items. */
    reviewChecklist: jsonb().$type<Record<string, boolean>>(),
    reviewNotes: text(),
    reviewedBy: uuid().references(() => user.id, { onDelete: 'restrict' }),
    reviewedAt: tstz(),
    submittedAt: tstz(),
  },
  (t) => [
    uniqueIndex().on(t.courseId, t.number),
    index().on(t.status, t.submittedAt),
    index().on(t.coverFileId),
    index().on(t.promoVideoId),
    index().on(t.reviewedBy),
  ],
)

export const courseTags = pgTable(
  'course_tags',
  {
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: 'restrict' }),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.courseId, t.tagId] }), index().on(t.tagId)],
)

export const sections = pgTable(
  'sections',
  {
    ...baseColumns(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    title: text().notNull(),
    position: integer().notNull(),
    /** Set when a review approves this section; null = not yet visible to learners. */
    liveSince: tstz(),
    removalRequestedAt: tstz(),
  },
  (t) => [index().on(t.courseId, t.position)],
)

export const lessonTypeEnum = pgEnum('lesson_type', [
  'video',
  'article',
  'quiz',
  'assignment',
  'live',
  'resource',
])

export const lessons = pgTable(
  'lessons',
  {
    ...baseColumns(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    sectionId: uuid()
      .notNull()
      .references(() => sections.id, { onDelete: 'restrict' }),
    type: lessonTypeEnum().notNull(),
    title: text().notNull(),
    position: integer().notNull(),
    isPreview: boolean().notNull().default(false),
    durationSec: integer().notNull().default(0),
    videoAssetId: uuid().references(() => videoAssets.id, { onDelete: 'restrict' }),
    articleDoc: jsonb().$type<Record<string, unknown>>(),
    articleHtml: text(),
    /** FKs to quizzes, assignments and live sessions arrive with Phases 6 and 8. */
    quizId: uuid(),
    assignmentId: uuid(),
    liveSessionId: uuid(),
    dripOffsetDays: smallint(),
    dripDate: tstz(),
    liveSince: tstz(),
    removalRequestedAt: tstz(),
    deletedAt: tstz(),
  },
  (t) => [
    index().on(t.courseId, t.sectionId, t.position),
    index().on(t.sectionId),
    index().on(t.videoAssetId),
  ],
)

export const lessonResources = pgTable(
  'lesson_resources',
  {
    ...baseColumns(),
    lessonId: uuid()
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    fileId: uuid()
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
    title: text().notNull(),
    /** Downloading it makes the sale non-refundable (docs/08 refunds). */
    isImportant: boolean().notNull().default(false),
    position: integer().notNull().default(0),
  },
  (t) => [index().on(t.lessonId, t.position), index().on(t.fileId)],
)

export const bundleStatusEnum = pgEnum('bundle_status', ['draft', 'active', 'archived'])

export const bundles = pgTable(
  'bundles',
  {
    ...baseColumns(),
    instructorId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    slug: text().notNull().unique(),
    title: text().notNull(),
    description: text(),
    priceKobo: kobo().notNull(),
    currency: currency(),
    status: bundleStatusEnum().notNull().default('draft'),
  },
  (t) => [
    index().on(t.instructorId, t.status),
    check('bundles_price_non_negative', sql`${t.priceKobo} >= 0`),
  ],
)

export const bundleCourses = pgTable(
  'bundle_courses',
  {
    bundleId: uuid()
      .notNull()
      .references(() => bundles.id, { onDelete: 'cascade' }),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    position: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.bundleId, t.courseId] }), index().on(t.courseId)],
)

export const courseStaffRoleEnum = pgEnum('course_staff_role', [
  'co_instructor',
  'teaching_assistant',
])

/** v1: teaching assistants only; co-instructor revenue share is Phase 12+ (docs/05). */
export const courseStaff = pgTable(
  'course_staff',
  {
    ...baseColumns(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    role: courseStaffRoleEnum().notNull().default('teaching_assistant'),
    invitedBy: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
  },
  (t) => [uniqueIndex().on(t.courseId, t.userId), index().on(t.userId), index().on(t.invitedBy)],
)
