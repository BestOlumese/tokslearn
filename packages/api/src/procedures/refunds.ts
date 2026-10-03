import type { RefundDto, RefundReviewDto } from '@tokslearn/contract'
import * as commerce from '@tokslearn/core/commerce'
import { authed } from '../base'

// Refunds (docs/06 §5, docs/08 §7). Thin: auth → core → DTO.

const iso = (d: Date) => d.toISOString()
const isoN = (d: Date | null) => (d ? d.toISOString() : null)

const toDto = (r: commerce.RefundView): RefundDto => ({
  ...r,
  amountKobo: r.amountKobo.toString(),
  appealedAt: isoN(r.appealedAt),
  createdAt: iso(r.createdAt),
  processedAt: isoN(r.processedAt),
})

const toReview = (r: commerce.RefundReview): RefundReviewDto => ({
  ...toDto(r),
  buyerName: r.buyerName,
  buyerEmail: r.buyerEmail,
  reasonText: r.reasonText,
  appealText: r.appealText,
  eligibility: r.eligibility,
  paidAt: isoN(r.paidAt),
  refundableUntil: isoN(r.refundableUntil),
  watchedPct: r.watchedPct,
  timeline: r.timeline.map((t) => ({ ...t, at: iso(t.at) })),
})

export const refundsRouter = {
  checkEligibility: authed.refunds.checkEligibility.handler(({ context, input }) =>
    commerce.checkRefundEligibility(context.ctx, input.orderItemId),
  ),
  request: authed.refunds.request.handler(async ({ context, input }) =>
    toDto(await commerce.requestRefund(context.ctx, input)),
  ),
  appeal: authed.refunds.appeal.handler(async ({ context, input }) =>
    toDto(await commerce.appealRefund(context.ctx, input)),
  ),
  listMine: authed.refunds.listMine.handler(async ({ context }) => ({
    items: (await commerce.listMyRefunds(context.ctx)).map(toDto),
  })),
}

export const adminRefundsRouter = {
  list: authed.admin.refunds.list.handler(async ({ context, input }) => ({
    items: (await commerce.listRefundQueue(context.ctx, input)).map(toDto),
  })),
  get: authed.admin.refunds.get.handler(async ({ context, input }) =>
    toReview(await commerce.getRefundForReview(context.ctx, input.refundId)),
  ),
  decide: authed.admin.refunds.decide.handler(async ({ context, input }) =>
    toDto(await commerce.decideRefund(context.ctx, input)),
  ),
  retry: authed.admin.refunds.retry.handler(async ({ context, input }) =>
    toDto(await commerce.retryRefund(context.ctx, input.refundId)),
  ),
}
