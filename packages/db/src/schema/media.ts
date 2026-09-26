import { bigint, index, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { baseColumns, tstz } from '../columns'
import { user } from './identity'

export const bucketEnum = pgEnum('file_bucket', ['public', 'private'])

export const filePurposeEnum = pgEnum('file_purpose', [
  'resource',
  'assignment_submission',
  'cover',
  'avatar',
  'certificate',
  'other',
])

export const fileStatusEnum = pgEnum('file_status', ['pending_upload', 'uploaded'])

export const scanStatusEnum = pgEnum('file_scan_status', [
  'pending',
  'clean',
  'infected',
  'skipped',
])

/** Objects in R2 (docs/05 media, docs/09 §5). Bytes never pass through our servers. */
export const files = pgTable(
  'files',
  {
    ...baseColumns(),
    ownerId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    bucket: bucketEnum().notNull(),
    key: text().notNull().unique(),
    mime: text().notNull(),
    sizeBytes: bigint({ mode: 'number' }).notNull(),
    sha256: text(),
    purpose: filePurposeEnum().notNull(),
    status: fileStatusEnum().notNull().default('pending_upload'),
    scanStatus: scanStatusEnum().notNull().default('pending'),
    uploadedAt: tstz(),
  },
  (t) => [index().on(t.ownerId, t.purpose)],
)
