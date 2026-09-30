import { schema } from '@tokslearn/db'
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { writeAudit } from '../admin'
import { track } from '../analytics'
import { listCourseQuizzes } from '../assessments'
import { getStudioCourse, studioCourse, updateCertificateSettings } from '../courses'
import { learnerDisplayName } from '../enrollments'
import { hasRole, type UserActor } from '../kernel/actor'
import { cacheTags } from '../kernel/cache'
import { type Ctx, inTransaction, provider } from '../kernel/ctx'
import { ConflictError, NotFoundError, RuleViolationError } from '../kernel/errors'
import { requireStaff, requireUser } from '../kernel/guards'
import { getFiles, getOwnedUploadedFile, privateFileUrl } from '../media'
import { renderCertificateFile, verifyUrlFor } from './issue'
import {
  basisText,
  type CertificateBasis,
  type CertificateMode,
  type CertificateSettings,
  cleanRecipientName,
  linkedInAddUrl,
  normaliseCode,
  readCertificateSettings,
  settingsForMode,
} from './rules'

// Certificates for learners, the public verify lookup, studio settings and external results,
// and staff revocation (docs/10 §8, docs/20 Phase 7 rows).
// Foreign reads (docs/03 §3): courses, instructor_profiles, enrollments, user.

const { certificates, externalExamResults, courses, instructorProfiles, enrollments, user } = schema

type CertificateRow = typeof certificates.$inferSelect

const canSearchCertificates = (u: UserActor) => hasRole(u, 'support', 'admin', 'super_admin')
const canRevokeCertificates = (u: UserActor) => hasRole(u, 'admin', 'super_admin')

/** Course slug only while the course page is public (published or unlisted). */
const publicSlug = sql<
  string | null
>`case when ${courses.status} in ('published', 'unlisted') and ${courses.deletedAt} is null then ${courses.slug} end`

// ─── Public ──────────────────────────────────────────────────────────────────────────────────

export interface PublicCertificate {
  code: string
  status: 'active' | 'revoked'
  recipientName: string
  courseTitle: string
  courseSlug: string | null
  instructorName: string
  instructorSlug: string | null
  issuedAt: Date
  basis: CertificateBasis
  basisText: string
  providerName: string | null
  revokedReason: string | null
  revokedAt: Date | null
}

/** The verify page (public, no sign-in). Unknown or malformed codes: CERTIFICATE_NOT_FOUND. */
export async function verifyCertificate(ctx: Ctx, input: string): Promise<PublicCertificate> {
  const code = normaliseCode(input)
  if (!code) throw new NotFoundError('CERTIFICATE_NOT_FOUND')
  const [row] = await ctx.db
    .select({
      cert: certificates,
      courseSlug: publicSlug,
      instructorSlug: instructorProfiles.slug,
    })
    .from(certificates)
    .innerJoin(courses, eq(courses.id, certificates.courseId))
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, courses.instructorId))
    .where(eq(certificates.publicCode, code))
  if (!row) throw new NotFoundError('CERTIFICATE_NOT_FOUND')
  const c = row.cert
  return {
    code: c.publicCode,
    status: c.status,
    recipientName: c.recipientNameSnapshot,
    courseTitle: c.courseTitleSnapshot,
    courseSlug: row.courseSlug,
    instructorName: c.instructorNameSnapshot,
    instructorSlug: row.instructorSlug,
    issuedAt: c.issuedAt,
    basis: c.basis,
    basisText: basisText(c.basis, c.providerNameSnapshot),
    providerName: c.providerNameSnapshot,
    revokedReason: c.revokedReason,
    revokedAt: c.revokedAt,
  }
}

// ─── Learner ─────────────────────────────────────────────────────────────────────────────────

export interface MyCertificate {
  id: string
  code: string
  courseId: string
  courseTitle: string
  courseSlug: string | null
  recipientName: string
  issuedAt: Date
  basis: CertificateBasis
  basisText: string
  status: 'active' | 'revoked'
  revokedReason: string | null
  canCorrectName: boolean
  verifyUrl: string
  linkedInUrl: string
}

function myView(ctx: Ctx, c: CertificateRow, courseSlug: string | null): MyCertificate {
  const verifyUrl = verifyUrlFor(ctx, c.publicCode)
  return {
    id: c.id,
    code: c.publicCode,
    courseId: c.courseId,
    courseTitle: c.courseTitleSnapshot,
    courseSlug,
    recipientName: c.recipientNameSnapshot,
    issuedAt: c.issuedAt,
    basis: c.basis,
    basisText: basisText(c.basis, c.providerNameSnapshot),
    status: c.status,
    revokedReason: c.revokedReason,
    canCorrectName: c.status === 'active' && c.nameCorrectedAt === null,
    verifyUrl,
    linkedInUrl: linkedInAddUrl({
      courseTitle: c.courseTitleSnapshot,
      issuedAt: c.issuedAt,
      verifyUrl,
      code: c.publicCode,
    }),
  }
}

export async function listMyCertificates(ctx: Ctx): Promise<MyCertificate[]> {
  const me = requireUser(ctx.actor)
  const rows = await ctx.db
    .select({ cert: certificates, courseSlug: publicSlug })
    .from(certificates)
    .innerJoin(courses, eq(courses.id, certificates.courseId))
    .where(eq(certificates.userId, me.userId))
    .orderBy(desc(certificates.issuedAt))
  return rows.map((r) => myView(ctx, r.cert, r.courseSlug))
}

async function ownCertificate(ctx: Ctx, certificateId: string) {
  const me = requireUser(ctx.actor)
  const [row] = await ctx.db
    .select({ cert: certificates, courseSlug: publicSlug })
    .from(certificates)
    .innerJoin(courses, eq(courses.id, certificates.courseId))
    .where(and(eq(certificates.id, certificateId), eq(certificates.userId, me.userId)))
  if (!row) throw new NotFoundError('CERTIFICATE_NOT_FOUND')
  return row
}

/** A short-lived link to the PDF. Renders it first if the job hasn't yet (or failed). */
export async function certificateDownloadUrl(ctx: Ctx, certificateId: string): Promise<string> {
  const { cert } = await ownCertificate(ctx, certificateId)
  if (cert.status === 'revoked') throw new ConflictError('CERTIFICATE_REVOKED')
  const fileId =
    cert.fileId ?? (await renderCertificateFile(ctx, cert.id, { notify: false })).fileId
  const file = (await getFiles(ctx, [fileId])).get(fileId)
  if (!file) throw new NotFoundError('CERTIFICATE_NOT_FOUND')
  const safeTitle = cert.courseTitleSnapshot.replace(/[\\/:*?"<>|]+/g, ' ').trim()
  return privateFileUrl(ctx, file, `Tokslearn certificate - ${safeTitle}.pdf`)
}

/**
 * Once per certificate (docs/10 §8): the name changes, the code stays, the PDF is made again by
 * the render job and the change is audit-logged.
 */
export async function requestNameCorrection(
  ctx: Ctx,
  input: { certificateId: string; name: string },
): Promise<MyCertificate> {
  const name = cleanRecipientName(input.name)
  if (!name) {
    throw new RuleViolationError('VALIDATION_FAILED', {
      issues: [{ path: 'name', message: 'Between 2 and 80 characters.' }],
    })
  }
  return inTransaction(ctx, async (tx) => {
    const { cert, courseSlug } = await ownCertificate(tx, input.certificateId)
    if (cert.status === 'revoked') throw new ConflictError('CERTIFICATE_REVOKED')
    if (cert.nameCorrectedAt) throw new RuleViolationError('NAME_CORRECTION_USED')
    // Guarded update: two tabs can't both use the one correction.
    const [updated] = await tx.db
      .update(certificates)
      .set({ recipientNameSnapshot: name, nameCorrectedAt: tx.now })
      .where(and(eq(certificates.id, cert.id), sql`${certificates.nameCorrectedAt} is null`))
      .returning()
    if (!updated) throw new RuleViolationError('NAME_CORRECTION_USED')
    await writeAudit(tx, {
      action: 'certificate.name_corrected',
      targetType: 'certificate',
      targetId: cert.id,
      before: { name: cert.recipientNameSnapshot },
      after: { name },
    })
    await tx.events.emit('certificate.name_corrected', {
      certificateId: cert.id,
      userId: cert.userId,
      courseId: cert.courseId,
    })
    tx.afterCommit(() => tx.cache.invalidate([cacheTags.certificate(cert.publicCode)]))
    return myView(tx, updated, courseSlug)
  })
}

// ─── Studio ──────────────────────────────────────────────────────────────────────────────────

export interface StudioCertificateSettings {
  courseId: string
  version: number
  mode: CertificateMode
  settings: CertificateSettings
  liveMode: CertificateMode
  exams: Array<{ quizId: string; title: string; isLive: boolean }>
  canEdit: boolean
  issuedCount: number
}

export async function getCertificateSettings(
  ctx: Ctx,
  courseId: string,
): Promise<StudioCertificateSettings> {
  const access = await studioCourse(ctx, courseId, 'view')
  const [studio, quizzes, [live], [count]] = await Promise.all([
    getStudioCourse(ctx, courseId),
    listCourseQuizzes(ctx, courseId),
    ctx.db.select({ mode: courses.certificateMode }).from(courses).where(eq(courses.id, courseId)),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(certificates)
      .where(eq(certificates.courseId, courseId)),
  ])
  return {
    courseId,
    version: studio.version,
    mode: studio.revision.certificateMode,
    settings: readCertificateSettings(studio.revision.certificateSettings),
    liveMode: live?.mode ?? 'none',
    exams: quizzes
      .filter((q) => q.kind === 'exam' && q.lessonId)
      .map((q) => ({ quizId: q.id, title: q.lessonTitle ?? 'Exam', isLive: q.isLive })),
    canEdit: access.canEdit,
    issuedCount: count?.n ?? 0,
  }
}

/** Saves to the draft; the courses module decides whether it needs a review. */
export async function updateCertificateRules(
  ctx: Ctx,
  input: {
    courseId: string
    version: number
    mode: CertificateMode
    settings: CertificateSettings
  },
): Promise<StudioCertificateSettings> {
  await studioCourse(ctx, input.courseId, 'edit')
  const settings = settingsForMode(input.mode, input.settings)
  if (input.mode === 'exam') {
    const exams = (await listCourseQuizzes(ctx, input.courseId)).filter(
      (q) => q.kind === 'exam' && q.lessonId,
    )
    if (!exams.some((q) => q.id === settings.examQuizId)) {
      throw new RuleViolationError('CERTIFICATE_EXAM_REQUIRED')
    }
  }
  if (input.mode === 'external' && !settings.providerName) {
    throw new RuleViolationError('CERTIFICATE_PROVIDER_REQUIRED')
  }
  await updateCertificateSettings(ctx, {
    courseId: input.courseId,
    version: input.version,
    mode: input.mode,
    settings: { ...settings },
  })
  return getCertificateSettings(ctx, input.courseId)
}

/** A sample PDF with the draft's rules, for the studio preview. */
export async function previewCertificate(ctx: Ctx, courseId: string): Promise<Uint8Array> {
  await studioCourse(ctx, courseId, 'view')
  const studio = await getStudioCourse(ctx, courseId)
  const settings = readCertificateSettings(studio.revision.certificateSettings)
  const [instructor] = await ctx.db
    .select({ name: sql<string>`coalesce(${instructorProfiles.displayName}, ${user.name})` })
    .from(courses)
    .innerJoin(user, eq(user.id, courses.instructorId))
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, courses.instructorId))
    .where(eq(courses.id, courseId))
  const mode = studio.revision.certificateMode
  const code = 'TL-C-SAMP-LE00'
  return provider(ctx, 'certificatePdf').render({
    code,
    recipientName: 'Chiamaka Okafor',
    courseTitle: studio.revision.title,
    instructorName: instructor?.name ?? '',
    basis: mode === 'none' ? 'completion' : mode,
    providerName: settings.providerName,
    issuedAt: ctx.now,
    verifyUrl: verifyUrlFor(ctx, code),
    sample: true,
  })
}

export interface IssuedCertificate {
  id: string
  code: string
  learnerName: string
  issuedAt: Date
  basis: CertificateBasis
  status: 'active' | 'revoked'
  revokedReason: string | null
}

const issuedView = (c: CertificateRow): IssuedCertificate => ({
  id: c.id,
  code: c.publicCode,
  learnerName: learnerDisplayName(c.recipientNameSnapshot),
  issuedAt: c.issuedAt,
  basis: c.basis,
  status: c.status,
  revokedReason: c.revokedReason,
})

export async function listIssuedCertificates(
  ctx: Ctx,
  input: { courseId: string; q?: string | undefined },
): Promise<IssuedCertificate[]> {
  await studioCourse(ctx, input.courseId, 'view')
  const q = input.q?.trim()
  const code = q ? normaliseCode(q) : null
  const rows = await ctx.db
    .select()
    .from(certificates)
    .where(
      and(
        eq(certificates.courseId, input.courseId),
        q
          ? code
            ? eq(certificates.publicCode, code)
            : ilike(certificates.recipientNameSnapshot, `%${q.replace(/[%_\\]/g, '\\$&')}%`)
          : undefined,
      ),
    )
    .orderBy(desc(certificates.issuedAt))
    .limit(200)
  return rows.map(issuedView)
}

async function revoke(
  tx: Ctx,
  cert: CertificateRow,
  reason: string,
  revokedBy: string,
): Promise<CertificateRow> {
  if (cert.status === 'revoked') throw new ConflictError('CERTIFICATE_REVOKED')
  const [updated] = await tx.db
    .update(certificates)
    .set({ status: 'revoked', revokedReason: reason, revokedAt: tx.now, revokedBy })
    .where(and(eq(certificates.id, cert.id), eq(certificates.status, 'active')))
    .returning()
  if (!updated) throw new ConflictError('CERTIFICATE_REVOKED')
  await writeAudit(tx, {
    action: 'certificate.revoked',
    targetType: 'certificate',
    targetId: cert.id,
    before: { status: 'active' },
    after: { status: 'revoked', reason },
  })
  await tx.events.emit('certificate.revoked', {
    certificateId: cert.id,
    userId: cert.userId,
    courseId: cert.courseId,
  })
  tx.afterCommit(() => tx.cache.invalidate([cacheTags.certificate(cert.publicCode)]))
  return updated
}

/** The instructor (or a co-instructor) revokes with a reason; only an admin can restore. */
export async function revokeCertificateAsInstructor(
  ctx: Ctx,
  input: { certificateId: string; reason: string },
): Promise<IssuedCertificate> {
  const me = requireUser(ctx.actor)
  return inTransaction(ctx, async (tx) => {
    const [cert] = await tx.db
      .select()
      .from(certificates)
      .where(eq(certificates.id, input.certificateId))
      .for('update')
    if (!cert) throw new NotFoundError('CERTIFICATE_NOT_FOUND')
    await studioCourse(tx, cert.courseId, 'edit')
    return issuedView(await revoke(tx, cert, input.reason, me.userId))
  })
}

// ─── External results ────────────────────────────────────────────────────────────────────────

export interface ExternalResult {
  id: string
  enrollmentId: string
  learnerName: string
  providerName: string
  examUrl: string | null
  result: 'pass' | 'fail'
  score: number | null
  hasEvidence: boolean
  recordedAt: Date
  recordedByName: string
}

async function resultViews(ctx: Ctx, where: ReturnType<typeof eq>): Promise<ExternalResult[]> {
  const rows = await ctx.db
    .select({
      r: externalExamResults,
      enrollmentId: enrollments.id,
      learner: user.name,
      recordedBy: sql<string>`(select u.name from "user" u where u.id = ${externalExamResults.recordedBy})`,
    })
    .from(externalExamResults)
    .innerJoin(user, eq(user.id, externalExamResults.userId))
    .innerJoin(
      enrollments,
      and(
        eq(enrollments.userId, externalExamResults.userId),
        eq(enrollments.courseId, externalExamResults.courseId),
      ),
    )
    .where(where)
    .orderBy(desc(externalExamResults.recordedAt))
    .limit(200)
  return rows.map(({ r, enrollmentId, learner, recordedBy }) => ({
    id: r.id,
    enrollmentId,
    learnerName: learnerDisplayName(learner),
    providerName: r.providerName,
    examUrl: r.examUrl,
    result: r.result,
    score: r.score,
    hasEvidence: r.evidenceFileId !== null,
    recordedAt: r.recordedAt,
    recordedByName: learnerDisplayName(recordedBy ?? ''),
  }))
}

export async function listExternalResults(ctx: Ctx, courseId: string): Promise<ExternalResult[]> {
  await studioCourse(ctx, courseId, 'view')
  return resultViews(ctx, eq(externalExamResults.courseId, courseId))
}

/**
 * Pass or fail for one learner in an exam taken elsewhere. Anyone who grades the course may
 * record it (the instructor and TAs). A pass on an external-mode course leads to the certificate
 * through the `certificate-issue` job.
 */
export async function recordExternalResult(
  ctx: Ctx,
  input: {
    courseId: string
    enrollmentId: string
    result: 'pass' | 'fail'
    score: number | null
    providerName: string
    examUrl: string | null
    evidenceFileId: string | null
  },
): Promise<ExternalResult> {
  const access = await studioCourse(ctx, input.courseId, 'view')
  if (!access.canGrade) throw new NotFoundError('COURSE_NOT_FOUND')
  const evidence = input.evidenceFileId
    ? await getOwnedUploadedFile(ctx, input.evidenceFileId, 'exam_evidence')
    : null
  const id = await inTransaction(ctx, async (tx) => {
    const [enrollment] = await tx.db
      .select({ userId: enrollments.userId })
      .from(enrollments)
      .where(and(eq(enrollments.id, input.enrollmentId), eq(enrollments.courseId, input.courseId)))
    if (!enrollment) throw new NotFoundError('ENROLLMENT_NOT_FOUND')
    const [row] = await tx.db
      .insert(externalExamResults)
      .values({
        courseId: input.courseId,
        userId: enrollment.userId,
        providerName: input.providerName.trim(),
        examUrl: input.examUrl,
        result: input.result,
        score: input.score,
        evidenceFileId: evidence?.id ?? null,
        recordedBy: access.user.userId,
        recordedAt: tx.now,
      })
      .returning({ id: externalExamResults.id })
    if (!row) throw new Error('external result not inserted')
    await writeAudit(tx, {
      action: 'external_result.recorded',
      targetType: 'external_exam_result',
      targetId: row.id,
      after: { result: input.result, score: input.score, provider: input.providerName },
    })
    await tx.events.emit('external_result.recorded', {
      resultId: row.id,
      userId: enrollment.userId,
      courseId: input.courseId,
      result: input.result,
    })
    return row.id
  })
  const [view] = await resultViews(ctx, eq(externalExamResults.id, id))
  if (!view) throw new NotFoundError('EXTERNAL_RESULT_NOT_FOUND')
  return view
}

export async function externalEvidenceUrl(ctx: Ctx, resultId: string): Promise<string> {
  const [row] = await ctx.db
    .select({ courseId: externalExamResults.courseId, fileId: externalExamResults.evidenceFileId })
    .from(externalExamResults)
    .where(eq(externalExamResults.id, resultId))
  if (!row) throw new NotFoundError('EXTERNAL_RESULT_NOT_FOUND')
  await studioCourse(ctx, row.courseId, 'view')
  const file = row.fileId ? (await getFiles(ctx, [row.fileId])).get(row.fileId) : undefined
  if (!file) throw new NotFoundError('FILE_NOT_FOUND')
  return privateFileUrl(ctx, file, file.originalName ?? undefined)
}

// ─── Admin ───────────────────────────────────────────────────────────────────────────────────

export interface AdminCertificate {
  id: string
  code: string
  recipientName: string
  email: string
  courseTitle: string
  issuedAt: Date
  basis: CertificateBasis
  status: 'active' | 'revoked'
  revokedReason: string | null
  revokedAt: Date | null
}

async function adminViews(ctx: Ctx, ids: ReadonlyArray<string>): Promise<AdminCertificate[]> {
  if (ids.length === 0) return []
  const rows = await ctx.db
    .select({ c: certificates, email: user.email })
    .from(certificates)
    .innerJoin(user, eq(user.id, certificates.userId))
    .where(inArray(certificates.id, [...ids]))
    .orderBy(desc(certificates.issuedAt))
  return rows.map(({ c, email }) => ({
    id: c.id,
    code: c.publicCode,
    recipientName: c.recipientNameSnapshot,
    email,
    courseTitle: c.courseTitleSnapshot,
    issuedAt: c.issuedAt,
    basis: c.basis,
    status: c.status,
    revokedReason: c.revokedReason,
    revokedAt: c.revokedAt,
  }))
}

/** By code, or by the learner's email or name (docs/20 /admin/certificates). */
export async function searchCertificates(ctx: Ctx, q: string): Promise<AdminCertificate[]> {
  requireStaff(ctx.actor, canSearchCertificates)
  const code = normaliseCode(q)
  const like = `%${q.trim().replace(/[%_\\]/g, '\\$&')}%`
  const rows = await ctx.db
    .select({ id: certificates.id })
    .from(certificates)
    .innerJoin(user, eq(user.id, certificates.userId))
    .where(
      code
        ? eq(certificates.publicCode, code)
        : or(
            ilike(user.email, like),
            ilike(user.name, like),
            ilike(certificates.recipientNameSnapshot, like),
          ),
    )
    .orderBy(desc(certificates.issuedAt))
    .limit(50)
  return adminViews(
    ctx,
    rows.map((r) => r.id),
  )
}

async function lockedCertificate(tx: Ctx, certificateId: string) {
  const [cert] = await tx.db
    .select()
    .from(certificates)
    .where(eq(certificates.id, certificateId))
    .for('update')
  if (!cert) throw new NotFoundError('CERTIFICATE_NOT_FOUND')
  return cert
}

export async function revokeCertificateAsAdmin(
  ctx: Ctx,
  input: { certificateId: string; reason: string },
): Promise<AdminCertificate> {
  const me = requireStaff(ctx.actor, canRevokeCertificates)
  await inTransaction(ctx, async (tx) =>
    revoke(tx, await lockedCertificate(tx, input.certificateId), input.reason, me.userId),
  )
  const [view] = await adminViews(ctx, [input.certificateId])
  if (!view) throw new NotFoundError('CERTIFICATE_NOT_FOUND')
  return view
}

export async function restoreCertificate(
  ctx: Ctx,
  input: { certificateId: string; reason: string },
): Promise<AdminCertificate> {
  requireStaff(ctx.actor, canRevokeCertificates)
  await inTransaction(ctx, async (tx) => {
    const cert = await lockedCertificate(tx, input.certificateId)
    if (cert.status === 'active') throw new ConflictError('CERTIFICATE_NOT_REVOKED')
    await tx.db
      .update(certificates)
      .set({ status: 'active', revokedReason: null, revokedAt: null, revokedBy: null })
      .where(eq(certificates.id, cert.id))
    await writeAudit(tx, {
      action: 'certificate.restored',
      targetType: 'certificate',
      targetId: cert.id,
      before: { status: 'revoked', reason: cert.revokedReason },
      after: { status: 'active', reason: input.reason },
    })
    tx.afterCommit(() => tx.cache.invalidate([cacheTags.certificate(cert.publicCode)]))
  })
  const [view] = await adminViews(ctx, [input.certificateId])
  if (!view) throw new NotFoundError('CERTIFICATE_NOT_FOUND')
  return view
}

/**
 * `certificate_verified` (docs/24): one per verify-page view. No visitor data: the page is
 * public and most viewers never signed in or agreed to analytics.
 */
export async function recordCertificateView(ctx: Ctx, input: string): Promise<void> {
  const code = normaliseCode(input)
  if (!code) return
  const [row] = await ctx.db
    .select({ id: certificates.id })
    .from(certificates)
    .where(eq(certificates.publicCode, code))
  if (row)
    await track(
      ctx,
      'certificate_verified',
      { certificate_id: row.id },
      { distinctId: 'verify-page' },
    )
}
