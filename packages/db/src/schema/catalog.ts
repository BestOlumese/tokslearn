import { type AnyPgColumn, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { baseColumns } from '../columns'

// Catalog taxonomy (docs/05 catalog). `course_search` arrives with search in Phase 3.

/** Two levels in v1: top categories and their subcategories (Udemy-style). */
export const categories = pgTable(
  'categories',
  {
    ...baseColumns(),
    slug: text().notNull().unique(),
    name: text().notNull(),
    parentId: uuid().references((): AnyPgColumn => categories.id, { onDelete: 'restrict' }),
    position: integer().notNull().default(0),
  },
  (t) => [index().on(t.parentId, t.position)],
)

export const tags = pgTable('tags', {
  ...baseColumns(),
  slug: text().notNull().unique(),
  name: text().notNull(),
})
