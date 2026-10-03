import { z } from 'zod'
import { base } from './base'
import { IsoDateTime } from './shared'
import { Kobo } from './studio'

// Phase 10 refunds (docs/06 §5, docs/08 §7, docs/20 Phase 10 rows, ADR-043).

const named = <S extends z.ZodType>(schema: S) =>
  schema as unknown as z.ZodType<z.output<S>, z.input<S>>

const get = (path: `/${string}`, tag: string, summary: string, description: string) =>
  base.route({ method: 'GET', path, tags: [tag], summary, description })
const post = (path: `/${string}`, tag: string, summary: string, description: string) =>
  base.route({ method: 'POST', path, tags: [tag], summary, description })

export const RefundReason = z.enum([
  'not_as_described',
  'quality',
  'technical',
  'duplicate',
  'changed_mind',
  'other',
])
export type RefundReason = z.infer<typeof RefundReason>
export const RefundStatus = z.enum([
  'under_review',
  'approved',
  'denied',
  'processing',
  'processed',
  'failed',
])
export type RefundStatus = z.infer<typeof RefundStatus>

const RefundShape = z.object({
  id: z.uuid(),
  publicId: z.string(),
  orderPublicId: z.string(),
  courseTitle: z.string(),
  courseSlug: z.string(),
  amountKobo: Kobo,
  reasonCode: RefundReason,
  status: RefundStatus,
  /** The decision in plain words. */
  decisionReason: z.string().nullable(),
  canAppeal: z.boolean(),
  appealedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
  processedAt: IsoDateTime.nullable(),
})
export type RefundDto = z.infer<typeof RefundShape>
export const RefundDto = named(RefundShape)

const RefundCheckShape = z.object({
  orderItemId: z.uuid(),
  eligible: z.boolean(),
  /** approve: refunded straight away; review: our finance team decides; deny: see `code`. */
  decision: z.enum(['approve', 'review', 'deny']),
  code: z.string().nullable(),
  details: z.record(z.string(), z.string()),
  existing: z.object({ publicId: z.string(), status: RefundStatus }).nullable(),
})
export type RefundCheckDto = z.infer<typeof RefundCheckShape>
export const RefundCheckDto = named(RefundCheckShape)

const RefundReviewShape = RefundShape.extend({
  buyerName: z.string(),
  buyerEmail: z.string(),
  reasonText: z.string().nullable(),
  appealText: z.string().nullable(),
  eligibility: z.record(z.string(), z.unknown()),
  paidAt: IsoDateTime.nullable(),
  refundableUntil: IsoDateTime.nullable(),
  watchedPct: z.number(),
  timeline: z.array(z.object({ kind: z.string(), label: z.string().nullable(), at: IsoDateTime })),
})
export type RefundReviewDto = z.infer<typeof RefundReviewShape>
export const RefundReviewDto = named(RefundReviewShape)

export const refundsContract = {
  checkEligibility: get(
    '/refunds/eligibility',
    'Refunds',
    'Can I get a refund?',
    'For one item of your order: approve (refunded straight away), review (our finance team decides) or deny with the rule.',
  )
    .input(z.object({ orderItemId: z.uuid() }))
    .output(RefundCheckDto),
  request: post(
    '/refunds',
    'Refunds',
    'Ask for a refund',
    'One request per course. Approved requests end access at once and the money goes back through Paystack.',
  )
    .input(
      z.strictObject({
        orderItemId: z.uuid(),
        reasonCode: RefundReason,
        reasonText: z.string().trim().max(1000).nullable().optional(),
      }),
    )
    .output(RefundDto),
  appeal: post(
    '/refunds/{refundId}/appeal',
    'Refunds',
    'Appeal a declined refund',
    'Once. Our finance team decides. APPEAL_USED, APPEAL_NOT_ALLOWED.',
  )
    .input(
      z.strictObject({
        refundId: z.string().min(3).max(20),
        text: z.string().trim().min(10).max(2000),
      }),
    )
    .output(RefundDto),
  listMine: get('/refunds', 'Refunds', 'My refund requests', 'Newest first.').output(
    z.object({ items: z.array(RefundDto) }),
  ),
}

export const adminRefundsContract = {
  list: get(
    '/admin/refunds',
    'Admin',
    'Refund queue',
    'Finance. Under review (new and appeals) oldest first by default; or one status, newest first.',
  )
    .input(z.object({ status: RefundStatus.optional() }))
    .output(z.object({ items: z.array(RefundDto) })),
  get: get(
    '/admin/refunds/{refundId}',
    'Admin',
    'A refund request',
    'Eligibility snapshot, buyer, reasons, appeal, watched share and the download/exam/certificate timeline.',
  )
    .input(z.object({ refundId: z.string().min(3).max(20) }))
    .output(RefundReviewDto),
  decide: post(
    '/admin/refunds/{refundId}/decide',
    'Admin',
    'Decide a refund',
    'Approve (even against the rules) or decline, with a reason the learner reads. Audit-logged.',
  )
    .input(
      z.strictObject({
        refundId: z.string().min(3).max(20),
        approve: z.boolean(),
        reason: z.string().trim().min(3).max(1000),
      }),
    )
    .output(RefundDto),
  retry: post(
    '/admin/refunds/{refundId}/retry',
    'Admin',
    'Send a failed refund again',
    'For refunds Paystack couldn’t process. Audit-logged.',
  )
    .input(z.strictObject({ refundId: z.string().min(3).max(20) }))
    .output(RefundDto),
}
