import type { EarningLineDto, EarningsSummaryDto } from '@tokslearn/contract'
import * as commerce from '@tokslearn/core/commerce'
import { authed } from '../base'

// Instructor earnings (docs/06 §5, docs/08 §8–9). Thin: auth → core → DTO.

const iso = (d: Date) => d.toISOString()
const k = (v: bigint) => v.toString()
const dateN = (s: string | undefined) => (s ? new Date(s) : undefined)

const toSummary = (s: commerce.EarningsSummary): EarningsSummaryDto => ({
  pendingKobo: k(s.pendingKobo),
  availableKobo: k(s.availableKobo),
  inTransitKobo: k(s.inTransitKobo),
  receivableKobo: k(s.receivableKobo),
  paidThisYearKobo: k(s.paidThisYearKobo),
  upcomingReleases: s.upcomingReleases.map((u) => ({ on: iso(u.on), amountKobo: k(u.amountKobo) })),
  nextPayoutOn: iso(s.nextPayoutOn),
  minPayoutKobo: k(s.minPayoutKobo),
  payoutAccount: s.payoutAccount
    ? { ...s.payoutAccount, allowedFrom: iso(s.payoutAccount.allowedFrom) }
    : null,
  problems: s.problems,
})

const toLine = (l: commerce.EarningLine): EarningLineDto => ({
  ...l,
  paidAt: iso(l.paidAt),
  pricePaidKobo: k(l.pricePaidKobo),
  deductionsKobo: k(l.deductionsKobo),
  paymentFeeKobo: k(l.paymentFeeKobo),
  shareKobo: k(l.shareKobo),
  releasesOn: l.releasesOn ? iso(l.releasesOn) : null,
})

export const earningsRouter = {
  summary: authed.earnings.summary.handler(async ({ context }) =>
    toSummary(await commerce.earningsSummary(context.ctx)),
  ),
  lines: authed.earnings.lines.handler(async ({ context, input }) => {
    const r = await commerce.earningLines(context.ctx, {
      status: input.status,
      from: dateN(input.from),
      to: dateN(input.to),
      before: input.before,
    })
    return { items: r.items.map(toLine), hasMore: r.hasMore }
  }),
  exportCsv: authed.earnings.exportCsv.handler(({ context, input }) =>
    commerce.earningsCsv(context.ctx, { from: dateN(input.from), to: dateN(input.to) }),
  ),
  statements: authed.earnings.statements.handler(async ({ context }) => ({
    items: (await commerce.listStatements(context.ctx)).map((s) => ({
      ...s,
      totals: s.totals,
      createdAt: iso(s.createdAt),
    })),
  })),
  statementUrl: authed.earnings.statementUrl.handler(async ({ context, input }) => ({
    url: await commerce.statementDownloadUrl(context.ctx, input.month),
  })),
}
