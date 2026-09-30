import {
  defaultQuizSettings,
  type QuestionType,
  type QuizKind,
  QuizSettings,
  type RichTextDoc,
} from '@tokslearn/contract'
import { schema } from '@tokslearn/db'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import {
  addLesson,
  renderRichText,
  richTextToPlain,
  type StudioCourse,
  type StudioCourseRef,
  studioCourse,
} from '../courses'
import type { Ctx } from '../kernel/ctx'
import { inTransaction } from '../kernel/ctx'
import { NotFoundError, RuleViolationError, ValidationError } from '../kernel/errors'
import { validateQuestion } from './grading'

// Authoring (docs/20 `/teach/courses/[id]/assessments`): question banks, questions, and quiz
// settings. Quizzes are lessons; their questions and settings are edited in place, like articles
// (ADR-035). Answer keys are returned here only, to people who can open the course in the studio.
// Foreign reads (docs/03 §3): lessons, courses, course_staff.

const { questionBanks, questions, quizzes, quizQuestions, quizSources, lessons } = schema

export const MAX_QUIZ_QUESTIONS = 200
export const MAX_QUIZ_SOURCES = 10

// ─── Banks ───────────────────────────────────────────────────────────────────────────────────

export interface BankView {
  id: string
  courseId: string
  title: string
  questionCount: number
}

const cleanTitle = (title: string, path = 'title') => {
  const t = title.trim()
  if (t.length < 2 || t.length > 120) {
    throw new ValidationError([{ path, message: 'Between 2 and 120 characters.' }])
  }
  return t
}

export async function listBanks(ctx: Ctx, courseId: string): Promise<BankView[]> {
  const course = await studioCourse(ctx, courseId, 'view')
  return ctx.db
    .select({
      id: questionBanks.id,
      courseId: questionBanks.courseId,
      title: questionBanks.title,
      questionCount: sql<number>`(select count(*)::int from questions q where q.bank_id = ${questionBanks.id} and q.archived_at is null)`,
    })
    .from(questionBanks)
    .where(and(eq(questionBanks.courseId, course.id), isNull(questionBanks.archivedAt)))
    .orderBy(asc(questionBanks.createdAt))
}

async function bankFor(ctx: Ctx, bankId: string, need: 'view' | 'edit') {
  const [bank] = await ctx.db
    .select()
    .from(questionBanks)
    .where(and(eq(questionBanks.id, bankId), isNull(questionBanks.archivedAt)))
  if (!bank) throw new NotFoundError('QUESTION_BANK_NOT_FOUND')
  try {
    const course = await studioCourse(ctx, bank.courseId, need)
    return { bank, course }
  } catch (e) {
    // Someone else's bank looks like a missing one.
    if (e instanceof NotFoundError) throw new NotFoundError('QUESTION_BANK_NOT_FOUND')
    throw e
  }
}

export async function createBank(ctx: Ctx, input: { courseId: string; title: string }) {
  const course = await studioCourse(ctx, input.courseId, 'edit')
  const [bank] = await ctx.db
    .insert(questionBanks)
    .values({ courseId: course.id, ownerId: course.user.userId, title: cleanTitle(input.title) })
    .returning()
  if (!bank) throw new Error('bank not inserted')
  return { id: bank.id, courseId: bank.courseId, title: bank.title, questionCount: 0 }
}

export async function renameBank(ctx: Ctx, input: { bankId: string; title: string }) {
  const { bank } = await bankFor(ctx, input.bankId, 'edit')
  await ctx.db
    .update(questionBanks)
    .set({ title: cleanTitle(input.title) })
    .where(eq(questionBanks.id, bank.id))
}

/** Archives a bank. A bank a quiz still draws from can't go: remove it from the quiz first. */
export async function archiveBank(ctx: Ctx, bankId: string) {
  const { bank } = await bankFor(ctx, bankId, 'edit')
  const [used] = await ctx.db
    .select({ id: quizSources.id })
    .from(quizSources)
    .where(eq(quizSources.bankId, bank.id))
    .limit(1)
  if (used) {
    throw new RuleViolationError('VALIDATION_FAILED', {
      issues: [{ path: 'bankId', message: 'A quiz draws from this bank. Remove it there first.' }],
    })
  }
  await ctx.db
    .update(questionBanks)
    .set({ archivedAt: ctx.now })
    .where(eq(questionBanks.id, bank.id))
}

// ─── Questions ───────────────────────────────────────────────────────────────────────────────

export interface QuestionView {
  id: string
  bankId: string
  type: QuestionType
  promptDoc: RichTextDoc
  promptHtml: string
  options: unknown
  /** The answer key: studio only. */
  answer: unknown
  explanationDoc: RichTextDoc | null
  points: number
  difficulty: 'easy' | 'medium' | 'hard' | null
  tags: string[]
  position: number
}

type QuestionRow = typeof questions.$inferSelect
const toQuestionView = (q: QuestionRow): QuestionView => ({
  id: q.id,
  bankId: q.bankId,
  type: q.type,
  promptDoc: q.promptDoc as RichTextDoc,
  promptHtml: q.promptHtml,
  options: q.options,
  answer: q.answer,
  explanationDoc: (q.explanationDoc as RichTextDoc | null) ?? null,
  points: q.points,
  difficulty: q.difficulty,
  tags: q.tags,
  position: q.position,
})

export async function listQuestions(ctx: Ctx, bankId: string): Promise<QuestionView[]> {
  const { bank } = await bankFor(ctx, bankId, 'view')
  const rows = await ctx.db
    .select()
    .from(questions)
    .where(and(eq(questions.bankId, bank.id), isNull(questions.archivedAt)))
    .orderBy(asc(questions.position), asc(questions.createdAt))
  return rows.map(toQuestionView)
}

export interface QuestionInput {
  prompt: RichTextDoc
  options: unknown
  answer: unknown
  explanation?: RichTextDoc | null | undefined
  points: number
  difficulty?: 'easy' | 'medium' | 'hard' | null | undefined
  tags?: string[] | undefined
}

function cleanQuestion(type: QuestionType, input: QuestionInput) {
  const promptText = richTextToPlain(input.prompt)
  if (promptText.length < 1 || promptText.length > 5000) {
    throw new ValidationError([
      { path: 'prompt', message: 'Write the question (up to 5,000 characters).' },
    ])
  }
  if (!Number.isInteger(input.points) || input.points < 1 || input.points > 100) {
    throw new ValidationError([{ path: 'points', message: 'Between 1 and 100 points.' }])
  }
  const { options, key } = validateQuestion(type, input.options, input.answer)
  const tags = [...new Set((input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))]
  if (tags.length > 10 || tags.some((t) => t.length > 40)) {
    throw new ValidationError([{ path: 'tags', message: 'Up to 10 tags of 40 characters.' }])
  }
  const explanation =
    input.explanation && richTextToPlain(input.explanation) ? input.explanation : null
  return {
    promptDoc: input.prompt as unknown as Record<string, unknown>,
    promptHtml: renderRichText(input.prompt),
    options,
    answer: key,
    explanationDoc: explanation as unknown as Record<string, unknown> | null,
    explanationHtml: explanation ? renderRichText(explanation) : null,
    points: input.points,
    difficulty: input.difficulty ?? null,
    tags,
  }
}

export async function createQuestion(
  ctx: Ctx,
  input: QuestionInput & { bankId: string; type: QuestionType },
): Promise<QuestionView> {
  const { bank } = await bankFor(ctx, input.bankId, 'edit')
  const values = cleanQuestion(input.type, input)
  const [row] = await ctx.db
    .insert(questions)
    .values({
      ...values,
      bankId: bank.id,
      type: input.type,
      position: sql`(select coalesce(max(q.position), 0) + 1 from questions q where q.bank_id = ${bank.id})`,
    })
    .returning()
  if (!row) throw new Error('question not inserted')
  return toQuestionView(row)
}

async function questionFor(ctx: Ctx, questionId: string, need: 'view' | 'edit') {
  const [q] = await ctx.db
    .select()
    .from(questions)
    .where(and(eq(questions.id, questionId), isNull(questions.archivedAt)))
  if (!q) throw new NotFoundError('QUESTION_NOT_FOUND')
  try {
    const { course } = await bankFor(ctx, q.bankId, need)
    return { question: q, course }
  } catch (e) {
    if (e instanceof NotFoundError) throw new NotFoundError('QUESTION_NOT_FOUND')
    throw e
  }
}

/**
 * Edits a question in place (the type can't change). Attempts already submitted keep their
 * grades; attempts in progress are graded against the new key (ADR-035).
 */
export async function updateQuestion(
  ctx: Ctx,
  input: QuestionInput & { questionId: string },
): Promise<QuestionView> {
  const { question } = await questionFor(ctx, input.questionId, 'edit')
  const [row] = await ctx.db
    .update(questions)
    .set(cleanQuestion(question.type, input))
    .where(eq(questions.id, question.id))
    .returning()
  if (!row) throw new Error('question not updated')
  return toQuestionView(row)
}

/** Archives a question and takes it out of fixed quizzes. Past attempts keep pointing at it. */
export async function archiveQuestion(ctx: Ctx, questionId: string) {
  const { question } = await questionFor(ctx, questionId, 'edit')
  await inTransaction(ctx, async (tx) => {
    await tx.db.update(questions).set({ archivedAt: tx.now }).where(eq(questions.id, question.id))
    await tx.db.delete(quizQuestions).where(eq(quizQuestions.questionId, question.id))
  })
}

// ─── Quizzes ─────────────────────────────────────────────────────────────────────────────────

/**
 * Adds a quiz or exam lesson: the lesson (courses) and its quiz (here) in one transaction.
 * Like any new lesson on a published course, learners see it after the next review.
 */
export async function addQuizLesson(
  ctx: Ctx,
  input: { courseId: string; version: number; sectionId: string; title: string; kind: QuizKind },
): Promise<StudioCourse> {
  return addLesson(ctx, {
    courseId: input.courseId,
    version: input.version,
    sectionId: input.sectionId,
    type: 'quiz',
    title: input.title,
    attach: async (tx, course) => {
      const [quiz] = await tx.db
        .insert(quizzes)
        .values({
          courseId: course.id,
          kind: input.kind,
          title: input.title.trim(),
          settings: defaultQuizSettings(input.kind),
        })
        .returning({ id: quizzes.id })
      if (!quiz) throw new Error('quiz not inserted')
      return { quizId: quiz.id }
    },
  })
}

export interface StudioQuiz {
  id: string
  courseId: string
  kind: QuizKind
  lessonId: string | null
  lessonTitle: string | null
  isLive: boolean
  settings: QuizSettings
  /** Fixed mode: the questions in order. */
  questions: Array<{
    id: string
    type: QuestionType
    promptHtml: string
    points: number
    bankId: string
  }>
  /** Draw mode: banks and how many to draw; `available` is how many the bank holds now. */
  sources: Array<{
    id: string
    bankId: string
    bankTitle: string
    questionCount: number
    tagFilter: string[]
    available: number
  }>
  /** Questions an attempt will show (fixed count, or the draws the banks can fill). */
  questionsPerAttempt: number
  canEdit: boolean
}

/** Settings as stored, read through the schema so older rows gain new defaults. */
export const readSettings = (raw: unknown): QuizSettings => QuizSettings.parse(raw ?? {})

async function quizFor(ctx: Ctx, quizId: string, need: 'view' | 'edit') {
  const [quiz] = await ctx.db.select().from(quizzes).where(eq(quizzes.id, quizId))
  if (!quiz) throw new NotFoundError('QUIZ_NOT_FOUND')
  try {
    return { quiz, course: await studioCourse(ctx, quiz.courseId, need) }
  } catch (e) {
    if (e instanceof NotFoundError) throw new NotFoundError('QUIZ_NOT_FOUND')
    throw e
  }
}

export async function getStudioQuiz(ctx: Ctx, quizId: string): Promise<StudioQuiz> {
  const { quiz, course } = await quizFor(ctx, quizId, 'view')
  return studioQuizView(ctx, quiz, course)
}

async function studioQuizView(
  ctx: Ctx,
  quiz: typeof quizzes.$inferSelect,
  course: StudioCourseRef,
): Promise<StudioQuiz> {
  const [lessonRows, fixed, sources] = await Promise.all([
    ctx.db
      .select({ id: lessons.id, title: lessons.title, liveSince: lessons.liveSince })
      .from(lessons)
      .where(and(eq(lessons.quizId, quiz.id), isNull(lessons.deletedAt))),
    ctx.db
      .select({
        id: questions.id,
        type: questions.type,
        promptHtml: questions.promptHtml,
        points: questions.points,
        bankId: questions.bankId,
      })
      .from(quizQuestions)
      .innerJoin(questions, eq(questions.id, quizQuestions.questionId))
      .where(and(eq(quizQuestions.quizId, quiz.id), isNull(questions.archivedAt)))
      .orderBy(asc(quizQuestions.position)),
    ctx.db
      .select({
        id: quizSources.id,
        bankId: quizSources.bankId,
        bankTitle: questionBanks.title,
        questionCount: quizSources.questionCount,
        tagFilter: quizSources.tagFilter,
        available: sql<number>`(select count(*)::int from questions q where q.bank_id = ${quizSources.bankId} and q.archived_at is null and (cardinality(${quizSources.tagFilter}) = 0 or q.tags && ${quizSources.tagFilter}))`,
      })
      .from(quizSources)
      .innerJoin(questionBanks, eq(questionBanks.id, quizSources.bankId))
      .where(eq(quizSources.quizId, quiz.id))
      .orderBy(asc(quizSources.createdAt)),
  ])
  const settings = readSettings(quiz.settings)
  const lesson = lessonRows[0]
  return {
    id: quiz.id,
    courseId: quiz.courseId,
    kind: quiz.kind,
    lessonId: lesson?.id ?? null,
    lessonTitle: lesson?.title ?? null,
    isLive: lesson?.liveSince != null,
    settings,
    questions: fixed,
    sources,
    questionsPerAttempt:
      settings.mode === 'fixed'
        ? fixed.length
        : sources.reduce((n, s) => n + Math.min(s.questionCount, s.available), 0),
    canEdit: course.canEdit,
  }
}

/**
 * The quizzes and exams in a course's curriculum, for the assessments tab. A quiz whose lesson was
 * deleted keeps its row (attempts point at it) but has nothing left to edit, so it isn't listed.
 */
export async function listCourseQuizzes(ctx: Ctx, courseId: string): Promise<StudioQuiz[]> {
  const course = await studioCourse(ctx, courseId, 'view')
  const rows = await ctx.db
    .select()
    .from(quizzes)
    .where(eq(quizzes.courseId, course.id))
    .orderBy(asc(quizzes.createdAt), asc(quizzes.id))
  const views = await Promise.all(rows.map((q) => studioQuizView(ctx, q, course)))
  return views.filter((q) => q.lessonId !== null)
}

export async function updateQuiz(
  ctx: Ctx,
  input: { quizId: string; kind: QuizKind; settings: unknown },
): Promise<StudioQuiz> {
  const { quiz, course } = await quizFor(ctx, input.quizId, 'edit')
  const parsed = QuizSettings.safeParse(input.settings)
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => ({
        path: ['settings', ...i.path.map(String)].join('.'),
        message: i.message,
      })),
    )
  }
  const settings = parsed.data
  if (input.kind === 'exam' && settings.timeLimitSec === null) {
    throw new ValidationError([
      { path: 'settings.timeLimitSec', message: 'Exams need a time limit.' },
    ])
  }
  if (settings.showAnswers === 'after_close' && !settings.closesAt) {
    throw new ValidationError([
      { path: 'settings.closesAt', message: 'Pick when answers become visible.' },
    ])
  }
  const [row] = await ctx.db
    .update(quizzes)
    .set({ kind: input.kind, settings })
    .where(eq(quizzes.id, quiz.id))
    .returning()
  if (!row) throw new Error('quiz not updated')
  return studioQuizView(ctx, row, course)
}

/** Fixed mode: the questions, in order. They must come from this course's banks. */
export async function setQuizQuestions(
  ctx: Ctx,
  input: { quizId: string; questionIds: string[] },
): Promise<StudioQuiz> {
  const { quiz, course } = await quizFor(ctx, input.quizId, 'edit')
  const ids = [...new Set(input.questionIds)]
  if (ids.length > MAX_QUIZ_QUESTIONS) {
    throw new ValidationError([
      { path: 'questionIds', message: `Up to ${MAX_QUIZ_QUESTIONS} questions.` },
    ])
  }
  if (ids.length > 0) {
    const found = await ctx.db
      .select({ id: questions.id })
      .from(questions)
      .innerJoin(questionBanks, eq(questionBanks.id, questions.bankId))
      .where(
        and(
          inArray(questions.id, ids),
          eq(questionBanks.courseId, course.id),
          isNull(questions.archivedAt),
          isNull(questionBanks.archivedAt),
        ),
      )
    if (found.length !== ids.length) throw new NotFoundError('QUESTION_NOT_FOUND')
  }
  await inTransaction(ctx, async (tx) => {
    await tx.db.delete(quizQuestions).where(eq(quizQuestions.quizId, quiz.id))
    if (ids.length > 0) {
      await tx.db
        .insert(quizQuestions)
        .values(ids.map((questionId, position) => ({ quizId: quiz.id, questionId, position })))
    }
  })
  return studioQuizView(ctx, quiz, course)
}

/** Draw mode: which banks, how many from each, optionally only questions with some tags. */
export async function setQuizSources(
  ctx: Ctx,
  input: {
    quizId: string
    sources: Array<{ bankId: string; questionCount: number; tagFilter?: string[] | undefined }>
  },
): Promise<StudioQuiz> {
  const { quiz, course } = await quizFor(ctx, input.quizId, 'edit')
  if (input.sources.length > MAX_QUIZ_SOURCES) {
    throw new ValidationError([{ path: 'sources', message: `Up to ${MAX_QUIZ_SOURCES} banks.` }])
  }
  input.sources.forEach((s, i) => {
    if (
      !Number.isInteger(s.questionCount) ||
      s.questionCount < 1 ||
      s.questionCount > MAX_QUIZ_QUESTIONS
    ) {
      throw new ValidationError([
        { path: `sources.${i}.questionCount`, message: 'Between 1 and 200.' },
      ])
    }
  })
  const bankIds = [...new Set(input.sources.map((s) => s.bankId))]
  if (bankIds.length !== input.sources.length) {
    throw new ValidationError([{ path: 'sources', message: 'Each bank once.' }])
  }
  if (bankIds.length > 0) {
    const found = await ctx.db
      .select({ id: questionBanks.id })
      .from(questionBanks)
      .where(
        and(
          inArray(questionBanks.id, bankIds),
          eq(questionBanks.courseId, course.id),
          isNull(questionBanks.archivedAt),
        ),
      )
    if (found.length !== bankIds.length) throw new NotFoundError('QUESTION_BANK_NOT_FOUND')
  }
  await inTransaction(ctx, async (tx) => {
    await tx.db.delete(quizSources).where(eq(quizSources.quizId, quiz.id))
    if (input.sources.length > 0) {
      await tx.db.insert(quizSources).values(
        input.sources.map((s) => ({
          quizId: quiz.id,
          bankId: s.bankId,
          questionCount: s.questionCount,
          tagFilter: [
            ...new Set((s.tagFilter ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean)),
          ],
        })),
      )
    }
  })
  return studioQuizView(ctx, quiz, course)
}
