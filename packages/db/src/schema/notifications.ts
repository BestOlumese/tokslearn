import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { baseColumns, timestamps, tstz } from '../columns'
import { user } from './identity'

// Notifications (docs/05 notifications, docs/13 §3, ADR-041). One row per notification, written
// by `notifications.notify`. `in_app` false rows exist only to be emailed or digested; the bell
// and the list skip them.

export const notificationChannelEnum = pgEnum('notification_channel', ['email', 'in_app', 'push'])
export const notificationEmailEnum = pgEnum('notification_email', [
  /** No email for this one (the person turned it off, or the type has none). */
  'none',
  /** Handed to the email job. */
  'sent',
  /** Busy hour: waiting for the digest. */
  'digest_pending',
  /** Went out in a digest. */
  'digested',
])

export const notifications = pgTable(
  'notifications',
  {
    ...baseColumns(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** A key of core's notification type registry, e.g. `thread.reply`. */
    type: text().notNull(),
    title: text().notNull(),
    body: text(),
    /** Path inside the app, e.g. `/learn/excel/community/…`. */
    link: text(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    inApp: boolean().notNull().default(true),
    email: notificationEmailEnum().notNull().default('none'),
    readAt: tstz(),
    /** Set by senders that may run twice (jobs): a second insert with the same key is skipped. */
    dedupeKey: text(),
  },
  (t) => [
    index('notifications_list_idx').on(t.userId, t.createdAt.desc()).where(sql`${t.inApp}`),
    // The bell's count: an index-only scan over a person's unread rows.
    index('notifications_unread_idx').on(t.userId).where(sql`${t.inApp} and ${t.readAt} is null`),
    uniqueIndex('notifications_dedupe_idx')
      .on(t.userId, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
    index('notifications_digest_idx')
      .on(t.userId, t.createdAt)
      .where(sql`${t.email} in ('sent', 'digest_pending')`),
  ],
)

/** Only choices that differ from the type's default are stored. */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text().notNull(),
    channel: notificationChannelEnum().notNull(),
    enabled: boolean().notNull(),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type, t.channel] })],
)
