import { z } from 'zod'
import { base } from './base'
import { IsoDateTime } from './shared'
import { Kobo } from './studio'

// Phase 10 instructor earnings (docs/06 §5, docs/08 §8–9, docs/20 `/teach/earnings`, ADR-044).

const named = <S extends z.ZodType>(schema: S) =>
  schema as unknown as z.ZodType<z.output<S>, z.input<S>>

const get = (path: `/${string}`, summary: string, description: string) =>
  base.route({ method: 'GET', path, tags: ['Earnings'], summary, description })

export const EarningLineStatus = z.enum([
  'pending',
  'available',
  'paid',
  'refunded',
  'refund_pending',
])
export type EarningLineStatus = z.infer<typeof EarningLineStatus>

const SummaryShape = z.object({
  pendingKobo: Kobo,
  availableKobo: Kobo,
  inTransitKobo: Kobo,
  receivableKobo: Kobo,
  paidThisYearKobo: Kobo,
  upcomingReleases: z.array(z.object({ on: IsoDateTime, amountKobo: Kobo })),
  nextPayoutOn: IsoDateTime,
  minPayoutKobo: Kobo,
  payoutAccount: z
    .object({ bankName: z.string(), last4: z.string(), allowedFrom: IsoDateTime })
    .nullable(),
  /** What stops a payout today, most important first. */
  problems: z.array(
    z.enum([
      'no_payout_account',
      'payout_account_in_review',
      'payout_account_on_hold',
      'kyc_not_verified',
      'two_factor_off',
    ]),
  ),
})
export type EarningsSummaryDto = z.infer<typeof SummaryShape>
export const EarningsSummaryDto = named(SummaryShape)

const LineShape = z.object({
  orderItemId: z.uuid(),
  orderPublicId: z.string(),
  paidAt: IsoDateTime,
  courseTitle: z.string(),
  pricePaidKobo: Kobo,
  deductionsKobo: Kobo,
  paymentFeeKobo: Kobo,
  shareKobo: Kobo,
  source: z.string(),
  status: EarningLineStatus,
  releasesOn: IsoDateTime.nullable(),
})
export type EarningLineDto = z.infer<typeof LineShape>
export const EarningLineDto = named(LineShape)

const StatementShape = z.object({
  month: z.string(),
  label: z.string(),
  totals: z.object({
    sales: z.number().int(),
    refunds: z.number().int(),
    grossKobo: Kobo,
    shareEarnedKobo: Kobo,
    refundedShareKobo: Kobo,
    releasedKobo: Kobo,
    paidOutKobo: Kobo,
    closingPendingKobo: Kobo,
    closingAvailableKobo: Kobo,
  }),
  createdAt: IsoDateTime,
})
export type StatementDto = z.infer<typeof StatementShape>
export const StatementDto = named(StatementShape)

const Month = z.string().regex(/^\d{4}-\d{2}$/)

export const earningsContract = {
  summary: get(
    '/earnings/summary',
    'My balances',
    'Pending (with release dates), available, in transit, owed back, paid this year; the next payout day and anything stopping a payout.',
  ).output(EarningsSummaryDto),
  lines: get(
    '/earnings/lines',
    'My sales',
    'One line per course sold, newest first, 50 a page (`before` = last line’s orderItemId).',
  )
    .input(
      z.object({
        status: EarningLineStatus.optional(),
        from: IsoDateTime.optional(),
        to: IsoDateTime.optional(),
        before: z.uuid().optional(),
      }),
    )
    .output(z.object({ items: z.array(EarningLineDto), hasMore: z.boolean() })),
  exportCsv: get(
    '/earnings/export',
    'Sales as CSV',
    'Every line in a period (default: this year), as CSV text with a file name.',
  )
    .input(z.object({ from: IsoDateTime.optional(), to: IsoDateTime.optional() }))
    .output(z.object({ filename: z.string(), csv: z.string() })),
  statements: get(
    '/earnings/statements',
    'My monthly statements',
    'Newest first, with their totals. Made on the 1st for the month before.',
  ).output(z.object({ items: z.array(StatementDto) })),
  statementUrl: get(
    '/earnings/statements/{month}/download',
    'Download a statement',
    'A link to the PDF, valid for 5 minutes.',
  )
    .input(z.object({ month: Month }))
    .output(z.object({ url: z.string() })),
}
