import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { baseColumns, timestamps, tstz } from '../columns'
import { courses, lessons } from './courses'
import { user } from './identity'

// Learning progress and engagement (docs/05 progress, engagement; docs/09 §4; docs/10 §4).
// Written by heartbeats: small rows, upserted, never trusted as sent (the server clamps).

export const lessonProgressStatusEnum = pgEnum('lesson_progress_status', [
  'not_started',
  'in_progress',
  'completed',
])

export const lessonProgress = pgTable(
  'lesson_progress',
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    lessonId: uuid()
      .notNull()
      .references(() => lessons.id, { onDelete: 'restrict' }),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    status: lessonProgressStatusEnum().notNull().default('in_progress'),
    /** Where to resume. */
    positionSec: integer().notNull().default(0),
    /** Seconds actually watched (clamped on the server, docs/09 §4). */
    watchedSec: integer().notNull().default(0),
    maxPositionSec: integer().notNull().default(0),
    completedAt: tstz(),
    lastHeartbeatAt: tstz(),
    /** Last `video_progress` consumption event (one per 5 minutes per lesson). */
    lastConsumptionAt: tstz(),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.lessonId] }),
    index().on(t.userId, t.courseId),
    index().on(t.lessonId),
    index().on(t.courseId),
    check(
      'lesson_progress_non_negative',
      sql`${t.positionSec} >= 0 and ${t.watchedSec} >= 0 and ${t.maxPositionSec} >= 0`,
    ),
  ],
)

/** One row per day a learner learned (Africa/Lagos days); decides streaks (docs/10 §4). */
export const activityDays = pgTable(
  'activity_days',
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    day: date({ mode: 'string' }).notNull(),
    learnedSec: integer().notNull().default(0),
    lessonsCompleted: smallint().notNull().default(0),
    /** Set once the day met the bar (≥ 1 lesson or ≥ 10 minutes) and counted for the streak. */
    countedAt: tstz(),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
)

export const streaks = pgTable('streaks', {
  userId: uuid()
    .primaryKey()
    .references(() => user.id, { onDelete: 'restrict' }),
  current: integer().notNull().default(0),
  longest: integer().notNull().default(0),
  lastDay: date({ mode: 'string' }),
  /** Earned one per 7 days in a row, at most 2; spent automatically on a missed day. */
  freezeTokens: smallint().notNull().default(0),
  ...timestamps(),
})

export const notes = pgTable(
  'notes',
  {
    ...baseColumns(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    lessonId: uuid()
      .notNull()
      .references(() => lessons.id, { onDelete: 'restrict' }),
    positionSec: integer(),
    body: text().notNull(),
  },
  (t) => [
    index().on(t.userId, t.courseId, t.createdAt),
    index().on(t.lessonId),
    index().on(t.courseId),
    check('notes_body_length', sql`char_length(${t.body}) between 1 and 2000`),
  ],
)

export const bookmarks = pgTable(
  'bookmarks',
  {
    ...baseColumns(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    lessonId: uuid()
      .notNull()
      .references(() => lessons.id, { onDelete: 'restrict' }),
    positionSec: integer(),
  },
  (t) => [
    unique('bookmarks_one_per_spot').on(t.userId, t.lessonId, t.positionSec).nullsNotDistinct(),
    index().on(t.userId, t.courseId),
    index().on(t.lessonId),
    index().on(t.courseId),
  ],
)

/** Badge definitions (reference data, seeded). Criteria are data; evaluators read them. */
export const badges = pgTable('badges', {
  ...baseColumns(),
  code: text().notNull().unique(),
  name: text().notNull(),
  description: text().notNull(),
  criteria: jsonb().$type<Record<string, unknown>>().notNull(),
  iconKey: text().notNull(),
  position: integer().notNull().default(0),
})

export const userBadges = pgTable(
  'user_badges',
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    badgeId: uuid()
      .notNull()
      .references(() => badges.id, { onDelete: 'restrict' }),
    awardedAt: tstz().notNull().defaultNow(),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.badgeId] }), index().on(t.badgeId)],
)
