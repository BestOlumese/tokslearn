import type {
  AttemptDto,
  AttemptReviewDto,
  GradingViewDto,
  MyAssignmentDto,
  QuizIntroDto,
  StudioAssignmentDto,
  SubmissionDto,
} from '@tokslearn/contract'
import * as assessments from '@tokslearn/core/assessments'
import * as assignments from '@tokslearn/core/assignments'
import type { Ctx } from '@tokslearn/core/kernel'
import { authed } from '../base'

// Quizzes, exams, assignments and grading (docs/06 §5, docs/10 §5–7). Thin: auth → core → DTO.

const iso = (d: Date) => d.toISOString()
const isoN = (d: Date | null) => (d ? d.toISOString() : null)
const ok = { ok: true as const }

const toAttempt = (ctx: Ctx, a: assessments.AttemptView): AttemptDto => ({
  ...a,
  startedAt: iso(a.startedAt),
  deadlineAt: isoN(a.deadlineAt),
  submittedAt: isoN(a.submittedAt),
  serverNow: iso(ctx.now),
})

const toIntro = (i: assessments.QuizIntro): QuizIntroDto => ({
  ...i,
  availableAt: isoN(i.availableAt),
  inProgress: i.inProgress ? { ...i.inProgress, deadlineAt: isoN(i.inProgress.deadlineAt) } : null,
  lastAttempt: i.lastAttempt
    ? { ...i.lastAttempt, submittedAt: isoN(i.lastAttempt.submittedAt) }
    : null,
})

const toSubmission = (s: assignments.SubmissionView): SubmissionDto => ({
  ...s,
  submittedAt: isoN(s.submittedAt),
  grade: s.grade ? { ...s.grade, gradedAt: iso(s.grade.gradedAt) } : null,
})

const toMine = (m: assignments.MyAssignment): MyAssignmentDto => ({
  ...m,
  dueAt: isoN(m.dueAt),
  draft: m.draft ? { ...m.draft, savedAt: iso(m.draft.savedAt) } : null,
  submissions: m.submissions.map(toSubmission),
})

const toStudioAssignment = (a: assignments.StudioAssignment): StudioAssignmentDto => a

const toGrading = (g: assignments.GradingView): GradingViewDto => ({
  ...g,
  submission: toSubmission(g.submission),
  earlier: g.earlier.map(toSubmission),
})

const toReview = (r: assessments.AttemptReview): AttemptReviewDto => ({
  ...r,
  submittedAt: isoN(r.submittedAt),
  startedAt: iso(r.startedAt),
  answers: r.answers.map((a) => ({ ...a, answeredAt: iso(a.answeredAt) })),
})

export const studioQuestionBanksRouter = {
  list: authed.studio.questionBanks.list.handler(({ context, input }) =>
    assessments.listBanks(context.ctx, input.courseId),
  ),
  create: authed.studio.questionBanks.create.handler(({ context, input }) =>
    assessments.createBank(context.ctx, input),
  ),
  rename: authed.studio.questionBanks.rename.handler(async ({ context, input }) => {
    await assessments.renameBank(context.ctx, input)
    return ok
  }),
  archive: authed.studio.questionBanks.archive.handler(async ({ context, input }) => {
    await assessments.archiveBank(context.ctx, input.bankId)
    return ok
  }),
}

export const studioQuestionsRouter = {
  list: authed.studio.questions.list.handler(({ context, input }) =>
    assessments.listQuestions(context.ctx, input.bankId),
  ),
  create: authed.studio.questions.create.handler(({ context, input }) =>
    assessments.createQuestion(context.ctx, input),
  ),
  update: authed.studio.questions.update.handler(({ context, input }) =>
    assessments.updateQuestion(context.ctx, input),
  ),
  archive: authed.studio.questions.archive.handler(async ({ context, input }) => {
    await assessments.archiveQuestion(context.ctx, input.questionId)
    return ok
  }),
}

export const studioQuizzesRouter = {
  list: authed.studio.quizzes.list.handler(({ context, input }) =>
    assessments.listCourseQuizzes(context.ctx, input.courseId),
  ),
  get: authed.studio.quizzes.get.handler(({ context, input }) =>
    assessments.getStudioQuiz(context.ctx, input.quizId),
  ),
  update: authed.studio.quizzes.update.handler(({ context, input }) =>
    assessments.updateQuiz(context.ctx, input),
  ),
  setQuestions: authed.studio.quizzes.setQuestions.handler(({ context, input }) =>
    assessments.setQuizQuestions(context.ctx, input),
  ),
  setSources: authed.studio.quizzes.setSources.handler(({ context, input }) =>
    assessments.setQuizSources(context.ctx, input),
  ),
}

export const studioAssignmentsRouter = {
  get: authed.studio.assignments.get.handler(async ({ context, input }) =>
    toStudioAssignment(await assignments.getStudioAssignment(context.ctx, input.assignmentId)),
  ),
  update: authed.studio.assignments.update.handler(async ({ context, input }) =>
    toStudioAssignment(await assignments.updateAssignment(context.ctx, input)),
  ),
}

export const quizzesRouter = {
  intro: authed.quizzes.intro.handler(async ({ context, input }) =>
    toIntro(await assessments.quizIntro(context.ctx, input.lessonId)),
  ),
  start: authed.quizzes.start.handler(async ({ context, input }) =>
    toAttempt(context.ctx, await assessments.startAttempt(context.ctx, input)),
  ),
  saveAnswer: authed.quizzes.saveAnswer.handler(async ({ context, input }) => ({
    savedAt: iso((await assessments.saveAnswer(context.ctx, input)).savedAt),
  })),
  submit: authed.quizzes.submit.handler(async ({ context, input }) =>
    toAttempt(context.ctx, await assessments.submitAttempt(context.ctx, input.attemptId)),
  ),
  getAttempt: authed.quizzes.getAttempt.handler(async ({ context, input }) =>
    toAttempt(context.ctx, await assessments.getAttempt(context.ctx, input.attemptId)),
  ),
}

export const examsRouter = {
  start: authed.exams.start.handler(async ({ context, input }) =>
    toAttempt(context.ctx, await assessments.startAttempt(context.ctx, input)),
  ),
  saveAnswer: authed.exams.saveAnswer.handler(async ({ context, input }) => ({
    savedAt: iso((await assessments.saveAnswer(context.ctx, input)).savedAt),
  })),
  submit: authed.exams.submit.handler(async ({ context, input }) =>
    toAttempt(context.ctx, await assessments.submitAttempt(context.ctx, input.attemptId)),
  ),
  logIntegrityEvent: authed.exams.logIntegrityEvent.handler(({ context, input }) =>
    assessments.logIntegrityEvent(context.ctx, input),
  ),
}

export const assignmentsRouter = {
  get: authed.assignments.get.handler(async ({ context, input }) =>
    toMine(await assignments.getMyAssignment(context.ctx, input.lessonId)),
  ),
  saveDraft: authed.assignments.saveDraft.handler(async ({ context, input }) => ({
    savedAt: iso((await assignments.saveDraft(context.ctx, input)).savedAt),
  })),
  submit: authed.assignments.submit.handler(async ({ context, input }) =>
    toMine(await assignments.submitAssignment(context.ctx, input.lessonId)),
  ),
  file: authed.assignments.file.handler(({ context, input }) =>
    assignments.mySubmissionFileUrl(context.ctx, input),
  ),
}

export const gradingRouter = {
  queue: authed.grading.queue.handler(async ({ context, input }) => {
    const page = await assignments.gradingQueue(context.ctx, input)
    return { ...page, items: page.items.map((i) => ({ ...i, submittedAt: iso(i.submittedAt) })) }
  }),
  get: authed.grading.get.handler(async ({ context, input }) =>
    toGrading(await assignments.getSubmissionForGrading(context.ctx, input.submissionId)),
  ),
  grade: authed.grading.grade.handler(async ({ context, input }) =>
    toGrading(await assignments.gradeSubmission(context.ctx, input)),
  ),
  file: authed.grading.file.handler(({ context, input }) =>
    assignments.gradingFileUrl(context.ctx, input),
  ),
  flagged: authed.grading.flagged.handler(async ({ context, input }) =>
    (await assessments.listFlaggedAttempts(context.ctx, input)).map((f) => ({
      ...f,
      submittedAt: isoN(f.submittedAt),
    })),
  ),
  attempt: authed.grading.attempt.handler(async ({ context, input }) =>
    toReview(await assessments.getAttemptForReview(context.ctx, input.attemptId)),
  ),
  voidAttempt: authed.grading.voidAttempt.handler(async ({ context, input }) =>
    toReview(await assessments.voidAttempt(context.ctx, input)),
  ),
}
