import { bigint, char, timestamp, uuid } from 'drizzle-orm/pg-core'
import { newId } from './ids'

/** `timestamptz`, stored UTC. */
export const tstz = () => timestamp({ withTimezone: true, mode: 'date' })

/** `created_at` + `updated_at` for every table. `updated_at` is set by the app on update. */
export const timestamps = () => ({
  createdAt: tstz().notNull().defaultNow(),
  updatedAt: tstz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

/** UUIDv7 primary key + timestamps. Spread into every table with a surrogate key. */
export const baseColumns = () => ({
  id: uuid().primaryKey().$defaultFn(newId),
  ...timestamps(),
})

/** Integer kobo amount. Money is never a float (CLAUDE.md §1.4). */
export const kobo = () => bigint({ mode: 'bigint' })

/** ISO 4217 currency; NGN only until Phase 16 (ADR-014). */
export const currency = () => char({ length: 3 }).notNull().default('NGN')
