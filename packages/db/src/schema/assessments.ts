import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { baseColumns, timestamps, tstz } from '../columns'
import { courses } from './courses'
import { user } from './identity'

// Question banks, quizzes, exams and attempts (docs/05 assessments, docs/10 §5–6). Answers live
// only here and in grading: `questions.answer` is never sent to a client. JSON columns are
// validated by Zod in core on every read and write.

/** Scores allow partial credit (ordering, matching), so they are decimals, never floats. */
const score = () => numeric({ precision: 10, scale: 2, mode: 'number' })

export const questionTypeEnum = pgEnum('question_type', [
  'single',
  'multiple',
  'true_false',
  'short_text',
  'ordering',
  'matching',
])
export const difficultyEnum = pgEnum('question_difficulty', ['easy', 'medium', 'hard'])
export const quizKindEnum = pgEnum('quiz_kind', ['practice', 'graded', 'exam'])
export const attemptStatusEnum = pgEnum('attempt_status', [
  'in_progress',
  'submitted',
  'auto_submitted',
  'graded',
  'void',
])

export const questionBanks = pgTable(
  'question_banks',
  {
    ...baseColumns(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    ownerId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    title: text().notNull(),
    archivedAt: tstz(),
  },
  (t) => [index().on(t.courseId), index().on(t.ownerId)],
)

export const questions = pgTable(
  'questions',
  {
    ...baseColumns(),
    bankId: uuid()
      .notNull()
      .references(() => questionBanks.id, { onDelete: 'restrict' }),
    type: questionTypeEnum().notNull(),
    promptDoc: jsonb().$type<Record<string, unknown>>().notNull(),
    promptHtml: text().notNull(),
    /** Choices, or items to order, or the two columns to match (shape per type, Zod in core). */
    options: jsonb().$type<unknown>().notNull(),
    /** Never sent to clients. */
    answer: jsonb().$type<unknown>().notNull(),
    explanationHtml: text(),
    points: smallint().notNull().default(1),
    difficulty: difficultyEnum(),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    position: integer().notNull().default(0),
    /**
     * Questions that attempts point at are archived, never deleted: attempts keep their frozen
     * question list and answers (ADR-035).
     */
    archivedAt: tstz(),
  },
  (t) => [
    index().on(t.bankId, t.position),
    check('questions_points', sql`${t.points} between 1 and 100`),
  ],
)

export const quizzes = pgTable(
  'quizzes',
  {
    ...baseColumns(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    kind: quizKindEnum().notNull().default('practice'),
    title: text().notNull(),
    /** Time limit, attempts, cooldown, pass mark, shuffling, draw size, show_answers (Zod in core). */
    settings: jsonb().$type<Record<string, unknown>>().notNull(),
  },
  (t) => [index().on(t.courseId)],
)

/** Fixed quizzes: the questions, in order. */
export const quizQuestions = pgTable(
  'quiz_questions',
  {
    quizId: uuid()
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    position: integer().notNull(),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.quizId, t.questionId] }), index().on(t.questionId)],
)

/** Draw quizzes: N questions from a bank, optionally only those with some tags. */
export const quizSources = pgTable(
  'quiz_sources',
  {
    ...baseColumns(),
    quizId: uuid()
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    bankId: uuid()
      .notNull()
      .references(() => questionBanks.id, { onDelete: 'restrict' }),
    questionCount: smallint().notNull(),
    tagFilter: text().array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [
    index().on(t.quizId),
    index().on(t.bankId),
    check('quiz_sources_count', sql`${t.questionCount} between 1 and 200`),
  ],
)

export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    ...baseColumns(),
    quizId: uuid()
      .notNull()
      .references(() => quizzes.id, { onDelete: 'restrict' }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    attemptNo: smallint().notNull(),
    status: attemptStatusEnum().notNull().default('in_progress'),
    startedAt: tstz().notNull(),
    /** Server deadline (timed quizzes and exams); answers after it plus grace are rejected. */
    deadlineAt: tstz(),
    submittedAt: tstz(),
    /** The questions drawn for this attempt, in the order shown. Frozen at start. */
    questionIds: uuid().array().notNull(),
    /** Per question, the option ids in the order shown. Frozen at start. */
    optionOrders: jsonb().$type<Record<string, string[]>>().notNull(),
    score: score(),
    maxScore: score(),
    passed: boolean(),
    /** Recorded, never blocking (docs/10 §6): focus loss, fullscreen exits, pastes, IP changes. */
    integrity: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    flagged: boolean().notNull().default(false),
    voidReason: text(),
    voidedBy: uuid().references(() => user.id, { onDelete: 'restrict' }),
    voidedAt: tstz(),
  },
  (t) => [
    // One attempt in progress per learner per quiz, even under concurrent starts.
    uniqueIndex('quiz_attempts_one_in_progress')
      .on(t.quizId, t.userId)
      .where(sql`${t.status} = 'in_progress'`),
    uniqueIndex().on(t.quizId, t.userId, t.attemptNo),
    index().on(t.userId),
    // The auto-submit job scans in-progress attempts by deadline.
    index('quiz_attempts_deadline').on(t.deadlineAt).where(sql`${t.status} = 'in_progress'`),
    index('quiz_attempts_flagged').on(t.quizId).where(sql`${t.flagged}`),
    index().on(t.voidedBy),
  ],
)

export const attemptAnswers = pgTable(
  'attempt_answers',
  {
    attemptId: uuid()
      .notNull()
      .references(() => quizAttempts.id, { onDelete: 'cascade' }),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    answer: jsonb().$type<unknown>().notNull(),
    isCorrect: boolean(),
    pointsAwarded: score(),
    answeredAt: tstz().notNull(),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.attemptId, t.questionId] }), index().on(t.questionId)],
)
