// Local demo assessments: adds a "Check your work" section to Excel for Accountants with a quiz
// (one question of every type), a 5-minute exam and a graded assignment, approves the change and
// enrols Chiamaka (learner1@tokslearn.test) so the player can be tried end to end. Refuses production.
//   DATABASE_URL=… pnpm --filter @tokslearn/core seed:demo-assessments
// Needs `pnpm db:seed` and `pnpm db:seed:demo-catalog` first.

import type { RichTextDoc } from '@tokslearn/contract'
import { createDb, type Db, schema } from '@tokslearn/db'
import { createFakeBunny } from '@tokslearn/integrations/bunny'
import { createFakeStorage } from '@tokslearn/integrations/r2'
import { eq } from 'drizzle-orm'
import {
  addQuizLesson,
  createBank,
  createQuestion,
  getStudioQuiz,
  setQuizQuestions,
  updateQuiz,
} from '../assessments'
import { addAssignmentLesson, updateAssignment } from '../assignments'
import {
  addSection,
  decideReview,
  getStudioCourse,
  listReviewQueue,
  reviewChecklistKeys,
  submitForReview,
} from '../courses'
import { grantEnrollment } from '../enrollments'
import type { Actor, UserActor } from '../kernel/actor'
import { createCtx } from '../kernel/ctx'

const ids = {
  tobi: '01920000-0000-7000-8000-000000000201',
  reviewer: '01920000-0000-7000-8000-000000000005',
  learner: '01920000-0000-7000-8000-000000000100',
}
const SECTION = 'Check your work'

const doc = (...paragraphs: string[]): RichTextDoc => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
})
const actor = (userId: string, roles: UserActor['roles']): UserActor => ({
  kind: 'user',
  userId,
  sessionId: 'demo-seed',
  roles,
  emailVerified: true,
  twoFactorEnabled: true,
  twoFactorVerifiedAt: new Date(),
})

const QUESTIONS = [
  {
    type: 'single',
    prompt: 'Which function returns a value from a table by matching a key in any column?',
    options: {
      choices: [
        { id: 'a', text: 'VLOOKUP' },
        { id: 'b', text: 'XLOOKUP' },
        { id: 'c', text: 'HLOOKUP' },
      ],
    },
    answer: { choice: 'b' },
    explanation: 'XLOOKUP can look left, right, up or down. VLOOKUP only looks right.',
  },
  {
    type: 'multiple',
    prompt: 'Which of these belong on a bank reconciliation?',
    options: {
      choices: [
        { id: 'a', text: 'Unpresented cheques' },
        { id: 'b', text: 'Depreciation' },
        { id: 'c', text: 'Deposits in transit' },
        { id: 'd', text: 'Bank charges not yet in the cash book' },
      ],
    },
    answer: { choices: ['a', 'c', 'd'] },
    explanation: 'Depreciation never touches the bank account.',
  },
  {
    type: 'true_false',
    prompt: 'A pivot table changes the data it summarises.',
    options: {},
    answer: { value: false },
    explanation: 'A pivot table only reads its source range.',
  },
  {
    type: 'short_text',
    prompt: 'Which Excel function adds up only the rows that meet several conditions?',
    options: {},
    answer: { accepted: ['SUMIFS', 'SUMIFS()'] },
    explanation: 'SUMIFS takes a sum range, then pairs of criteria ranges and criteria.',
  },
  {
    type: 'ordering',
    prompt: 'Put the month-end close in order.',
    options: {
      items: [
        { id: 'a', text: 'Post accruals' },
        { id: 'b', text: 'Reconcile the bank' },
        { id: 'c', text: 'Run the trial balance' },
        { id: 'd', text: 'Send the management pack' },
      ],
    },
    answer: { order: ['b', 'a', 'c', 'd'] },
    explanation: 'Reconcile first so the accruals sit on clean cash figures.',
  },
  {
    type: 'matching',
    prompt: 'Match each shortcut to what it does.',
    options: {
      left: [
        { id: 'a', text: 'Ctrl + T' },
        { id: 'b', text: 'F4' },
        { id: 'c', text: 'Alt + =' },
      ],
      right: [
        { id: 'x', text: 'AutoSum' },
        { id: 'y', text: 'Make a table' },
        { id: 'z', text: 'Lock a cell reference' },
        { id: 'w', text: 'Open Paste Special' },
      ],
    },
    answer: {
      pairs: [
        { left: 'a', right: 'y' },
        { left: 'b', right: 'z' },
        { left: 'c', right: 'x' },
      ],
    },
    explanation: 'F4 cycles through $A$1, A$1, $A1 and A1.',
  },
] as const

async function run(db: Db) {
  const ctx = (a: Actor) =>
    createCtx({
      db,
      actor: a,
      requestId: 'demo-seed',
      providers: {
        storage: createFakeStorage(),
        video: createFakeBunny().provider,
        sessions: { revokeSession: async () => {}, revokeAllSessions: async () => {} },
        urls: { app: 'http://localhost:3000', cdn: null },
      },
    })
  const owner = ctx(actor(ids.tobi, ['learner', 'instructor']))
  const reviewer = ctx(actor(ids.reviewer, ['learner', 'reviewer']))

  const [course] = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(eq(schema.courses.slug, 'excel-for-accountants'))
  if (!course) throw new Error('Run pnpm db:seed:demo-catalog first.')
  let s = await getStudioCourse(owner, course.id)
  if (s.sections.some((x) => x.title === SECTION)) {
    console.info('skip  assessments (already there)')
    return
  }

  s = await addSection(owner, { courseId: s.id, version: s.version, title: SECTION })
  const sectionId = s.sections.find((x) => x.title === SECTION)?.id ?? ''

  const bank = await createBank(owner, { courseId: s.id, title: 'Month-end basics' })
  const questionIds: string[] = []
  for (const q of QUESTIONS) {
    const made = await createQuestion(owner, {
      bankId: bank.id,
      type: q.type,
      prompt: doc(q.prompt),
      options: q.options,
      answer: q.answer,
      explanation: doc(q.explanation),
      points: 2,
      tags: [],
    })
    questionIds.push(made.id)
  }

  for (const kind of ['graded', 'exam'] as const) {
    s = await addQuizLesson(owner, {
      courseId: s.id,
      version: s.version,
      sectionId,
      title: kind === 'exam' ? 'Final exam' : 'Quick check',
      kind,
    })
    const lesson = s.sections
      .flatMap((x) => x.lessons)
      .find((l) => l.quizId && l.title === (kind === 'exam' ? 'Final exam' : 'Quick check'))
    if (!lesson?.quizId) throw new Error('quiz lesson missing')
    await setQuizQuestions(owner, { quizId: lesson.quizId, questionIds })
    const quiz = await getStudioQuiz(owner, lesson.quizId)
    await updateQuiz(owner, {
      quizId: quiz.id,
      kind,
      settings:
        kind === 'exam'
          ? {
              ...quiz.settings,
              timeLimitSec: 300,
              cooldownHours: 0,
              attemptsAllowed: 3,
              requireAllLessons: false,
              oneQuestionPerScreen: true,
            }
          : { ...quiz.settings, showAnswers: 'after_submit' },
    })
  }

  s = await addAssignmentLesson(owner, {
    courseId: s.id,
    version: s.version,
    sectionId,
    title: 'Reconcile March',
  })
  const assignment = s.sections.flatMap((x) => x.lessons).find((l) => l.assignmentId)
  await updateAssignment(owner, {
    assignmentId: assignment?.assignmentId ?? '',
    instructions: doc(
      'Reconcile the March bank statement against the cash book in the practice workbook.',
      'Upload your finished workbook, and write two or three lines on anything that did not match.',
    ),
    settings: {
      submissionTypes: ['text', 'file', 'link'],
      maxFiles: 3,
      maxFileMb: 20,
      passPct: 60,
      dueMode: 'days_after_enrollment',
      dueDays: 7,
      latePolicy: { mode: 'penalty', penaltyPct: 10, graceHours: 0 },
      resubmissionsAllowed: 1,
      rubric: {
        criteria: [
          {
            id: 'acc',
            title: 'Accuracy',
            description: 'The adjusted balances agree.',
            levels: [
              { id: 'off', title: 'Off', description: '', points: 0 },
              { id: 'close', title: 'Close', description: '', points: 8 },
              { id: 'yes', title: 'Balanced', description: '', points: 15 },
            ],
          },
          {
            id: 'pres',
            title: 'Presentation',
            description: 'Someone else could follow it.',
            levels: [
              { id: 'no', title: 'Hard to follow', description: '', points: 0 },
              { id: 'yes', title: 'Clear', description: '', points: 5 },
            ],
          },
        ],
      },
    },
  })

  s = await getStudioCourse(owner, s.id)
  await submitForReview(owner, { courseId: s.id, version: s.version })
  const [item] = (await listReviewQueue(reviewer)).filter((q) => q.courseId === s.id)
  await decideReview(reviewer, {
    revisionId: item?.revisionId ?? '',
    decision: 'approve',
    notes: 'Demo assessments.',
    checklist: Object.fromEntries(reviewChecklistKeys.map((k) => [k, true])),
  })
  await grantEnrollment(owner, { userId: ids.learner, courseId: s.id, source: 'admin_grant' })
  console.info('added quiz, exam and assignment to /courses/excel-for-accountants')
}

const url = process.env.DATABASE_URL
if (!url) throw new Error('Set DATABASE_URL')
if (process.env.NEXT_PUBLIC_APP_ENV === 'production') {
  throw new Error('Demo assessments are for local and preview databases only.')
}
const { db, close } = createDb(url, { max: 1, tcp: true })
try {
  await run(db)
} finally {
  await close()
}
