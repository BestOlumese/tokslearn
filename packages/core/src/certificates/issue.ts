import { schema } from '@tokslearn/db'
import { and, asc, desc, eq, gt, inArray, isNotNull, or, sql } from 'drizzle-orm'
import { track } from '../analytics'
import { passedAttempt } from '../assessments'
import { markPurchaseConsumed } from '../commerce'
import { type Ctx, inTransaction, provider } from '../kernel/ctx'
import { NotFoundError } from '../kernel/errors'
import { removeGeneratedFile, storeGeneratedFile } from '../media'
import { sendEmail } from '../notifications'
import {
  type CertificateMode,
  type CertificateSettings,
  decide,
  learnerBasisText,
  linkedInAddUrl,
  newCertificateCode,
  readCertificateSettings,
} from './rules'

// Issuing certificates (docs/10 §8). A job calls `issueCertificate` on every event that could
// complete the criteria; it is insert-if-absent on (user, course), so repeats and races issue one.
// Foreign reads (docs/03 §3): courses, course_revisions, instructor_profiles, enrollments, user,
// quiz_attempts (via assessments); consumption_events (write: certificate_issued).

const {
  certificates,
  externalExamResults,
  courses,
  courseRevisions,
  instructorProfiles,
  enrollments,
  user,
  consumptionEvents,
} = schema

export interface LiveCertificateCourse {
  id: string
  title: string
  instructorId: string
  instructorName: string
  mode: CertificateMode
  settings: CertificateSettings
}

/** The course's live certificate rules and the names printed on its certificates. */
export async function liveCertificateCourse(
  ctx: Ctx,
  courseId: string,
): Promise<LiveCertificateCourse | null> {
  const [row] = await ctx.db
    .select({
      id: courses.id,
      instructorId: courses.instructorId,
      mode: courses.certificateMode,
      settings: courses.certificateSettings,
      title: courseRevisions.title,
      instructorName: sql<string>`coalesce(${instructorProfiles.displayName}, ${user.name})`,
    })
    .from(courses)
    .innerJoin(courseRevisions, eq(courseRevisions.id, courses.liveRevisionId))
    .innerJoin(user, eq(user.id, courses.instructorId))
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, courses.instructorId))
    .where(eq(courses.id, courseId))
  if (!row) return null
  return { ...row, settings: readCertificateSettings(row.settings) }
}

/** The enrollment that can earn a certificate: active or completed, and not expired. */
async function activeEnrollment(ctx: Ctx, userId: string, courseId: string) {
  const [row] = await ctx.db
    .select({ id: enrollments.id, completedAt: enrollments.completedAt })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, userId),
        eq(enrollments.courseId, courseId),
        inArray(enrollments.status, ['active', 'completed']),
        or(sql`${enrollments.accessExpiresAt} is null`, gt(enrollments.accessExpiresAt, ctx.now)),
      ),
    )
  return row ?? null
}

async function latestExternalPass(ctx: Ctx, userId: string, courseId: string) {
  const [row] = await ctx.db
    .select({ id: externalExamResults.id, providerName: externalExamResults.providerName })
    .from(externalExamResults)
    .where(
      and(
        eq(externalExamResults.userId, userId),
        eq(externalExamResults.courseId, courseId),
        eq(externalExamResults.result, 'pass'),
      ),
    )
    .orderBy(desc(externalExamResults.recordedAt))
    .limit(1)
  return row ?? null
}

/**
 * Whether the learner meets the course's live criteria right now, with what issuing needs.
 * Shared by issuing and by the player's "being prepared" notice, so both agree.
 */
export async function earnedDecision(ctx: Ctx, userId: string, courseId: string) {
  const course = await liveCertificateCourse(ctx, courseId)
  if (!course || course.mode === 'none') return null
  const enrollment = await activeEnrollment(ctx, userId, courseId)
  if (!enrollment) return null
  const [exam, external] = await Promise.all([
    course.mode === 'exam' && course.settings.examQuizId
      ? passedAttempt(ctx, { userId, quizId: course.settings.examQuizId })
      : null,
    course.mode === 'external' ? latestExternalPass(ctx, userId, courseId) : null,
  ])
  const decision = decide(course.mode, course.settings, {
    completed: enrollment.completedAt !== null,
    examAttemptId: exam?.attemptId ?? null,
    externalPassId: external?.id ?? null,
  })
  return decision ? { course, enrollment, decision, external } : null
}

export type IssueResult = { certificateId: string; created: boolean } | null

/**
 * Issues the learner's certificate if the course's live criteria are met. Returns the existing
 * certificate if there is one, or null when nothing is earned yet. Never throws for "not yet".
 */
export async function issueCertificate(
  ctx: Ctx,
  input: { userId: string; courseId: string },
): Promise<IssueResult> {
  return inTransaction(ctx, async (tx) => {
    const [existing] = await tx.db
      .select({ id: certificates.id })
      .from(certificates)
      .where(and(eq(certificates.userId, input.userId), eq(certificates.courseId, input.courseId)))
    if (existing) return { certificateId: existing.id, created: false }

    const earned = await earnedDecision(tx, input.userId, input.courseId)
    if (!earned) return null
    const { course, enrollment, decision, external } = earned

    const [learner] = await tx.db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, input.userId))
    if (!learner) return null

    // A new code on the rare collision; a conflict on (user, course) means another run won.
    for (let i = 0; i < 3; i++) {
      const [row] = await tx.db
        .insert(certificates)
        .values({
          publicCode: newCertificateCode(),
          userId: input.userId,
          courseId: input.courseId,
          enrollmentId: enrollment.id,
          basis: decision.basis,
          quizAttemptId: decision.basis === 'exam' ? decision.quizAttemptId : null,
          externalResultId: decision.basis === 'external' ? decision.externalResultId : null,
          recipientNameSnapshot: learner.name.trim(),
          courseTitleSnapshot: course.title,
          instructorNameSnapshot: course.instructorName,
          providerNameSnapshot:
            decision.basis === 'external' ? (external?.providerName ?? null) : null,
          issuedAt: tx.now,
        })
        .onConflictDoNothing()
        .returning({ id: certificates.id })
      if (row) {
        await tx.db.insert(consumptionEvents).values({
          userId: input.userId,
          courseId: input.courseId,
          kind: 'certificate_issued',
          refId: row.id,
          occurredAt: tx.now,
          ipHash: tx.ipHash,
        })
        await markPurchaseConsumed(tx, {
          userId: input.userId,
          courseId: input.courseId,
          reason: 'certificate_issued',
        })
        await tx.events.emit('certificate.issued', {
          certificateId: row.id,
          userId: input.userId,
          courseId: input.courseId,
        })
        void track(
          tx,
          'certificate_issued',
          { course_id: input.courseId, basis: decision.basis },
          { distinctId: input.userId },
        )
        return { certificateId: row.id, created: true }
      }
      const [winner] = await tx.db
        .select({ id: certificates.id })
        .from(certificates)
        .where(
          and(eq(certificates.userId, input.userId), eq(certificates.courseId, input.courseId)),
        )
      if (winner) return { certificateId: winner.id, created: false }
    }
    throw new Error('could not find a free certificate code')
  })
}

export const verifyUrlFor = (ctx: Ctx, code: string) =>
  `${provider(ctx, 'urls').app.replace(/\/$/, '')}/verify/${code}`

/**
 * Renders the PDF, stores it and points the certificate at it, removing the one it replaces.
 * `notify` sends the `certificate-issued` email (first issue only, never on name corrections).
 */
export async function renderCertificateFile(
  ctx: Ctx,
  certificateId: string,
  options: { notify: boolean },
): Promise<{ fileId: string }> {
  const [cert] = await ctx.db
    .select({ cert: certificates, email: user.email, name: user.name })
    .from(certificates)
    .innerJoin(user, eq(user.id, certificates.userId))
    .where(eq(certificates.id, certificateId))
  if (!cert) throw new NotFoundError('CERTIFICATE_NOT_FOUND')
  const c = cert.cert
  const verifyUrl = verifyUrlFor(ctx, c.publicCode)
  const bytes = await provider(ctx, 'certificatePdf').render({
    code: c.publicCode,
    recipientName: c.recipientNameSnapshot,
    courseTitle: c.courseTitleSnapshot,
    instructorName: c.instructorNameSnapshot,
    basis: c.basis,
    providerName: c.providerNameSnapshot,
    issuedAt: c.issuedAt,
    verifyUrl,
  })
  const file = await storeGeneratedFile(ctx, {
    ownerId: c.userId,
    purpose: 'certificate',
    bytes,
    mime: 'application/pdf',
    originalName: `Tokslearn certificate ${c.publicCode}.pdf`,
  })
  await ctx.db.update(certificates).set({ fileId: file.id }).where(eq(certificates.id, c.id))
  if (c.fileId) await removeGeneratedFile(ctx, c.fileId)

  if (options.notify && c.status === 'active') {
    await sendEmail(ctx, {
      id: 'certificate-issued',
      to: cert.email,
      businessKey: c.id,
      data: {
        name: cert.name.split(/\s+/)[0] ?? cert.name,
        courseTitle: c.courseTitleSnapshot,
        basisText: learnerBasisText(c.basis, c.providerNameSnapshot),
        code: c.publicCode,
        url: `${provider(ctx, 'urls').app.replace(/\/$/, '')}/account/certificates`,
        verifyUrl,
        linkedInUrl: linkedInAddUrl({
          courseTitle: c.courseTitleSnapshot,
          issuedAt: c.issuedAt,
          verifyUrl,
          code: c.publicCode,
        }),
      },
    })
  }
  return { fileId: file.id }
}

const BACKFILL_PAGE = 200

/**
 * Learners who already meet a course's live criteria but have no certificate, in pages by user
 * id. Runs when a course's certificate rules go live, so earlier finishers get theirs too.
 */
export async function certificateCandidates(
  ctx: Ctx,
  courseId: string,
  afterUserId: string | null,
): Promise<string[]> {
  const course = await liveCertificateCourse(ctx, courseId)
  if (!course || course.mode === 'none') return []
  // Literal outer column: Drizzle leaves single-table columns unqualified, which the subquery
  // would read as its own user_id.
  const noCertificate = sql`not exists (select 1 from certificates c where c.user_id = "enrollments"."user_id" and c.course_id = ${courseId})`
  const after = afterUserId ? gt(enrollments.userId, afterUserId) : undefined
  const base = and(
    eq(enrollments.courseId, courseId),
    inArray(enrollments.status, ['active', 'completed']),
    noCertificate,
    after,
  )
  if (course.mode === 'completion') {
    const rows = await ctx.db
      .select({ userId: enrollments.userId })
      .from(enrollments)
      .where(and(base, isNotNull(enrollments.completedAt)))
      .orderBy(asc(enrollments.userId))
      .limit(BACKFILL_PAGE)
    return rows.map((r) => r.userId)
  }
  if (course.mode === 'exam') {
    if (!course.settings.examQuizId) return []
    const rows = await ctx.db
      .select({ userId: enrollments.userId })
      .from(enrollments)
      .where(
        and(
          base,
          sql`exists (select 1 from quiz_attempts a where a.user_id = "enrollments"."user_id" and a.quiz_id = ${course.settings.examQuizId} and a.status = 'graded' and a.passed)`,
        ),
      )
      .orderBy(asc(enrollments.userId))
      .limit(BACKFILL_PAGE)
    return rows.map((r) => r.userId)
  }
  const rows = await ctx.db
    .select({ userId: enrollments.userId })
    .from(enrollments)
    .where(
      and(
        base,
        sql`exists (select 1 from external_exam_results r where r.user_id = "enrollments"."user_id" and r.course_id = ${courseId} and r.result = 'pass')`,
      ),
    )
    .orderBy(asc(enrollments.userId))
    .limit(BACKFILL_PAGE)
  return rows.map((r) => r.userId)
}

export { BACKFILL_PAGE }
