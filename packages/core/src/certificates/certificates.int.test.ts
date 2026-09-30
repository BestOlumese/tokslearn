import { type Db, schema } from '@tokslearn/db'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { and, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import {
  addQuizLesson,
  createBank,
  createQuestion,
  getStudioQuiz,
  saveAnswer,
  setQuizQuestions,
  startAttempt,
  submitAttempt,
  updateQuiz,
} from '../assessments'
import { addToCart, completeOrder, startCheckout } from '../commerce'
import { addStaff, getStudioCourse } from '../courses'
import { systemActor, type UserActor } from '../kernel/actor'
import { insertUser, testUser } from '../kernel/testing'
import { completeLessonFor } from '../learning'
import { completeFileUpload, createFileUpload } from '../media'
import { approveChanges, codeOf, doc, people, publishCourse, setup } from '../testing'
import {
  certificateCandidates,
  certificateDownloadUrl,
  getCertificateSettings,
  issueCertificate,
  listIssuedCertificates,
  listMyCertificates,
  myCourseCertificate,
  recordExternalResult,
  renderCertificateFile,
  requestNameCorrection,
  restoreCertificate,
  revokeCertificateAsAdmin,
  revokeCertificateAsInstructor,
  searchCertificates,
  updateCertificateRules,
  verifyCertificate,
} from '.'

afterAll(closeTestDb)

const T0 = new Date('2026-10-01T09:00:00Z')
const at = (min: number) => new Date(T0.getTime() + min * 60_000)
const blank = { examQuizId: null, requireCompletion: false, providerName: null, providerUrl: null }

async function world(db: Db, mode: 'completion' | 'exam' | 'external') {
  await seedCatalog(db)
  await seedCommission(db)
  const env = setup(db)
  const { owner, reviewer } = await people(db)
  const course = await publishCourse(env, owner, reviewer)
  const teach = env.ctx(owner, T0)

  let examQuizId: string | null = null
  let examLessonId: string | null = null
  let questionId = ''
  if (mode === 'exam') {
    const bank = await createBank(teach, { courseId: course.id, title: 'Final' })
    const q = await createQuestion(teach, {
      bankId: bank.id,
      type: 'true_false',
      prompt: doc('A trial balance lists every ledger balance.'),
      options: {},
      answer: { value: true },
      explanation: null,
      points: 1,
      tags: [],
    })
    questionId = q.id
    const s = await getStudioCourse(teach, course.id)
    const after = await addQuizLesson(teach, {
      courseId: course.id,
      version: s.version,
      sectionId: s.sections[0]?.id ?? '',
      title: 'Final exam',
      kind: 'exam',
    })
    const lesson = after.sections.flatMap((x) => x.lessons).find((l) => l.quizId)
    examQuizId = lesson?.quizId ?? null
    examLessonId = lesson?.id ?? null
    await setQuizQuestions(teach, { quizId: examQuizId ?? '', questionIds: [q.id] })
    const quiz = await getStudioQuiz(teach, examQuizId ?? '')
    await updateQuiz(teach, {
      quizId: quiz.id,
      kind: 'exam',
      settings: { ...quiz.settings, requireAllLessons: false },
    })
  }

  const studio = await getStudioCourse(teach, course.id)
  await updateCertificateRules(teach, {
    courseId: course.id,
    version: studio.version,
    mode,
    settings:
      mode === 'exam'
        ? { ...blank, examQuizId }
        : mode === 'external'
          ? { ...blank, providerName: 'ICAN', providerUrl: 'https://icanig.org' }
          : blank,
  })
  // Certificate rules (and the new exam lesson) go live with the review.
  await approveChanges(env, owner, reviewer, course.id)

  const buyer = testUser(['learner'], {
    userId: await insertUser(db, { name: 'Ada Eze', email: 'ada@example.com' }),
  })
  const bc = env.ctx(buyer, T0)
  await addToCart(bc, { itemType: 'course', itemId: course.id })
  const order = await startCheckout(bc, {
    expectedTotalKobo: 1_500_000n,
    idempotencyKey: 'buy',
    anonymousId: null,
  })
  await completeOrder(bc, { reference: order.publicId, via: 'confirm' })
  const job = env.ctx(systemActor('certificate-issue'), at(5))
  return {
    env,
    owner,
    reviewer,
    course,
    buyer,
    job,
    examLessonId,
    questionId,
    issue: () => issueCertificate(job, { userId: buyer.userId, courseId: course.id }),
  }
}

async function finishCourse(
  env: ReturnType<typeof setup>,
  owner: UserActor,
  courseId: string,
  buyer: UserActor,
) {
  const s = await getStudioCourse(env.ctx(owner, T0), courseId)
  for (const lesson of s.sections.flatMap((x) => x.lessons)) {
    await completeLessonFor(env.ctx(buyer, at(1)), {
      userId: buyer.userId,
      lesson: { id: lesson.id, courseId, type: lesson.type },
    })
  }
}

describe('completion certificates', () => {
  it('issue once when every lesson is done, end the refund right, and render, email and verify', async () => {
    await withRollback(async (db) => {
      const w = await world(db, 'completion')
      expect(await w.issue()).toBeNull()
      await finishCourse(w.env, w.owner, w.course.id, w.buyer)

      const first = await w.issue()
      expect(first).toMatchObject({ created: true })
      expect(await w.issue()).toEqual({ certificateId: first?.certificateId, created: false })

      // Issuing makes the purchase non-refundable (docs/08, Phase 7 acceptance).
      const [item] = await db
        .select({ status: schema.orderItems.status })
        .from(schema.orderItems)
        .where(eq(schema.orderItems.courseId, w.course.id))
      expect(item?.status).toBe('non_refundable')
      const consumed = await db
        .select()
        .from(schema.consumptionEvents)
        .where(eq(schema.consumptionEvents.kind, 'certificate_issued'))
      expect(consumed).toHaveLength(1)

      const certificateId = first?.certificateId ?? ''
      await renderCertificateFile(w.job, certificateId, { notify: true })
      expect(w.env.pdf.rendered[0]).toMatchObject({
        recipientName: 'Ada Eze',
        courseTitle: 'Excel for Accountants',
        basis: 'completion',
      })
      const outbox = await db.select({ payload: schema.outbox.payload }).from(schema.outbox)
      expect(outbox.map((o) => (o.payload as { id?: string }).id)).toContain('certificate-issued')

      const me = w.env.ctx(w.buyer, at(10))
      const [mine] = await listMyCertificates(me)
      expect(mine).toMatchObject({ courseTitle: 'Excel for Accountants', canCorrectName: true })
      expect(mine?.linkedInUrl).toContain('linkedin.com/profile/add')
      expect(await certificateDownloadUrl(me, certificateId)).toContain('/certificate/')

      const shown = await verifyCertificate(
        w.env.ctx({ kind: 'anonymous' }),
        mine?.code.toLowerCase() ?? '',
      )
      expect(shown).toMatchObject({
        status: 'active',
        recipientName: 'Ada Eze',
        basisText: 'Completed all lessons',
        courseSlug: w.course.slug,
      })
      expect(await codeOf(verifyCertificate(me, 'TL-C-0000-0000'))).toBe('CERTIFICATE_NOT_FOUND')

      // Someone else can't download it.
      const other = testUser(['learner'], { userId: await insertUser(db, { name: 'Bola' }) })
      expect(await codeOf(certificateDownloadUrl(w.env.ctx(other), certificateId))).toBe(
        'CERTIFICATE_NOT_FOUND',
      )
    })
  })

  it('corrects the name once, and revocation shows on verify and blocks downloads until restored', async () => {
    await withRollback(async (db) => {
      const w = await world(db, 'completion')
      await finishCourse(w.env, w.owner, w.course.id, w.buyer)
      const id = (await w.issue())?.certificateId ?? ''
      const me = w.env.ctx(w.buyer, at(10))

      const fixed = await requestNameCorrection(me, { certificateId: id, name: ' Adaeze  Eze ' })
      expect(fixed).toMatchObject({ recipientName: 'Adaeze Eze', canCorrectName: false })
      expect(await codeOf(requestNameCorrection(me, { certificateId: id, name: 'Ada' }))).toBe(
        'NAME_CORRECTION_USED',
      )
      const audit = await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, 'certificate.name_corrected'))
      expect(audit).toHaveLength(1)

      const teach = w.env.ctx(w.owner, at(20))
      const revoked = await revokeCertificateAsInstructor(teach, {
        certificateId: id,
        reason: 'Shared exam answers in the course group.',
      })
      expect(revoked.status).toBe('revoked')
      expect(await verifyCertificate(me, fixed.code)).toMatchObject({
        status: 'revoked',
        revokedReason: 'Shared exam answers in the course group.',
      })
      expect(await codeOf(certificateDownloadUrl(me, id))).toBe('CERTIFICATE_REVOKED')
      expect(
        await codeOf(
          revokeCertificateAsInstructor(teach, { certificateId: id, reason: 'Again, please.' }),
        ),
      ).toBe('CERTIFICATE_REVOKED')

      // TAs can see the list but not revoke; only admins restore.
      const ta = testUser(['learner'], {
        userId: await insertUser(db, { name: 'Tunde TA', email: 'ta@example.com' }),
      })
      await addStaff(teach, { courseId: w.course.id, emailOrUsername: 'ta@example.com' })
      expect(await listIssuedCertificates(w.env.ctx(ta), { courseId: w.course.id })).toHaveLength(1)
      expect(
        await codeOf(
          revokeCertificateAsInstructor(w.env.ctx(ta), { certificateId: id, reason: 'Not mine.' }),
        ),
      ).toBe('NOT_COURSE_OWNER')

      const admin = testUser(['admin'], {
        userId: await insertUser(db, { name: 'Admin' }),
        twoFactorEnabled: true,
        twoFactorVerifiedAt: at(19),
      })
      const found = await searchCertificates(w.env.ctx(admin, at(20)), 'ada@example.com')
      expect(found.map((c) => c.id)).toEqual([id])
      const restored = await restoreCertificate(w.env.ctx(admin, at(20)), {
        certificateId: id,
        reason: 'The instructor revoked the wrong learner.',
      })
      expect(restored.status).toBe('active')
      expect(
        await codeOf(
          restoreCertificate(w.env.ctx(admin, at(20)), {
            certificateId: id,
            reason: 'Twice over.',
          }),
        ),
      ).toBe('CERTIFICATE_NOT_REVOKED')
      await revokeCertificateAsAdmin(w.env.ctx(admin, at(21)), {
        certificateId: id,
        reason: 'Chargeback fraud.',
      })
      expect((await verifyCertificate(me, fixed.code)).status).toBe('revoked')
    })
  })

  it('issues exactly one certificate when several jobs race', async () => {
    await withRollback(async (db) => {
      const w = await world(db, 'completion')
      await finishCourse(w.env, w.owner, w.course.id, w.buyer)
      // One connection inside the test transaction serialises these, but each must still see
      // the others' row and report it rather than insert a second.
      const results = await Promise.all(Array.from({ length: 5 }, () => w.issue()))
      expect(results.filter((r) => r?.created)).toHaveLength(1)
      expect(new Set(results.map((r) => r?.certificateId)).size).toBe(1)
    })
  })
})

describe('exam certificates', () => {
  it('issue after a pass at the chosen exam, not before', async () => {
    await withRollback(async (db) => {
      const w = await world(db, 'exam')
      const settings = await getCertificateSettings(w.env.ctx(w.owner, T0), w.course.id)
      expect(settings.liveMode).toBe('exam')
      expect(settings.exams).toHaveLength(1)
      expect(await w.issue()).toBeNull()
      const state = () => myCourseCertificate(w.env.ctx(w.buyer, at(4)), w.course.id)
      expect(await state()).toEqual({ mode: 'exam', certificate: null, preparing: false })

      const me = w.env.ctx(w.buyer, at(1))
      const attempt = await startAttempt(me, { lessonId: w.examLessonId ?? '', confirmed: true })
      await saveAnswer(w.env.ctx(w.buyer, at(2)), {
        attemptId: attempt.id,
        questionId: w.questionId,
        answer: { value: true },
      })
      const done = await submitAttempt(w.env.ctx(w.buyer, at(3)), attempt.id)
      expect(done.result?.passed).toBe(true)
      // Passed, not issued yet: the player says it's being prepared.
      expect((await state()).preparing).toBe(true)

      const issued = await w.issue()
      expect(issued?.created).toBe(true)
      expect(await state()).toMatchObject({ preparing: false, certificate: { status: 'active' } })
      const [cert] = await db
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.id, issued?.certificateId ?? ''))
      expect(cert).toMatchObject({ basis: 'exam', quizAttemptId: attempt.id })
    })
  })

  it('rejects exam mode without an exam of this course, and external mode without a provider', async () => {
    await withRollback(async (db) => {
      const w = await world(db, 'completion')
      const teach = w.env.ctx(w.owner, at(30))
      const s = await getStudioCourse(teach, w.course.id)
      expect(
        await codeOf(
          updateCertificateRules(teach, {
            courseId: w.course.id,
            version: s.version,
            mode: 'exam',
            settings: { ...blank, examQuizId: '01920000-0000-7000-8000-00000000abcd' },
          }),
        ),
      ).toBe('CERTIFICATE_EXAM_REQUIRED')
      expect(
        await codeOf(
          updateCertificateRules(teach, {
            courseId: w.course.id,
            version: s.version,
            mode: 'external',
            settings: blank,
          }),
        ),
      ).toBe('CERTIFICATE_PROVIDER_REQUIRED')
    })
  })
})

describe('external certificates', () => {
  it('issue on a recorded pass with the provider named, and never on a fail', async () => {
    await withRollback(async (db) => {
      const w = await world(db, 'external')
      const teach = w.env.ctx(w.owner, at(30))
      const [enrollment] = await db
        .select({ id: schema.enrollments.id })
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.userId, w.buyer.userId),
            eq(schema.enrollments.courseId, w.course.id),
          ),
        )
      const up = await createFileUpload(teach, {
        purpose: 'exam_evidence',
        filename: 'results.pdf',
        mime: 'application/pdf',
        sizeBytes: 2048,
      })
      const [file] = await db.select().from(schema.files).where(eq(schema.files.id, up.fileId))
      w.env.storage.putObject('private', file?.key ?? '', 2048, 'application/pdf')
      await completeFileUpload(teach, up.fileId)

      const input = {
        courseId: w.course.id,
        enrollmentId: enrollment?.id ?? '',
        score: 48,
        providerName: 'ICAN',
        examUrl: 'https://icanig.org/results',
        evidenceFileId: null,
      }
      const fail = await recordExternalResult(teach, { ...input, result: 'fail' })
      expect(fail).toMatchObject({ result: 'fail', learnerName: 'Ada E.', hasEvidence: false })
      expect(await w.issue()).toBeNull()

      const pass = await recordExternalResult(teach, {
        ...input,
        result: 'pass',
        score: 71,
        evidenceFileId: up.fileId,
      })
      expect(pass.hasEvidence).toBe(true)
      const issued = await w.issue()
      expect(issued?.created).toBe(true)
      const shown = await verifyCertificate(
        w.env.ctx({ kind: 'anonymous' }),
        (await listMyCertificates(w.env.ctx(w.buyer)))[0]?.code ?? '',
      )
      expect(shown.basisText).toBe('Externally assessed via ICAN')

      // Learners of other courses can't be given a result here.
      expect(
        await codeOf(
          recordExternalResult(teach, {
            ...input,
            enrollmentId: '01920000-0000-7000-8000-00000000abcd',
            result: 'pass',
          }),
        ),
      ).toBe('ENROLLMENT_NOT_FOUND')
    })
  })
})

describe('backfill', () => {
  it('finds learners who already qualify when the rules go live, and skips those with one', async () => {
    await withRollback(async (db) => {
      const w = await world(db, 'completion')
      await finishCourse(w.env, w.owner, w.course.id, w.buyer)
      expect(await certificateCandidates(w.job, w.course.id, null)).toEqual([w.buyer.userId])
      await w.issue()
      expect(await certificateCandidates(w.job, w.course.id, null)).toEqual([])
    })
  })
})
