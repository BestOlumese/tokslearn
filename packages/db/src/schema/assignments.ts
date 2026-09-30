import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { baseColumns, tstz } from '../columns'
import { courses } from './courses'
import { user } from './identity'

// Assignments, submissions and grades (docs/05 assignments, docs/10 §7). Instructors and the
// course's TAs grade with a rubric; the learner sees the grade and feedback.

const score = () => numeric({ precision: 10, scale: 2, mode: 'number' })

export const dueModeEnum = pgEnum('assignment_due_mode', [
  'none',
  'days_after_enrollment',
  'cohort_date',
])
export const submissionStatusEnum = pgEnum('submission_status', [
  'draft',
  'submitted',
  'grading',
  'graded',
  'returned',
])
export const gradeDecisionEnum = pgEnum('grade_decision', ['graded', 'returned'])

export const assignments = pgTable(
  'assignments',
  {
    ...baseColumns(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    instructionsDoc: jsonb().$type<Record<string, unknown>>(),
    instructionsHtml: text(),
    /** Any of text, file, link (Zod in core). */
    submissionTypes: text().array().notNull().default(sql`'{text}'::text[]`),
    maxFiles: smallint().notNull().default(3),
    maxFileMb: smallint().notNull().default(20),
    /** Criteria × levels (Zod in core). Null: a single score out of `max_score`. */
    rubric: jsonb().$type<Record<string, unknown>>(),
    maxScore: score().notNull().default(100),
    passPct: smallint().notNull().default(50),
    dueMode: dueModeEnum().notNull().default('none'),
    dueDays: smallint(),
    /** accept | penalty (with %) | reject, and grace hours (Zod in core). */
    latePolicy: jsonb()
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{"mode":"accept"}'::jsonb`),
    /** How many times a learner may submit again after a grade or a return. */
    resubmissionsAllowed: smallint().notNull().default(0),
  },
  (t) => [
    index().on(t.courseId),
    check('assignments_pass_pct', sql`${t.passPct} between 0 and 100`),
    check(
      'assignments_limits',
      sql`${t.maxFiles} between 0 and 10 and ${t.maxFileMb} between 1 and 100`,
    ),
  ],
)

export const submissions = pgTable(
  'submissions',
  {
    ...baseColumns(),
    assignmentId: uuid()
      .notNull()
      .references(() => assignments.id, { onDelete: 'restrict' }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    attemptNo: smallint().notNull(),
    status: submissionStatusEnum().notNull().default('draft'),
    textDoc: jsonb().$type<Record<string, unknown>>(),
    textHtml: text(),
    fileIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    link: text(),
    submittedAt: tstz(),
    isLate: boolean().notNull().default(false),
    /** Late-penalty percentage frozen at submission (late policy "penalty"). */
    latePenaltyPct: smallint().notNull().default(0),
  },
  (t) => [
    uniqueIndex().on(t.assignmentId, t.userId, t.attemptNo),
    // One draft per learner per assignment.
    uniqueIndex('submissions_one_draft')
      .on(t.assignmentId, t.userId)
      .where(sql`${t.status} = 'draft'`),
    index().on(t.userId),
    // The grading queue: oldest submitted first.
    index('submissions_queue')
      .on(t.assignmentId, t.submittedAt)
      .where(sql`${t.status} in ('submitted', 'grading')`),
  ],
)

export const grades = pgTable(
  'grades',
  {
    ...baseColumns(),
    submissionId: uuid()
      .notNull()
      .unique()
      .references(() => submissions.id, { onDelete: 'restrict' }),
    graderId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    decision: gradeDecisionEnum().notNull().default('graded'),
    rubricScores: jsonb().$type<Record<string, unknown>>(),
    score: score(),
    maxScore: score(),
    passed: boolean(),
    feedbackDoc: jsonb().$type<Record<string, unknown>>(),
    feedbackHtml: text(),
    gradedAt: tstz().notNull(),
  },
  (t) => [index().on(t.graderId)],
)
