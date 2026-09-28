import { sql } from 'drizzle-orm'
import {
  check,
  index,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { baseColumns, tstz } from '../columns'
import { orderItems } from './commerce'
import { courses } from './courses'
import { user } from './identity'

// Enrollments and consumption evidence (docs/05 enrollments, refunds). Access to paid content is
// decided only by `enrollments` (docs/08 §6); consumption events are append-only evidence for the
// refund rules (docs/08 §7) and are written from Phase 5 on.

export const enrollmentSourceEnum = pgEnum('enrollment_source', [
  'purchase',
  'free',
  'bundle',
  'coupon_100',
  'admin_grant',
  'subscription',
  'organization',
])

export const enrollmentStatusEnum = pgEnum('enrollment_status', [
  'active',
  'revoked',
  'expired',
  'completed',
])

export const enrollments = pgTable(
  'enrollments',
  {
    ...baseColumns(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    source: enrollmentSourceEnum().notNull(),
    orderItemId: uuid().references(() => orderItems.id, { onDelete: 'restrict' }),
    /** Cohorts arrive in Phase 8; the foreign key is added then. */
    cohortId: uuid(),
    status: enrollmentStatusEnum().notNull().default('active'),
    accessExpiresAt: tstz(),
    completedAt: tstz(),
    lastAccessedAt: tstz(),
    progressPct: smallint().notNull().default(0),
  },
  (t) => [
    uniqueIndex().on(t.userId, t.courseId),
    index().on(t.courseId, t.status),
    index().on(t.userId, t.lastAccessedAt.desc()),
    index().on(t.orderItemId),
    check('enrollments_progress', sql`${t.progressPct} between 0 and 100`),
  ],
)

export const consumptionKindEnum = pgEnum('consumption_kind', [
  'video_progress',
  'resource_download',
  'certificate_issued',
  'exam_started',
  'assignment_submitted',
])

export const consumptionEvents = pgTable(
  'consumption_events',
  {
    ...baseColumns(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    orderItemId: uuid().references(() => orderItems.id, { onDelete: 'restrict' }),
    kind: consumptionKindEnum().notNull(),
    refId: uuid(),
    value: numeric({ precision: 12, scale: 2 }),
    occurredAt: tstz().notNull(),
    ipHash: text(),
    userAgentHash: text(),
  },
  (t) => [
    index().on(t.userId, t.courseId, t.occurredAt),
    index().on(t.orderItemId),
    index().on(t.courseId),
  ],
)
