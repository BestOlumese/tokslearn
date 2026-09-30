import { z } from 'zod'
import { base } from './base'
import { IsoDateTime } from './shared'

// Phase 7 procedures (docs/06 §5, docs/10 §8, docs/20 Phase 7 rows): certificates for learners,
// the public verify lookup, the studio certificate settings and external results, and admin
// revocation. Codes look like TL-C-8Q2M-4K7P.

const named = <S extends z.ZodType>(schema: S) =>
  schema as unknown as z.ZodType<z.output<S>, z.input<S>>

const get = (path: `/${string}`, tag: string, summary: string, description: string) =>
  base.route({ method: 'GET', path, tags: [tag], summary, description })
const post = (path: `/${string}`, tag: string, summary: string, description: string) =>
  base.route({ method: 'POST', path, tags: [tag], summary, description })

export const CertificateMode = z.enum(['none', 'completion', 'exam', 'external'])
export type CertificateMode = z.infer<typeof CertificateMode>
export const CertificateBasis = z.enum(['completion', 'exam', 'external'])
export type CertificateBasis = z.infer<typeof CertificateBasis>

/** Anything with letters, digits and dashes; core normalises and checks the real format. */
const CodeParam = z.string().trim().min(1).max(40)
const Reason = z.string().trim().min(5).max(500)

/**
 * What counts, per mode (docs/10 §8). Completion needs every lesson done, which already means
 * every graded quiz and assignment passed (they complete only on a pass).
 */
export const CertificateSettings = z.object({
  /** Exam mode: the exam that earns the certificate (an exam lesson of this course). */
  examQuizId: z.uuid().nullable().default(null),
  /** Exam mode: every other lesson must be completed as well. */
  requireCompletion: z.boolean().default(false),
  /** External mode: who runs the exam, shown on the certificate. */
  providerName: z.string().trim().min(2).max(80).nullable().default(null),
  providerUrl: z
    .url({ protocol: /^https$/ })
    .max(500)
    .nullable()
    .default(null),
})
export type CertificateSettings = z.infer<typeof CertificateSettings>

// ─── Public and learner ────────────────────────────────────────────────────────────────────

const PublicCertificateShape = z.object({
  code: z.string(),
  status: z.enum(['active', 'revoked']),
  recipientName: z.string(),
  courseTitle: z.string(),
  /** Null when the course is no longer listed. */
  courseSlug: z.string().nullable(),
  instructorName: z.string(),
  instructorSlug: z.string().nullable(),
  issuedAt: IsoDateTime,
  basis: CertificateBasis,
  /** "Passed a timed exam" / "Completed all lessons" / "Externally assessed via {provider}". */
  basisText: z.string(),
  providerName: z.string().nullable(),
  revokedReason: z.string().nullable(),
  revokedAt: IsoDateTime.nullable(),
})
export type PublicCertificateDto = z.infer<typeof PublicCertificateShape>
export const PublicCertificateDto = named(PublicCertificateShape)

const MyCertificateShape = z.object({
  id: z.uuid(),
  code: z.string(),
  courseId: z.uuid(),
  courseTitle: z.string(),
  courseSlug: z.string().nullable(),
  recipientName: z.string(),
  issuedAt: IsoDateTime,
  basis: CertificateBasis,
  basisText: z.string(),
  status: z.enum(['active', 'revoked']),
  revokedReason: z.string().nullable(),
  canCorrectName: z.boolean(),
  verifyUrl: z.string(),
  /** LinkedIn's "Add licence or certification" form, prefilled. */
  linkedInUrl: z.string(),
})
export type MyCertificateDto = z.infer<typeof MyCertificateShape>
export const MyCertificateDto = named(MyCertificateShape)

const CourseCertificateShape = z.object({
  mode: CertificateMode,
  certificate: z
    .object({ id: z.uuid(), code: z.string(), status: z.enum(['active', 'revoked']) })
    .nullable(),
  /** Criteria met, certificate not issued yet (it's on its way). */
  preparing: z.boolean(),
})
export type CourseCertificateDto = z.infer<typeof CourseCertificateShape>
export const CourseCertificateDto = named(CourseCertificateShape)

export const certificatesContract = {
  listMine: get(
    '/me/certificates',
    'Certificates',
    'My certificates',
    'Every certificate the signed-in learner has earned, newest first, revoked ones included.',
  ).output(z.object({ items: z.array(MyCertificateDto) })),
  forCourse: get(
    '/me/courses/{courseId}/certificate',
    'Certificates',
    'My certificate for a course',
    'For the course player: the certificate if issued, or `preparing` while it is on its way.',
  )
    .input(z.object({ courseId: z.uuid() }))
    .output(CourseCertificateDto),
  download: post(
    '/me/certificates/{certificateId}/download',
    'Certificates',
    'Download a certificate',
    'A short-lived link to the PDF. Revoked certificates: CERTIFICATE_REVOKED.',
  )
    .input(z.object({ certificateId: z.uuid() }))
    .output(z.object({ url: z.string() })),
  verify: get(
    '/certificates/{code}',
    'Certificates',
    'Check a certificate',
    'Public. Who earned it, for which course, how and whether it still stands.',
  )
    .input(z.object({ code: CodeParam }))
    .output(PublicCertificateDto),
  requestNameCorrection: post(
    '/me/certificates/{certificateId}/name',
    'Certificates',
    'Correct the name on a certificate',
    'Once per certificate. Re-issues the PDF with the same code; recorded in the audit log.',
  )
    .input(
      z.strictObject({
        certificateId: z.uuid(),
        name: z.string().trim().min(2).max(80),
      }),
    )
    .output(MyCertificateDto),
}

// ─── Studio ─────────────────────────────────────────────────────────────────────────────────

const StudioCertificateSettingsShape = z.object({
  courseId: z.uuid(),
  version: z.number().int(),
  /** The draft's choice; it goes live with the next approved review. */
  mode: CertificateMode,
  settings: CertificateSettings,
  liveMode: CertificateMode,
  /** Exam lessons of the course, for the exam picker. */
  exams: z.array(z.object({ quizId: z.uuid(), title: z.string(), isLive: z.boolean() })),
  canEdit: z.boolean(),
  issuedCount: z.number().int(),
})
export type StudioCertificateSettingsDto = z.infer<typeof StudioCertificateSettingsShape>
export const StudioCertificateSettingsDto = named(StudioCertificateSettingsShape)

const IssuedCertificateShape = z.object({
  id: z.uuid(),
  code: z.string(),
  learnerName: z.string(),
  issuedAt: IsoDateTime,
  basis: CertificateBasis,
  status: z.enum(['active', 'revoked']),
  revokedReason: z.string().nullable(),
})
export type IssuedCertificateDto = z.infer<typeof IssuedCertificateShape>
export const IssuedCertificateDto = named(IssuedCertificateShape)

const ExternalResultShape = z.object({
  id: z.uuid(),
  enrollmentId: z.uuid(),
  learnerName: z.string(),
  providerName: z.string(),
  examUrl: z.string().nullable(),
  result: z.enum(['pass', 'fail']),
  score: z.number().nullable(),
  hasEvidence: z.boolean(),
  recordedAt: IsoDateTime,
  recordedByName: z.string(),
})
export type ExternalResultDto = z.infer<typeof ExternalResultShape>
export const ExternalResultDto = named(ExternalResultShape)

export const studioCertificatesContract = {
  get: get(
    '/studio/courses/{courseId}/certificate',
    'Studio',
    'Certificate settings',
    'The mode (none, completion, exam, external) and what counts.',
  )
    .input(z.object({ courseId: z.uuid() }))
    .output(StudioCertificateSettingsDto),
  update: post(
    '/studio/courses/{courseId}/certificate',
    'Studio',
    'Save certificate settings',
    'Saved to the draft. On a published course a change of mode or criteria needs a review.',
  )
    .input(
      z.strictObject({
        courseId: z.uuid(),
        version: z.number().int(),
        mode: CertificateMode,
        settings: CertificateSettings,
      }),
    )
    .output(StudioCertificateSettingsDto),
  preview: post(
    '/studio/courses/{courseId}/certificate/preview',
    'Studio',
    'Preview the certificate',
    'A sample PDF with a placeholder name and the code TL-C-SAMP-LE00.',
  )
    .input(z.object({ courseId: z.uuid() }))
    .output(z.file()),
  list: get(
    '/studio/courses/{courseId}/certificates',
    'Studio',
    'Issued certificates',
    'Newest first, up to 200. Learners by display name only.',
  )
    .input(z.object({ courseId: z.uuid(), q: z.string().trim().max(100).optional() }))
    .output(z.object({ items: z.array(IssuedCertificateDto) })),
  revoke: post(
    '/studio/certificates/{certificateId}/revoke',
    'Studio',
    'Revoke a certificate',
    'With a reason, which the verify page shows. Only an admin can restore it.',
  )
    .input(z.strictObject({ certificateId: z.uuid(), reason: Reason }))
    .output(IssuedCertificateDto),
  results: get(
    '/studio/courses/{courseId}/external-results',
    'Studio',
    'External exam results',
    'Results recorded for an exam taken elsewhere, newest first.',
  )
    .input(z.object({ courseId: z.uuid() }))
    .output(z.object({ items: z.array(ExternalResultDto) })),
  recordExternalResult: post(
    '/studio/courses/{courseId}/external-results',
    'Studio',
    'Record an external exam result',
    'Pass or fail for one learner. A pass on an external-mode course issues the certificate.',
  )
    .input(
      z.strictObject({
        courseId: z.uuid(),
        enrollmentId: z.uuid(),
        result: z.enum(['pass', 'fail']),
        score: z.number().min(0).max(1000).nullable().default(null),
        providerName: z.string().trim().min(2).max(80),
        examUrl: z
          .url({ protocol: /^https$/ })
          .max(500)
          .nullable()
          .default(null),
        evidenceFileId: z.uuid().nullable().default(null),
      }),
    )
    .output(ExternalResultDto),
  evidenceFile: post(
    '/studio/external-results/{resultId}/evidence',
    'Studio',
    'Download the evidence',
    'A short-lived link to the file uploaded with the result.',
  )
    .input(z.object({ resultId: z.uuid() }))
    .output(z.object({ url: z.string() })),
}

// ─── Admin ──────────────────────────────────────────────────────────────────────────────────

const AdminCertificateShape = z.object({
  id: z.uuid(),
  code: z.string(),
  recipientName: z.string(),
  email: z.string(),
  courseTitle: z.string(),
  issuedAt: IsoDateTime,
  basis: CertificateBasis,
  status: z.enum(['active', 'revoked']),
  revokedReason: z.string().nullable(),
  revokedAt: IsoDateTime.nullable(),
})
export type AdminCertificateDto = z.infer<typeof AdminCertificateShape>
export const AdminCertificateDto = named(AdminCertificateShape)

export const adminCertificatesContract = {
  search: get(
    '/admin/certificates',
    'Admin',
    'Find certificates',
    'By code, or by the learner’s email or name. Newest first, up to 50.',
  )
    .input(z.object({ q: z.string().trim().min(2).max(100) }))
    .output(z.object({ items: z.array(AdminCertificateDto) })),
  revoke: post(
    '/admin/certificates/{certificateId}/revoke',
    'Admin',
    'Revoke a certificate',
    'With a reason shown on the verify page. Written to the audit log.',
  )
    .input(z.strictObject({ certificateId: z.uuid(), reason: Reason }))
    .output(AdminCertificateDto),
  restore: post(
    '/admin/certificates/{certificateId}/restore',
    'Admin',
    'Restore a certificate',
    'Makes a revoked certificate valid again. The reason goes to the audit log.',
  )
    .input(z.strictObject({ certificateId: z.uuid(), reason: Reason }))
    .output(AdminCertificateDto),
}
