import type { DashboardDto, InstructorDetailDto, SystemStatusDto } from '@tokslearn/contract'
import * as admin from '@tokslearn/core/admin'
import * as analytics from '@tokslearn/core/analytics'
import * as instructors from '@tokslearn/core/instructors'
import { authed } from '../base'

// Back office (docs/20 §6, ADR-047). Thin: auth → core → DTO.

const iso = (d: Date) => d.toISOString()
const k = (v: bigint) => v.toString()

const toDashboard = (d: analytics.PlatformDashboard): DashboardDto => ({
  ...d,
  from: iso(d.from),
  gmvKobo: k(d.gmvKobo),
  revenueKobo: k(d.revenueKobo),
  refundedKobo: k(d.refundedKobo),
})

const toStatus = (s: admin.SystemStatus): SystemStatusDto => ({
  outbox: {
    ...s.outbox,
    oldestPendingAt: s.outbox.oldestPendingAt ? iso(s.outbox.oldestPendingAt) : null,
  },
  failedOutbox: s.failedOutbox.map((o) => ({ ...o, createdAt: iso(o.createdAt) })),
  webhooks: s.webhooks,
  failedWebhooks: s.failedWebhooks.map((w) => ({ ...w, createdAt: iso(w.createdAt) })),
})

const toSetting = (s: admin.PlatformSetting) => ({
  ...s,
  options: s.options ? [...s.options] : undefined,
  updatedAt: s.updatedAt ? iso(s.updatedAt) : null,
})

export const toInstructorDetail = (d: instructors.InstructorDetail): InstructorDetailDto => ({
  ...d,
  approvedAt: iso(d.approvedAt),
  payoutAccount: d.payoutAccount
    ? { ...d.payoutAccount, payoutsAllowedFrom: iso(d.payoutAccount.payoutsAllowedFrom) }
    : null,
  courses: d.courses.map((c) => ({ ...c, priceKobo: k(c.priceKobo) })),
  money: {
    pendingKobo: k(d.money.pendingKobo),
    availableKobo: k(d.money.availableKobo),
    inTransitKobo: k(d.money.inTransitKobo),
    receivableKobo: k(d.money.receivableKobo),
    paidKobo: k(d.money.paidKobo),
  },
  payouts: d.payouts.map((p) => ({
    ...p,
    amountKobo: k(p.amountKobo),
    settledAt: p.settledAt ? iso(p.settledAt) : null,
  })),
  strikes: d.strikes.map((s) => ({
    ...s,
    createdAt: iso(s.createdAt),
    revokedAt: s.revokedAt ? iso(s.revokedAt) : null,
  })),
})

export const adminDashboardRouter = {
  get: authed.admin.dashboard.get.handler(async ({ context, input }) =>
    toDashboard(await analytics.platformDashboard(context.ctx, input)),
  ),
}

export const adminJobsRouter = {
  status: authed.admin.jobs.status.handler(async ({ context }) =>
    toStatus(await admin.systemStatus(context.ctx)),
  ),
}

export const adminSettingsRouter = {
  list: authed.admin.settings.list.handler(async ({ context }) => ({
    items: (await admin.listPlatformSettings(context.ctx)).map(toSetting),
  })),
  update: authed.admin.settings.update.handler(async ({ context, input }) =>
    toSetting(await admin.updatePlatformSetting(context.ctx, input)),
  ),
}

export const adminInstructorStaffRouter = {
  list: authed.admin.instructors.list.handler(async ({ context, input }) => {
    const r = await instructors.listInstructors(context.ctx, input)
    return {
      hasMore: r.hasMore,
      items: r.items.map((i) => ({
        ...i,
        approvedAt: iso(i.approvedAt),
        availableKobo: k(i.availableKobo),
      })),
    }
  }),
  get: authed.admin.instructors.get.handler(async ({ context, input }) =>
    toInstructorDetail(await instructors.getInstructorDetail(context.ctx, input.userId)),
  ),
  issueStrike: authed.admin.instructors.issueStrike.handler(async ({ context, input }) =>
    toInstructorDetail(await instructors.issueStrike(context.ctx, input)),
  ),
  revokeStrike: authed.admin.instructors.revokeStrike.handler(async ({ context, input }) =>
    toInstructorDetail(await instructors.revokeStrike(context.ctx, input)),
  ),
}
