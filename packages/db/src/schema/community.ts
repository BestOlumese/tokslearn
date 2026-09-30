import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { baseColumns, timestamps, tstz } from '../columns'
import { courses } from './courses'
import { user } from './identity'

// Community (docs/05 community, docs/10 §10): discussions, lesson Q&A and announcements, scoped
// to a course, a cohort run or a lesson. Bodies are stored as editor JSON plus HTML rendered
// server-side from an allowlist; the HTML is never taken from the client.

export const threadScopeEnum = pgEnum('thread_scope', ['course', 'cohort', 'lesson'])
export const threadKindEnum = pgEnum('thread_kind', ['discussion', 'question', 'announcement'])
export const reactionKindEnum = pgEnum('reaction_kind', ['like'])
export const reportTargetEnum = pgEnum('report_target', ['thread', 'post'])
export const reportStatusEnum = pgEnum('report_status', ['open', 'resolved', 'dismissed'])

export const threads = pgTable(
  'threads',
  {
    ...baseColumns(),
    /** Every thread belongs to one course, whatever its scope (access checks, the studio). */
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    scopeType: threadScopeEnum().notNull(),
    /** The course, cohort or lesson id. */
    scopeId: uuid().notNull(),
    kind: threadKindEnum().notNull(),
    authorId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    title: text().notNull(),
    bodyDoc: jsonb().$type<Record<string, unknown>>().notNull(),
    bodyHtml: text().notNull(),
    isPinned: boolean().notNull().default(false),
    isLocked: boolean().notNull().default(false),
    /** The asker's accepted answer (questions). No FK: posts reference threads. */
    acceptedPostId: uuid(),
    /** Questions: when an instructor or TA first answered, or an answer was accepted. */
    answeredAt: tstz(),
    replyCount: integer().notNull().default(0),
    lastActivityAt: tstz().notNull(),
    /** Hidden by a moderator: only staff and the course's teachers still see it. */
    hiddenAt: tstz(),
    hiddenBy: uuid().references(() => user.id, { onDelete: 'restrict' }),
    deletedAt: tstz(),
  },
  (t) => [
    index().on(t.scopeType, t.scopeId, t.lastActivityAt.desc()),
    index().on(t.courseId, t.kind, t.lastActivityAt.desc()),
    index('threads_unanswered_idx')
      .on(t.courseId, t.createdAt)
      .where(sql`${t.kind} = 'question' and ${t.answeredAt} is null and ${t.deletedAt} is null`),
    index().on(t.authorId),
    index().on(t.hiddenBy),
  ],
)

export const posts = pgTable(
  'posts',
  {
    ...baseColumns(),
    threadId: uuid()
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    authorId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    /** A reply to another reply (one level of nesting in the UI). */
    parentId: uuid(),
    bodyDoc: jsonb().$type<Record<string, unknown>>().notNull(),
    bodyHtml: text().notNull(),
    /** Written by the course's instructor or a TA. */
    isInstructorAnswer: boolean().notNull().default(false),
    editedAt: tstz(),
    hiddenAt: tstz(),
    hiddenBy: uuid().references(() => user.id, { onDelete: 'restrict' }),
    deletedAt: tstz(),
  },
  (t) => [
    index().on(t.threadId, t.createdAt),
    index().on(t.authorId),
    index().on(t.parentId),
    index().on(t.hiddenBy),
  ],
)

export const reactions = pgTable(
  'reactions',
  {
    postId: uuid()
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: reactionKindEnum().notNull().default('like'),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId, t.kind] }), index().on(t.userId)],
)

export const reports = pgTable(
  'reports',
  {
    ...baseColumns(),
    targetType: reportTargetEnum().notNull(),
    targetId: uuid().notNull(),
    /** The course the thread or post is in, for the instructor's queue. */
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    reporterId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    reason: text().notNull(),
    status: reportStatusEnum().notNull().default('open'),
    handledBy: uuid().references(() => user.id, { onDelete: 'restrict' }),
    handledAt: tstz(),
  },
  (t) => [
    // One report per person per thing.
    uniqueIndex().on(t.targetType, t.targetId, t.reporterId),
    index('reports_open_idx').on(t.createdAt).where(sql`${t.status} = 'open'`),
    index().on(t.courseId, t.status),
    index().on(t.reporterId),
    index().on(t.handledBy),
  ],
)

export const threadReads = pgTable(
  'thread_reads',
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    threadId: uuid()
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    lastReadAt: tstz().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.threadId] }), index().on(t.threadId)],
)
