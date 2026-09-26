import * as identity from '@tokslearn/core/identity'
import { authed } from '../base'
import { toMeDto, toSessionDto } from '../dto'

export const meRouter = {
  get: authed.me.get.handler(async ({ context }) => toMeDto(await identity.getMe(context.ctx))),

  update: authed.me.update.handler(async ({ context, input }) =>
    toMeDto(await identity.updateMe(context.ctx, input)),
  ),

  sessions: {
    list: authed.me.sessions.list.handler(async ({ context }) => ({
      items: (await identity.listMySessions(context.ctx)).map(toSessionDto),
    })),
    revoke: authed.me.sessions.revoke.handler(async ({ context, input }) => {
      await identity.revokeMySession(context.ctx, input.sessionId)
      return { ok: true as const }
    }),
    revokeOthers: authed.me.sessions.revokeOthers.handler(async ({ context }) => {
      await identity.revokeMyOtherSessions(context.ctx)
      return { ok: true as const }
    }),
  },

  requestDeletion: authed.me.requestDeletion.handler(async ({ context }) => {
    const { scheduledFor } = await identity.requestDeletion(context.ctx)
    return { scheduledFor: scheduledFor.toISOString() }
  }),

  cancelDeletion: authed.me.cancelDeletion.handler(async ({ context }) => {
    await identity.cancelDeletion(context.ctx)
    return { ok: true as const }
  }),

  exportData: authed.me.exportData.handler(async ({ context }) => {
    await identity.requestDataExport(context.ctx)
    return { status: 'queued' as const }
  }),
}
