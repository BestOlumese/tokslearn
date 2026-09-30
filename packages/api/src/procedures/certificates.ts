import type {
  AdminCertificateDto,
  ExternalResultDto,
  IssuedCertificateDto,
  MyCertificateDto,
  PublicCertificateDto,
} from '@tokslearn/contract'
import * as certificates from '@tokslearn/core/certificates'
import { authed, pub } from '../base'

// Certificates (docs/06 §5, docs/10 §8). Thin: auth → core → DTO.

const iso = (d: Date) => d.toISOString()
const isoN = (d: Date | null) => (d ? d.toISOString() : null)

const toPublic = (c: certificates.PublicCertificate): PublicCertificateDto => ({
  ...c,
  issuedAt: iso(c.issuedAt),
  revokedAt: isoN(c.revokedAt),
})
const toMine = (c: certificates.MyCertificate): MyCertificateDto => ({
  ...c,
  issuedAt: iso(c.issuedAt),
})
const toIssued = (c: certificates.IssuedCertificate): IssuedCertificateDto => ({
  ...c,
  issuedAt: iso(c.issuedAt),
})
const toResult = (r: certificates.ExternalResult): ExternalResultDto => ({
  ...r,
  recordedAt: iso(r.recordedAt),
})
const toAdmin = (c: certificates.AdminCertificate): AdminCertificateDto => ({
  ...c,
  issuedAt: iso(c.issuedAt),
  revokedAt: isoN(c.revokedAt),
})

export const certificatesRouter = {
  listMine: authed.certificates.listMine.handler(async ({ context }) => ({
    items: (await certificates.listMyCertificates(context.ctx)).map(toMine),
  })),
  forCourse: authed.certificates.forCourse.handler(({ context, input }) =>
    certificates.myCourseCertificate(context.ctx, input.courseId),
  ),
  download: authed.certificates.download.handler(async ({ context, input }) => ({
    url: await certificates.certificateDownloadUrl(context.ctx, input.certificateId),
  })),
  verify: pub.certificates.verify.handler(async ({ context, input }) =>
    toPublic(await certificates.verifyCertificate(context.ctx, input.code)),
  ),
  requestNameCorrection: authed.certificates.requestNameCorrection.handler(
    async ({ context, input }) =>
      toMine(await certificates.requestNameCorrection(context.ctx, input)),
  ),
}

export const studioCertificatesRouter = {
  get: authed.studio.certificates.get.handler(({ context, input }) =>
    certificates.getCertificateSettings(context.ctx, input.courseId),
  ),
  update: authed.studio.certificates.update.handler(({ context, input }) =>
    certificates.updateCertificateRules(context.ctx, input),
  ),
  preview: authed.studio.certificates.preview.handler(async ({ context, input }) => {
    const bytes = await certificates.previewCertificate(context.ctx, input.courseId)
    return new File([new Uint8Array(bytes)], 'certificate-sample.pdf', {
      type: 'application/pdf',
    })
  }),
  list: authed.studio.certificates.list.handler(async ({ context, input }) => ({
    items: (await certificates.listIssuedCertificates(context.ctx, input)).map(toIssued),
  })),
  revoke: authed.studio.certificates.revoke.handler(async ({ context, input }) =>
    toIssued(await certificates.revokeCertificateAsInstructor(context.ctx, input)),
  ),
  results: authed.studio.certificates.results.handler(async ({ context, input }) => ({
    items: (await certificates.listExternalResults(context.ctx, input.courseId)).map(toResult),
  })),
  recordExternalResult: authed.studio.certificates.recordExternalResult.handler(
    async ({ context, input }) =>
      toResult(await certificates.recordExternalResult(context.ctx, input)),
  ),
  evidenceFile: authed.studio.certificates.evidenceFile.handler(async ({ context, input }) => ({
    url: await certificates.externalEvidenceUrl(context.ctx, input.resultId),
  })),
}

export const adminCertificatesRouter = {
  search: authed.admin.certificates.search.handler(async ({ context, input }) => ({
    items: (await certificates.searchCertificates(context.ctx, input.q)).map(toAdmin),
  })),
  revoke: authed.admin.certificates.revoke.handler(async ({ context, input }) =>
    toAdmin(await certificates.revokeCertificateAsAdmin(context.ctx, input)),
  ),
  restore: authed.admin.certificates.restore.handler(async ({ context, input }) =>
    toAdmin(await certificates.restoreCertificate(context.ctx, input)),
  ),
}
