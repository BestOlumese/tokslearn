import type { PayoutRunDetailDto, PayoutRunDto } from '@tokslearn/contract'
import * as commerce from '@tokslearn/core/commerce'
import { authed } from '../base'

// Payout runs for finance (docs/08 §9, ADR-046). Thin: auth → core → DTO.

const iso = (d: Date | null) => (d ? d.toISOString() : null)

const toRun = (r: commerce.PayoutRunSummary): PayoutRunDto => ({
  publicId: r.publicId,
  month: r.month,
  label: r.label,
  payOn: r.payOn.toISOString(),
  status: r.status,
  totalKobo: r.totalKobo.toString(),
  cosignRequired: r.cosignRequired,
  approvedAt: iso(r.approvedAt),
  cosignedAt: iso(r.cosignedAt),
  counts: r.counts,
})

const toDetail = (r: commerce.PayoutRunDetail): PayoutRunDetailDto => ({
  ...toRun(r),
  approvedByName: r.approvedByName,
  cosignedByName: r.cosignedByName,
  lastError: r.lastError,
  startedAt: iso(r.startedAt),
  finishedAt: iso(r.finishedAt),
  items: r.items.map((i) => ({
    ...i,
    amountKobo: i.amountKobo.toString(),
    nettedKobo: i.nettedKobo.toString(),
    feeKobo: i.feeKobo === null ? null : i.feeKobo.toString(),
    sentAt: iso(i.sentAt),
    settledAt: iso(i.settledAt),
  })),
})

export const adminPayoutsRouter = {
  list: authed.admin.payouts.list.handler(async ({ context }) => ({
    items: (await commerce.listPayoutRuns(context.ctx)).map(toRun),
  })),
  get: authed.admin.payouts.get.handler(async ({ context, input }) =>
    toDetail(await commerce.getPayoutRun(context.ctx, input.runId)),
  ),
  prepare: authed.admin.payouts.prepare.handler(async ({ context }) => ({
    runId: (await commerce.draftPayoutRun(context.ctx)).publicId,
  })),
  setHold: authed.admin.payouts.setHold.handler(async ({ context, input }) =>
    toDetail(await commerce.setPayoutItemHold(context.ctx, input)),
  ),
  approve: authed.admin.payouts.approve.handler(async ({ context, input }) =>
    toDetail(await commerce.approvePayoutRun(context.ctx, input.runId)),
  ),
  cosign: authed.admin.payouts.cosign.handler(async ({ context, input }) =>
    toDetail(await commerce.cosignPayoutRun(context.ctx, input.runId)),
  ),
  retry: authed.admin.payouts.retry.handler(async ({ context, input }) =>
    toDetail(await commerce.retryPayoutItem(context.ctx, input)),
  ),
  exportCsv: authed.admin.payouts.exportCsv.handler(({ context, input }) =>
    commerce.payoutRunCsv(context.ctx, input.runId),
  ),
}
