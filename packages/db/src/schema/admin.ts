import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { baseColumns, timestamps, tstz } from '../columns'
import { user } from './identity'

// Append-only. Written for every staff action and every money-affecting action (docs/05 §2).
export const auditLog = pgTable(
  'audit_log',
  {
    ...baseColumns(),
    actorId: uuid().references(() => user.id, { onDelete: 'restrict' }),
    actorKind: text().notNull(),
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: text().notNull(),
    before: jsonb(),
    after: jsonb(),
    ipHash: text(),
    requestId: text().notNull(),
  },
  (t) => [
    index().on(t.targetType, t.targetId, t.createdAt),
    index().on(t.actorId, t.createdAt),
    index().on(t.createdAt),
  ],
)

export const settings = pgTable('settings', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedBy: uuid().references(() => user.id, { onDelete: 'restrict' }),
  ...timestamps(),
})

export const featureFlags = pgTable('feature_flags', {
  key: text().primaryKey(),
  enabled: boolean().notNull().default(false),
  rules: jsonb().notNull().default(sql`'{}'::jsonb`),
  description: text().notNull().default(''),
  updatedBy: uuid().references(() => user.id, { onDelete: 'restrict' }),
  ...timestamps(),
})

export const outboxStatus = pgEnum('outbox_status', ['pending', 'sent', 'failed'])

export const outbox = pgTable(
  'outbox',
  {
    ...baseColumns(),
    eventName: text().notNull(),
    payload: jsonb().notNull(),
    status: outboxStatus().notNull().default('pending'),
    attempts: integer().notNull().default(0),
    availableAt: tstz().notNull().defaultNow(),
    sentAt: tstz(),
    lastError: text(),
  },
  (t) => [index().on(t.status, t.availableAt)],
)

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text().primaryKey(),
    scope: text().notNull(),
    requestHash: text().notNull(),
    response: jsonb(),
    expiresAt: tstz().notNull(),
    ...timestamps(),
  },
  (t) => [index().on(t.expiresAt)],
)
