import { z } from 'zod'
import { base } from './base'
import { IsoDateTime } from './shared'
import { Kobo } from './studio'

// Phase 10 back office (docs/06 §5, docs/20 §6, ADR-047): dashboard, background jobs, platform
// settings, instructors and strikes.

const named = <S extends z.ZodType>(schema: S) =>
  schema as unknown as z.ZodType<z.output<S>, z.input<S>>

const get = (path: `/${string}`, summary: string, description: string) =>
  base.route({ method: 'GET', path, tags: ['Admin'], summary, description })
const post = (path: `/${string}`, summary: string, description: string) =>
  base.route({ method: 'POST', path, tags: ['Admin'], summary, description })

export const DashboardPeriod = z.enum(['today', '7d', '30d'])
export type DashboardPeriod = z.infer<typeof DashboardPeriod>

const AlertShape = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ledger_integrity'),
    ok: z.literal(false),
    at: IsoDateTime,
    problems: z.record(z.string(), z.number().int()),
  }),
  z.object({ kind: z.literal('ledger_never_checked') }),
  z.object({ kind: z.literal('outbox_stuck'), stale: z.number().int(), failed: z.number().int() }),
  z.object({
    kind: z.literal('webhooks_failing'),
    failed: z.number().int(),
    stale: z.number().int(),
  }),
  z.object({ kind: z.literal('video_failures'), count: z.number().int() }),
  z.object({ kind: z.literal('refunds_waiting'), count: z.number().int() }),
  z.object({ kind: z.literal('payout_run_waiting'), runId: z.string(), label: z.string() }),
  z.object({ kind: z.literal('payout_run_failed'), runId: z.string(), label: z.string() }),
])

const DashboardShape = z.object({
  period: DashboardPeriod,
  from: IsoDateTime,
  orders: z.number().int(),
  gmvKobo: Kobo,
  revenueKobo: Kobo,
  refunds: z.number().int(),
  refundedKobo: Kobo,
  refundRatePct: z.number(),
  failedPayments: z.number().int(),
  newInstructors: z.number().int(),
  activeLearners: z.number().int(),
  alerts: z.array(AlertShape),
})
export type DashboardDto = z.infer<typeof DashboardShape>
export const DashboardDto = named(DashboardShape)

const StatusShape = z.object({
  outbox: z.object({
    pending: z.number().int(),
    stale: z.number().int(),
    failed: z.number().int(),
    oldestPendingAt: IsoDateTime.nullable(),
  }),
  failedOutbox: z.array(
    z.object({
      id: z.string(),
      eventName: z.string(),
      attempts: z.number().int(),
      lastError: z.string().nullable(),
      createdAt: IsoDateTime,
    }),
  ),
  webhooks: z.object({ failed: z.number().int(), stale: z.number().int() }),
  failedWebhooks: z.array(
    z.object({
      provider: z.string(),
      type: z.string(),
      eventId: z.string(),
      error: z.string().nullable(),
      createdAt: IsoDateTime,
    }),
  ),
})
export type SystemStatusDto = z.infer<typeof StatusShape>
export const SystemStatusDto = named(StatusShape)

const SettingValue = z.union([z.number(), z.string(), z.array(z.string())])
const SettingShape = z.object({
  key: z.string(),
  group: z.enum(['refunds', 'payouts', 'checkout', 'reviews']),
  label: z.string(),
  description: z.string(),
  kind: z.enum(['int', 'kobo', 'choice', 'dates']),
  min: z.number().optional(),
  max: z.number().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  defaultValue: SettingValue,
  value: SettingValue,
  updatedAt: IsoDateTime.nullable(),
})
export type PlatformSettingDto = z.infer<typeof SettingShape>
export const PlatformSettingDto = named(SettingShape)

const InstructorRowShape = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.string(),
  slug: z.string(),
  approvedAt: IsoDateTime,
  suspended: z.boolean(),
  publishedCourses: z.number().int(),
  learners: z.number().int(),
  availableKobo: Kobo,
  strikes: z.number().int(),
})
export type InstructorRowDto = z.infer<typeof InstructorRowShape>

const StrikeShape = z.object({
  id: z.uuid(),
  rule: z.string(),
  reason: z.string(),
  courseId: z.uuid().nullable(),
  courseTitle: z.string().nullable(),
  issuedByName: z.string().nullable(),
  createdAt: IsoDateTime,
  revokedAt: IsoDateTime.nullable(),
  revokedByName: z.string().nullable(),
  revokeReason: z.string().nullable(),
  active: z.boolean(),
})

const InstructorDetailShape = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.string(),
  slug: z.string(),
  displayName: z.string(),
  approvedAt: IsoDateTime,
  suspended: z.boolean(),
  banReason: z.string().nullable(),
  twoFactorEnabled: z.boolean(),
  kycStatus: z.string().nullable(),
  payoutAccount: z
    .object({
      bankName: z.string(),
      last4: z.string(),
      status: z.string(),
      payoutsAllowedFrom: IsoDateTime,
    })
    .nullable(),
  commissionOverrideId: z.string().nullable(),
  courses: z.array(
    z.object({
      id: z.uuid(),
      slug: z.string(),
      title: z.string(),
      status: z.string(),
      priceKobo: Kobo,
      learners: z.number().int(),
      rating: z.number().nullable(),
      ratings: z.number().int(),
    }),
  ),
  money: z.object({
    pendingKobo: Kobo,
    availableKobo: Kobo,
    inTransitKobo: Kobo,
    receivableKobo: Kobo,
    paidKobo: Kobo,
  }),
  payouts: z.array(
    z.object({
      month: z.string(),
      amountKobo: Kobo,
      status: z.string(),
      settledAt: IsoDateTime.nullable(),
    }),
  ),
  strikes: z.array(StrikeShape),
  activeStrikes: z.number().int(),
})
export type InstructorDetailDto = z.infer<typeof InstructorDetailShape>
export const InstructorDetailDto = named(InstructorDetailShape)

export const adminDashboardContract = {
  get: get(
    '/admin/dashboard',
    'Dashboard',
    'Any staff. Orders, GMV, revenue, refunds, failed payments, new instructors and active learners for today (Lagos), 7 or 30 days, plus what needs attention.',
  )
    .input(z.object({ period: DashboardPeriod.default('today') }))
    .output(DashboardDto),
}

export const adminJobsContract = {
  status: get(
    '/admin/jobs',
    'Background jobs',
    'Admins. Outbox backlog and failures, and webhooks that failed or have waited over 15 minutes.',
  ).output(SystemStatusDto),
}

export const adminSettingsContract = {
  list: get(
    '/admin/settings',
    'Platform settings',
    'Finance and admins can read; every editable setting with its limits and current value.',
  ).output(z.object({ items: z.array(PlatformSettingDto) })),
  update: post(
    '/admin/settings/{key}',
    'Change a platform setting',
    'Super admin with 2FA in the last 12 hours. Validated against the setting’s limits. Audit-logged.',
  )
    .input(z.strictObject({ key: z.string().min(1).max(64), value: SettingValue }))
    .output(PlatformSettingDto),
}

export const adminInstructorStaffContract = {
  list: get(
    '/admin/instructors',
    'Instructors',
    'Search by name, email or profile slug; 50 a page, newest approvals first.',
  )
    .input(
      z.object({
        q: z.string().trim().max(100).optional(),
        page: z.coerce.number().int().min(0).max(1000).optional(),
      }),
    )
    .output(z.object({ items: z.array(InstructorRowShape), hasMore: z.boolean() })),
  get: get(
    '/admin/instructors/{userId}',
    'An instructor',
    'Courses, money, bank and identity status, recent payouts and strikes.',
  )
    .input(z.object({ userId: z.uuid() }))
    .output(InstructorDetailDto),
  issueStrike: post(
    '/admin/instructors/{instructorId}/strikes',
    'Record a strike',
    'Reviewers and admins. The instructor is told. Three in 12 months remove instructor privileges (docs/25). Audit-logged.',
  )
    .input(
      z.strictObject({
        instructorId: z.uuid(),
        rule: z.string().trim().min(2).max(80),
        reason: z.string().trim().min(10).max(1000),
        courseId: z.uuid().optional(),
      }),
    )
    .output(InstructorDetailDto),
  revokeStrike: post(
    '/admin/strikes/{strikeId}/revoke',
    'Revoke a strike',
    'Admins. The strike stays on record with the reason. Audit-logged.',
  )
    .input(z.strictObject({ strikeId: z.uuid(), reason: z.string().trim().min(3).max(1000) }))
    .output(InstructorDetailDto),
}
