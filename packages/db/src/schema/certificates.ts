import { sql } from 'drizzle-orm'
import {
  check,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { baseColumns, tstz } from '../columns'
import { quizAttempts } from './assessments'
import { courses } from './courses'
import { enrollments } from './enrollments'
import { user } from './identity'
import { files } from './media'

// Certificates (docs/05 certificates, docs/10 §8). One per learner per course, issued by a job
// when the course's criteria are met; the verify page reads the snapshot columns, never live data.

export const certificateBasisEnum = pgEnum('certificate_basis', ['completion', 'exam', 'external'])
export const certificateStatusEnum = pgEnum('certificate_status', ['active', 'revoked'])
export const externalResultEnum = pgEnum('external_exam_result', ['pass', 'fail'])

/** Layouts per instructor; no row = the platform template. Instructor templates come later. */
export const certificateTemplates = pgTable(
  'certificate_templates',
  {
    ...baseColumns(),
    instructorId: uuid().references(() => user.id, { onDelete: 'cascade' }),
    layout: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [uniqueIndex().on(t.instructorId)],
)

/** Pass or fail recorded by the instructor for an exam taken elsewhere (docs/10 §8 external). */
export const externalExamResults = pgTable(
  'external_exam_results',
  {
    ...baseColumns(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    providerName: text().notNull(),
    examUrl: text(),
    result: externalResultEnum().notNull(),
    score: numeric({ precision: 10, scale: 2, mode: 'number' }),
    evidenceFileId: uuid().references(() => files.id, { onDelete: 'restrict' }),
    recordedBy: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    recordedAt: tstz().notNull(),
  },
  (t) => [
    index().on(t.courseId, t.recordedAt.desc()),
    index().on(t.userId, t.courseId),
    index().on(t.evidenceFileId),
    index().on(t.recordedBy),
  ],
)

export const certificates = pgTable(
  'certificates',
  {
    ...baseColumns(),
    /** Printed on the certificate and used in /verify/{code}, e.g. TL-C-8Q2M-4K7P. */
    publicCode: text().notNull().unique(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    enrollmentId: uuid()
      .notNull()
      .references(() => enrollments.id, { onDelete: 'restrict' }),
    basis: certificateBasisEnum().notNull(),
    quizAttemptId: uuid().references(() => quizAttempts.id, { onDelete: 'restrict' }),
    externalResultId: uuid().references(() => externalExamResults.id, { onDelete: 'restrict' }),
    recipientNameSnapshot: text().notNull(),
    courseTitleSnapshot: text().notNull(),
    instructorNameSnapshot: text().notNull(),
    /** For external certificates: "Externally assessed via {provider}". */
    providerNameSnapshot: text(),
    issuedAt: tstz().notNull(),
    /** The rendered PDF; null until the render job has run. */
    fileId: uuid().references(() => files.id, { onDelete: 'set null' }),
    status: certificateStatusEnum().notNull().default('active'),
    revokedReason: text(),
    revokedAt: tstz(),
    revokedBy: uuid().references(() => user.id, { onDelete: 'restrict' }),
    /** The learner may correct the name once (docs/10 §8); the code stays the same. */
    nameCorrectedAt: tstz(),
  },
  (t) => [
    // Exactly one certificate per learner per course: issuance is insert-if-absent.
    uniqueIndex().on(t.userId, t.courseId),
    index().on(t.courseId, t.issuedAt.desc()),
    index().on(t.enrollmentId),
    index().on(t.quizAttemptId),
    index().on(t.externalResultId),
    index().on(t.fileId),
    index().on(t.revokedBy),
    check(
      'certificates_revoked_has_reason',
      sql`${t.status} = 'active' or (${t.revokedReason} is not null and ${t.revokedAt} is not null)`,
    ),
  ],
)
