import type { AssignmentSettings, RichTextDoc, Rubric } from '@tokslearn/contract'
import { type Db, schema } from '@tokslearn/db'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { and, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { addStaff, getStudioCourse } from '../courses'
import { grantEnrollment } from '../enrollments'
import type { UserActor } from '../kernel/actor'
import { inTransaction } from '../kernel/ctx'
import { insertUser, testUser } from '../kernel/testing'
import { completeFileUpload, createFileUpload } from '../media'
import { codeOf, people, publishCourse, setup } from '../testing'
import {
  addAssignmentLesson,
  getMyAssignment,
  getStudioAssignment,
  getSubmissionForGrading,
  gradeSubmission,
  gradingFileUrl,
  gradingQueue,
  mySubmissionFileUrl,
  saveDraft,
  submitAssignment,
  updateAssignment,
} from '.'

afterAll(closeTestDb)

const T0 = new Date('2026-10-01T09:00:00Z')
const DAY = 86_400_000
const doc = (text: string): RichTextDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})
const rubric: Rubric = {
  criteria: [
    {
      id: 'acc',
      title: 'Accuracy',
      description: '',
      levels: [
        { id: 'no', title: 'Off', description: '', points: 0 },
        { id: 'yes', title: 'Balanced', description: '', points: 15 },
      ],
    },
    {
      id: 'pres',
      title: 'Presentation',
      description: '',
      levels: [
        { id: 'no', title: 'Messy', description: '', points: 0 },
        { id: 'yes', title: 'Clear', description: '', points: 5 },
      ],
    },
  ],
}

async function world(db: Db, settings: Partial<AssignmentSettings> = {}) {
  await seedCatalog(db)
  await seedCommission(db)
  const env = setup(db)
  const { owner, reviewer } = await people(db)
  const course = await publishCourse(env, owner, reviewer)
  const teach = env.ctx(owner, T0)
  const studio = await getStudioCourse(teach, course.id)
  const after = await addAssignmentLesson(teach, {
    courseId: course.id,
    version: studio.version,
    sectionId: studio.sections[0]?.id ?? '',
    title: 'Reconcile March',
  })
  const lesson = after.sections.flatMap((s) => s.lessons).find((l) => l.type === 'assignment')
  if (!lesson?.assignmentId) throw new Error('assignment lesson missing')
  await db.update(schema.lessons).set({ liveSince: T0 }).where(eq(schema.lessons.id, lesson.id))
  await updateAssignment(teach, {
    assignmentId: lesson.assignmentId,
    instructions: doc('Reconcile the March bank statement and upload your workbook.'),
    settings: { submissionTypes: ['text', 'file', 'link'], rubric, passPct: 60, ...settings },
  })

  const learnerId = await insertUser(db, { name: 'Ngozi Ade', email: 'ngozi@example.com' })
  await inTransaction(env.ctx({ kind: 'system', reason: 'test' }), (tx) =>
    grantEnrollment(tx, { userId: learnerId, courseId: course.id, source: 'free' }),
  )
  const learner = testUser(['learner'], { userId: learnerId })
  const [enrollment] = await db
    .select({ at: schema.enrollments.createdAt })
    .from(schema.enrollments)
    .where(eq(schema.enrollments.userId, learnerId))
  return {
    env,
    owner,
    course,
    lesson,
    assignmentId: lesson.assignmentId,
    learner,
    enrolledAt: enrollment?.at ?? T0,
  }
}

async function upload(
  env: ReturnType<typeof setup>,
  who: UserActor,
  name: string,
  sizeBytes = 4096,
) {
  const up = await createFileUpload(env.ctx(who), {
    purpose: 'assignment_submission',
    filename: name,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes,
  })
  const [file] = await env
    .ctx(who)
    .db.select()
    .from(schema.files)
    .where(eq(schema.files.id, up.fileId))
  env.storage.putObject('private', file?.key ?? '', sizeBytes, file?.mime ?? '')
  await completeFileUpload(env.ctx(who), up.fileId)
  return up.fileId
}

describe('submitting', () => {
  it('keeps a draft, checks it against the brief, submits once, and waits for a grade', async () => {
    await withRollback(async (db) => {
      const { env, lesson, learner } = await world(db, { maxFiles: 1 })
      const me = env.ctx(learner, T0)
      const view = await getMyAssignment(me, lesson.id)
      expect(view).toMatchObject({
        canSubmit: true,
        blockedBy: null,
        draft: null,
        submissions: [],
        maxScore: 20,
        dueAt: null,
      })
      expect(view.instructionsHtml).toContain('March bank statement')

      // Nothing saved yet: submitting does nothing.
      expect((await submitAssignment(me, lesson.id)).submissions).toEqual([])

      const file = await upload(env, learner, 'C:\\Users\\ngozi\\march-recon.xlsx')
      const other = await upload(env, learner, 'extra.xlsx')
      expect(
        await codeOf(
          saveDraft(me, { lessonId: lesson.id, text: null, fileIds: [file, other], link: null }),
        ),
      ).toBe('VALIDATION_FAILED')
      expect(
        await codeOf(
          saveDraft(me, {
            lessonId: lesson.id,
            text: null,
            fileIds: [],
            link: 'javascript:alert(1)',
          }),
        ),
      ).toBe('VALIDATION_FAILED')
      // Someone else's file can't be attached.
      const stranger = testUser(['learner'], { userId: await insertUser(db) })
      const theirs = await upload(env, stranger, 'theirs.xlsx')
      expect(
        await codeOf(
          saveDraft(me, { lessonId: lesson.id, text: null, fileIds: [theirs], link: null }),
        ),
      ).toBe('FILE_NOT_FOUND')
      expect(await codeOf(getMyAssignment(env.ctx(stranger, T0), lesson.id))).toBe('NOT_ENROLLED')

      await saveDraft(me, {
        lessonId: lesson.id,
        text: doc('Balanced to the kobo.'),
        fileIds: [file],
        link: 'https://sheets.example/march',
      })
      const drafted = await getMyAssignment(me, lesson.id)
      expect(drafted.draft).toMatchObject({
        link: 'https://sheets.example/march',
        files: [{ name: 'march-recon.xlsx' }],
      })

      const sent = await submitAssignment(
        env.ctx(learner, new Date(T0.getTime() + 60_000)),
        lesson.id,
      )
      expect(sent.draft).toBeNull()
      expect(sent.submissions).toHaveLength(1)
      expect(sent.submissions[0]).toMatchObject({
        attemptNo: 1,
        status: 'submitted',
        isLate: false,
        textHtml: expect.stringContaining('kobo'),
      })
      expect(sent).toMatchObject({ canSubmit: false, blockedBy: 'awaiting_grade' })
      expect((await mySubmissionFileUrl(me, { lessonId: lesson.id, fileId: file })).filename).toBe(
        'march-recon.xlsx',
      )

      // A new draft can't be submitted while the first waits for its grade.
      await saveDraft(me, { lessonId: lesson.id, text: doc('Second go'), fileIds: [], link: null })
      expect(await codeOf(submitAssignment(me, lesson.id))).toBe('RESUBMISSION_NOT_ALLOWED')
      const events = await db.select({ name: schema.outbox.eventName }).from(schema.outbox)
      expect(events.map((e) => e.name)).toContain('assignment.submitted')
    })
  })

  it('applies due dates: rejects late work, or takes the penalty off the grade', async () => {
    await withRollback(async (db) => {
      const reject = await world(db, {
        dueMode: 'days_after_enrollment',
        dueDays: 3,
        latePolicy: { mode: 'reject', penaltyPct: 0, graceHours: 12 },
      })
      const late = new Date(reject.enrolledAt.getTime() + 4 * DAY)
      const me = reject.env.ctx(reject.learner, late)
      expect((await getMyAssignment(me, reject.lesson.id)).blockedBy).toBe('past_due')
      await saveDraft(me, {
        lessonId: reject.lesson.id,
        text: doc('Late'),
        fileIds: [],
        link: null,
      })
      expect(await codeOf(submitAssignment(me, reject.lesson.id))).toBe('SUBMISSION_PAST_DUE')
      // Within the grace period it counts as on time.
      const graced = reject.env.ctx(
        reject.learner,
        new Date(reject.enrolledAt.getTime() + 3 * DAY + 11 * 3_600_000),
      )
      expect((await submitAssignment(graced, reject.lesson.id)).submissions[0]?.isLate).toBe(false)
    })
  })
})

describe('grading', () => {
  it('queues work for the instructor and TAs, grades with the rubric, emails the learner and completes the lesson on a pass', async () => {
    await withRollback(async (db) => {
      const { env, owner, course, lesson, learner, enrolledAt } = await world(db, {
        dueMode: 'days_after_enrollment',
        dueDays: 1,
        latePolicy: { mode: 'penalty', penaltyPct: 20, graceHours: 0 },
        resubmissionsAllowed: 0,
      })
      const later = new Date(enrolledAt.getTime() + 2 * DAY)
      const me = env.ctx(learner, later)
      const file = await upload(env, learner, 'recon.xlsx')
      await saveDraft(me, {
        lessonId: lesson.id,
        text: doc('Here it is.'),
        fileIds: [file],
        link: null,
      })
      const sent = await submitAssignment(me, lesson.id)
      expect(sent.submissions[0]).toMatchObject({ isLate: true, latePenaltyPct: 20 })
      const submissionId = sent.submissions[0]?.id ?? ''

      const teach = env.ctx(owner, later)
      const queue = await gradingQueue(teach, {})
      expect(queue.items).toEqual([
        expect.objectContaining({
          submissionId,
          learnerName: 'Ngozi A.',
          assignmentTitle: 'Reconcile March',
          isLate: true,
          overdue: false,
        }),
      ])
      expect(
        (await gradingQueue(env.ctx(owner, new Date(later.getTime() + 6 * DAY)), {})).items[0]
          ?.overdue,
      ).toBe(true)

      const taId = await insertUser(db, { email: 'ta@example.com', roles: ['learner'] })
      await addStaff(teach, { courseId: course.id, emailOrUsername: 'ta@example.com' })
      const ta = env.ctx(testUser(['learner'], { userId: taId }), later)
      expect((await gradingQueue(ta, {})).items).toHaveLength(1)
      const outsider = env.ctx(
        testUser(['learner', 'instructor'], { userId: await insertUser(db) }),
        later,
      )
      expect((await gradingQueue(outsider, {})).items).toEqual([])
      expect(await codeOf(getSubmissionForGrading(outsider, submissionId))).toBe(
        'SUBMISSION_NOT_FOUND',
      )

      const view = await getSubmissionForGrading(ta, submissionId)
      expect(view).toMatchObject({
        canGrade: true,
        maxScore: 20,
        submission: { files: [{ name: 'recon.xlsx' }] },
      })
      expect((await gradingFileUrl(ta, { submissionId, fileId: file })).filename).toBe('recon.xlsx')
      expect(
        await codeOf(
          gradeSubmission(ta, {
            submissionId,
            decision: 'graded',
            rubricScores: { acc: 'yes' },
            feedback: null,
          }),
        ),
      ).toBe('VALIDATION_FAILED')

      // 20 points, less the 20% late penalty: 16 of 20, a pass at 60%.
      const graded = await gradeSubmission(ta, {
        submissionId,
        decision: 'graded',
        rubricScores: { acc: 'yes', pres: 'yes' },
        feedback: doc('Clean work. Label the bank charges next time.'),
      })
      expect(graded.submission.grade).toMatchObject({
        decision: 'graded',
        score: 16,
        maxScore: 20,
        passed: true,
      })
      expect(
        await codeOf(
          gradeSubmission(teach, {
            submissionId,
            decision: 'graded',
            rubricScores: { acc: 'no', pres: 'no' },
            feedback: null,
          }),
        ),
      ).toBe('SUBMISSION_ALREADY_GRADED')
      const mine = await getMyAssignment(me, lesson.id)
      expect(mine.submissions[0]?.grade?.feedbackHtml).toContain('bank charges')
      expect(mine).toMatchObject({ canSubmit: false, blockedBy: 'no_resubmissions' })
      const emails = await db.select({ payload: schema.outbox.payload }).from(schema.outbox)
      const graded_ = emails
        .map((e) => e.payload as { id: string; data: Record<string, unknown> })
        .find((p) => p.id === 'assignment-graded')
      expect(graded_?.data).toMatchObject({ decision: 'graded', score: '16 / 20', passed: true })
      const [progress] = await db
        .select()
        .from(schema.lessonProgress)
        .where(
          and(
            eq(schema.lessonProgress.userId, learner.userId),
            eq(schema.lessonProgress.lessonId, lesson.id),
          ),
        )
      expect(progress?.status).toBe('completed')
      expect((await gradingQueue(teach, { status: 'done' })).items).toHaveLength(1)
    })
  })

  it('returns work for changes, which can always be submitted again', async () => {
    await withRollback(async (db) => {
      const { env, owner, lesson, learner } = await world(db, { resubmissionsAllowed: 0 })
      const me = env.ctx(learner, T0)
      await saveDraft(me, { lessonId: lesson.id, text: doc('First'), fileIds: [], link: null })
      const first = (await submitAssignment(me, lesson.id)).submissions[0]?.id ?? ''
      const teach = env.ctx(owner, T0)
      expect(
        await codeOf(
          gradeSubmission(teach, { submissionId: first, decision: 'returned', feedback: null }),
        ),
      ).toBe('VALIDATION_FAILED')
      await gradeSubmission(teach, {
        submissionId: first,
        decision: 'returned',
        feedback: doc('Add the reconciling items.'),
      })
      expect(await getMyAssignment(me, lesson.id)).toMatchObject({
        canSubmit: true,
        blockedBy: null,
      })
      await saveDraft(me, {
        lessonId: lesson.id,
        text: doc('Second, with items'),
        fileIds: [],
        link: null,
      })
      const again = await submitAssignment(me, lesson.id)
      expect(again.submissions.map((s) => [s.attemptNo, s.status])).toEqual([
        [2, 'submitted'],
        [1, 'returned'],
      ])
      // Plain scores when there is no rubric.
      const studio = await getStudioAssignment(teach, again.assignmentId)
      await updateAssignment(teach, {
        assignmentId: studio.id,
        instructions: studio.instructionsDoc,
        settings: { ...studio.settings, rubric: null, maxScore: 50 },
      })
      const second = again.submissions[0]?.id ?? ''
      expect(
        await codeOf(
          gradeSubmission(teach, {
            submissionId: second,
            decision: 'graded',
            score: 51,
            feedback: null,
          }),
        ),
      ).toBe('VALIDATION_FAILED')
      const done = await gradeSubmission(teach, {
        submissionId: second,
        decision: 'graded',
        score: 20,
        feedback: null,
      })
      expect(done.submission.grade).toMatchObject({ score: 20, maxScore: 50, passed: false })
    })
  })
})
