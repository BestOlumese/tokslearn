import { char, index, jsonb, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { baseColumns, tstz } from '../columns'
import { user } from './identity'
import { files } from './media'

// Monthly earnings statements (docs/08 §9, ADR-044): one PDF per instructor per month with
// activity, made on the 1st for the month before. Totals are kept with it so the page and the
// email don't re-read the ledger.

export const earningStatements = pgTable(
  'earning_statements',
  {
    ...baseColumns(),
    instructorId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    /** `YYYY-MM`, Lagos calendar month. */
    month: char({ length: 7 }).notNull(),
    fileId: uuid().references(() => files.id, { onDelete: 'restrict' }),
    /** Kobo amounts as strings and counts (see `StatementTotals` in core). */
    totals: jsonb().$type<Record<string, string | number>>().notNull(),
    emailedAt: tstz(),
  },
  (t) => [uniqueIndex().on(t.instructorId, t.month), index().on(t.fileId)],
)
