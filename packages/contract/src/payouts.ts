import { z } from 'zod'
import { base } from './base'
import { IsoDateTime } from './shared'
import { Kobo } from './studio'

// Phase 10 payout runs (docs/06 §5, docs/08 §9, docs/20 `/admin/payouts`, ADR-046). Finance only;
// approving, co-signing and retrying need a 2FA code from the last 12 hours.

const named = <S extends z.ZodType>(schema: S) =>
  schema as unknown as z.ZodType<z.output<S>, z.input<S>>

const get = (path: `/${string}`, summary: string, description: string) =>
  base.route({ method: 'GET', path, tags: ['Admin'], summary, description })
const post = (path: `/${string}`, summary: string, description: string) =>
  base.route({ method: 'POST', path, tags: ['Admin'], summary, description })

export const PayoutRunStatus = z.enum([
  'draft',
  'approved',
  'processing',
  'completed',
  'partially_failed',
])
export type PayoutRunStatus = z.infer<typeof PayoutRunStatus>
export const PayoutItemStatus = z.enum([
  'queued',
  'held',
  'sending',
  'sent',
  'success',
  'failed',
  'reversed',
])
export type PayoutItemStatus = z.infer<typeof PayoutItemStatus>
export const PayoutHoldReason = z.enum([
  'no_payout_account',
  'payout_account_in_review',
  'payout_account_on_hold',
  'kyc_not_verified',
  'two_factor_off',
  'suspended',
  'below_minimum',
  'finance_hold',
])
export type PayoutHoldReason = z.infer<typeof PayoutHoldReason>

const RunShape = z.object({
  publicId: z.string(),
  month: z.string(),
  label: z.string(),
  payOn: IsoDateTime,
  status: PayoutRunStatus,
  totalKobo: Kobo,
  cosignRequired: z.boolean(),
  approvedAt: IsoDateTime.nullable(),
  cosignedAt: IsoDateTime.nullable(),
  counts: z.record(PayoutItemStatus, z.number().int()),
})
export type PayoutRunDto = z.infer<typeof RunShape>
export const PayoutRunDto = named(RunShape)

const ItemShape = z.object({
  id: z.uuid(),
  instructorId: z.uuid(),
  instructorName: z.string(),
  bankName: z.string().nullable(),
  last4: z.string().nullable(),
  amountKobo: Kobo,
  nettedKobo: Kobo,
  status: PayoutItemStatus,
  holdReason: PayoutHoldReason.nullable(),
  /** first_payout, new_account, over_3x_last */
  anomalies: z.array(z.string()),
  attempt: z.number().int(),
  feeKobo: Kobo.nullable(),
  failureReason: z.string().nullable(),
  sentAt: IsoDateTime.nullable(),
  settledAt: IsoDateTime.nullable(),
})
export type PayoutItemDto = z.infer<typeof ItemShape>

const DetailShape = RunShape.extend({
  approvedByName: z.string().nullable(),
  cosignedByName: z.string().nullable(),
  lastError: z.string().nullable(),
  startedAt: IsoDateTime.nullable(),
  finishedAt: IsoDateTime.nullable(),
  items: z.array(ItemShape),
})
export type PayoutRunDetailDto = z.infer<typeof DetailShape>
export const PayoutRunDetailDto = named(DetailShape)

const RunId = z.string().regex(/^PR-\d{4}-\d{2}$/)

export const adminPayoutsContract = {
  list: get('/admin/payouts', 'Payout runs', 'Newest first, with item counts by status.').output(
    z.object({ items: z.array(PayoutRunDto) }),
  ),
  get: get(
    '/admin/payouts/{runId}',
    'A payout run',
    'Every instructor in the run: failed first, then flagged, held, and the rest by amount.',
  )
    .input(z.object({ runId: RunId }))
    .output(PayoutRunDetailDto),
  prepare: post(
    '/admin/payouts/prepare',
    'Draft this month’s run',
    'Builds this month’s draft now, or rebuilds a draft nobody has approved (finance holds stay). The 1st-of-month job does this on its own.',
  ).output(z.object({ runId: RunId })),
  setHold: post(
    '/admin/payouts/{runId}/items/{itemId}/hold',
    'Hold or release someone',
    'Draft runs only. A held instructor isn’t paid in this run; their money stays available.',
  )
    .input(z.strictObject({ runId: RunId, itemId: z.uuid(), hold: z.boolean() }))
    .output(PayoutRunDetailDto),
  approve: post(
    '/admin/payouts/{runId}/approve',
    'Approve a run',
    'Needs 2FA in the last 12 hours. Runs over the co-sign limit also need a super admin’s co-signature. Audit-logged.',
  )
    .input(z.strictObject({ runId: RunId }))
    .output(PayoutRunDetailDto),
  cosign: post(
    '/admin/payouts/{runId}/cosign',
    'Co-sign a run',
    'Super admin, not the approver, with 2FA in the last 12 hours. Audit-logged.',
  )
    .input(z.strictObject({ runId: RunId }))
    .output(PayoutRunDetailDto),
  retry: post(
    '/admin/payouts/{runId}/items/{itemId}/retry',
    'Send a failed transfer again',
    'With a new Paystack reference. Needs 2FA in the last 12 hours. Audit-logged.',
  )
    .input(z.strictObject({ runId: RunId, itemId: z.uuid() }))
    .output(PayoutRunDetailDto),
  exportCsv: get('/admin/payouts/{runId}/export', 'Run as CSV', 'For bank reconciliation.')
    .input(z.object({ runId: RunId }))
    .output(z.object({ filename: z.string(), csv: z.string() })),
}
