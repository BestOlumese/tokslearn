import { z } from 'zod'
import { base } from './base'
import { Cursor, IsoDateTime, Page } from './shared'

// Instructor onboarding: application, KYC and payout accounts (docs/07 §5, docs/20 /teach/apply).

export const ApplicationStatus = z.enum(['draft', 'submitted', 'in_review', 'approved', 'rejected'])
export const KycMethod = z.enum(['bvn', 'nin'])
export const KycStatus = z.enum(['pending', 'verified', 'failed', 'manual_review'])
export const PayoutAccountStatus = z.enum(['active', 'pending_review', 'disabled'])
export const ApplicationGap = z.enum(['about', 'expertise', 'kyc', 'bank'])

/** Step 1, "About you". */
export const ApplicationAbout = z.object({
  headline: z.string().trim().min(3).max(120),
  topics: z.array(z.string().trim().min(2).max(40)).min(1).max(5),
  experience: z.string().trim().min(20).max(1500),
})
export type ApplicationAbout = z.infer<typeof ApplicationAbout>

/** Step 2, "Expertise and sample". */
export const ApplicationExpertise = z.object({
  expertise: z.string().trim().min(20).max(1000),
  sampleUrl: z.url({ protocol: /^https?$/ }).max(500),
})

export const KycStatusDto = z.object({
  status: KycStatus,
  method: KycMethod,
  /** Name on the BVN/NIN record, shown to the applicant so they can spot mistakes. */
  matchedName: z.string().nullable(),
  checkedAt: IsoDateTime,
})
export type KycStatusDto = z.infer<typeof KycStatusDto>

export const PayoutAccountDto = z.object({
  id: z.uuid(),
  bankName: z.string(),
  accountNumberLast4: z.string().length(4),
  accountName: z.string(),
  status: PayoutAccountStatus,
  payoutsAllowedFrom: IsoDateTime,
  createdAt: IsoDateTime,
})
export type PayoutAccountDto = z.infer<typeof PayoutAccountDto>

export const ApplicationDto = z.object({
  id: z.uuid(),
  status: ApplicationStatus,
  step: z.number().int().min(0).max(4),
  about: ApplicationAbout.partial(),
  expertise: z.string().nullable(),
  sampleUrl: z.string().nullable(),
  decisionReason: z.string().nullable(),
  submittedAt: IsoDateTime.nullable(),
  decidedAt: IsoDateTime.nullable(),
  /** What's still missing before the applicant can submit. */
  gaps: z.array(ApplicationGap),
})
export type ApplicationDto = z.infer<typeof ApplicationDto>

export const MyApplicationDto = z.object({
  application: ApplicationDto.nullable(),
  kyc: KycStatusDto.nullable(),
  payoutAccount: PayoutAccountDto.nullable(),
  /** Set after a rejection: the date the user may apply again. */
  canReapplyAt: IsoDateTime.nullable(),
  isInstructor: z.boolean(),
})
export type MyApplicationDto = z.infer<typeof MyApplicationDto>

export const BankDto = z.object({ code: z.string(), name: z.string() })

const AccountNumber = z.string().regex(/^\d{10}$/, 'Enter the 10-digit account number.')
const BankCode = z.string().regex(/^\d{3,6}$/)

export const instructorsContract = {
  getMyApplication: base
    .route({
      method: 'GET',
      path: '/instructors/application',
      tags: ['Instructors'],
      summary: 'My instructor application',
      description:
        'The latest application with its progress, the latest identity check and the payout account.',
    })
    .output(MyApplicationDto),

  saveApplication: base
    .route({
      method: 'PATCH',
      path: '/instructors/application',
      tags: ['Instructors'],
      summary: 'Save application progress',
      description:
        'Saves one step of the application. Starts a draft if there is none. Only drafts can be edited.',
    })
    .input(
      z.strictObject({
        about: ApplicationAbout.optional(),
        expertise: ApplicationExpertise.optional(),
        step: z.number().int().min(1).max(4),
      }),
    )
    .output(MyApplicationDto),

  submitApplication: base
    .route({
      method: 'POST',
      path: '/instructors/application/submit',
      tags: ['Instructors'],
      summary: 'Submit the application',
      description: 'Sends a complete draft to the review queue.',
    })
    .output(MyApplicationDto),
}

export const kycContract = {
  start: base
    .route({
      method: 'POST',
      path: '/kyc',
      tags: ['Instructors'],
      summary: 'Verify identity',
      description:
        'Checks a BVN or NIN with a selfie through Dojah. The number is sent to Dojah and never stored.',
    })
    .input(
      z.strictObject({
        method: KycMethod,
        number: z.string().regex(/^\d{11}$/, 'Enter the 11-digit number.'),
        /** Base64 JPEG or PNG from the camera, without the data-URL prefix. */
        selfieImage: z
          .string()
          .min(1000)
          .max(3_000_000)
          .regex(/^[A-Za-z0-9+/=]+$/),
      }),
    )
    .output(KycStatusDto),

  status: base
    .route({
      method: 'GET',
      path: '/kyc',
      tags: ['Instructors'],
      summary: 'Latest identity check',
      description: 'The result of the latest identity check, or null.',
    })
    .output(KycStatusDto.nullable()),
}

export const payoutAccountsContract = {
  listBanks: base
    .route({
      method: 'GET',
      path: '/payout-accounts/banks',
      tags: ['Instructors'],
      summary: 'Nigerian banks',
      description: 'Banks that can receive payouts, sorted by name.',
    })
    .output(z.array(BankDto)),

  resolve: base
    .route({
      method: 'POST',
      path: '/payout-accounts/resolve',
      tags: ['Instructors'],
      summary: 'Look up an account name',
      description: 'Returns the name on a bank account so the user can confirm it before adding.',
    })
    .input(z.strictObject({ bankCode: BankCode, accountNumber: AccountNumber }))
    .output(z.object({ accountName: z.string() })),

  add: base
    .route({
      method: 'POST',
      path: '/payout-accounts',
      tags: ['Instructors'],
      summary: 'Add a payout account',
      description:
        'Adds the account payouts go to. The name must match the verified identity or the account waits for manual review. Replacing an existing account needs two-factor verification in the last 12 hours.',
    })
    .input(z.strictObject({ bankCode: BankCode, accountNumber: AccountNumber }))
    .output(PayoutAccountDto),

  list: base
    .route({
      method: 'GET',
      path: '/payout-accounts',
      tags: ['Instructors'],
      summary: 'My payout accounts',
      description: 'Current and past payout accounts (last 4 digits only).',
    })
    .output(z.array(PayoutAccountDto)),
}

// Admin review queue (docs/20 /admin/instructors/applications).

export const AdminApplicationRow = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  headline: z.string().nullable(),
  status: ApplicationStatus,
  kycStatus: KycStatus.nullable(),
  payoutAccountStatus: PayoutAccountStatus.nullable(),
  submittedAt: IsoDateTime.nullable(),
})
export type AdminApplicationRow = z.infer<typeof AdminApplicationRow>

export const AdminApplicationDetail = AdminApplicationRow.extend({
  email: z.email(),
  about: ApplicationAbout.partial(),
  expertise: z.string().nullable(),
  sampleUrl: z.string().nullable(),
  decisionReason: z.string().nullable(),
  decidedAt: IsoDateTime.nullable(),
  reviewerName: z.string().nullable(),
  /** No ID numbers, ever: method, result, score and the name on the record. */
  kyc: z
    .object({
      method: KycMethod,
      status: KycStatus,
      matchedName: z.string().nullable(),
      faceMatchScore: z.number().nullable(),
      nameMatchesAccount: z.boolean().nullable(),
      checkedAt: IsoDateTime,
      attempts: z.number().int(),
    })
    .nullable(),
  payoutAccount: z
    .object({
      bankName: z.string(),
      accountNumberLast4: z.string(),
      accountName: z.string(),
      status: PayoutAccountStatus,
      nameMatchScore: z.number().nullable(),
    })
    .nullable(),
  previousApplications: z.array(
    z.object({ id: z.uuid(), status: ApplicationStatus, decidedAt: IsoDateTime.nullable() }),
  ),
})
export type AdminApplicationDetail = z.infer<typeof AdminApplicationDetail>

export const adminInstructorsContract = {
  listApplications: base
    .route({
      method: 'GET',
      path: '/admin/instructor-applications',
      tags: ['Admin'],
      summary: 'Instructor applications',
      description: 'Review queue, oldest submitted first. Reviewers and admins only.',
    })
    .input(
      z.object({
        status: z.enum(['open', 'approved', 'rejected']).default('open'),
        cursor: Cursor.optional(),
        limit: z.number().int().min(1).max(50).default(25),
      }),
    )
    .output(Page(AdminApplicationRow)),

  getApplication: base
    .route({
      method: 'GET',
      path: '/admin/instructor-applications/{id}',
      tags: ['Admin'],
      summary: 'Application detail',
      description: 'Answers, sample, identity result and bank name match.',
    })
    .input(z.object({ id: z.uuid() }))
    .output(AdminApplicationDetail),

  decide: base
    .route({
      method: 'POST',
      path: '/admin/instructor-applications/{id}/decision',
      tags: ['Admin'],
      summary: 'Approve or reject an application',
      description:
        'Approving grants the instructor role, creates the public profile and activates a bank account waiting for review. Rejecting needs a reason the applicant will see.',
    })
    .input(
      z.strictObject({
        id: z.uuid(),
        decision: z.enum(['approve', 'reject']),
        reason: z.string().trim().min(10).max(1000),
      }),
    )
    .output(AdminApplicationDetail),
}
