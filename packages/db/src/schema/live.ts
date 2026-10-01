import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core'
import { baseColumns, timestamps, tstz } from '../columns'
import { cohorts } from './cohorts'
import { courses, lessons } from './courses'
import { user } from './identity'
import { videoAssets } from './media'

// Live classes (docs/05 live, docs/10 §11, ADR-039). A session belongs to a course, optionally to
// one cohort run (only that run's learners may join) and optionally to a "Live class" lesson,
// where learners find it and, afterwards, its recording. The Daily room is created on the first
// join, so a session cancelled before then never costs anything.

export const liveSessionStatusEnum = pgEnum('live_session_status', [
  'scheduled',
  'live',
  'ended',
  'cancelled',
])
export const liveRecordingStatusEnum = pgEnum('live_recording_status', [
  'none',
  'importing',
  'ready',
  'failed',
])

export const liveSessions = pgTable(
  'live_sessions',
  {
    ...baseColumns(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    /** Null: every learner of the course. */
    cohortId: uuid().references(() => cohorts.id, { onDelete: 'restrict' }),
    /** The "Live class" lesson that shows it, if any. */
    lessonId: uuid().references(() => lessons.id, { onDelete: 'restrict' }),
    /** Who scheduled it. */
    createdBy: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    title: text().notNull(),
    startsAt: tstz().notNull(),
    endsAt: tstz().notNull(),
    status: liveSessionStatusEnum().notNull().default('scheduled'),
    recordingEnabled: boolean().notNull().default(true),
    /** Set when the room is first created (first join). */
    dailyRoomName: text().unique(),
    dailyRoomUrl: text(),
    /** The expiry the room was created or last updated with; a reschedule updates the room. */
    roomExpiresAt: tstz(),
    /** From Daily's meeting.started / meeting.ended webhooks. */
    startedAt: tstz(),
    endedAt: tstz(),
    cancelledAt: tstz(),
    recordingStatus: liveRecordingStatusEnum().notNull().default('none'),
    /** The recording being imported or imported; the longest one wins. */
    dailyRecordingId: text(),
    recordingDurationSec: integer(),
    /** Bunny title used to find a fetched video when Bunny doesn't return its id. */
    recordingTitle: text(),
    recordingVideoAssetId: uuid().references(() => videoAssets.id, { onDelete: 'restrict' }),
  },
  (t) => [
    index().on(t.courseId, t.startsAt),
    index().on(t.cohortId),
    index().on(t.lessonId),
    index().on(t.createdBy),
    index().on(t.recordingVideoAssetId),
    index('live_sessions_upcoming_idx').on(t.startsAt).where(sql`${t.status} = 'scheduled'`),
    check('live_sessions_time_order', sql`${t.endsAt} > ${t.startsAt}`),
  ],
)

export const liveAttendance = pgTable(
  'live_attendance',
  {
    sessionId: uuid()
      .notNull()
      .references(() => liveSessions.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** First join (from our join call, so it works without webhooks). */
    joinedAt: tstz().notNull(),
    /** Last leave and total time in the room, from Daily's participant.left webhooks. */
    leftAt: tstz(),
    totalSec: integer().notNull().default(0),
    isHost: boolean().notNull().default(false),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.userId] }), index().on(t.userId)],
)
