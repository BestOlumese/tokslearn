import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core'
import { baseColumns, tstz } from '../columns'
import { user } from './identity'

export const bucketEnum = pgEnum('file_bucket', ['public', 'private'])

export const filePurposeEnum = pgEnum('file_purpose', [
  'resource',
  'assignment_submission',
  'cover',
  'avatar',
  'certificate',
  'exam_evidence',
  'statement',
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
    /** The name it had on the uploader's device, cleaned (shown to graders, never used as a key). */
    originalName: text(),
    sha256: text(),
    purpose: filePurposeEnum().notNull(),
    status: fileStatusEnum().notNull().default('pending_upload'),
    scanStatus: scanStatusEnum().notNull().default('pending'),
    uploadedAt: tstz(),
  },
  (t) => [index().on(t.ownerId, t.purpose)],
)

export const videoStatusEnum = pgEnum('video_status', [
  'uploading',
  'processing',
  'ready',
  'failed',
])

/** Videos hosted on Bunny Stream (docs/09 §1–2). The API key never reaches the browser. */
export const videoAssets = pgTable(
  'video_assets',
  {
    ...baseColumns(),
    ownerId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    provider: text().notNull().default('bunny'),
    libraryId: text().notNull(),
    providerVideoId: text().notNull().unique(),
    status: videoStatusEnum().notNull().default('uploading'),
    filename: text().notNull(),
    sizeBytes: bigint({ mode: 'number' }).notNull(),
    durationSec: integer(),
    width: integer(),
    height: integer(),
    thumbnailUrl: text(),
    drmEnabled: boolean().notNull().default(false),
    captions: jsonb().$type<ReadonlyArray<{ lang: string; label: string }>>(),
    error: text(),
    readyAt: tstz(),
  },
  (t) => [index().on(t.ownerId, t.createdAt)],
)
