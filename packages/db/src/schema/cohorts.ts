import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { baseColumns, tstz } from '../columns'
import { courses } from './courses'
import { user } from './identity'

// Cohorts (docs/05 cohorts, docs/10 §9). A cohort-based course sells by run: each learner picks a
// start date, capped by capacity. Learners belong to a run through `enrollments.cohort_id`.

export const cohortStatusEnum = pgEnum('cohort_status', ['draft', 'open', 'cancelled'])

export const cohorts = pgTable(
  'cohorts',
  {
    ...baseColumns(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    /** Shown to learners, e.g. "November 2026". */
    name: text().notNull(),
    startsAt: tstz().notNull(),
    endsAt: tstz().notNull(),
    /** Null: open as soon as the run is published. */
    enrollOpensAt: tstz(),
    /** Null: closes when the run starts. */
    enrollClosesAt: tstz(),
    /** Null: no limit. */
    capacity: integer(),
    /** draft: only the studio sees it; open: on sale within its window; cancelled: gone. */
    status: cohortStatusEnum().notNull().default('draft'),
    timezone: text().notNull().default('Africa/Lagos'),
  },
  (t) => [
    index().on(t.courseId, t.startsAt),
    check('cohorts_capacity_positive', sql`${t.capacity} is null or ${t.capacity} > 0`),
    check('cohorts_ends_after_start', sql`${t.endsAt} > ${t.startsAt}`),
  ],
)

/**
 * A seat held for a pending order (docs/10 §9: capacity reserved at checkout for 30 minutes).
 * Written in the same transaction as the order while the cohort row is locked, so concurrent
 * checkouts can't take more seats than the capacity (ADR-037).
 */
export const cohortHolds = pgTable(
  'cohort_holds',
  {
    ...baseColumns(),
    cohortId: uuid()
      .notNull()
      .references(() => cohorts.id, { onDelete: 'cascade' }),
    /** The order that holds it; the commerce module owns orders, so no foreign key here. */
    orderId: uuid().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: tstz().notNull(),
  },
  (t) => [
    uniqueIndex().on(t.orderId, t.cohortId),
    index().on(t.cohortId, t.expiresAt),
    index().on(t.userId),
  ],
)
