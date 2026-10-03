import * as notifications from '@tokslearn/core/notifications'
import { authed, pub } from '../base'

// Notification centre (docs/06 §5, docs/13 §3). Thin: auth → core → DTO.

export const notificationsRouter = {
  list: authed.notifications.list.handler(async ({ context, input }) => {
    const r = await notifications.listNotifications(context.ctx, input)
    return {
      hasMore: r.hasMore,
      items: r.items.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
    }
  }),
  unreadCount: authed.notifications.unreadCount.handler(async ({ context }) => ({
    count: await notifications.unreadCount(context.ctx),
  })),
  markRead: authed.notifications.markRead.handler(async ({ context, input }) => ({
    updated: await notifications.markRead(context.ctx, input),
  })),
  unsubscribe: pub.notifications.unsubscribe.handler(({ context, input }) =>
    notifications.unsubscribeByLink(context.ctx, input),
  ),
  preferences: {
    get: authed.notifications.preferences.get.handler(async ({ context }) => ({
      items: await notifications.getPreferences(context.ctx),
    })),
    set: authed.notifications.preferences.set.handler(async ({ context, input }) => ({
      items: await notifications.setPreference(context.ctx, input),
    })),
  },
}
