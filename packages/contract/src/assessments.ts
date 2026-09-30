import { z } from 'zod'

// Question shapes, answer keys, learner answers and quiz settings (docs/05 assessments,
// docs/10 §5–6). Shared by core (validation, grading), the web and the mobile app.
// `AnswerKey` is authoring-only: it never appears in a learner-facing DTO.

export const QuestionType = z.enum([
  'single',
  'multiple',
  'true_false',
  'short_text',
  'ordering',
  'matching',
])
export type QuestionType = z.infer<typeof QuestionType>

const OptionId = z.string().regex(/^[a-z0-9]{1,16}$/, 'Option ids are short lowercase codes.')
const OptionText = z.string().trim().min(1).max(500)
const Item = z.object({ id: OptionId, text: OptionText })

const uniqueIds = (items: ReadonlyArray<{ id: string }>) =>
  new Set(items.map((i) => i.id)).size === items.length

const Items = (min: number, max: number) =>
  z.array(Item).min(min).max(max).refine(uniqueIds, { message: 'Each option needs its own id.' })

/** What the learner is shown, per type (in authoring order; attempts shuffle a copy). */
export const QuestionOptions = {
  single: z.object({ choices: Items(2, 10) }),
  multiple: z.object({ choices: Items(2, 10) }),
  true_false: z.object({}),
  short_text: z.object({}),
  ordering: z.object({ items: Items(2, 10) }),
  matching: z.object({ left: Items(2, 10), right: Items(2, 12) }),
} as const

export const AcceptedText = z.string().trim().min(1).max(200)

/** The correct answer, per type. Never sent to learners. */
export const AnswerKey = {
  single: z.object({ choice: OptionId }),
  multiple: z.object({ choices: z.array(OptionId).min(1).max(10) }),
  true_false: z.object({ value: z.boolean() }),
  short_text: z.object({
    /** Any of these counts, compared after normalising case, spaces and end punctuation. */
    accepted: z.array(AcceptedText).min(1).max(20),
    caseSensitive: z.boolean().default(false),
  }),
  ordering: z.object({ order: z.array(OptionId).min(2).max(10) }),
  matching: z.object({
    pairs: z
      .array(z.object({ left: OptionId, right: OptionId }))
      .min(2)
      .max(10),
  }),
} as const

/** What the learner sends, per type. */
export const LearnerAnswer = {
  single: z.object({ choice: OptionId }),
  multiple: z.object({ choices: z.array(OptionId).max(10) }),
  true_false: z.object({ value: z.boolean() }),
  short_text: z.object({ text: z.string().max(500) }),
  ordering: z.object({ order: z.array(OptionId).max(10) }),
  matching: z.object({
    pairs: z.array(z.object({ left: OptionId, right: OptionId })).max(10),
  }),
} as const

export type QuestionOptionsOf<T extends QuestionType> = z.infer<(typeof QuestionOptions)[T]>
export type AnswerKeyOf<T extends QuestionType> = z.infer<(typeof AnswerKey)[T]>
export type LearnerAnswerOf<T extends QuestionType> = z.infer<(typeof LearnerAnswer)[T]>

/** Any learner answer, as it travels (the question's type decides which shape applies). */
export const AnyLearnerAnswer = z.union([
  LearnerAnswer.single,
  LearnerAnswer.multiple,
  LearnerAnswer.true_false,
  LearnerAnswer.short_text,
  LearnerAnswer.ordering,
  LearnerAnswer.matching,
])

export const QuizKind = z.enum(['practice', 'graded', 'exam'])
export type QuizKind = z.infer<typeof QuizKind>
export const ShowAnswers = z.enum(['never', 'after_submit', 'after_pass', 'after_close'])

export const QuizSettings = z.object({
  /** Fixed list of questions, or drawn from banks each attempt. */
  mode: z.enum(['fixed', 'draw']).default('fixed'),
  timeLimitSec: z
    .number()
    .int()
    .min(60)
    .max(4 * 60 * 60)
    .nullable()
    .default(null),
  /** Null: unlimited. */
  attemptsAllowed: z.number().int().min(1).max(50).nullable().default(null),
  cooldownHours: z
    .number()
    .int()
    .min(0)
    .max(24 * 30)
    .default(0),
  passPct: z.number().int().min(0).max(100).default(70),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(true),
  showAnswers: ShowAnswers.default('after_submit'),
  /** For `after_close`: when answers become visible to everyone. */
  closesAt: z.iso.datetime({ offset: true }).nullable().default(null),
  /** Ordering and matching earn a share of the points for each item placed right. */
  partialCredit: z.boolean().default(true),
  /** Exams: every other lesson completed first. */
  requireAllLessons: z.boolean().default(false),
  /** Exams: one question per screen instead of the full paper. */
  oneQuestionPerScreen: z.boolean().default(false),
})
export type QuizSettings = z.infer<typeof QuizSettings>

/** Sensible starting settings per kind (the studio can change them). */
export const defaultQuizSettings = (kind: QuizKind): QuizSettings =>
  QuizSettings.parse(
    kind === 'exam'
      ? {
          timeLimitSec: 3600,
          attemptsAllowed: 2,
          cooldownHours: 24,
          passPct: 70,
          shuffleQuestions: true,
          showAnswers: 'never',
          requireAllLessons: true,
        }
      : kind === 'graded'
        ? { attemptsAllowed: 3, passPct: 70 }
        : { passPct: 0 },
  )
