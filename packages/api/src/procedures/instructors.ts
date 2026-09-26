import type {
  AdminApplicationDetail,
  KycStatusDto,
  MyApplicationDto,
  PayoutAccountDto,
} from '@tokslearn/contract'
import * as instructors from '@tokslearn/core/instructors'
import { authed, staff } from '../base'

// Instructor onboarding (docs/07 §5). Thin: auth → core → DTO. Authorization lives in core.

const iso = (d: Date | null) => d?.toISOString() ?? null

const toKycDto = (k: {
  status: KycStatusDto['status']
  method: KycStatusDto['method']
  matchedName: string | null
  createdAt?: Date
  checkedAt?: Date
}): KycStatusDto => ({
  status: k.status,
  method: k.method,
  matchedName: k.matchedName,
  checkedAt: (k.checkedAt ?? k.createdAt ?? new Date(0)).toISOString(),
})

const toPayoutDto = (p: {
  id: string
  bankName: string
  accountNumberLast4: string
  accountName: string
  status: PayoutAccountDto['status']
  payoutsAllowedFrom: Date
  createdAt: Date
}): PayoutAccountDto => ({
  id: p.id,
  bankName: p.bankName,
  accountNumberLast4: p.accountNumberLast4,
  accountName: p.accountName,
  status: p.status,
  payoutsAllowedFrom: p.payoutsAllowedFrom.toISOString(),
  createdAt: p.createdAt.toISOString(),
})

const toMyApplicationDto = (m: instructors.MyApplication): MyApplicationDto => ({
  application: m.application
    ? {
        ...m.application,
        submittedAt: iso(m.application.submittedAt),
        decidedAt: iso(m.application.decidedAt),
      }
    : null,
  kyc: m.kyc ? toKycDto(m.kyc) : null,
  payoutAccount: m.payoutAccount ? toPayoutDto(m.payoutAccount) : null,
  canReapplyAt: iso(m.canReapplyAt),
  isInstructor: m.isInstructor,
})

export const instructorsRouter = {
  getMyApplication: authed.instructors.getMyApplication.handler(async ({ context }) =>
    toMyApplicationDto(await instructors.getMyApplication(context.ctx)),
  ),
  saveApplication: authed.instructors.saveApplication.handler(async ({ context, input }) =>
    toMyApplicationDto(await instructors.saveApplication(context.ctx, input)),
  ),
  submitApplication: authed.instructors.submitApplication.handler(async ({ context }) =>
    toMyApplicationDto(await instructors.submitApplication(context.ctx)),
  ),
}

export const kycRouter = {
  start: authed.kyc.start.handler(async ({ context, input }) =>
    toKycDto(await instructors.startKyc(context.ctx, input)),
  ),
  status: authed.kyc.status.handler(async ({ context }) => {
    const k = await instructors.getKycStatus(context.ctx)
    return k ? toKycDto(k) : null
  }),
}

export const payoutAccountsRouter = {
  listBanks: authed.payoutAccounts.listBanks.handler(async ({ context }) => [
    ...(await instructors.listBanks(context.ctx)),
  ]),
  resolve: authed.payoutAccounts.resolve.handler(async ({ context, input }) =>
    instructors.resolveAccount(context.ctx, input),
  ),
  add: authed.payoutAccounts.add.handler(async ({ context, input }) =>
    toPayoutDto(await instructors.addPayoutAccount(context.ctx, input)),
  ),
  list: authed.payoutAccounts.list.handler(async ({ context }) =>
    (await instructors.listPayoutAccounts(context.ctx)).map(toPayoutDto),
  ),
}

const reviewers = staff('reviewer', 'admin', 'super_admin')

const toDetailDto = (
  d: Awaited<ReturnType<typeof instructors.getApplicationDetail>>,
): AdminApplicationDetail => ({
  ...d,
  submittedAt: iso(d.submittedAt),
  decidedAt: iso(d.decidedAt),
  kyc: d.kyc ? { ...d.kyc, checkedAt: d.kyc.checkedAt.toISOString() } : null,
  previousApplications: d.previousApplications.map((p) => ({ ...p, decidedAt: iso(p.decidedAt) })),
})

export const adminInstructorsRouter = {
  listApplications: reviewers.admin.instructors.listApplications.handler(
    async ({ context, input }) => {
      const page = await instructors.listApplications(context.ctx, input)
      return {
        items: page.items.map((r) => ({ ...r, submittedAt: iso(r.submittedAt) })),
        nextCursor: page.nextCursor,
      }
    },
  ),
  getApplication: reviewers.admin.instructors.getApplication.handler(async ({ context, input }) =>
    toDetailDto(await instructors.getApplicationDetail(context.ctx, input.id)),
  ),
  decide: reviewers.admin.instructors.decide.handler(async ({ context, input }) =>
    toDetailDto(await instructors.decideApplication(context.ctx, input)),
  ),
}
