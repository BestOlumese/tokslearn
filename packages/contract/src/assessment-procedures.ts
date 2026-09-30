import { z } from 'zod'
import { AnyLearnerAnswer, QuestionType, QuizKind, QuizSettings, ShowAnswers } from './assessments'
import { AssignmentSettings, LatePolicy, Rubric, SubmissionType } from './assignments'
import { base } from './base'
import { RichTextDoc } from './rich-text'
import { Cursor, IsoDateTime } from './shared'

// Phase 6 procedures (docs/06 §5, docs/10 §5–7, docs/20 Phase 6 rows): studio authoring,
// taking quizzes and exams, assignments, and grading. Answer keys appear only in studio DTOs and
// in results the quiz's `show_answers` allows.

const named = <S extends z.ZodType>(schema: S) =>
  schema as unknown as z.ZodType<z.output<S>, z.input<S>>

const get = (path: `/${string}`, tag: string, summary: string, description: string) =>
  base.route({ method: 'GET', path, tags: [tag], summary, description })
const post = (path: `/${string}`, tag: string, summary: string, description: string) =>
  base.route({ method: 'POST', path, tags: [tag], summary, description })

const ok = z.object({ ok: z.literal(true) })
const Title = z.string().trim().min(2).max(120)

// ─── Studio: banks, questions, quizzes ───────────────────────────────────────────────────────

const QuestionBankShape = z.object({
  id: z.uuid(),
  courseId: z.uuid(),
  title: z.string(),
  questionCount: z.number().int(),
})
export type QuestionBankDto = z.infer<typeof QuestionBankShape>
export const QuestionBankDto = named(QuestionBankShape)

const QuestionShape = z.object({
  id: z.uuid(),
  bankId: z.uuid(),
  type: QuestionType,
  promptDoc: RichTextDoc,
  promptHtml: z.string(),
  options: z.unknown(),
  /** The answer key: studio only. */
  answer: z.unknown(),
  explanationDoc: RichTextDoc.nullable(),
  points: z.number().int(),
  difficulty: z.enum(['easy', 'medium', 'hard']).nullable(),
  tags: z.array(z.string()),
  position: z.number().int(),
})
export type QuestionDto = z.infer<typeof QuestionShape>
export const QuestionDto = named(QuestionShape)

const QuestionFields = {
  prompt: RichTextDoc,
  /** Shape per type: see `QuestionOptions`. */
  options: z.unknown(),
  /** Shape per type: see `AnswerKey`. */
  answer: z.unknown(),
  explanation: RichTextDoc.nullable().optional(),
  points: z.number().int().min(1).max(100),
  difficulty: z.enum(['easy', 'medium', 'hard']).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
}

const StudioQuizShape = z.object({
  id: z.uuid(),
  courseId: z.uuid(),
  kind: QuizKind,
  lessonId: z.uuid().nullable(),
  lessonTitle: z.string().nullable(),
  isLive: z.boolean(),
  settings: QuizSettings,
  questions: z.array(
    z.object({
      id: z.uuid(),
      type: QuestionType,
      promptHtml: z.string(),
      points: z.number().int(),
      bankId: z.uuid(),
    }),
  ),
  sources: z.array(
    z.object({
      id: z.uuid(),
      bankId: z.uuid(),
      bankTitle: z.string(),
      questionCount: z.number().int(),
      tagFilter: z.array(z.string()),
      available: z.number().int(),
    }),
  ),
  questionsPerAttempt: z.number().int(),
  canEdit: z.boolean(),
})
export type StudioQuizDto = z.infer<typeof StudioQuizShape>
export const StudioQuizDto = named(StudioQuizShape)

export const studioQuestionBanksContract = {
  list: get(
    '/studio/courses/{courseId}/question-banks',
    'Studio',
    'Question banks',
    'The course’s banks with how many questions each holds.',
  )
    .input(z.object({ courseId: z.uuid() }))
    .output(z.array(QuestionBankDto)),
  create: post(
    '/studio/courses/{courseId}/question-banks',
    'Studio',
    'Create a question bank',
    'An empty bank for this course.',
  )
    .input(z.strictObject({ courseId: z.uuid(), title: Title }))
    .output(QuestionBankDto),
  rename: post('/studio/question-banks/{bankId}', 'Studio', 'Rename a question bank', 'New title.')
    .input(z.strictObject({ bankId: z.uuid(), title: Title }))
    .output(ok),
  archive: post(
    '/studio/question-banks/{bankId}/archive',
    'Studio',
    'Archive a question bank',
    'Not while a quiz draws from it.',
  )
    .input(z.strictObject({ bankId: z.uuid() }))
    .output(ok),
}

export const studioQuestionsContract = {
  list: get(
    '/studio/question-banks/{bankId}/questions',
    'Studio',
    'Questions in a bank',
    'With their answer keys.',
  )
    .input(z.object({ bankId: z.uuid() }))
    .output(z.array(QuestionDto)),
  create: post(
    '/studio/question-banks/{bankId}/questions',
    'Studio',
    'Add a question',
    'Options and answer key are checked against each other.',
  )
    .input(z.strictObject({ bankId: z.uuid(), type: QuestionType, ...QuestionFields }))
    .output(QuestionDto),
  update: post(
    '/studio/questions/{questionId}',
    'Studio',
    'Edit a question',
    'Everything but the type. Graded attempts keep their grades.',
  )
    .input(z.strictObject({ questionId: z.uuid(), ...QuestionFields }))
    .output(QuestionDto),
  archive: post(
    '/studio/questions/{questionId}/archive',
    'Studio',
    'Archive a question',
    'Takes it out of quizzes; past attempts keep it.',
  )
    .input(z.strictObject({ questionId: z.uuid() }))
    .output(ok),
}

export const studioQuizzesContract = {
  list: get(
    '/studio/courses/{courseId}/quizzes',
    'Studio',
    'Quizzes and exams',
    'Every quiz and exam lesson of the course.',
  )
    .input(z.object({ courseId: z.uuid() }))
    .output(z.array(StudioQuizDto)),
  get: get('/studio/quizzes/{quizId}', 'Studio', 'A quiz', 'Settings, questions or bank draws.')
    .input(z.object({ quizId: z.uuid() }))
    .output(StudioQuizDto),
  update: post(
    '/studio/quizzes/{quizId}',
    'Studio',
    'Save quiz settings',
    'Kind and settings. Exams need a time limit.',
  )
    .input(z.strictObject({ quizId: z.uuid(), kind: QuizKind, settings: QuizSettings }))
    .output(StudioQuizDto),
  setQuestions: post(
    '/studio/quizzes/{quizId}/questions',
    'Studio',
    'Set the questions',
    'Fixed quizzes: the questions in order.',
  )
    .input(z.strictObject({ quizId: z.uuid(), questionIds: z.array(z.uuid()).max(200) }))
    .output(StudioQuizDto),
  setSources: post(
    '/studio/quizzes/{quizId}/sources',
    'Studio',
    'Set the bank draws',
    'Draw quizzes: how many questions from which banks.',
  )
    .input(
      z.strictObject({
        quizId: z.uuid(),
        sources: z
          .array(
            z.strictObject({
              bankId: z.uuid(),
              questionCount: z.number().int().min(1).max(200),
              tagFilter: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
            }),
          )
          .max(10),
      }),
    )
    .output(StudioQuizDto),
}

// ─── Taking quizzes and exams ────────────────────────────────────────────────────────────────

const Choice = z.object({ id: z.string(), text: z.string() })

const AttemptShape = z.object({
  id: z.uuid(),
  quizId: z.uuid(),
  lessonId: z.uuid().nullable(),
  kind: QuizKind,
  attemptNo: z.number().int(),
  status: z.enum(['in_progress', 'submitted', 'auto_submitted', 'graded', 'void']),
  startedAt: IsoDateTime,
  deadlineAt: IsoDateTime.nullable(),
  submittedAt: IsoDateTime.nullable(),
  /** The server's clock, so the display timer counts against it and not the device's. */
  serverNow: IsoDateTime,
  oneQuestionPerScreen: z.boolean(),
  questions: z.array(
    z.object({
      id: z.uuid(),
      type: QuestionType,
      promptHtml: z.string(),
      points: z.number().int(),
      /** In this attempt's order. Never the answer key. */
      options: z.object({
        choices: z.array(Choice).optional(),
        items: z.array(Choice).optional(),
        left: z.array(Choice).optional(),
        right: z.array(Choice).optional(),
      }),
    }),
  ),
  /** The learner's saved answers, by question id. */
  answers: z.record(z.string(), z.unknown()),
  result: z
    .object({
      score: z.number(),
      maxScore: z.number(),
      pct: z.number(),
      passed: z.boolean(),
      feedback: z
        .record(
          z.string(),
          z.object({
            correct: z.boolean(),
            points: z.number(),
            correctAnswer: z.unknown(),
            explanationHtml: z.string().nullable(),
          }),
        )
        .nullable(),
    })
    .nullable(),
})
export type AttemptDto = z.infer<typeof AttemptShape>
export const AttemptDto = named(AttemptShape)

const QuizIntroShape = z.object({
  quizId: z.uuid(),
  kind: QuizKind,
  questionCount: z.number().int(),
  timeLimitSec: z.number().int().nullable(),
  attemptsAllowed: z.number().int().nullable(),
  attemptsUsed: z.number().int(),
  passPct: z.number().int(),
  showAnswers: ShowAnswers,
  oneQuestionPerScreen: z.boolean(),
  availableAt: IsoDateTime.nullable(),
  inProgress: z.object({ attemptId: z.uuid(), deadlineAt: IsoDateTime.nullable() }).nullable(),
  lastAttempt: z
    .object({
      attemptId: z.uuid(),
      status: z.enum(['in_progress', 'submitted', 'auto_submitted', 'graded', 'void']),
      pct: z.number().nullable(),
      passed: z.boolean().nullable(),
      submittedAt: IsoDateTime.nullable(),
    })
    .nullable(),
  lessonsRemaining: z.number().int(),
  endsRefund: z.boolean(),
})
export type QuizIntroDto = z.infer<typeof QuizIntroShape>
export const QuizIntroDto = named(QuizIntroShape)

const SaveAnswerInput = z.strictObject({
  attemptId: z.uuid(),
  questionId: z.uuid(),
  answer: AnyLearnerAnswer,
})

export const quizzesContract = {
  intro: get(
    '/learn/lessons/{lessonId}/quiz',
    'Learn',
    'Quiz intro',
    'Questions, time, attempts left, pass mark, an attempt in progress.',
  )
    .input(z.object({ lessonId: z.uuid() }))
    .output(QuizIntroDto),
  start: post(
    '/quizzes/start',
    'Learn',
    'Start a quiz',
    'Draws and freezes the questions. ATTEMPT_IN_PROGRESS carries the running attempt’s id.',
  )
    .input(z.strictObject({ lessonId: z.uuid() }))
    .output(AttemptDto),
  saveAnswer: post(
    '/quizzes/attempts/{attemptId}/answers',
    'Learn',
    'Save an answer',
    'Replaces the previous answer to that question (autosave).',
  )
    .input(SaveAnswerInput)
    .output(z.object({ savedAt: IsoDateTime })),
  submit: post(
    '/quizzes/attempts/{attemptId}/submit',
    'Learn',
    'Submit a quiz',
    'Grades it. Submitting twice returns the same result.',
  )
    .input(z.strictObject({ attemptId: z.uuid() }))
    .output(AttemptDto),
  getAttempt: get(
    '/quizzes/attempts/{attemptId}',
    'Learn',
    'An attempt',
    'Questions, my answers, and the result when there is one.',
  )
    .input(z.object({ attemptId: z.uuid() }))
    .output(AttemptDto),
}

export const examsContract = {
  start: post(
    '/exams/start',
    'Learn',
    'Start an exam',
    'Needs `confirmed: true`: starting ends the refund right. The server keeps the time.',
  )
    .input(z.strictObject({ lessonId: z.uuid(), confirmed: z.boolean() }))
    .output(AttemptDto),
  saveAnswer: post(
    '/exams/attempts/{attemptId}/answers',
    'Learn',
    'Save an exam answer',
    'After the deadline plus 5 s: ATTEMPT_EXPIRED, and the attempt is submitted.',
  )
    .input(SaveAnswerInput)
    .output(z.object({ savedAt: IsoDateTime })),
  submit: post(
    '/exams/attempts/{attemptId}/submit',
    'Learn',
    'Submit an exam',
    'Grades it. Accepts an Idempotency-Key; submitting twice returns the same result.',
  )
    .input(z.strictObject({ attemptId: z.uuid() }))
    .output(AttemptDto),
  logIntegrityEvent: post(
    '/exams/attempts/{attemptId}/events',
    'Learn',
    'Record an exam signal',
    'Left the tab (with how long), left fullscreen, or tried to paste. Recorded, never blocking.',
  )
    .input(
      z.strictObject({
        attemptId: z.uuid(),
        kind: z.enum(['focus_loss', 'fullscreen_exit', 'paste']),
        durationMs: z
          .number()
          .int()
          .min(0)
          .max(4 * 3_600_000)
          .optional(),
      }),
    )
    .output(ok),
}

// ─── Assignments ─────────────────────────────────────────────────────────────────────────────

const FileRef = z.object({
  id: z.uuid(),
  name: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int(),
})

const GradeShape = z.object({
  decision: z.enum(['graded', 'returned']),
  score: z.number().nullable(),
  maxScore: z.number().nullable(),
  passed: z.boolean().nullable(),
  feedbackHtml: z.string().nullable(),
  rubricScores: z.record(z.string(), z.string()).nullable(),
  gradedAt: IsoDateTime,
})

const SubmissionShape = z.object({
  id: z.uuid(),
  attemptNo: z.number().int(),
  status: z.enum(['submitted', 'grading', 'graded', 'returned']),
  submittedAt: IsoDateTime.nullable(),
  isLate: z.boolean(),
  latePenaltyPct: z.number().int(),
  textHtml: z.string().nullable(),
  files: z.array(FileRef),
  link: z.string().nullable(),
  grade: GradeShape.nullable(),
})
export type SubmissionDto = z.infer<typeof SubmissionShape>
export const SubmissionDto = named(SubmissionShape)

const MyAssignmentShape = z.object({
  assignmentId: z.uuid(),
  lessonId: z.uuid(),
  instructionsHtml: z.string().nullable(),
  submissionTypes: z.array(SubmissionType),
  maxFiles: z.number().int(),
  maxFileMb: z.number().int(),
  rubric: Rubric.nullable(),
  maxScore: z.number(),
  passPct: z.number().int(),
  latePolicy: LatePolicy,
  resubmissionsAllowed: z.number().int(),
  dueAt: IsoDateTime.nullable(),
  draft: z
    .object({
      textDoc: RichTextDoc.nullable(),
      files: z.array(FileRef),
      link: z.string().nullable(),
      savedAt: IsoDateTime,
    })
    .nullable(),
  submissions: z.array(SubmissionShape),
  canSubmit: z.boolean(),
  blockedBy: z.enum(['awaiting_grade', 'no_resubmissions', 'past_due', 'teaching']).nullable(),
})
export type MyAssignmentDto = z.infer<typeof MyAssignmentShape>
export const MyAssignmentDto = named(MyAssignmentShape)

const StudioAssignmentShape = z.object({
  id: z.uuid(),
  courseId: z.uuid(),
  lessonId: z.uuid().nullable(),
  lessonTitle: z.string().nullable(),
  isLive: z.boolean(),
  instructionsDoc: RichTextDoc.nullable(),
  settings: AssignmentSettings,
  maxScore: z.number(),
  waiting: z.number().int(),
  canEdit: z.boolean(),
})
export type StudioAssignmentDto = z.infer<typeof StudioAssignmentShape>
export const StudioAssignmentDto = named(StudioAssignmentShape)

export const studioAssignmentsContract = {
  get: get('/studio/assignments/{assignmentId}', 'Studio', 'An assignment', 'Brief and settings.')
    .input(z.object({ assignmentId: z.uuid() }))
    .output(StudioAssignmentDto),
  update: post(
    '/studio/assignments/{assignmentId}',
    'Studio',
    'Save an assignment',
    'Brief, submission types, rubric, due date, late policy, resubmissions.',
  )
    .input(
      z.strictObject({
        assignmentId: z.uuid(),
        instructions: RichTextDoc.nullable(),
        settings: AssignmentSettings,
      }),
    )
    .output(StudioAssignmentDto),
}

const DraftInput = z.strictObject({
  lessonId: z.uuid(),
  text: RichTextDoc.nullable(),
  fileIds: z.array(z.uuid()).max(10),
  link: z.string().trim().max(2000).nullable(),
})

export const assignmentsContract = {
  get: get(
    '/learn/lessons/{lessonId}/assignment',
    'Learn',
    'An assignment',
    'The brief, my draft and submissions, and whether I can submit.',
  )
    .input(z.object({ lessonId: z.uuid() }))
    .output(MyAssignmentDto),
  saveDraft: post(
    '/assignments/draft',
    'Learn',
    'Save my draft',
    'Replaces the draft (autosave). Files are uploaded first with purpose assignment_submission.',
  )
    .input(DraftInput)
    .output(z.object({ savedAt: IsoDateTime })),
  submit: post(
    '/assignments/submit',
    'Learn',
    'Submit my work',
    'Turns the draft into a submission. Accepts an Idempotency-Key.',
  )
    .input(z.strictObject({ lessonId: z.uuid() }))
    .output(MyAssignmentDto),
  file: get(
    '/assignments/files/{fileId}',
    'Learn',
    'Download my file',
    'A 5-minute link to a file in my draft or submissions.',
  )
    .input(z.object({ lessonId: z.uuid(), fileId: z.uuid() }))
    .output(z.object({ url: z.string(), filename: z.string() })),
}

// ─── Grading ─────────────────────────────────────────────────────────────────────────────────

const QueueItemShape = z.object({
  submissionId: z.uuid(),
  courseId: z.uuid(),
  courseTitle: z.string(),
  lessonId: z.uuid(),
  assignmentTitle: z.string(),
  learnerName: z.string(),
  attemptNo: z.number().int(),
  submittedAt: IsoDateTime,
  isLate: z.boolean(),
  status: z.enum(['submitted', 'grading', 'graded', 'returned']),
  overdue: z.boolean(),
})
export type QueueItemDto = z.infer<typeof QueueItemShape>
export const QueueItemDto = named(QueueItemShape)

const GradingViewShape = z.object({
  submission: SubmissionShape,
  learnerName: z.string(),
  courseId: z.uuid(),
  courseTitle: z.string(),
  assignmentTitle: z.string(),
  lessonId: z.uuid(),
  instructionsHtml: z.string().nullable(),
  rubric: Rubric.nullable(),
  maxScore: z.number(),
  passPct: z.number().int(),
  earlier: z.array(SubmissionShape),
  canGrade: z.boolean(),
})
export type GradingViewDto = z.infer<typeof GradingViewShape>
export const GradingViewDto = named(GradingViewShape)

const FlaggedShape = z.object({
  attemptId: z.uuid(),
  courseId: z.uuid(),
  courseTitle: z.string(),
  lessonId: z.uuid().nullable(),
  examTitle: z.string(),
  learnerName: z.string(),
  attemptNo: z.number().int(),
  submittedAt: IsoDateTime.nullable(),
  score: z.number().nullable(),
  maxScore: z.number().nullable(),
  passed: z.boolean().nullable(),
  reasons: z.array(
    z.enum(['focus_loss', 'fullscreen_exit', 'paste', 'network_change', 'too_fast']),
  ),
})
export type FlaggedAttemptDto = z.infer<typeof FlaggedShape>
export const FlaggedAttemptDto = named(FlaggedShape)

const AttemptReviewShape = FlaggedShape.extend({
  status: z.string(),
  startedAt: IsoDateTime,
  integrity: z.object({
    focusLosses: z.number().optional(),
    focusLossMs: z.number().optional(),
    fullscreenExits: z.number().optional(),
    pastes: z.number().optional(),
    networksSeen: z.number(),
  }),
  answers: z.array(
    z.object({
      questionId: z.uuid(),
      promptHtml: z.string(),
      answer: z.unknown(),
      correct: z.boolean().nullable(),
      points: z.number().nullable(),
      answeredAt: IsoDateTime,
    }),
  ),
  canVoid: z.boolean(),
})
export type AttemptReviewDto = z.infer<typeof AttemptReviewShape>
export const AttemptReviewDto = named(AttemptReviewShape)

export const gradingContract = {
  queue: get(
    '/grading/queue',
    'Grading',
    'Grading queue',
    'Waiting work oldest first, or graded work newest first, across courses I teach or assist on.',
  )
    .input(
      z.object({
        status: z.enum(['waiting', 'done']).optional(),
        courseId: z.uuid().optional(),
        cursor: Cursor.optional(),
      }),
    )
    .output(z.object({ items: z.array(QueueItemDto), nextCursor: z.string().nullable() })),
  get: get(
    '/grading/submissions/{submissionId}',
    'Grading',
    'A submission',
    'The work, the brief, the rubric and earlier attempts.',
  )
    .input(z.object({ submissionId: z.uuid() }))
    .output(GradingViewDto),
  grade: post(
    '/grading/submissions/{submissionId}/grade',
    'Grading',
    'Grade or return',
    'Rubric levels or a plain score, feedback; `returned` sends it back for changes.',
  )
    .input(
      z.strictObject({
        submissionId: z.uuid(),
        decision: z.enum(['graded', 'returned']),
        rubricScores: z.record(z.string(), z.string()).optional(),
        score: z.number().min(0).max(1000).optional(),
        feedback: RichTextDoc.nullable(),
      }),
    )
    .output(GradingViewDto),
  file: get(
    '/grading/submissions/{submissionId}/files/{fileId}',
    'Grading',
    'Download a submitted file',
    'A 5-minute link.',
  )
    .input(z.object({ submissionId: z.uuid(), fileId: z.uuid() }))
    .output(z.object({ url: z.string(), filename: z.string() })),
  flagged: get(
    '/grading/flagged',
    'Grading',
    'Flagged exam attempts',
    'Attempts over the integrity thresholds, newest first.',
  )
    .input(z.object({ courseId: z.uuid().optional() }))
    .output(z.array(FlaggedAttemptDto)),
  attempt: get(
    '/grading/attempts/{attemptId}',
    'Grading',
    'An exam attempt for review',
    'Signals (summarised) and answers.',
  )
    .input(z.object({ attemptId: z.uuid() }))
    .output(AttemptReviewDto),
  voidAttempt: post(
    '/grading/attempts/{attemptId}/void',
    'Grading',
    'Void an attempt',
    'With a reason the learner sees. It stops counting toward the limit.',
  )
    .input(z.strictObject({ attemptId: z.uuid(), reason: z.string().trim().min(10).max(1000) }))
    .output(AttemptReviewDto),
}
