import type { FeatureFlagDto } from '@tokslearn/contract'
import * as admin from '@tokslearn/core/admin'
import * as identity from '@tokslearn/core/identity'
import { staff } from '../base'
import { toAdminUserRow, toAuditDto, toSessionDto } from '../dto'

const supportPlus = staff('support', 'admin', 'super_admin')
const adminOnly = staff('admin', 'super_admin')

const toFlagDto = (flag: admin.FeatureFlag): FeatureFlagDto => ({
  key: flag.key,
  enabled: flag.enabled,
  description: flag.description,
  updatedAt: flag.updatedAt.toISOString(),
})

export const adminRouter = {
  listFeatureFlags: adminOnly.admin.listFeatureFlags.handler(async ({ context }) => ({
    items: (await admin.listFeatureFlags(context.ctx)).map(toFlagDto),
  })),

  setFeatureFlag: adminOnly.admin.setFeatureFlag.handler(async ({ context, input }) =>
    toFlagDto(await admin.setFeatureFlag(context.ctx, input)),
  ),

  users: {
    search: supportPlus.admin.users.search.handler(async ({ context, input }) => {
      const page = await identity.searchUsers(context.ctx, input)
      return { items: page.items.map(toAdminUserRow), nextCursor: page.nextCursor }
    }),

    get: supportPlus.admin.users.get.handler(async ({ context, input }) => {
      const d = await identity.getUserDetail(context.ctx, input.userId)
      return {
        ...toAdminUserRow(d),
        headline: d.headline,
        banReason: d.banReason,
        sessions: d.sessions.map((s) => {
          const { current: _current, ...rest } = toSessionDto({ ...s, current: false })
          return rest
        }),
        audit: d.audit.map(toAuditDto),
      }
    }),

    setBanned: adminOnly.admin.users.setBanned.handler(async ({ context, input }) => {
      await identity.setBanned(context.ctx, input)
      return { ok: true as const }
    }),

    setRole: adminOnly.admin.users.setRole.handler(async ({ context, input }) => ({
      roles: await identity.setRole(context.ctx, input),
    })),

    revokeSessions: supportPlus.admin.users.revokeSessions.handler(async ({ context, input }) => {
      await identity.revokeUserSessions(context.ctx, input)
      return { ok: true as const }
    }),
  },

  audit: {
    list: adminOnly.admin.audit.list.handler(async ({ context, input }) => {
      const page = await admin.listAuditLog(context.ctx, input)
      return { items: page.items.map(toAuditDto), nextCursor: page.nextCursor }
    }),
  },
}
